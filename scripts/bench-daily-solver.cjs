// Benchmark + sanity check pour le solveur du défi quotidien.
//
// Compare l'ancien solveur (dict-first) avec le nouveau (slot-driven) sur
// plusieurs dates/langues. Attendu :
//   - bestScore identique
//   - bestWord identique OU de même score (ties autorisées, ordre d'itération peut différer)
//   - nouveau solveur significativement plus rapide
//
// Usage (depuis la racine du repo) :
//   node scripts/bench-daily-solver.js
//   node scripts/bench-daily-solver.js fr en     # limiter aux langues données
//   node scripts/bench-daily-solver.js --dates=2026-04-20,2026-04-21

'use strict'

const path = require('path')
const fs   = require('fs')

const FN_DIR = path.join(__dirname, '..', 'functions')

const { generateChallenge } = require(path.join(FN_DIR, 'dailyChallengeGen.js'))
const { getDictionary, getDictionaryIndex } = require(path.join(FN_DIR, 'dictionary.js'))
const { solveChallenge: solveChallengeNew } = require(path.join(FN_DIR, 'dailyChallengeSolver.js'))

// Le nouveau solveur a remplacé le fichier, on embarque ici l'ancien pour comparer.
const {
  validatePlacement,
  calculateWordScore,
  BOARD_SIZE,
} = require(path.join(FN_DIR, 'boardHelpers.js'))

function countLetters(arr) {
  const counts = {}
  for (const l of arr) counts[l] = (counts[l] || 0) + 1
  return counts
}
function isOnBorder(row, col) {
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
}

// ── OLD SOLVER (copié tel quel depuis la version précédente) ────────────────
function solveChallengeOld(board, rack, dict) {
  if (!dict || !rack?.length) return null
  const maxWordLen   = Math.min(9, rack.length + 15)
  const rackCounts   = countLetters(rack)
  const boardIsEmpty = Object.keys(board).length === 0
  let best = null
  for (const word of dict) {
    const L = word.length
    if (L < 2 || L > maxWordLen) continue
    for (const dir of ['H', 'V']) {
      const dr = dir === 'V' ? 1 : 0
      const dc = dir === 'H' ? 1 : 0
      for (let sr = 0; sr < BOARD_SIZE; sr++) {
        for (let sc = 0; sc < BOARD_SIZE; sc++) {
          const er = sr + (L - 1) * dr
          const ec = sc + (L - 1) * dc
          if (er >= BOARD_SIZE || ec >= BOARD_SIZE) continue
          if (sr - dr >= 0 && sc - dc >= 0 && board[`${sr - dr}_${sc - dc}`]) continue
          if (er + dr < BOARD_SIZE && ec + dc < BOARD_SIZE && board[`${er + dr}_${ec + dc}`]) continue
          const placed = []
          const needed = {}
          let mismatched = false
          for (let i = 0; i < L; i++) {
            const r = sr + i * dr
            const c = sc + i * dc
            const cell = board[`${r}_${c}`]
            const wl = word[i]
            if (cell) {
              const boardLetter = typeof cell === 'string' ? cell : cell.letter
              if (boardLetter !== wl) { mismatched = true; break }
            } else {
              placed.push({ row: r, col: c, letter: wl })
              needed[wl] = (needed[wl] || 0) + 1
            }
          }
          if (mismatched) continue
          if (placed.length === 0) continue
          let canProvide = true
          for (const l in needed) {
            if ((rackCounts[l] || 0) < needed[l]) { canProvide = false; break }
          }
          if (!canProvide) continue
          if (boardIsEmpty) {
            const coversCenter = placed.some(p => p.row === 9 && p.col === 9)
            if (!coversCenter) continue
          }
          const { valid, wordData } = validatePlacement(placed, board)
          if (!valid || !wordData) continue
          if (wordData.word !== word) continue
          const crossWords = wordData.crossWords ?? []
          let crossOk = true
          for (const cw of crossWords) {
            if (!dict.has(cw.word.toUpperCase())) { crossOk = false; break }
          }
          if (!crossOk) continue
          const touchesBorder = placed.some(p => isOnBorder(p.row, p.col))
          const rawPoints = calculateWordScore(wordData.existingCount, wordData.newCount)
            + crossWords.reduce((s, cw) => s + calculateWordScore(cw.existingCount, cw.newCount), 0)
          const finalScore = touchesBorder ? Math.max(0, rawPoints - 10) : rawPoints
          if (!best || finalScore > best.score) {
            best = { score: finalScore, word, placedLetters: placed, touchesBorder, crossWords }
          }
        }
      }
    }
  }
  return best
}

// ── Parsing arguments ───────────────────────────────────────────────────────
const args = process.argv.slice(2)
let languages = ['fr', 'en', 'es', 'de']
let dates     = ['2026-04-20', '2026-04-21', '2026-05-01', '2026-06-15']

for (const a of args) {
  if (a.startsWith('--dates=')) {
    dates = a.slice('--dates='.length).split(',').filter(Boolean)
  } else if (!a.startsWith('--')) {
    // liste de langues
    if (a === 'fr' || a === 'en' || a === 'es' || a === 'de') {
      if (!args.some(x => x.startsWith('--'))) {
        // Remplacer la liste par défaut au premier match
      }
    }
  }
}
// Filtre langues : si des langues sont passées sans --, elles remplacent la liste
const langArgs = args.filter(a => ['fr', 'en', 'es', 'de'].includes(a))
if (langArgs.length > 0) languages = langArgs

// ── Vérif dicos présents ────────────────────────────────────────────────────
for (const lang of languages) {
  const p = path.join(FN_DIR, 'dictionaries', `${lang}.json`)
  if (!fs.existsSync(p)) {
    console.error(`Dictionnaire manquant : ${p}`)
    console.error(`→ vérifie que le predeploy a bien copié public/dictionaries vers functions/dictionaries`)
    console.error(`→ ou lance : cp public/dictionaries/*.json functions/dictionaries/`)
    process.exit(1)
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

let allMatch = true
const rows = []

for (const lang of languages) {
  const dictIndex = getDictionaryIndex(lang)
  const dict      = dictIndex.set

  for (const date of dates) {
    const gen = generateChallenge(date, lang, dict)

    const t0   = Date.now()
    const oldBest = solveChallengeOld(gen.board, gen.rack, dict)
    const tOld = Date.now() - t0

    const t1   = Date.now()
    const newBest = solveChallengeNew(gen.board, gen.rack, dictIndex)
    const tNew = Date.now() - t1

    const oldScore = oldBest?.score ?? 0
    const newScore = newBest?.score ?? 0
    const oldWord  = oldBest?.word ?? '-'
    const newWord  = newBest?.word ?? '-'

    const scoreMatch = oldScore === newScore
    const wordMatch  = oldWord === newWord
    const status     = scoreMatch ? (wordMatch ? 'OK' : 'tie') : 'MISMATCH'
    if (!scoreMatch) allMatch = false

    rows.push({
      date, lang, status,
      oldWord, oldScore, tOld,
      newWord, newScore, tNew,
      speedup: tOld > 0 ? (tOld / Math.max(1, tNew)).toFixed(1) + 'x' : 'n/a',
    })

    console.log(
      `[${date} ${lang}] old="${oldWord}" ${oldScore}pts (${tOld}ms) | ` +
      `new="${newWord}" ${newScore}pts (${tNew}ms) | ${status} | speedup ${rows.at(-1).speedup}`
    )
  }
}

console.log('')
console.log('Résumé :')
console.table(rows)

if (!allMatch) {
  console.error('\n❌ Au moins un score diverge entre l\'ancien et le nouveau solveur !')
  process.exit(1)
}
console.log('\n✅ Tous les scores correspondent.')
