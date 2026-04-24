// Solveur du défi quotidien, trouve le meilleur coup possible (un seul mot).
//
// Approche (slot-driven) :
// 1. On énumère chaque (startRow, startCol, direction, length) comme un "slot".
// 2. On filtre agressivement avant toute itération dict :
//    - adjacence avant/après le slot doit être vide (sinon le mot serait étendu)
//    - le slot doit contenir au moins une case vide (sinon rien de nouveau)
//    - connexion : au moins une case fixe dans le slot, OU une case vide
//      adjacente perpendiculairement à une case occupée, OU (board vide)
//      le slot couvre le centre.
// 3. Pour les slots retenus, on n'itère QUE les mots de la longueur L
//    (via byLength[L]) et on vérifie inline : lettres fixes, multiset rack,
//    cross-words, score.
//
// validatePlacement n'est plus appelé dans la boucle chaude : tout est calculé
// en un seul passage. Gain vs approche dict-first naïve : ~10-30x.

'use strict'

const { calculateWordScore, BOARD_SIZE } = require('./boardHelpers')

const CENTER = 9

function countLetters(arr) {
  const counts = {}
  for (const l of arr) counts[l] = (counts[l] || 0) + 1
  return counts
}

function isOnBorder(row, col) {
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
}

/**
 * Trouve le meilleur coup possible (un mot) sur un board+rack donné.
 *
 * @param {object}  board - { "row_col": { letter } | string }
 * @param {string[]} rack  - lettres disponibles (majuscules)
 * @param {{ set: Set<string>, byLength: Array<string[]> }} dictIndex
 * @returns {{ score, word, placedLetters, touchesBorder, crossWords } | null}
 */
function solveChallenge(board, rack, dictIndex) {
  if (!dictIndex || !rack?.length) return null
  const { set: dict, byLength } = dictIndex

  // Plafonné à la taille du plateau. On ne coupe pas à rack.length car un slot
  // de longueur L peut contenir jusqu'à (L - rack.length) lettres déjà posées
  // que le mot réutilise: rater ces mots = rater les très gros coups.
  const maxWordLen   = BOARD_SIZE
  const rackCounts   = countLetters(rack)
  const boardIsEmpty = Object.keys(board).length === 0

  // Lecture d'une case, null si hors-plateau ou vide
  const getLetter = (r, c) => {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null
    const cell = board[`${r}_${c}`]
    if (!cell) return null
    return typeof cell === 'string' ? cell : cell.letter
  }

  let best = null

  for (const dir of ['H', 'V']) {
    const dr  = dir === 'V' ? 1 : 0
    const dc  = dir === 'H' ? 1 : 0
    // Direction perpendiculaire pour les cross-words
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

          // Bordures du slot : les cases juste avant/après doivent être vides
          if (getLetter(sr - dr, sc - dc)) continue
          if (getLetter(er + dr, ec + dc)) continue

          // Walk cellules : on collecte fixed[], emptyIdx[] et on check la connexion
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
              // Adjacence perpendiculaire à une case occupée
              if (!hasConnection) {
                if (getLetter(r + cdr, c + cdc) || getLetter(r - cdr, c - cdc)) {
                  hasConnection = true
                }
              }
            }
          }

          if (emptyIdx.length === 0) continue

          // Connexion : plateau non vide → doit être connecté, plateau vide →
          // doit couvrir le centre.
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

          // Itération des mots de longueur L uniquement
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

              // Walk en amont (gauche/haut)
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

              // Walk en aval (droite/bas)
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

            // Pénalité bord : une case posée sur les lignes/colonnes 0 ou 18
            let touchesBorder = false
            for (let k = 0; k < emptyIdx.length; k++) {
              const i = emptyIdx[k]
              if (isOnBorder(sr + i * dr, sc + i * dc)) { touchesBorder = true; break }
            }
            const finalScore = touchesBorder ? Math.max(0, rawPoints - 10) : rawPoints

            if (!best || finalScore > best.score) {
              // placedLetters construit seulement quand on améliore
              const placed = new Array(emptyIdx.length)
              for (let k = 0; k < emptyIdx.length; k++) {
                const i = emptyIdx[k]
                placed[k] = {
                  row:    sr + i * dr,
                  col:    sc + i * dc,
                  letter: word[i],
                }
              }
              best = { score: finalScore, word, placedLetters: placed, touchesBorder, crossWords }
            }
          }
        }
      }
    }
  }

  return best
}

module.exports = { solveChallenge }
