// Défi quotidien (Phase C).
//
// Exports :
//   generateDailyChallenge, scheduled à 00h00 Europe/Paris.
//     Génère un doc par langue (fr + en) dans dailyChallenges/{YYYY-MM-DD}_{lang}
//     avec un board pré-rempli, une réglette fixe, et le bestScore précalculé.
//
//   submitDailyChallenge  , callable.
//     Valide le coup du joueur, calcule le score, attribue 1/2/3 perles selon
//     le tier (100% / ≥60% / <60%), incrémente la streak si hier atteint.
//     Un joueur ne peut soumettre qu'un seul défi par jour (toutes langues confondues).

'use strict'

const { onSchedule }         = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin                   = require('firebase-admin')

const {
  buildWord,
  detectCrossWords,
  calculateWordScore,
  touchesBorderCheck,
} = require('./boardHelpers')
const { getDictionary, getDictionaryIndex, isValidWord } = require('./dictionary')
const { generateChallenge }          = require('./dailyChallengeGen')
const { solveChallenge }             = require('./dailyChallengeSolver')

const db = () => admin.firestore()

const LANGUAGES = ['en', 'fr', 'es', 'de']

// ── Helpers date (heure Paris) ──────────────────────────────────────────────

/** Retourne "YYYY-MM-DD" dans le fuseau Europe/Paris. */
function parisDateString(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  })
  return fmt.format(date) // "YYYY-MM-DD" grâce à la locale en-CA
}

/** Retourne la date "YYYY-MM-DD" de la veille en heure Paris. */
function parisYesterday(date = new Date()) {
  const d = new Date(date.getTime() - 24 * 60 * 60 * 1000)
  return parisDateString(d)
}

/** Retourne la date "YYYY-MM-DD" d'il y a N jours en heure Paris. */
function parisDaysAgo(n, date = new Date()) {
  const d = new Date(date.getTime() - n * 24 * 60 * 60 * 1000)
  return parisDateString(d)
}

// Supprime les défis datant de plus de 7 jours (comparaison lexicographique
// sur le champ "date" au format YYYY-MM-DD, qui reflète l'ordre chronologique).
async function purgeOldChallenges() {
  const cutoff = parisDaysAgo(7)
  const snap = await db()
    .collection('dailyChallenges')
    .where('date', '<', cutoff)
    .get()

  if (snap.empty) {
    console.log('[dailyChallenge] Aucun ancien défi à supprimer')
    return
  }

  // Batch par paquets de 500 (limite Firestore)
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db().batch()
    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  console.log(`[dailyChallenge] ${docs.length} défis antérieurs au ${cutoff} supprimés`)
}

// ── Scheduled : générer les défis du jour ───────────────────────────────────

exports.generateDailyChallenge = onSchedule(
  {
    schedule:  '0 0 * * *',
    timeZone:  'Europe/Paris',
    region:    'europe-west4',
    timeoutSeconds: 540,
    memory:    '2GiB',
  },
  async () => {
    const today = parisDateString()
    console.log(`[dailyChallenge] Génération pour ${today}`)

    // Purge des anciens défis (> 7 jours) avant la génération
    try {
      await purgeOldChallenges()
    } catch (err) {
      // Non bloquant : on continue la génération même si la purge échoue
      console.error('[dailyChallenge] Erreur lors de la purge:', err)
    }

    // Séquentiel : solveChallenge est CPU-bound synchrone et bloque l'event loop,
    // donc Promise.all ne parallélise rien (le thread Node est unique). Pire,
    // en parallèle les writes Firestore peuvent être émis mais jamais flushés
    // si un autre solve bloque le thread juste après : à la fin du timeout,
    // ces writes sont perdus (incident 2026-04-20 : en solvé mais non écrit).
    // En séquentiel, chaque doc est committé avant de lancer le solve suivant.
    for (const lang of LANGUAGES) {
      const docId = `${today}_${lang}`
      const ref   = db().doc(`dailyChallenges/${docId}`)
      const snap  = await ref.get()

      // Idempotent : si déjà généré (re-run manuel), on saute
      if (snap.exists) {
        console.log(`[dailyChallenge] ${docId} déjà présent, saut`)
        continue
      }

      const dictIndex = getDictionaryIndex(lang)
      if (!dictIndex) {
        console.warn(`[dailyChallenge] Dictionnaire ${lang} manquant, saut`)
        continue
      }

      // 1. Génération board + réglette (déterministe depuis la date)
      const gen = generateChallenge(today, lang, dictIndex)
      console.log(`[dailyChallenge] ${docId}: ${gen.preplacedLetters} lettres, rack ${gen.rackSize}`)

      // 2. Résolution, trouve le meilleur mot possible
      const t0    = Date.now()
      const best  = solveChallenge(gen.board, gen.rack, dictIndex)
      const dtMs  = Date.now() - t0

      if (!best || best.score <= 0) {
        console.warn(`[dailyChallenge] ${docId}: aucun mot trouvé par le solveur (${dtMs}ms), saut`)
        continue
      }
      const crossWordsStr = (best.crossWords ?? []).map(c => c.word).join(', ') || ', '
      console.log(`[dailyChallenge] ${docId}: best "${best.word}" = ${best.score} pts (cross: ${crossWordsStr}) (solve: ${dtMs}ms)`)

      // 3. Écriture Firestore, awaitée avant de passer au solve suivant pour
      // garantir que le write est flushé avant que le thread ne soit re-bloqué.
      await ref.set({
        date:       today,
        language:   lang,
        board:      gen.board,
        rack:       gen.rack,
        rackSize:   gen.rackSize,
        bestScore:  best.score,
        bestWord:   best.word,
        bestCrossWords: (best.crossWords ?? []).map(c => c.word),
        createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  },
)

// ── Helper : calcule le tier de récompense ─────────────────────────────────

/** 100% → 3, ≥60% → 2, sinon 1. bestScore==0 → 1 (cas dégénéré). */
function computePearls(score, bestScore) {
  if (!bestScore || bestScore <= 0) return 1
  const ratio = score / bestScore
  if (ratio >= 1) return 3
  if (ratio >= 0.6) return 2
  return 1
}

// ── Callable : soumettre son coup ──────────────────────────────────────────

exports.submitDailyChallenge = onCall(
  { region: 'europe-west4', enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in')
    }
    const userId = request.auth.uid

    const { challengeId, draftEntries } = request.data ?? {}
    if (!challengeId || !Array.isArray(draftEntries) || draftEntries.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing challengeId or draftEntries')
    }

    // Format challengeId attendu : "YYYY-MM-DD_{lang}"
    const [challengeDate, challengeLang] = challengeId.split('_')
    if (!challengeDate || !challengeLang || !LANGUAGES.includes(challengeLang)) {
      throw new HttpsError('invalid-argument', 'Invalid challengeId')
    }

    // Le challenge doit être celui du jour (anti-replay)
    const today = parisDateString()
    if (challengeDate !== today) {
      throw new HttpsError('failed-precondition', 'This challenge is no longer active')
    }

    // 1. Lecture du challenge
    const challengeRef = db().doc(`dailyChallenges/${challengeId}`)
    const challengeSnap = await challengeRef.get()
    if (!challengeSnap.exists) {
      throw new HttpsError('not-found', 'Daily challenge not found')
    }
    const challenge = challengeSnap.data()

    // 2. Transaction : vérif + validation + écriture atomique
    try {
      const userRef   = db().doc(`users/${userId}`)
      const resultRef = db().doc(`users/${userId}/dailyResults/${today}`)

      const result = await db().runTransaction(async (t) => {
        const userSnap   = await t.get(userRef)
        const resultSnap = await t.get(resultRef)

        if (resultSnap.exists) {
          return { success: false, error: 'already_played' }
        }
        const user = userSnap.exists ? userSnap.data() : {}

        // Verrou croisé-langues : lastDailyDate === today → déjà joué dans l'autre langue
        if (user.lastDailyDate === today) {
          return { success: false, error: 'already_played' }
        }

        // 3. Construire placedLetters + valider contre la main du défi (multiset)
        const placedLetters = draftEntries.map(([key, tile]) => {
          const [row, col] = key.split('_').map(Number)
          return { row, col, letter: String(tile.letter).toUpperCase() }
        })

        // Les lettres posées doivent toutes venir de la réglette fournie
        const rackPool = [...challenge.rack.map(l => String(l).toUpperCase())]
        for (const pl of placedLetters) {
          const idx = rackPool.indexOf(pl.letter)
          if (idx === -1) {
            return { success: false, error: `Letter "${pl.letter}" is not in your rack` }
          }
          rackPool.splice(idx, 1)
        }

        // Toutes les cellules posées doivent être libres
        for (const pl of placedLetters) {
          if (challenge.board[`${pl.row}_${pl.col}`]) {
            return { success: false, error: 'Cell already occupied' }
          }
        }

        // 4. Reconstruire le mot + cross-words
        const wordData = buildWord(placedLetters, challenge.board)
        if (!wordData || wordData.word.length < 2) {
          return { success: false, error: 'Word too short' }
        }
        const crossWords = detectCrossWords(placedLetters, challenge.board, wordData.direction)

        // 5. Valider contre le dictionnaire
        const dict = getDictionary(challengeLang)
        if (!isValidWord(wordData.word, dict)) {
          return { success: false, error: `"${wordData.word}" is not in the dictionary` }
        }
        for (const cw of crossWords) {
          if (!isValidWord(cw.word, dict)) {
            return { success: false, error: `"${cw.word}" is not in the dictionary` }
          }
        }

        // 6. Score (même formule qu'en partie normale)
        const rawPoints = calculateWordScore(wordData.existingCount, wordData.newCount)
          + crossWords.reduce((s, cw) => s + calculateWordScore(cw.existingCount, cw.newCount), 0)

        const touchesBorder = touchesBorderCheck(draftEntries)
        const finalScore    = touchesBorder ? Math.max(0, rawPoints - 10) : rawPoints

        // 7. Pearls selon tier + streak
        const pearlsEarned = computePearls(finalScore, challenge.bestScore ?? 0)

        const yesterday = parisYesterday()
        const prevStreak = user.dailyStreak ?? 0
        const newStreak  = user.lastDailyDate === yesterday ? prevStreak + 1 : 1

        // 8. Écritures
        t.set(resultRef, {
          date:         today,
          language:     challengeLang,
          score:        finalScore,
          bestScore:    challenge.bestScore ?? 0,
          bestWord:     challenge.bestWord ?? null,
          bestCrossWords: challenge.bestCrossWords ?? [],
          pearlsEarned,
          word:         wordData.word,
          crossWords:   crossWords.map(cw => cw.word),
          placedLetters,
          touchesBorder,
          playedAt:     admin.firestore.FieldValue.serverTimestamp(),
        })

        t.set(userRef, {
          dailyStreak:    newStreak,
          lastDailyDate:  today,
          pearls:         admin.firestore.FieldValue.increment(pearlsEarned),
        }, { merge: true })

        return {
          success:       true,
          score:         finalScore,
          bestScore:     challenge.bestScore ?? 0,
          bestWord:      challenge.bestWord ?? null,
          pearlsEarned,
          newStreak,
          word:          wordData.word,
          touchesBorder,
        }
      })

      return result
    } catch (err) {
      if (err instanceof HttpsError) throw err
      console.error('submitDailyChallenge error:', err)
      return { success: false, error: 'Transaction failed, try again' }
    }
  },
)
