// Cloud Functions de matchmaking.
//
//  onMatchmakingJoin  , trigger sur chaque nouvelle entrée dans matchmaking/{userId}.
//                        Crée immédiatement un match si 5 joueurs compatibles sont présents.
//                        Les transactions Firestore gèrent les races conditions entre triggers.
//
//  matchmakingBotFill , scheduled toutes les 10 minutes.
//                        Crée des matchs 5 humains restés en attente, puis complète avec
//                        des bots pour les joueurs en file depuis plus de MAX_WAIT_MS.

'use strict'

const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onSchedule }        = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')

const {
  HANDICAP_TOLERANCE, MAX_WAIT_MS,
  buildPlayerEntry, buildBotPlayerEntry, randomBotName,
} = require('./constants')

const db = () => admin.firestore()

// ── Helpers internes ──────────────────────────────────────────────────────────

/**
 * Crée une partie pour des joueurs humains uniquement (transaction atomique).
 * Vérifie que toutes les entrées matchmaking existent encore avant d'écrire.
 *
 * @param {Array}  players  - [{ id, userId, displayName, handicap }]
 * @param {string} language
 * @returns {Promise<string>} ID de la partie créée
 */
async function createMatchedGame(players, language) {
  const firestore = db()

  return await firestore.runTransaction(async (t) => {
    // 1. Vérifier que toutes les entrées matchmaking existent encore
    const mmRefs  = players.map(p => firestore.doc(`matchmaking/${p.id}`))
    const mmSnaps = await Promise.all(mmRefs.map(r => t.get(r)))

    if (mmSnaps.some(s => !s.exists)) {
      throw new Error('A player left the queue')
    }

    // 2. Lire les profils pour récupérer les skills
    const userRefs  = players.map(p => firestore.doc(`users/${p.id}`))
    const userSnaps = await Promise.all(userRefs.map(r => t.get(r)))

    // 3. Construire les entrées joueurs (PA synchronisés au même instant)
    const startTs      = Date.now()
    const playerEntries = players.map((p, i) => {
      const skills = userSnaps[i].data()?.skills ?? {}
      return { ...buildPlayerEntry(p.id, p.displayName, skills), lastApUpdate: startTs }
    })
    const playerIds = players.map(p => p.id)

    // 4. Créer le document de partie
    const gameRef = firestore.collection('games').doc()
    t.set(gameRef, {
      status:       'active',
      language,
      boardVersion: 0,
      board:        {},
      lastWords:    [],
      playerIds,
      players:      playerEntries,
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      startedAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastMoveAt:   admin.firestore.FieldValue.serverTimestamp(),
      finishedAt:   null,
    })

    // 5. Supprimer les entrées matchmaking
    for (const ref of mmRefs) t.delete(ref)

    return gameRef.id
  })
}

/**
 * Crée une partie en complétant les slots vides avec des bots.
 *
 * @param {Array}  humanPlayers - Joueurs humains [{ id, displayName }]
 * @param {string} language
 * @returns {Promise<string>} ID de la partie créée
 */
async function createGameWithBots(humanPlayers, language) {
  const firestore = db()
  const botCount  = 5 - humanPlayers.length

  return await firestore.runTransaction(async (t) => {
    // 1. Vérifier que les joueurs humains sont toujours en file
    const mmRefs  = humanPlayers.map(p => firestore.doc(`matchmaking/${p.id}`))
    const mmSnaps = await Promise.all(mmRefs.map(r => t.get(r)))

    if (mmSnaps.some(s => !s.exists)) {
      throw new Error('A player left the queue')
    }

    // 2. Lire les profils humains
    const userRefs  = humanPlayers.map(p => firestore.doc(`users/${p.id}`))
    const userSnaps = await Promise.all(userRefs.map(r => t.get(r)))

    // 3. Construire les entrées
    const startTs      = Date.now()
    const humanEntries = humanPlayers.map((p, i) => {
      const skills = userSnaps[i].data()?.skills ?? {}
      return { ...buildPlayerEntry(p.id, p.displayName, skills), lastApUpdate: startTs }
    })

    const usedNames = []
    const botEntries = Array.from({ length: botCount }, () => {
      const name = randomBotName(usedNames)
      usedNames.push(name)
      return { ...buildBotPlayerEntry(name, language), lastApUpdate: startTs }
    })

    const allPlayers  = [...humanEntries, ...botEntries]
    const allPlayerIds = humanEntries.map(p => p.userId)

    // 4. Créer la partie
    const gameRef = firestore.collection('games').doc()
    t.set(gameRef, {
      status:       'active',
      language,
      boardVersion: 0,
      board:        {},
      lastWords:    [],
      playerIds:    allPlayerIds,
      players:      allPlayers,
      hasBots:      true,
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      startedAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastMoveAt:   admin.firestore.FieldValue.serverTimestamp(),
      finishedAt:   null,
    })

    // 5. Retirer les humains de la file
    for (const ref of mmRefs) t.delete(ref)

    return gameRef.id
  })
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Trigger, se déclenche quand un joueur rejoint la file.
 * Tente de créer immédiatement un match avec les joueurs compatibles présents.
 */
exports.onMatchmakingJoin = onDocumentCreated({ document: 'matchmaking/{userId}', region: 'europe-west4' }, async (event) => {
  const newEntry = event.data?.data()
  if (!newEntry) return

  const { language, handicap } = newEntry

  // Lire toutes les entrées pour cette langue
  const snap    = await db().collection('matchmaking').where('language', '==', language).get()
  const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Filtrer les joueurs compatibles (tolérance de handicap)
  const compatible = entries.filter(
    e => Math.abs((e.handicap ?? 0) - (handicap ?? 0)) <= HANDICAP_TOLERANCE
  )

  if (compatible.length < 5) return // Pas assez de joueurs, on attend

  // Tenter de créer le match, la transaction gère les races conditions
  try {
    const gameId = await createMatchedGame(compatible.slice(0, 5), language)
    console.log(`Match created: ${gameId} (${compatible.slice(0, 5).map(p => p.id).join(', ')})`)
  } catch (err) {
    // Normal si un autre trigger a créé le match en même temps
    console.log('Match creation skipped (concurrent):', err.message)
  }
})

/**
 * Scheduled, toutes les 10 minutes.
 * 1. Tente de créer des matchs humains complets (cas manqués par le trigger).
 * 2. Crée des matchs avec bots pour les joueurs en attente depuis > MAX_WAIT_MS.
 */
exports.matchmakingBotFill = onSchedule({ schedule: 'every 10 minutes', region: 'europe-west4' }, async () => {
  const snap = await db().collection('matchmaking').get()
  if (snap.empty) return

  const now = Date.now()

  // Regrouper les entrées par langue (convertir Timestamp → ms)
  const byLanguage = {}
  snap.docs.forEach(d => {
    const data = d.data()
    const lang = data.language ?? 'en'
    if (!byLanguage[lang]) byLanguage[lang] = []
    byLanguage[lang].push({
      id:         d.id,
      displayName: data.displayName ?? 'Player',
      handicap:   data.handicap ?? 0,
      joinedAtMs: data.joinedAt?.toMillis?.() ?? now,
    })
  })

  for (const [language, allEntries] of Object.entries(byLanguage)) {
    // Trier du plus ancien au plus récent
    let remaining = [...allEntries].sort((a, b) => a.joinedAtMs - b.joinedAtMs)

    while (remaining.length > 0) {
      const anchor     = remaining[0]
      const compatible = remaining.filter(
        e => Math.abs(e.handicap - anchor.handicap) <= HANDICAP_TOLERANCE
      )

      if (compatible.length >= 5) {
        // Assez de joueurs humains → créer un match sans bots
        try {
          const five  = compatible.slice(0, 5)
          const gameId = await createMatchedGame(five, language)
          console.log(`Scheduled match: ${gameId} (${language})`)
          const matchedIds = new Set(five.map(p => p.id))
          remaining = remaining.filter(e => !matchedIds.has(e.id))
        } catch (err) {
          console.log('Scheduled match skipped (concurrent):', err.message)
          break // Arrêter pour cette langue et laisser le prochain run gérer
        }
      } else if (anchor.joinedAtMs < now - MAX_WAIT_MS) {
        // Anchor a trop attendu → compléter avec des bots
        try {
          const gameId = await createGameWithBots(compatible, language)
          console.log(`Bot-fill match: ${gameId} (${language}, ${compatible.length} humans)`)
          const handledIds = new Set(compatible.map(p => p.id))
          remaining = remaining.filter(e => !handledIds.has(e.id))
        } catch (err) {
          console.log('Bot-fill skipped (concurrent):', err.message)
          break
        }
      } else {
        // Pas assez de joueurs et délai non dépassé → rien à faire
        break
      }
    }
  }
})
