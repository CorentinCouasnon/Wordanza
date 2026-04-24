// Point d'entrée des Cloud Functions.
// Chaque fonction est définie dans son propre fichier pour la lisibilité.

'use strict'

const admin = require('firebase-admin')

// Initialiser l'Admin SDK une seule fois
// (firebase-admin détecte automatiquement les credentials en environnement Functions)
if (!admin.apps.length) {
  admin.initializeApp()
}

const { onMatchmakingJoin, matchmakingBotFill } = require('./matchmaking')
const { onGameEnd }                              = require('./onGameEnd')
const { finishInactiveGames }                   = require('./finishInactiveGame')
const { validateWord }                          = require('./validateWord')
const { buyItem }                               = require('./buyItem')
const { gameAction }                            = require('./gameAction')
const { playBotTurns }                          = require('./playBotTurns')
const { updateDisplayName }                     = require('./updateDisplayName')
const { generateDailyChallenge, submitDailyChallenge } = require('./dailyChallenge')
const { cleanupAnonymousUsers }                 = require('./cleanupAnonymous')

module.exports = {
  onMatchmakingJoin,
  matchmakingBotFill,
  onGameEnd,
  finishInactiveGames,
  validateWord,
  buyItem,
  gameAction,
  playBotTurns,
  updateDisplayName,
  generateDailyChallenge,
  submitDailyChallenge,
  cleanupAnonymousUsers,
}
