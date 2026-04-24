// Calcul des Action Points (AP) côté client.
//
// Les AP sont stockés dans Firestore comme { apStored, lastApUpdate }.
// On ne recalcule pas les AP à chaque seconde côté serveur, on les calcule
// à la volée côté client en fonction du temps écoulé depuis la dernière mise à jour.

// Source de vérité : shared/gameData.json (partagée avec functions/constants.js)
import gameData from '../../shared/gameData.json'

export const AP_REGEN_RATE = 1               // 1 AP par minute
export const AP_MAX        = gameData.AP_MAX // Plafond absolu, quel que soit le niveau de Wisdom

/**
 * Calcule les AP actuels d'un joueur à partir de ses données Firestore.
 *
 * @param {number} apStored - AP enregistrés lors de la dernière action
 * @param {number} lastApUpdate - Timestamp (ms) de la dernière mise à jour
 * @returns {number} AP actuels (plafonnés à AP_MAX)
 */
export function getCurrentAP(apStored, lastApUpdate) {
  const elapsedMinutes = Math.floor((Date.now() - lastApUpdate) / 60000)
  return Math.min(AP_MAX, apStored + elapsedMinutes * AP_REGEN_RATE)
}

/**
 * Calcule combien de minutes avant qu'un joueur ait assez d'AP pour une action.
 *
 * @param {number} currentAP - AP actuels
 * @param {number} apCost - Coût de l'action
 * @returns {number} Minutes à attendre (0 si déjà assez)
 */
export function minutesUntilEnoughAP(currentAP, apCost) {
  if (currentAP >= apCost) return 0
  return Math.ceil((apCost - currentAP) / AP_REGEN_RATE)
}

/**
 * Prépare les valeurs apStored et lastApUpdate à écrire dans Firestore
 * après qu'un joueur a dépensé des AP.
 *
 * @param {number} apStored - AP stockés dans Firestore
 * @param {number} lastApUpdate - Timestamp de la dernière mise à jour
 * @param {number} apSpent - AP dépensés pour l'action
 * @returns {{ apStored: number, lastApUpdate: number }}
 */
export function computeNewAP(apStored, lastApUpdate, apSpent) {
  const now        = Date.now()
  const elapsedMs  = now - lastApUpdate
  // Fraction de minute déjà écoulée mais pas encore créditée (entre 0 et 59 999 ms)
  const remainingMs = elapsedMs % 60000
  const current    = Math.min(AP_MAX, apStored + Math.floor(elapsedMs / 60000))
  const newAP      = Math.max(0, current - apSpent)
  return {
    apStored: newAP,
    // On recule de la fraction non créditée pour qu'elle soit conservée lors du prochain calcul
    lastApUpdate: now - remainingMs,
  }
}
