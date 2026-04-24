// Distribution des lettres par langue.
// Ces fréquences définissent la probabilité de tirer chaque lettre.
// La pioche est pondérée : une lettre avec count:9 a 9x plus de chances qu'une avec count:1.
//
// Source de vérité : shared/gameData.json (partagée avec functions/constants.js)

import gameData from '../../shared/gameData.json'

export const LETTER_DISTRIBUTIONS = gameData.LETTER_DISTRIBUTIONS

// Voyelles (communes à toutes les langues)
export const VOWELS = new Set(gameData.VOWELS)

export function isVowel(letter) {
  return VOWELS.has(letter.toUpperCase())
}

// Construit un "sac" de lettres pondéré à partir d'une distribution.
// Ex: { A: 2, B: 1 } → ['A', 'A', 'B']
export function buildLetterBag(language = 'en') {
  const distribution = LETTER_DISTRIBUTIONS[language]
  const bag = []
  for (const [letter, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) {
      bag.push(letter)
    }
  }
  return bag
}

export function drawRandomLetter(language = 'en') {
  const bag = buildLetterBag(language)
  return bag[Math.floor(Math.random() * bag.length)]
}

export function drawRandomVowel(language = 'en') {
  const bag = buildLetterBag(language).filter(l => isVowel(l))
  return bag[Math.floor(Math.random() * bag.length)]
}

export function drawRandomConsonant(language = 'en') {
  const bag = buildLetterBag(language).filter(l => !isVowel(l))
  return bag[Math.floor(Math.random() * bag.length)]
}

export function drawMultipleLetters(count, language = 'en') {
  return Array.from({ length: count }, () => drawRandomLetter(language))
}
