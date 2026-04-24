// Calcul du handicap (score cible) en fonction des points de compétences investis.
// Le handicap est calculé une seule fois au démarrage de la partie.
//
// totalSkillPoints = somme de tous les niveaux achetés dans les 3 compétences.
// Ex: Speed 3 + Creativity 2 + Wisdom 1 = totalSkillPoints 6 → score cible 302

// Source de vérité : shared/gameData.json (partagée avec functions/constants.js)
import gameData from '../../shared/gameData.json'

// JSON stocke les clés numériques en strings, on reconvertit
const HANDICAP_TABLE = Object.fromEntries(
  Object.entries(gameData.HANDICAP_TABLE).map(([k, v]) => [Number(k), v])
)

/**
 * Retourne le score cible (handicap) pour un joueur.
 *
 * @param {number} totalSkillPoints - Somme de tous les niveaux de compétences (0-30)
 * @returns {number} Score à atteindre pour gagner
 */
export function getTargetScore(totalSkillPoints) {
  const clamped = Math.max(0, Math.min(30, totalSkillPoints))
  return HANDICAP_TABLE[clamped] ?? 650
}

/**
 * Calcule le totalSkillPoints d'un joueur à partir de son objet skills.
 *
 * @param {{ speed: number, creativity: number, wisdom: number }} skills
 * @returns {number}
 */
export function getTotalSkillPoints(skills) {
  return (skills.speed ?? 0) + (skills.creativity ?? 0) + (skills.wisdom ?? 0)
}
