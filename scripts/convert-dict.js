// Script de conversion d'un fichier .txt de mots en .json
// Un mot par ligne dans le .txt → tableau JSON de mots en majuscules
//
// Usage :
//   node scripts/convert-dict.js words_alpha.txt public/dictionaries/en.json
//
// Exemple :
//   node scripts/convert-dict.js C:\Users\Corentin\Downloads\words_alpha.txt public/dictionaries/en.json

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const inputPath  = process.argv[2]
const outputPath = process.argv[3]

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/convert-dict.js <input.txt> <output.json>')
  process.exit(1)
}

console.log(`Reading ${inputPath}...`)
const raw = readFileSync(resolve(inputPath), 'utf-8')

// Caractères autorisés : A-Z uniquement.
// Les mots contenant des accents (Ñ, Ä, Ö, Ü, É...) sont exclus.
// Cas particulier ß : 'ß'.toUpperCase() === 'SS' en JS, donc les mots allemands
// contenant ß sont automatiquement convertis en forme SS et acceptés. Côté jeu,
// la tuile ß posée par un joueur subit la même conversion lors de la validation,
// donc le matching fonctionne sans traitement spécial.
const words = raw
  .split('\n')
  .map(w => w.trim().toUpperCase())
  .filter(w => w.length >= 2 && /^[A-Z]+$/.test(w))

console.log(`${words.length} words found. Writing ${outputPath}...`)
writeFileSync(resolve(outputPath), JSON.stringify(words))
console.log('Done!')
