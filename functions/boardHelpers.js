// Helpers de plateau partagés par les Cloud Functions.
//
// Portage minimal de src/utils/boardValidation.js et src/utils/scoring.js.
// sans dépendance i18next (les erreurs sont en anglais, pas traduites).

'use strict'

const BOARD_SIZE = 19
const CENTER     = 9

function isOnBorder(row, col) {
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
}

function isBoardEmpty(board) {
  return !board || Object.keys(board).length === 0
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const NEW_LETTER_BONUS = [0, 1, 4, 9, 16, 25, 36, 49, 64, 80, 90, 100, 110, 120, 130, 140]

function calculateWordScore(existingLetters, newLetters) {
  if (newLetters < 0 || newLetters > 15) return 0
  return existingLetters + NEW_LETTER_BONUS[newLetters]
}

// ── Extraction de mot ─────────────────────────────────────────────────────────

/**
 * Remonte jusqu'au début du mot dans une direction, puis avance jusqu'à la fin.
 * combinedBoard = { "row_col": { letter } | { letter, playedBy } }
 */
function extractWordAt(row, col, direction, combinedBoard) {
  const dr = direction === 'vertical'   ? 1 : 0
  const dc = direction === 'horizontal' ? 1 : 0

  // Remonter au début
  let startRow = row
  let startCol = col
  while (
    startRow - dr >= 0 &&
    startCol - dc >= 0 &&
    combinedBoard[`${startRow - dr}_${startCol - dc}`]
  ) {
    startRow -= dr
    startCol -= dc
  }

  // Avancer jusqu'à la fin
  let r = startRow
  let c = startCol
  let word = ''
  const cells = []

  while (r < BOARD_SIZE && c < BOARD_SIZE && combinedBoard[`${r}_${c}`]) {
    const cell   = combinedBoard[`${r}_${c}`]
    const letter = typeof cell === 'string' ? cell : cell.letter
    word += letter
    cells.push({ row: r, col: c, letter })
    r += dr
    c += dc
  }

  return { word, cells, direction, startRow, startCol }
}

/**
 * Détermine la direction des lettres posées.
 * Retourne 'horizontal' | 'vertical' | 'single' | null
 */
function getWordDirection(placedLetters) {
  if (placedLetters.length === 0) return null
  if (placedLetters.length === 1) return 'single'

  const rows = placedLetters.map(l => l.row)
  const cols = placedLetters.map(l => l.col)

  const allSameRow = rows.every(r => r === rows[0])
  const allSameCol = cols.every(c => c === cols[0])

  if (allSameRow) return 'horizontal'
  if (allSameCol) return 'vertical'
  return null
}

/**
 * Reconstruit le mot principal formé par les lettres posées + plateau existant.
 * Retourne { word, cells, direction, existingCount, newCount } ou null si invalide.
 */
function buildWord(placedLetters, board) {
  const direction = getWordDirection(placedLetters)
  if (!direction) return null

  const combined = { ...(board || {}) }
  for (const { row, col, letter } of placedLetters) {
    combined[`${row}_${col}`] = { letter }
  }

  const newLetterMap = {}
  for (const { row, col } of placedLetters) {
    newLetterMap[`${row}_${col}`] = true
  }

  let wordData
  if (direction === 'single') {
    const { row, col } = placedLetters[0]
    const hWord = extractWordAt(row, col, 'horizontal', combined)
    const vWord = extractWordAt(row, col, 'vertical',   combined)
    wordData    = hWord.word.length >= vWord.word.length ? hWord : vWord
  } else {
    wordData = extractWordAt(placedLetters[0].row, placedLetters[0].col, direction, combined)
  }

  return {
    ...wordData,
    existingCount: wordData.cells.filter(c => !newLetterMap[`${c.row}_${c.col}`]).length,
    newCount:      wordData.cells.filter(c =>  newLetterMap[`${c.row}_${c.col}`]).length,
  }
}

/**
 * Détecte les mots croisés perpendiculaires formés par les lettres posées.
 * Retourne [{ word, existingCount, newCount }]
 */
function detectCrossWords(placedLetters, board, mainDirection) {
  const combined = { ...(board || {}) }
  for (const { row, col, letter } of placedLetters) {
    combined[`${row}_${col}`] = { letter }
  }

  const crossDir  = mainDirection === 'horizontal' ? 'vertical' : 'horizontal'
  const placedKeys = new Set(placedLetters.map(p => `${p.row}_${p.col}`))
  const crossWords = []

  for (const placed of placedLetters) {
    const cross = extractWordAt(placed.row, placed.col, crossDir, combined)
    if (cross.word.length < 2) continue

    // Le mot croisé doit toucher au moins une lettre déjà sur le plateau
    const touchesExisting = cross.cells.some(c => board?.[`${c.row}_${c.col}`])
    if (!touchesExisting) continue

    const crossNewCount      = cross.cells.filter(c =>  placedKeys.has(`${c.row}_${c.col}`)).length
    const crossExistingCount = cross.cells.length - crossNewCount
    crossWords.push({ word: cross.word, existingCount: crossExistingCount, newCount: crossNewCount })
  }

  return crossWords
}

/**
 * Valide un placement complet sur le plateau.
 * Retourne { valid, error, wordData } où wordData inclut crossWords[].
 *
 * Portage de src/utils/boardValidation.js::validatePlacement, sans i18next.
 * Utilisé uniquement par la logique bot côté serveur (playBotTurns).
 */
function validatePlacement(placedLetters, board) {
  if (placedLetters.length === 0) {
    return { valid: false, error: 'No letters placed', wordData: null }
  }

  for (const { row, col } of placedLetters) {
    if (board?.[`${row}_${col}`]) {
      return { valid: false, error: 'Cell occupied', wordData: null }
    }
  }

  const boardEmpty = isBoardEmpty(board)
  const direction  = getWordDirection(placedLetters)
  if (!direction) {
    return { valid: false, error: 'Must be straight line', wordData: null }
  }

  if (boardEmpty) {
    const coversCenter = placedLetters.some(l => l.row === CENTER && l.col === CENTER)
    if (!coversCenter) {
      return { valid: false, error: 'First word must cover center', wordData: null }
    }
  }

  const wordData = buildWord(placedLetters, board)
  if (!wordData || wordData.word.length < 2) {
    return { valid: false, error: 'Word too short', wordData: null }
  }

  // Toutes les lettres posées doivent faire partie du mot extrait
  const wordCellKeys = new Set(wordData.cells.map(c => `${c.row}_${c.col}`))
  for (const pl of placedLetters) {
    if (!wordCellKeys.has(`${pl.row}_${pl.col}`)) {
      return { valid: false, error: 'Isolated letter', wordData: null }
    }
  }

  // Continuité
  const cells = wordData.cells
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]
    const curr = cells[i]
    if (Math.abs(curr.row - prev.row) > 1 || Math.abs(curr.col - prev.col) > 1) {
      return { valid: false, error: 'Word has gaps', wordData: null }
    }
  }

  // Connexion au plateau (sauf premier mot)
  if (!boardEmpty && wordData.existingCount === 0) {
    const isAdjacentToExisting = placedLetters.some(({ row, col }) =>
      [[-1,0],[1,0],[0,-1],[0,1]].some(([dr, dc]) => board?.[`${row+dr}_${col+dc}`])
    )
    if (!isAdjacentToExisting) {
      return { valid: false, error: 'Word not connected', wordData: null }
    }
  }

  const crossWords    = detectCrossWords(placedLetters, board, wordData.direction)
  const touchesBorder = wordData.cells.some(c => isOnBorder(c.row, c.col))

  return {
    valid: true,
    error: null,
    wordData: { ...wordData, crossWords },
    touchesBorder,
  }
}

/**
 * Vérifie si les lettres posées touchent le bord du plateau.
 */
function touchesBorderCheck(draftEntries) {
  return draftEntries.some(([key]) => {
    const [row, col] = key.split('_').map(Number)
    return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
  })
}

module.exports = {
  calculateWordScore,
  buildWord,
  detectCrossWords,
  touchesBorderCheck,
  validatePlacement,
  isBoardEmpty,
  BOARD_SIZE,
  CENTER,
}
