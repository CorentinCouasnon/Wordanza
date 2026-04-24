// Predeploy pour les Cloud Functions.
// Copie les dictionnaires et le gameData.json partagé dans functions/
// avant l'upload. Appelé par firebase.json > functions.predeploy.
//
// Script Node dédié pour éviter les soucis de quoting du shell Windows
// (les `node -e "..."` avec `=` cassent via firebase CLI sur cmd.exe).

'use strict'

const fs   = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

const dictsSrc = path.join(repoRoot, 'public', 'dictionaries')
const dictsDst = path.join(repoRoot, 'functions', 'dictionaries')
fs.cpSync(dictsSrc, dictsDst, { recursive: true, force: true })
console.log(`Dictionaries copied -> ${path.relative(repoRoot, dictsDst)}`)

const sharedDst = path.join(repoRoot, 'functions', 'shared')
fs.mkdirSync(sharedDst, { recursive: true })
fs.copyFileSync(
  path.join(repoRoot, 'shared', 'gameData.json'),
  path.join(sharedDst, 'gameData.json'),
)
console.log(`Shared data copied -> ${path.relative(repoRoot, sharedDst)}/gameData.json`)
