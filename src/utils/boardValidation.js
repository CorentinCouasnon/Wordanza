// Logique de validation du placement d'un mot sur le plateau 19x19.
//
// Règles :
// 1. Le premier mot doit passer par la case centrale (9, 9)
// 2. Les lettres posées doivent former une ligne continue (horizontale ou verticale)
// 3. Toutes les lettres posées doivent faire partie du mot extrait (pas de lettre isolée)
// 4. Le mot doit être connecté aux lettres existantes (sauf premier mot)
// 5. Chaque mot croisé formé perpendiculairement doit aussi être valide (règle Scrabble)
// 6. Un mot qui touche le bord déclenche un reset du plateau

import i18next from 'i18next'

export const BOARD_SIZE = 19
export const CENTER = 9

export function isOnBorder(row, col) {
  return row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
}

export function isBoardEmpty(board) {
  return !board || Object.keys(board).length === 0
}

/**
 * Vérifie que toutes les lettres posées sont sur la même ligne ou la même colonne.
 * Retourne 'horizontal', 'vertical', 'single' ou null si invalide.
 */
export function getWordDirection(placedLetters) {
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
 * Extrait le mot complet qui passe par (row, col) dans une direction donnée,
 * en combinant plateau existant et lettres posées.
 */
function extractWordAt(row, col, direction, combinedBoard) {
  const dr = direction === 'vertical' ? 1 : 0
  const dc = direction === 'horizontal' ? 1 : 0

  // Remonter au début du mot
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
    const cell = combinedBoard[`${r}_${c}`]
    const letter = typeof cell === 'string' ? cell : cell.letter
    word += letter
    cells.push({ row: r, col: c, letter })
    r += dr
    c += dc
  }

  return { word, cells, direction, startRow, startCol }
}

/**
 * Reconstitue le mot principal formé par les lettres posées + lettres existantes.
 */
export function buildWord(placedLetters, board) {
  const direction = getWordDirection(placedLetters)
  if (!direction) return null

  const combined = { ...(board || {}) }
  for (const { row, col, letter } of placedLetters) {
    combined[`${row}_${col}`] = { letter }
  }

  const newLetterMap = {}
  for (const { row, col, letter } of placedLetters) {
    newLetterMap[`${row}_${col}`] = letter
  }

  if (direction === 'single') {
    const { row, col } = placedLetters[0]
    const hWord = extractWordAt(row, col, 'horizontal', combined)
    const vWord = extractWordAt(row, col, 'vertical', combined)
    const result = hWord.word.length >= vWord.word.length ? hWord : vWord
    return {
      ...result,
      existingCount: result.cells.filter(c => !newLetterMap[`${c.row}_${c.col}`]).length,
      newCount:      result.cells.filter(c => !!newLetterMap[`${c.row}_${c.col}`]).length,
    }
  }

  const wordData = extractWordAt(placedLetters[0].row, placedLetters[0].col, direction, combined)
  return {
    ...wordData,
    existingCount: wordData.cells.filter(c => !newLetterMap[`${c.row}_${c.col}`]).length,
    newCount:      wordData.cells.filter(c => !!newLetterMap[`${c.row}_${c.col}`]).length,
  }
}

/**
 * Valide le placement complet.
 * Retourne { valid, error, wordData } où wordData contient aussi crossWords[].
 *
 * crossWords est la liste des mots perpendiculaires formés par les lettres posées.
 * L'appelant doit vérifier chaque crossWord contre le dictionnaire.
 */
export function validatePlacement(placedLetters, board) {
  if (placedLetters.length === 0) {
    return { valid: false, error: i18next.t('game.noLettersPlaced'), wordData: null }
  }

  // 0. No placed tile may overlap with an already-validated cell
  for (const { row, col } of placedLetters) {
    if (board?.[`${row}_${col}`]) {
      return { valid: false, error: i18next.t('game.cellOccupied'), wordData: null }
    }
  }

  const boardEmpty = isBoardEmpty(board)

  // 1. Alignement
  const direction = getWordDirection(placedLetters)
  if (!direction) {
    return { valid: false, error: i18next.t('game.mustBeStraightLine'), wordData: null }
  }

  // 2. Premier mot : doit passer par le centre
  if (boardEmpty) {
    const coversCenter = placedLetters.some(l => l.row === CENTER && l.col === CENTER)
    if (!coversCenter) {
      return { valid: false, error: i18next.t('game.firstWordCenter'), wordData: null }
    }
  }

  // 3. Construire le mot principal
  const wordData = buildWord(placedLetters, board)
  if (!wordData || wordData.word.length < 2) {
    return { valid: false, error: i18next.t('game.wordTooShort'), wordData: null }
  }

  // 4. Toutes les lettres posées doivent faire partie du mot extrait.
  //    Si une lettre est hors du mot, c'est qu'elle est isolée ou sur une autre ligne.
  const wordCellKeys = new Set(wordData.cells.map(c => `${c.row}_${c.col}`))
  for (const pl of placedLetters) {
    if (!wordCellKeys.has(`${pl.row}_${pl.col}`)) {
      return { valid: false, error: i18next.t('game.isolatedLetter'), wordData: null }
    }
  }

  // 5. Continuité (pas de trou dans le mot)
  const cells = wordData.cells
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1]
    const curr = cells[i]
    if (Math.abs(curr.row - prev.row) > 1 || Math.abs(curr.col - prev.col) > 1) {
      return { valid: false, error: i18next.t('game.wordHasGaps'), wordData: null }
    }
  }

  // 6. Sauf premier mot : doit être connecté au plateau
  //    Connexion valide si : au moins une lettre du draft est déjà sur le plateau (existingCount > 0)
  //    OU si une lettre placée est adjacente à une lettre existante (connexion perpendiculaire).
  if (!boardEmpty && wordData.existingCount === 0) {
    const isAdjacentToExisting = placedLetters.some(({ row, col }) =>
      [[-1,0],[1,0],[0,-1],[0,1]].some(([dr, dc]) => board?.[`${row+dr}_${col+dc}`])
    )
    if (!isAdjacentToExisting) {
      return { valid: false, error: i18next.t('game.wordNotConnected'), wordData: null }
    }
  }

  // 7. Détecter les mots croisés (perpendiculaires) formés par les lettres posées.
  //    Un mot croisé n'est pertinent que s'il implique au moins une lettre déjà sur le plateau.
  const combined = { ...(board || {}) }
  for (const { row, col, letter } of placedLetters) {
    combined[`${row}_${col}`] = { letter }
  }

  const mainDir  = wordData.direction  // 'horizontal' | 'vertical'
  const crossDir = mainDir === 'horizontal' ? 'vertical' : 'horizontal'
  const crossWords = []

  for (const placed of placedLetters) {
    const cross = extractWordAt(placed.row, placed.col, crossDir, combined)
    // Valider seulement si le mot croisé a 2+ lettres ET touche une lettre existante
    if (cross.word.length >= 2) {
      const touchesExisting = cross.cells.some(c => board?.[`${c.row}_${c.col}`])
      if (touchesExisting) {
        // Compter combien de lettres du mot croisé sont nouvelles (posées maintenant)
        const placedKeys = new Set(placedLetters.map(p => `${p.row}_${p.col}`))
        const crossNewCount      = cross.cells.filter(c => placedKeys.has(`${c.row}_${c.col}`)).length
        const crossExistingCount = cross.cells.length - crossNewCount
        crossWords.push({ word: cross.word, existingCount: crossExistingCount, newCount: crossNewCount })
      }
    }
  }

  // 8. Bord
  const touchesBorder = wordData.cells.some(c => isOnBorder(c.row, c.col))

  return {
    valid: true,
    error: null,
    wordData: { ...wordData, crossWords },
    touchesBorder,
  }
}
