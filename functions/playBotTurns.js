// Scheduled, toutes les 2h.
// Joue un coup pour un seul bot par partie active (round-robin déterministe).
//
// Pourquoi cette cadence :
//   - Gratuit : 1 invocation / 2h × ~N parties actives = quelques dizaines de
//     reads et writes par cycle, très en dessous des quotas free tier.
//   - Round-robin sur (hourIndex % bots.length): déterministe, pas besoin de
//     stocker un "nextBotToPlay" en base. Un bot donné joue donc toutes les
//     2 × bots.length heures, ce qui est volontaire : on veut un rythme lent
//     et humain, pas une course.
//
// La transaction (boardVersion) garantit la cohérence si un humain joue
// simultanément dans la même partie.

'use strict'

const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin          = require('firebase-admin')
const {
  buildWord,
  detectCrossWords,
  touchesBorderCheck,
  calculateWordScore,
} = require('./boardHelpers')
const { findBotMove }           = require('./botLogic')
const { getDictionaryIndex }    = require('./dictionary')
const { drawRandomLetter, autoFinishLastPlayer } = require('./constants')

const db = () => admin.firestore()

const CYCLE_HOURS   = 2
const BOT_DRAW_COST = 20

// Regen passive (1 AP/min, cap 500): miroir de src/utils/ap.js
function getCurrentAP(apStored, lastApUpdate) {
  const elapsed = Math.max(0, Date.now() - (lastApUpdate ?? Date.now()))
  const regen   = Math.floor(elapsed / 60_000)
  return Math.min(500, (apStored ?? 0) + regen)
}

function computeNewAP(apStored, lastApUpdate, cost) {
  const current  = getCurrentAP(apStored, lastApUpdate)
  const newStore = Math.max(0, current - cost)
  // Préserve la fraction de minute pour éviter la dérive
  const elapsed  = Math.max(0, Date.now() - (lastApUpdate ?? Date.now()))
  const remainMs = elapsed % 60_000
  return { apStored: newStore, lastApUpdate: Date.now() - remainMs }
}

// ── Point d'entrée ──────────────────────────────────────────────────────────

exports.playBotTurns = onSchedule(
  { schedule: 'every 2 hours', region: 'europe-west4' },
  async () => {
    // Index déterministe basé sur le timestamp, partagé entre toutes les parties
    // pour ce cycle → chaque partie fait tourner son bot indépendamment mais
    // avec le même "tick" global, simple et prévisible.
    const cycleIndex = Math.floor(Date.now() / (CYCLE_HOURS * 3600_000))

    const snap = await db().collection('games')
      .where('status',  '==', 'active')
      .where('hasBots', '==', true)
      .get()

    if (snap.empty) return

    console.log(`playBotTurns: ${snap.size} game(s) with bots`)

    // Traiter chaque partie séparément pour isoler les erreurs
    for (const gameDoc of snap.docs) {
      try {
        await playOneBotInGame(gameDoc.ref, cycleIndex)
      } catch (err) {
        console.error(`playBotTurns[${gameDoc.id}]`, err)
      }
    }
  }
)

// ── Logique par partie ──────────────────────────────────────────────────────

async function playOneBotInGame(gameRef, cycleIndex) {
  // Lecture hors-transaction pour trouver le bot, la transaction relira tout.
  const snap = await gameRef.get()
  if (!snap.exists) return
  const game = snap.data()
  if (game.status !== 'active') return

  const bots = (game.players ?? []).filter(p => p.isBot && !p.finished)
  if (bots.length === 0) return

  const lang      = game.language ?? 'en'
  const dictIndex = getDictionaryIndex(lang)

  // Étape 1 : tous les bots piochent au maximum (dans une même transaction).
  // On veut que leur rack soit toujours le plus rempli possible, indépendamment
  // du round-robin qui ne fait jouer qu'un seul bot par cycle.
  await drawAllBotsMax(gameRef, lang)

  // Étape 2 : round-robin déterministe, un bot joue un coup.
  // Relecture nécessaire : son rack a pu changer à l'étape précédente.
  const freshSnap = await gameRef.get()
  if (!freshSnap.exists) return
  const freshGame = freshSnap.data()
  if (freshGame.status !== 'active') return

  const freshBots = (freshGame.players ?? []).filter(p => p.isBot && !p.finished)
  if (freshBots.length === 0) return

  const bot  = freshBots[cycleIndex % freshBots.length]
  const move = findBotMove(bot.hand, freshGame.board ?? {}, dictIndex)

  if (move) {
    await applyBotMove(gameRef, bot.userId, move)
  }
  // Pas de fallback pioche : le bot a déjà pioché au max à l'étape 1.
}

// ── Action : pioche groupée pour tous les bots ──────────────────────────────

async function drawAllBotsMax(gameRef, language) {
  await db().runTransaction(async (t) => {
    const snap = await t.get(gameRef)
    if (!snap.exists) return
    const game = snap.data()
    if (game.status !== 'active') return

    let changed = false
    const players = game.players.map(p => {
      if (!p.isBot || p.finished) return p

      let hand         = [...(p.hand ?? [])]
      let apStored     = p.apStored ?? 0
      let lastApUpdate = p.lastApUpdate ?? Date.now()

      // Pioche tant que possible : rack non plein ET PA ≥ 20
      while (hand.length < (p.handSize ?? 8)) {
        const currentAP = getCurrentAP(apStored, lastApUpdate)
        if (currentAP < BOT_DRAW_COST) break

        const { apStored: newAP, lastApUpdate: newLast } =
          computeNewAP(apStored, lastApUpdate, BOT_DRAW_COST)
        apStored     = newAP
        lastApUpdate = newLast
        hand.push(drawRandomLetter(language))
        changed = true
      }

      return { ...p, hand, apStored, lastApUpdate }
    })

    if (!changed) return
    t.update(gameRef, { players })
  })
}

// ── Action : le bot joue un mot ─────────────────────────────────────────────

async function applyBotMove(gameRef, botId, move) {
  const { placedLetters, wordData } = move

  await db().runTransaction(async (t) => {
    const snap = await t.get(gameRef)
    if (!snap.exists) return
    const game = snap.data()
    if (game.status !== 'active') return

    const bot = game.players.find(p => p.userId === botId)
    if (!bot || bot.finished) return

    // Re-vérifier : le plateau a pu changer depuis la lecture initiale.
    // Si oui, on abandonne ce tour, le prochain cycle réessaiera avec un nouveau board.
    for (const { row, col } of placedLetters) {
      if (game.board?.[`${row}_${col}`]) return
    }

    // Recalculer mot + crossWords depuis le board à jour dans la transaction
    const freshWordData = buildWord(placedLetters, game.board ?? {})
    if (!freshWordData || freshWordData.word !== wordData.word) return

    const crossWords  = detectCrossWords(placedLetters, game.board ?? {}, freshWordData.direction)
    const draftEntries = placedLetters.map(({ row, col, letter }) => [
      `${row}_${col}`, { letter },
    ])
    const touchBorder = touchesBorderCheck(draftEntries)

    const rawPoints = calculateWordScore(freshWordData.existingCount, freshWordData.newCount)
      + crossWords.reduce((sum, cw) => sum + calculateWordScore(cw.existingCount, cw.newCount), 0)

    // Mettre à jour le board
    let newBoard
    if (touchBorder) {
      newBoard = {}
    } else {
      newBoard = { ...(game.board ?? {}) }
      for (const [key, tile] of draftEntries) {
        newBoard[key] = { letter: tile.letter.toUpperCase(), playedBy: botId }
      }
    }

    // Retirer les lettres jouées de la main du bot
    const usedLetters   = placedLetters.map(p => p.letter)
    const remainingHand = [...bot.hand]
    for (const l of usedLetters) {
      const idx = remainingHand.indexOf(l)
      if (idx !== -1) remainingHand.splice(idx, 1)
    }

    const scoreAfterWord = (bot.score ?? 0) + rawPoints
    const finalScore     = touchBorder ? Math.max(0, scoreAfterWord - 10) : scoreAfterWord
    const netPoints      = finalScore - (bot.score ?? 0)
    const alreadyFinishedCount = game.players.filter(p => p.finished).length

    const playersAfterWord = game.players.map(p => {
      if (p.userId !== botId) return p
      const isNowFinished = finalScore >= p.targetScore
      return {
        ...p,
        score:      finalScore,
        hand:       remainingHand,
        finished:   isNowFinished,
        rank:       isNowFinished ? alreadyFinishedCount + 1 : p.rank,
        finishedAt: isNowFinished ? Date.now() : p.finishedAt,
      }
    })
    // Si ce bot laisse un seul joueur en lice, on le termine auto avec
    // son score courant (reçoit ses perles normalement via onGameEnd).
    const players = autoFinishLastPlayer(playersAfterWord)

    const wordEntry = {
      word:          freshWordData.word,
      crossWords,
      touchesBorder: touchBorder,
      rawPoints,
      playedBy:      botId,
      displayName:   bot.displayName ?? '',
      points:        netPoints,
      timestamp:     Date.now(),
    }
    const lastWords   = [wordEntry, ...(game.lastWords ?? [])].slice(0, 10)
    const allFinished = players.every(p => p.finished)

    t.update(gameRef, {
      board:        newBoard,
      boardVersion: (game.boardVersion ?? 0) + 1,
      players,
      lastWords,
      lastMoveAt:   admin.firestore.FieldValue.serverTimestamp(),
      ...(allFinished ? { status: 'finished', finishedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    })
  })
}

