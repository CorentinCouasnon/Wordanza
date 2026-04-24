// Service Firestore pour les parties.
//
// Les actions de jeu qui modifient la main / les PA / les power-ups passent
// désormais par la Cloud Function callable `gameAction` (server-authoritative).
// Ce fichier se limite aux opérations CRUD (création, join, subscribe) et aux
// wrappers des callables.

import i18next from 'i18next'
import { db, functions } from '../firebase/config'
import {
  doc, collection, addDoc, updateDoc, getDoc,
  query, where, getDocs,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getTargetScore, getTotalSkillPoints } from '../utils/handicap'
import { drawMultipleLetters } from '../constants/LETTERS'
import { getMaxGameSlots } from '../constants/GAME_SLOTS'

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Construit l'objet joueur stocké dans le tableau players[] d'une partie.
 */
export function buildPlayerEntry(userId, displayName, skills = {}) {
  const creativity = skills.creativity ?? 0
  const wisdom     = skills.wisdom     ?? 0

  return {
    userId,
    displayName,
    score:       0,
    targetScore: getTargetScore(getTotalSkillPoints(skills)),
    apStored:    160 + wisdom * 20,
    // Stocké en ms (number) pour pouvoir faire de l'arithmétique directement
    lastApUpdate: Date.now(),
    hand:        [],           // string[]: lettres en main
    handSize:    6 + creativity,
    finished:          false,
    rank:              null,
    finishedAt:        null,
    pearlsDistributed: false,
    shieldActive:      false,
    powerupUsage:      {},
  }
}

/**
 * Construit l'objet joueur pour un bot.
 * Le bot a un ID unique généré localement (pas de compte Firebase Auth).
 * Sa main est déjà tirée au sort dès la création de la partie.
 *
 * @param {string} displayName - Nom affiché (ex: "Capybara Bot")
 * @param {string} language    - Langue de la partie pour la distribution des lettres
 */
export function buildBotPlayerEntry(displayName, language = 'en') {
  // ID local unique, pas un UID Firebase, mais unique dans le contexte de la partie
  const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const entry = buildPlayerEntry(botId, displayName, {}) // bots sans compétences
  return {
    ...entry,
    isBot: true,
    hand:  drawMultipleLetters(entry.handSize, language),
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Returns true if the player has reached their simultaneous-games limit.
 * Default limit is 1, increased by `users.extraGameSlots` (up to MAX_EXTRA_GAME_SLOTS).
 */
async function hasReachedSlotLimit(userId) {
  const userSnap   = await getDoc(doc(db, 'users', userId))
  const extraSlots = userSnap.data()?.extraGameSlots ?? 0
  const maxSlots   = getMaxGameSlots(extraSlots)

  const q    = query(collection(db, 'games'), where('playerIds', 'array-contains', userId))
  const snap = await getDocs(q)
  const ongoingCount = snap.docs.reduce((acc, d) => {
    const game = d.data()
    if (game.status === 'waiting') return acc + 1
    if (game.status === 'active') {
      // Active but the player already finished/forfeited → doesn't count
      const player = game.players?.find(p => p.userId === userId)
      return player && !player.finished ? acc + 1 : acc
    }
    return acc
  }, 0)

  return ongoingCount >= maxSlots
}

export async function createGame(userId, displayName, skills = {}, language = 'en') {
  if (await hasReachedSlotLimit(userId)) {
    throw new Error(i18next.t('lobby.alreadyInGame'))
  }

  const player = buildPlayerEntry(userId, displayName, skills)
  const ref = await addDoc(collection(db, 'games'), {
    status:            'waiting',
    language,
    boardVersion:      0,
    board:             {},
    lastWords:         [],
    createdAt:         serverTimestamp(),
    startedAt:         null,
    lastMoveAt:        serverTimestamp(),
    finishedAt:        null,
    players:           [player],
    // playerIds est maintenu en parallèle de players[] pour les règles Firestore.
    // Les Security Rules ne peuvent pas mapper un tableau d'objets → on stocke
    // les UIDs séparément pour pouvoir écrire : uid in resource.data.playerIds
    playerIds:    [userId],
    // Marque la partie comme privée (créée à la main via lien, par opposition au matchmaking).
    // Les parties privées n'accordent pas de Pearls en fin de partie (voir onGameEnd.js).
    isPrivate:    true,
  })
  return ref.id
}

/**
 * Rejoint une partie existante en "waiting".
 * La partie ne démarre PAS automatiquement, le démarrage est géré
 * soit par startGame() (manuel/test), soit par la logique de matchmaking.
 */
export async function joinGame(gameId, userId, displayName, skills = {}) {
  const gameRef = doc(db, 'games', gameId)
  const snap = await getDoc(gameRef)
  if (!snap.exists()) throw new Error('Game not found')

  const game = snap.data()
  if (game.status === 'finished') throw new Error('Game is already finished')
  if (game.status === 'active')   throw new Error('Game has already started')
  // Déjà dans la partie → rien à faire
  if (game.players.some(p => p.userId === userId)) return

  // Block joining if the player has hit their simultaneous-games limit
  if (await hasReachedSlotLimit(userId)) {
    throw new Error(i18next.t('lobby.alreadyInGame'))
  }

  const player     = buildPlayerEntry(userId, displayName, skills)
  const newPlayers = [...game.players, player]
  const isFull     = newPlayers.length >= 5  // Démarrage automatique à 5 joueurs

  // Quand la partie démarre, réinitialiser lastApUpdate pour tous les joueurs
  // au même instant, sinon ceux qui ont attendu longtemps dans le lobby
  // auraient déjà regénéré des PA avant que la partie ait officiellement commencé.
  const startTs  = Date.now()
  const players  = isFull
    ? newPlayers.map(p => ({ ...p, lastApUpdate: startTs }))
    : newPlayers

  await updateDoc(gameRef, {
    players,
    playerIds:  [...(game.playerIds ?? []), userId],
    lastMoveAt: serverTimestamp(),
    ...(isFull ? { status: 'active', startedAt: serverTimestamp() } : {}),
  })
}

/**
 * S'abonne aux mises à jour temps réel d'une partie (onSnapshot).
 *
 * @param {string} gameId
 * @param {function} callback - Appelé avec { id, ...data } ou null si la partie n'existe pas
 * @returns {function} Fonction de désabonnement à appeler dans useEffect cleanup
 */
export function subscribeToGame(gameId, callback) {
  return onSnapshot(doc(db, 'games', gameId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}

// ── Bots en partie privée ───────────────────────────────────────────────────

// Liste miroir de BOT_NAMES dans functions/constants.js, dupliquée côté client
// pour pouvoir construire un bot sans aller-retour serveur quand l'hôte l'ajoute
// dans le lobby d'une partie privée.
const BOT_NAMES = [
  'Panda Bot', 'Koala Bot', 'Otter Bot', 'Tapir Bot', 'Lemur Bot',
  'Capybara Bot', 'Axolotl Bot', 'Flamingo Bot', 'Platypus Bot',
  'Narwhal Bot', 'Pangolin Bot', 'Okapi Bot',
]

function pickBotName(usedNames = []) {
  const available = BOT_NAMES.filter(n => !usedNames.includes(n))
  const pool      = available.length > 0 ? available : BOT_NAMES
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Ajoute un bot à une partie privée en "waiting".
 * Met `hasBots: true` pour que le scheduler serveur `playBotTurns` prenne la
 * partie en compte une fois démarrée.
 */
export async function addBotToPrivateGame(gameId) {
  const gameRef = doc(db, 'games', gameId)
  const snap    = await getDoc(gameRef)
  if (!snap.exists()) throw new Error('Game not found')

  const game = snap.data()
  if (game.status !== 'waiting') throw new Error('Game already started')
  if ((game.players?.length ?? 0) >= 5) throw new Error('Game is full')

  const usedNames = (game.players ?? []).filter(p => p.isBot).map(p => p.displayName)
  const bot       = buildBotPlayerEntry(pickBotName(usedNames), game.language ?? 'en')

  await updateDoc(gameRef, {
    players:    [...(game.players ?? []), bot],
    hasBots:    true,
    lastMoveAt: serverTimestamp(),
  })
}

/**
 * Retire un bot d'une partie privée en "waiting".
 * Repasse `hasBots` à false si plus aucun bot ne reste.
 */
export async function removeBotFromPrivateGame(gameId, botUserId) {
  const gameRef = doc(db, 'games', gameId)
  const snap    = await getDoc(gameRef)
  if (!snap.exists()) throw new Error('Game not found')

  const game       = snap.data()
  if (game.status !== 'waiting') throw new Error('Game already started')

  const newPlayers = (game.players ?? []).filter(p => p.userId !== botUserId)
  const stillHasBots = newPlayers.some(p => p.isBot)

  await updateDoc(gameRef, {
    players:    newPlayers,
    hasBots:    stillHasBots,
    lastMoveAt: serverTimestamp(),
  })
}

// ── Validation de mot (callable) ────────────────────────────────────────────

/**
 * Valide un mot via la Cloud Function validateWord (callable HTTPS).
 *
 * Le serveur relit le board depuis Firestore, recalcule le score et vérifie
 * le dictionnaire, le client n'envoie pas rawPoints ni crossWords.
 *
 * Retourne { success, touchesBorder, finalPoints, rawPoints }
 *   ou { success: false, error }
 */
export async function validateWordCallable({
  gameId,
  userId,
  currentBoardVersion,
  draftEntries,
  remainingHand,
}) {
  try {
    const fn     = httpsCallable(functions, 'validateWord')
    const result = await fn({ gameId, userId, currentBoardVersion, draftEntries, remainingHand })
    return result.data
  } catch (err) {
    // FirebaseFunctionsError, ex: unauthenticated, permission-denied
    const message = err?.message ?? i18next.t('game.validationFailed')
    return { success: false, error: message }
  }
}

// ── Actions de jeu (callable gameAction) ────────────────────────────────────

/**
 * Wrapper générique pour la Cloud Function `gameAction`.
 *
 * Toutes les actions server-authoritative (pioche, power-ups, forfait) passent
 * par ici. Le serveur recalcule les PA, tire les lettres aléatoires et écrit
 * le résultat dans Firestore dans une transaction.
 *
 * @param {string} gameId
 * @param {string} action  - ex: 'drawLetter', 'trash', 'recycle', 'binoculars', 'forfeit'…
 * @param {object} params  - paramètres spécifiques à l'action (targetId, letter, draftLetters…)
 * @returns {Promise<object>} La réponse du serveur.
 *   En cas d'erreur HttpsError, l'objet contient { error, code }.
 */
export async function callGameAction(gameId, action, params = {}) {
  try {
    const fn     = httpsCallable(functions, 'gameAction')
    const result = await fn({ gameId, action, params })
    return result.data
  } catch (err) {
    // FirebaseFunctionsError expose { code, message, details }
    return {
      success: false,
      error:   err?.message ?? 'Action failed',
      code:    err?.code,
    }
  }
}

/**
 * Abandon de partie. Wrapper de callGameAction → 'forfeit'.
 * Utilisé par le bouton "Forfeit" dans GamePage.
 */
export async function forfeitGame(gameId) {
  const result = await callGameAction(gameId, 'forfeit')
  if (!result?.success) {
    throw new Error(result?.error ?? 'Forfeit failed')
  }
}

// ── Dev bypass ──────────────────────────────────────────────────────────────

/**
 * Ajoute des points directement au score d'un joueur.
 * Utilisé uniquement pour les tests de développement (bouton DEV protégé par `users.isDev`).
 * NOTE : le serveur ne valide pas ce bypass, à durcir ou protéger par un check isDev serveur
 * avant de déployer en production grand public.
 */
export async function devAddScore(gameId, userId, points) {
  const gameRef = doc(db, 'games', gameId)
  const snap    = await getDoc(gameRef)
  if (!snap.exists()) return

  const game       = snap.data()
  const players    = game.players.map(p => {
    if (p.userId !== userId) return p
    const newScore      = p.score + points
    const alreadyFinishedCount = game.players.filter(pl => pl.finished).length
    const isNowFinished = newScore >= p.targetScore
    return {
      ...p,
      score:      newScore,
      finished:   isNowFinished,
      rank:       isNowFinished && !p.finished ? alreadyFinishedCount + 1 : p.rank,
      finishedAt: isNowFinished && !p.finished ? Date.now() : p.finishedAt,
    }
  })

  const allFinished = players.every(p => p.finished)

  await updateDoc(gameRef, {
    players,
    ...(allFinished ? { status: 'finished', finishedAt: serverTimestamp() } : {}),
  })
}

// ── Démarrage forcé ─────────────────────────────────────────────────────────

/**
 * Force le démarrage d'une partie encore en "waiting".
 * Utilisé uniquement pour les tests (bouton "Force start" en mode dev).
 *
 * En production, la partie démarre automatiquement quand assez de joueurs
 * ont rejoint (logique dans joinGame).
 */
export async function startGame(gameId) {
  const gameRef = doc(db, 'games', gameId)
  const snap    = await getDoc(gameRef)
  if (!snap.exists()) return

  // Réinitialiser lastApUpdate pour tous les joueurs au même instant
  const startTs = Date.now()
  const players = snap.data().players.map(p => ({ ...p, lastApUpdate: startTs }))

  await updateDoc(gameRef, {
    status:    'active',
    startedAt: serverTimestamp(),
    players,
  })
}

// ── Mise à jour des PA uniquement (salle d'attente) ─────────────────────────

/**
 * Met à jour uniquement les PA d'un joueur, sans toucher à sa main.
 * Utilisé pour corriger l'AP de départ quand wisdom change en salle d'attente.
 * la partie n'est pas encore active, donc gameAction ne s'applique pas ici.
 */
export async function updatePlayerAP(gameId, userId, newAP) {
  const gameRef = doc(db, 'games', gameId)
  const snap    = await getDoc(gameRef)
  if (!snap.exists()) return

  const players = snap.data().players.map(p =>
    p.userId !== userId ? p : { ...p, apStored: newAP, lastApUpdate: Date.now() }
  )
  await updateDoc(gameRef, { players })
}
