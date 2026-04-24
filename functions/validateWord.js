// Callable HTTPS: validation de mot côté serveur.
//
// Le serveur relit le board depuis Firestore, recalcule le score et vérifie le
// dictionnaire. Le client n'envoie pas de score, le serveur est source de vérité.
// Les bots valident via validateWordTransaction directement (pas de latence callable).
//
// Dictionnaires : copiés automatiquement dans functions/dictionaries/ au déploiement
// (predeploy dans firebase.json). Si absents, la vérification dictionnaire est ignorée.

'use strict'

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const {
  buildWord,
  detectCrossWords,
  touchesBorderCheck,
  calculateWordScore,
} = require('./boardHelpers')
const { getDictionary, isValidWord } = require('./dictionary')
const { autoFinishLastPlayer } = require('./constants')

const db = () => admin.firestore()

// ── Callable ──────────────────────────────────────────────────────────────────

exports.validateWord = onCall({ region: 'europe-west4', enforceAppCheck: true }, async (request) => {
  // 1. Vérification d'authentification
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in')
  }

  const { gameId, userId, currentBoardVersion, draftEntries, remainingHand } = request.data

  // Le userId doit correspondre à l'appelant pour éviter qu'un joueur joue pour un autre
  if (request.auth.uid !== userId) {
    throw new HttpsError('permission-denied', 'Cannot validate word for another player')
  }

  if (!gameId || !draftEntries?.length || !remainingHand) {
    throw new HttpsError('invalid-argument', 'Missing required parameters')
  }

  // 2. Construire placedLetters depuis les draftEntries
  // draftEntries = [["row_col", { id, letter }], ...]
  const placedLetters = draftEntries.map(([key, tile]) => {
    const [row, col] = key.split('_').map(Number)
    return { row, col, letter: tile.letter.toUpperCase() }
  })

  // 3. Transaction Firestore
  const gameRef = db().doc(`games/${gameId}`)

  try {
    const result = await db().runTransaction(async (t) => {
      const snap = await t.get(gameRef)
      if (!snap.exists) throw new HttpsError('not-found', 'Game not found')

      const game = snap.data()

      // Vérification de version (conflit avec un autre joueur)
      if (game.boardVersion !== currentBoardVersion) {
        return { success: false, error: 'Board was modified, try again' }
      }

      // Vérification de chevauchement (sécurité anti-cheating)
      for (const [key] of draftEntries) {
        if (game.board[key]) {
          return { success: false, error: 'Cell already occupied' }
        }
      }

      // 4. Vérifier que les lettres jouées proviennent bien de la main du joueur.
      // On compare en multiset : stored.hand doit contenir remainingHand + placedLetters.
      // Sinon un client trafiqué pourrait jouer des lettres qu'il n'a jamais eues.
      const currentPlayerCheck = game.players.find(p => p.userId === userId)
      if (!currentPlayerCheck) return { success: false, error: 'Player not found in game' }
      const handPool = [...(currentPlayerCheck.hand ?? [])]
      const claimed  = [
        ...remainingHand.map(l => String(l).toUpperCase()),
        ...placedLetters.map(p => p.letter),
      ]
      for (const l of claimed) {
        const idx = handPool.indexOf(l)
        if (idx === -1) {
          return { success: false, error: `Letter "${l}" is not in your hand` }
        }
        handPool.splice(idx, 1)
      }

      // 4bis. Recalculer le mot principal + mots croisés depuis le board actuel
      const wordData = buildWord(placedLetters, game.board)
      if (!wordData || wordData.word.length < 2) {
        return { success: false, error: 'Word too short' }
      }

      const crossWords  = detectCrossWords(placedLetters, game.board, wordData.direction)
      const touchBorder = touchesBorderCheck(draftEntries)

      // 5. Valider contre le dictionnaire
      const dict = getDictionary(game.language ?? 'en')

      if (!isValidWord(wordData.word, dict)) {
        return { success: false, error: `"${wordData.word}" is not in the dictionary` }
      }
      for (const cw of crossWords) {
        if (!isValidWord(cw.word, dict)) {
          return { success: false, error: `"${cw.word}" is not in the dictionary` }
        }
      }

      // 6. Recalculer le score côté serveur (on ne fait pas confiance au client)
      const rawPoints = calculateWordScore(wordData.existingCount, wordData.newCount)
        + crossWords.reduce((sum, cw) => sum + calculateWordScore(cw.existingCount, cw.newCount), 0)

      // 7. Mettre à jour le board
      let newBoard
      if (touchBorder) {
        newBoard = {} // Reset si le bord est touché
      } else {
        newBoard = { ...game.board }
        for (const [key, tile] of draftEntries) {
          newBoard[key] = { letter: tile.letter.toUpperCase(), playedBy: userId }
        }
      }

      // 8. Mettre à jour le joueur
      const alreadyFinishedCount = game.players.filter(p => p.finished).length
      const currentPlayer        = game.players.find(p => p.userId === userId)
      if (!currentPlayer) return { success: false, error: 'Player not found in game' }

      const scoreAfterWord = (currentPlayer.score ?? 0) + rawPoints
      const finalScore     = touchBorder ? Math.max(0, scoreAfterWord - 10) : scoreAfterWord
      const netPoints      = finalScore - (currentPlayer.score ?? 0)

      const playersAfterWord = game.players.map(p => {
        if (p.userId !== userId) return p
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
      // Si le joueur courant vient de finir et qu'il ne reste qu'une personne
      // en lice, on termine automatiquement cette dernière avec son score
      // actuel (elle recevra ses perles normalement, pas de forfait).
      const players = autoFinishLastPlayer(playersAfterWord)

      // 9. Historique des derniers mots
      const wordEntry = {
        word:        wordData.word,
        crossWords,
        touchesBorder: touchBorder,
        rawPoints,
        playedBy:    userId,
        displayName: currentPlayer.displayName ?? '',
        points:      netPoints,
        timestamp:   Date.now(),
      }
      const lastWords   = [wordEntry, ...(game.lastWords ?? [])].slice(0, 10)
      const allFinished = players.every(p => p.finished)

      t.update(gameRef, {
        board:        newBoard,
        boardVersion: game.boardVersion + 1,
        players,
        lastWords,
        lastMoveAt:   admin.firestore.FieldValue.serverTimestamp(),
        ...(allFinished ? { status: 'finished', finishedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      })

      return { success: true, touchesBorder: touchBorder, finalPoints: netPoints, rawPoints }
    })

    return result
  } catch (err) {
    // HttpsError est relancée telle quelle (auth, not-found...)
    if (err instanceof HttpsError) throw err
    // Erreur inattendue
    console.error('validateWord error:', err)
    return { success: false, error: 'Transaction failed, try again' }
  }
})
