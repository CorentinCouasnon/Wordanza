// Configuration des slots de parties simultanées.
// Par défaut, un joueur peut avoir 1 partie active/en attente à la fois.
// Chaque slot supplémentaire acheté en boutique augmente cette limite de 1.
//
// Source de vérité : shared/gameData.json (partagée avec functions/constants.js)

import gameData from '../../shared/gameData.json'

export const GAME_SLOT_COST       = gameData.GAME_SLOT_COST
export const MAX_EXTRA_GAME_SLOTS = gameData.MAX_EXTRA_GAME_SLOTS
export const BASE_GAME_SLOTS      = gameData.BASE_GAME_SLOTS

export function getMaxGameSlots(extraGameSlots = 0) {
  return BASE_GAME_SLOTS + Math.min(extraGameSlots, MAX_EXTRA_GAME_SLOTS)
}
