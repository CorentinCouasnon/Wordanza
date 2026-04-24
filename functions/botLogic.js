// Logique de jeu pour les bots, version serveur.
//
// Approche slot-driven, adaptée de dailyChallengeSolver.js :
// 1. On énumère chaque (startRow, startCol, direction, length) comme un "slot".
// 2. Filtrage agressif : bords, connexion, lettres fixes, multiset rack.
// 3. On collecte tous les coups valides puis on tire un mot avec une
//    pondération quadratique sur le score (favorise le meilleur sans garantir).
//
// Le bot n'est donc pas optimal mais "plutôt intelligent" : ~40% de chance
// de jouer le top, le reste réparti sur les autres bons coups.

'use strict'

const { calculateWordScore, BOARD_SIZE, CENTER } = require('./boardHelpers')

const TOP_K = 10

function countLetters(arr) {
  const counts = {}
  for (const l of arr) counts[l] = (counts[l] || 0) + 1
  return counts
}

function isOnBorder(row, col) {
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
}

/**
 * Collecte tous les coups valides pour un rack et un board donnés.
 * Retourne [{ score, word, placedLetters, crossWords, touchesBorder }, ...].
 */
function collectMoves(board, rack, dictIndex) {
  if (!dictIndex || !rack?.length) return []
  const { set: dict, byLength } = dictIndex

  const maxWordLen   = BOARD_SIZE
  const rackCounts   = countLetters(rack)
  const boardIsEmpty = Object.keys(board).length === 0

  const getLetter = (r, c) => {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null
    const cell = board[`${r}_${c}`]
    if (!cell) return null
    return typeof cell === 'string' ? cell : cell.letter
  }

  const moves = []

  for (const dir of ['H', 'V']) {
    const dr  = dir === 'V' ? 1 : 0
    const dc  = dir === 'H' ? 1 : 0
    const cdr = dir === 'V' ? 0 : 1
    const cdc = dir === 'V' ? 1 : 0

    for (let L = 2; L <= maxWordLen; L++) {
      const words = byLength[L]
      if (!words || words.length === 0) continue

      for (let sr = 0; sr < BOARD_SIZE; sr++) {
        for (let sc = 0; sc < BOARD_SIZE; sc++) {
          const er = sr + (L - 1) * dr
          const ec = sc + (L - 1) * dc
          if (er >= BOARD_SIZE || ec >= BOARD_SIZE) continue

          // Bordures du slot : cases juste avant/après doivent être vides
          if (getLetter(sr - dr, sc - dc)) continue
          if (getLetter(er + dr, ec + dc)) continue

          // Walk cellules : collecte fixed[], emptyIdx[] et check connexion
          const fixed    = new Array(L)
          const emptyIdx = []
          let hasConnection = false

          for (let i = 0; i < L; i++) {
            const r = sr + i * dr
            const c = sc + i * dc
            const existing = getLetter(r, c)
            if (existing) {
              fixed[i] = existing
              hasConnection = true
            } else {
              fixed[i] = null
              emptyIdx.push(i)
              if (!hasConnection) {
                if (getLetter(r + cdr, c + cdc) || getLetter(r - cdr, c - cdc)) {
                  hasConnection = true
                }
              }
            }
          }

          if (emptyIdx.length === 0) continue
          // Ne jamais poser plus que ce qu'on a en main
          if (emptyIdx.length > rack.length) continue

          if (boardIsEmpty) {
            let coversCenter = false
            for (let k = 0; k < emptyIdx.length; k++) {
              const i = emptyIdx[k]
              if (sr + i * dr === CENTER && sc + i * dc === CENTER) {
                coversCenter = true
                break
              }
            }
            if (!coversCenter) continue
          } else if (!hasConnection) {
            continue
          }

          wordLoop:
          for (let w = 0; w < words.length; w++) {
            const word = words[w]

            // 1) Lettres fixes
            for (let i = 0; i < L; i++) {
              if (fixed[i] !== null && word[i] !== fixed[i]) continue wordLoop
            }

            // 2) Multiset rack sur les positions libres
            const localNeed = {}
            for (let k = 0; k < emptyIdx.length; k++) {
              const l = word[emptyIdx[k]]
              const n = (localNeed[l] || 0) + 1
              if (n > (rackCounts[l] || 0)) continue wordLoop
              localNeed[l] = n
            }

            // 3) Cross-words sur chaque position libre
            const crossWords = []
            for (let k = 0; k < emptyIdx.length; k++) {
              const i = emptyIdx[k]
              const r = sr + i * dr
              const c = sc + i * dc
              const placedLetter = word[i]

              let leftWord  = ''
              let leftCount = 0
              let cr = r - cdr
              let cc = c - cdc
              for (;;) {
                const ex = getLetter(cr, cc)
                if (!ex) break
                leftWord = ex + leftWord
                leftCount++
                cr -= cdr
                cc -= cdc
              }

              let rightWord  = ''
              let rightCount = 0
              cr = r + cdr
              cc = c + cdc
              for (;;) {
                const ex = getLetter(cr, cc)
                if (!ex) break
                rightWord += ex
                rightCount++
                cr += cdr
                cc += cdc
              }

              if (leftCount + rightCount === 0) continue

              const cw = leftWord + placedLetter + rightWord
              if (!dict.has(cw)) continue wordLoop

              crossWords.push({
                word: cw,
                existingCount: leftCount + rightCount,
                newCount:      1,
              })
            }

            // 4) Score
            const existingCount = L - emptyIdx.length
            const newCount      = emptyIdx.length
            let rawPoints = calculateWordScore(existingCount, newCount)
            for (let x = 0; x < crossWords.length; x++) {
              rawPoints += calculateWordScore(crossWords[x].existingCount, crossWords[x].newCount)
            }

            let touchesBorder = false
            for (let k = 0; k < emptyIdx.length; k++) {
              const i = emptyIdx[k]
              if (isOnBorder(sr + i * dr, sc + i * dc)) { touchesBorder = true; break }
            }
            const finalScore = touchesBorder ? Math.max(0, rawPoints - 10) : rawPoints

            const placed = new Array(emptyIdx.length)
            for (let k = 0; k < emptyIdx.length; k++) {
              const i = emptyIdx[k]
              placed[k] = {
                row:    sr + i * dr,
                col:    sc + i * dc,
                letter: word[i],
              }
            }

            moves.push({
              score: finalScore,
              word,
              placedLetters: placed,
              crossWords,
              touchesBorder,
            })
          }
        }
      }
    }
  }

  return moves
}

/**
 * Tirage pondéré quadratique sur les TOP_K meilleurs coups.
 * Poids = score² : le meilleur coup a la plus grosse probabilité mais
 * reste remplaçable par un des suivants.
 */
function pickWeighted(moves) {
  if (moves.length === 0) return null

  const sorted = [...moves].sort((a, b) => b.score - a.score).slice(0, TOP_K)

  // Cas dégénéré : tous à 0, on tire uniforme
  const allZero = sorted.every(m => m.score <= 0)
  if (allZero) return sorted[Math.floor(Math.random() * sorted.length)]

  let total = 0
  const weights = sorted.map(m => {
    const w = Math.max(1, m.score) ** 2
    total += w
    return w
  })

  let r = Math.random() * total
  for (let i = 0; i < sorted.length; i++) {
    r -= weights[i]
    if (r <= 0) return sorted[i]
  }
  return sorted[sorted.length - 1]
}

/**
 * Cherche un coup pour un bot.
 *
 * @param {string[]} hand      - Lettres du bot (majuscules)
 * @param {object}   board     - Plateau Firestore actuel
 * @param {{ set: Set<string>, byLength: Array<string[]> }} dictIndex
 * @returns {{ placedLetters, word, wordData } | null}
 */
function findBotMove(hand, board, dictIndex) {
  const letters = hand.filter(Boolean)
  if (letters.length < 2) return null

  const moves = collectMoves(board, letters, dictIndex)
  const pick  = pickWeighted(moves)
  if (!pick) return null

  // On expose un wordData minimal : playBotTurns recalcule freshWordData
  // dans la transaction et ne lit que .word ici.
  return {
    placedLetters: pick.placedLetters,
    word:          pick.word,
    wordData:      { word: pick.word, crossWords: pick.crossWords },
  }
}

module.exports = { findBotMove }
