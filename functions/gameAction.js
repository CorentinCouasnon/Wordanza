// Callable HTTPS: actions de jeu server-authoritative.
//
// Toutes les actions qui modifient la main, les PA, l'état de bouclier ou les
// compteurs d'utilisation de power-ups passent par ici. Le client n'écrit plus
// directement ces champs sur le document de partie, il appelle gameAction,
// et le serveur recalcule tout depuis Firestore dans une transaction.
//
// Pourquoi une seule callable avec routing `action` plutôt que plusieurs :
//   - Toutes les actions partagent la même enveloppe (auth, lecture game/user,
//     transaction, check de participation). Une seule callable = moins de
//     boilerplate dupliqué et un seul déploiement à suivre.
//   - Les coûts (invocations, cold starts) sont mutualisés.
//
// Sécurité :
//   - enforceAppCheck: true → refuse tout appel hors app officielle.
//   - Le serveur relit les PA depuis apStored+lastApUpdate (jamais confiance au client).
//   - Les tirages aléatoires (lettres) se font côté serveur, impossible de
//     choisir sa lettre depuis un client trafiqué.
//   - Les limites d'usage (usesPerGame) sont vérifiées contre le state stocké,
//     pas contre un compteur client.

'use strict'

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

const {
  POWERUPS,
  SHIELDABLE_POWERUPS,
  getCurrentAP,
  computeNewAP,
  drawRandomLetter,
  drawRandomVowel,
  drawRandomConsonant,
  drawMultipleLetters,
  autoFinishLastPlayer,
} = require('./constants')

const db = () => admin.firestore()

// ── Helpers ──────────────────────────────────────────────────────────────────

// Retire un exemplaire de chaque lettre de `toRemove` dans `arr` (multiset diff).
// Utilisé pour ignorer les lettres actuellement en draft côté client :
// le serveur travaille sur la "main effective" (stored hand - drafts).
function multisetDiff(arr, toRemove) {
  const result = [...(arr ?? [])]
  for (const l of toRemove ?? []) {
    const idx = result.indexOf(l)
    if (idx !== -1) result.splice(idx, 1)
  }
  return result
}

// Incrémente le compteur d'utilisation selon le type de limite du power-up.
function bumpUsage(usage, powerupId, powerup) {
  const next = { ...(usage ?? {}) }
  if (powerup.usesPerGame === Infinity) return next
  if (powerup.usesPerGame === 1) {
    next[powerupId] = true
  } else {
    next[powerupId] = (next[powerupId] ?? 0) + 1
  }
  return next
}

// Le joueur peut-il encore utiliser ce power-up ?
function canUsePowerup(usage, powerupId, powerup) {
  if (powerup.usesPerGame === Infinity) return true
  const u = usage?.[powerupId]
  if (powerup.usesPerGame === 1) return !u
  return (u ?? 0) < powerup.usesPerGame
}

// Remplace le joueur `userId` dans le tableau players[] par un nouvel objet.
function replacePlayer(players, userId, updater) {
  return players.map(p => (p.userId === userId ? { ...p, ...updater(p) } : p))
}

// Applique de façon immuable des updates à plusieurs joueurs.
// updatesByUid = { [uid]: partialPlayer, ... }
function patchPlayers(players, updatesByUid) {
  return players.map(p => {
    const patch = updatesByUid[p.userId]
    return patch ? { ...p, ...patch } : p
  })
}

// ── Callable ─────────────────────────────────────────────────────────────────

exports.gameAction = onCall({ region: 'europe-west4', enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in')

  const userId = request.auth.uid
  const { gameId, action, params = {} } = request.data ?? {}

  if (!gameId || !action) {
    throw new HttpsError('invalid-argument', 'Missing gameId or action')
  }

  const gameRef = db().doc(`games/${gameId}`)
  const userRef = db().doc(`users/${userId}`)

  try {
    return await db().runTransaction(async (t) => {
      // Lectures en premier (Firestore transactions : toutes les reads avant les writes).
      // On lit users/{uid} pour récupérer `speed` (drawCost non stocké dans le player entry).
      const [userSnap, gameSnap] = await Promise.all([t.get(userRef), t.get(gameRef)])

      if (!gameSnap.exists) throw new HttpsError('not-found', 'Game not found')

      const game = gameSnap.data()
      const me   = game.players?.find(p => p.userId === userId)
      if (!me) throw new HttpsError('permission-denied', 'Not a participant')

      // Tout sauf le forfait exige une partie active et un joueur non terminé.
      if (action !== 'forfeit') {
        if (game.status !== 'active')  throw new HttpsError('failed-precondition', 'Game is not active')
        if (me.finished)               throw new HttpsError('failed-precondition', 'You already finished')
      }

      const userData = userSnap.exists ? userSnap.data() : {}
      const speed    = userData.skills?.speed ?? 0
      const drawCost = Math.max(1, 20 - speed)

      const lang         = game.language ?? 'en'
      const handSize     = me.handSize ?? 6
      const draftLetters = Array.isArray(params.draftLetters) ? params.draftLetters : []
      const effHand      = multisetDiff(me.hand ?? [], draftLetters)

      // Route sur `action` ────────────────────────────────────────────────────
      switch (action) {

        // ── drawLetter : piocher une lettre aléatoire ────────────────────────
        case 'drawLetter': {
          if (effHand.length >= handSize) {
            throw new HttpsError('failed-precondition', 'Your rack is full')
          }
          const ap = getCurrentAP(me.apStored, me.lastApUpdate)
          if (ap < drawCost) {
            throw new HttpsError('failed-precondition', `Need ${drawCost} AP (you have ${ap})`)
          }
          const { apStored, lastApUpdate } = computeNewAP(me.apStored, me.lastApUpdate, drawCost)
          const newLetter = drawRandomLetter(lang)
          // IMPORTANT : on part de me.hand (et non effHand) pour préserver les
          // lettres du draft. Les drafts ne sont retirés de la main serveur
          // qu'au moment de validateWord, pas à chaque pioche.
          const newHand   = [...(me.hand ?? []), newLetter]

          const players = replacePlayer(game.players, userId, () => ({
            hand: newHand, apStored, lastApUpdate,
          }))
          t.update(gameRef, { players })
          return { success: true, newHand, newLetter }
        }

        // ── forfeit : abandon ────────────────────────────────────────────────
        case 'forfeit': {
          if (game.status !== 'active') {
            throw new HttpsError('failed-precondition', 'Game is not active')
          }
          if (me.finished) {
            throw new HttpsError('failed-precondition', 'Already finished')
          }
          const alreadyFinishedCount = game.players.filter(p => p.finished).length
          const playersAfterForfeit = replacePlayer(game.players, userId, () => ({
            finished:   true,
            forfeited:  true,
            rank:       alreadyFinishedCount + 1,
            finishedAt: Date.now(),
          }))
          // Si ce forfait laisse un seul joueur en lice, on le termine auto
          // avec son score courant (reçoit ses perles normalement).
          const players     = autoFinishLastPlayer(playersAfterForfeit)
          const allFinished = players.every(p => p.finished)
          t.update(gameRef, {
            players,
            ...(allFinished ? {
              status:     'finished',
              finishedAt: admin.firestore.FieldValue.serverTimestamp(),
            } : {}),
          })
          return { success: true }
        }
      }

      // ── À partir d'ici : power-ups ─────────────────────────────────────────
      // L'action est supposée être un powerupId. On valide AP/usage/shield ici.
      const powerupId = action
      const powerup   = POWERUPS[powerupId]
      if (!powerup) {
        throw new HttpsError('invalid-argument', `Unknown action: ${action}`)
      }

      const ap = getCurrentAP(me.apStored, me.lastApUpdate)
      if (ap < powerup.apCost) {
        throw new HttpsError('failed-precondition', `Need ${powerup.apCost} AP (you have ${ap})`)
      }
      if (!canUsePowerup(me.powerupUsage, powerupId, powerup)) {
        throw new HttpsError('failed-precondition', `${powerupId} usage limit reached`)
      }

      const { apStored: newAP, lastApUpdate: newLast } =
        computeNewAP(me.apStored, me.lastApUpdate, powerup.apCost)

      // Helper : construit le patch standard pour le joueur après un power-up
      // qui modifie sa main (PA, timestamp, compteur d'usage incrémenté).
      const selfPatch = (newHand, extra = {}) => ({
        hand:         newHand,
        apStored:     newAP,
        lastApUpdate: newLast,
        powerupUsage: bumpUsage(me.powerupUsage, powerupId, powerup),
        ...extra,
      })

      // Pour les power-ups ciblés : vérifier la cible et le Shield.
      // Si bloqué par Shield → consommer les PA, incrémenter l'usage, désactiver
      // le Shield de la cible. Même comportement que l'existant.
      function applyShieldBlockedPowerup(targetId) {
        const players = patchPlayers(game.players, {
          [userId]:   selfPatch(me.hand ?? []),
          [targetId]: { shieldActive: false },
        })
        t.update(gameRef, { players })
        return { success: false, blocked: true }
      }

      switch (powerupId) {

        // ── trash : vider le rack (0 AP) ───────────────────────────────────
        case 'trash': {
          const players = replacePlayer(game.players, userId, () => selfPatch([]))
          t.update(gameRef, { players })
          return { success: true, newHand: [] }
        }

        // ── recycle : remplacer une lettre par une aléatoire ────────────────
        case 'recycle': {
          const letter = (params.letter ?? '').toUpperCase()
          if (!letter) throw new HttpsError('invalid-argument', 'Missing letter')
          const idx = effHand.indexOf(letter)
          if (idx === -1) throw new HttpsError('failed-precondition', `You don't have ${letter}`)

          const newLetter = drawRandomLetter(lang)
          const newEffHand = [...effHand]
          newEffHand[idx]  = newLetter
          // Préserver les drafts dans la main serveur (cf. drawLetter).
          const newHand = [...draftLetters, ...newEffHand]

          const players = replacePlayer(game.players, userId, () => selfPatch(newHand))
          t.update(gameRef, { players })
          return { success: true, newHand, newLetter, replacedLetter: letter }
        }

        // ── vowel / consonant : piocher une lettre ciblée ──────────────────
        case 'vowel':
        case 'consonant': {
          if (effHand.length >= handSize) {
            throw new HttpsError('failed-precondition', 'Rack is full')
          }
          const newLetter = powerupId === 'vowel'
            ? drawRandomVowel(lang)
            : drawRandomConsonant(lang)
          const newHand = [...(me.hand ?? []), newLetter]
          const players = replacePlayer(game.players, userId, () => selfPatch(newHand))
          t.update(gameRef, { players })
          return { success: true, newHand, newLetter }
        }

        // ── boost : +3 lettres d'un coup ───────────────────────────────────
        case 'boost': {
          if (handSize - effHand.length < 3) {
            throw new HttpsError('failed-precondition', 'Need 3 free slots for Boost')
          }
          const newLetters = drawMultipleLetters(3, lang)
          const newHand    = [...(me.hand ?? []), ...newLetters]
          const players = replacePlayer(game.players, userId, () => selfPatch(newHand))
          t.update(gameRef, { players })
          return { success: true, newHand, newLetters }
        }

        // ── twister : remplacer toutes les lettres du rack ─────────────────
        case 'twister': {
          const count = effHand.length
          if (count === 0) throw new HttpsError('failed-precondition', 'No letters to replace')
          const newLetters = drawMultipleLetters(count, lang)
          // Twister remplace uniquement les lettres du rack ; les drafts restent
          // sur le plateau et doivent être préservés dans la main serveur.
          const newHand = [...draftLetters, ...newLetters]
          const players = replacePlayer(game.players, userId, () => selfPatch(newHand))
          t.update(gameRef, { players })
          return { success: true, newHand: newLetters, newLetters }
        }

        // ── joker : ajouter la lettre choisie ──────────────────────────────
        case 'joker': {
          // ß ne s'écrit pas en majuscule (toUpperCase → 'SS'), on le préserve.
          const raw    = params.letter ?? ''
          const letter = raw === 'ß' ? 'ß' : raw.toUpperCase()
          const validRe = lang === 'de' ? /^[A-Zß]$/ : /^[A-Z]$/
          if (!letter || !validRe.test(letter)) {
            throw new HttpsError('invalid-argument', 'Invalid letter')
          }
          if (effHand.length >= handSize) {
            throw new HttpsError('failed-precondition', 'Rack is full')
          }
          const newHand = [...(me.hand ?? []), letter]
          const players = replacePlayer(game.players, userId, () => selfPatch(newHand))
          t.update(gameRef, { players })
          return { success: true, newHand, newLetter: letter }
        }

        // ── shield : activer la protection ──────────────────────────────────
        case 'shield': {
          if (me.shieldActive) {
            throw new HttpsError('failed-precondition', 'Shield already active')
          }
          // On ne change pas la main ici, on réutilise me.hand tel quel pour
          // que selfPatch(me.hand ?? []) n'écrase pas les lettres.
          const players = replacePlayer(game.players, userId, () =>
            selfPatch(me.hand ?? [], { shieldActive: true })
          )
          t.update(gameRef, { players })
          return { success: true }
        }

        // ── binoculars : voir la main d'un adversaire ──────────────────────
        case 'binoculars': {
          const targetId = params.targetId
          if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId')
          const target = game.players.find(p => p.userId === targetId)
          if (!target) throw new HttpsError('not-found', 'Target not found')

          if (target.shieldActive && SHIELDABLE_POWERUPS.includes(powerupId)) {
            return applyShieldBlockedPowerup(targetId)
          }

          const players = replacePlayer(game.players, userId, () => selfPatch(me.hand ?? []))
          t.update(gameRef, { players })
          return {
            success:    true,
            targetHand: target.hand ?? [],
            targetName: target.displayName ?? '',
          }
        }

        // ── steal : voler une lettre aléatoire ─────────────────────────────
        case 'steal': {
          const targetId = params.targetId
          if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId')
          const target = game.players.find(p => p.userId === targetId)
          if (!target)                 throw new HttpsError('not-found', 'Target not found')
          if ((target.hand ?? []).length === 0) {
            throw new HttpsError('failed-precondition', 'Target has no letters')
          }

          if (target.shieldActive) {
            return applyShieldBlockedPowerup(targetId)
          }

          // Tirage aléatoire côté serveur
          const idx    = Math.floor(Math.random() * target.hand.length)
          const stolen = target.hand[idx]

          const newTargetHand = target.hand.filter((_, i) => i !== idx)
          // On ajoute la lettre volée à la main complète (drafts inclus) : les
          // drafts ne sont retirés de la main serveur qu'au validateWord.
          const newMyHand     = [...(me.hand ?? []), stolen]

          const players = patchPlayers(game.players, {
            [userId]:   selfPatch(newMyHand),
            [targetId]: { hand: newTargetHand },
          })
          t.update(gameRef, { players })
          return { success: true, stolen, newHand: newMyHand }
        }

        // ── switcheroo : échanger les mains ────────────────────────────────
        case 'switcheroo': {
          const targetId = params.targetId
          if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId')
          const target = game.players.find(p => p.userId === targetId)
          if (!target) throw new HttpsError('not-found', 'Target not found')

          if (target.handSize !== me.handSize) {
            throw new HttpsError('failed-precondition', 'Rack size mismatch')
          }

          if (target.shieldActive) {
            return applyShieldBlockedPowerup(targetId)
          }

          // Échange des mains stockées. Le client devra réinitialiser son draft
          // car ses drafts pointaient sur d'anciennes lettres.
          const players = patchPlayers(game.players, {
            [userId]:   selfPatch(target.hand ?? []),
            [targetId]: { hand: me.hand ?? [] },
          })
          t.update(gameRef, { players })
          return { success: true, newHand: target.hand ?? [] }
        }

        default:
          throw new HttpsError('invalid-argument', `Unknown power-up: ${powerupId}`)
      }
    })
  } catch (err) {
    if (err instanceof HttpsError) throw err
    console.error('gameAction error:', err)
    throw new HttpsError('internal', err.message ?? 'Internal error')
  }
})
