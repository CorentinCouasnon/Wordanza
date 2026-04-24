// Générateur du défi quotidien, crée un board pré-rempli + une réglette fixe.
//
// Approche : simulation de quelques coups de bot sur un plateau vide avec
// des réglettes aléatoires successives. Le bot utilise findBotMove (limité
// à 4 lettres par mot): parfait pour générer un board "crédible".
// Puis on tire une réglette finale pour le défi (taille 6-9).
//
// Toute l'aléa est déterministe via un PRNG seedé (mulberry32) sur la date.

'use strict'

const { findBotMove } = require('./botLogic')
const { LETTER_DISTRIBUTIONS, VOWELS } = require('./constants')

// ── PRNG déterministe (mulberry32) ──────────────────────────────────────────

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function() {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

function pickRandom(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function buildBag(language) {
  const dist = LETTER_DISTRIBUTIONS[language] ?? LETTER_DISTRIBUTIONS.en
  const bag  = []
  for (const [l, n] of Object.entries(dist)) {
    for (let i = 0; i < n; i++) bag.push(l)
  }
  return bag
}

function drawRack(rng, language, size) {
  const bag = buildBag(language)
  const rack = []
  for (let i = 0; i < size; i++) rack.push(pickRandom(rng, bag))
  return rack
}

// Réglette équilibrée : au moins 2 voyelles et 2 consonnes pour être jouable
function drawBalancedRack(rng, language, size) {
  const bag = buildBag(language)
  const vowelBag     = bag.filter(l => VOWELS.has(l))
  const consonantBag = bag.filter(l => !VOWELS.has(l))

  const rack = []
  for (let i = 0; i < 2; i++) rack.push(pickRandom(rng, vowelBag))
  for (let i = 0; i < 2; i++) rack.push(pickRandom(rng, consonantBag))
  for (let i = 4; i < size; i++) rack.push(pickRandom(rng, bag))

  // Mélange Fisher-Yates pour que les 4 premières positions ne soient pas fixes
  for (let i = rack.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[rack[i], rack[j]] = [rack[j], rack[i]]
  }
  return rack
}

/**
 * Génère un board pré-rempli + réglette pour le défi quotidien.
 *
 * @param {string}       date     - "YYYY-MM-DD"
 * @param {string}       language - "en" | "fr"
 * @param {Set<string>}  dict
 * @returns {{ board, rack, rackSize, preplacedLetters }}
 */
function generateChallenge(date, language, dict) {
  const seed = hashString(`${date}_${language}`)
  const rng  = mulberry32(seed)

  // Nombre de coups de bot à simuler (varie largement pour la diversité)
  const botMoves = randInt(rng, 3, 6)
  // Taille de la réglette finale (min 6, max 9 selon spec utilisateur)
  const rackSize = randInt(rng, 6, 9)

  const isValidWord = (w) => dict ? dict.has(w.toUpperCase()) : true

  let board = {}
  let moves = 0
  let attempts = 0

  while (moves < botMoves && attempts < 20) {
    attempts++
    // Réglette de bot : taille fixe 7 pour la simulation
    const botHand = drawBalancedRack(rng, language, 7)
    const result  = findBotMove(botHand, board, isValidWord)
    if (!result) continue

    // Vérifier que tous les cross-words sont valides
    const crossWords = result.wordData?.crossWords ?? []
    if (crossWords.some(c => !isValidWord(c.word))) continue

    // Appliquer les lettres au board (sans playedBy, c'est un challenge, pas un joueur)
    for (const { row, col, letter } of result.placedLetters) {
      board[`${row}_${col}`] = { letter: letter.toUpperCase() }
    }
    moves++
  }

  // Réglette finale du défi
  const rack = drawBalancedRack(rng, language, rackSize)

  return {
    board,
    rack,
    rackSize,
    preplacedLetters: Object.keys(board).length,
    botMoves: moves,
  }
}

module.exports = { generateChallenge }
