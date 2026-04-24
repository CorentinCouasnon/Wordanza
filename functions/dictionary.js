// Chargement des dictionnaires côté Cloud Functions.
//
// Dictionnaires : copiés automatiquement dans functions/dictionaries/ au
// déploiement (predeploy dans firebase.json). Si absents, la validation
// du dictionnaire est désactivée et les mots passent.
//
// Cache : chargé une seule fois au cold start, réutilisé ensuite.

'use strict'

const fs   = require('fs')
const path = require('path')

const dictCache      = {}
const byLengthCache  = {}

/**
 * Retourne un Set<string> (mots en majuscules) pour la langue donnée,
 * ou null si le fichier est absent.
 */
function getDictionary(language) {
  if (dictCache[language] !== undefined) return dictCache[language]

  try {
    const filePath = path.join(__dirname, 'dictionaries', `${language}.json`)
    const words    = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    dictCache[language] = new Set(words.map(w => w.toUpperCase()))
    console.log(`Dictionary "${language}" loaded (${dictCache[language].size} words)`)
    return dictCache[language]
  } catch {
    console.warn(`Dictionary "${language}" not found, skipping dict check`)
    dictCache[language] = null
    return null
  }
}

/**
 * Retourne un index { byLength: Array<string[]>, set: Set<string> } pour
 * itérer les mots d'une longueur précise sans scanner tout le dict.
 * Construit paresseusement et caché par langue (~400k mots, quelques ms).
 */
function getDictionaryIndex(language) {
  if (byLengthCache[language] !== undefined) return byLengthCache[language]

  const set = getDictionary(language)
  if (!set) {
    byLengthCache[language] = null
    return null
  }

  const byLength = []
  for (const w of set) {
    const L = w.length
    if (!byLength[L]) byLength[L] = []
    byLength[L].push(w)
  }

  byLengthCache[language] = { set, byLength }
  return byLengthCache[language]
}

/**
 * @param {string} word
 * @param {Set<string>|null} dict
 * @returns {boolean} true si le mot est valide (ou dict absent)
 */
function isValidWord(word, dict) {
  if (!dict) return true
  return dict.has(word.toUpperCase())
}

module.exports = { getDictionary, getDictionaryIndex, isValidWord }
