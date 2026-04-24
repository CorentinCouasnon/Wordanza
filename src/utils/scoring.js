// Calcul des points pour un mot posé sur le plateau.
//
// Formule : points = lettresDejaPresentes + bonusNouvellesLettres
//
// Barème du bonus pour les nouvelles lettres :
//   n=1 → 1, n=2 → 4, n=3 → 9, ... n=8 → 64  (= n²)
//   n=9 → 80, n=10 → 90, n=11 → 100, ...       (linéaire +10 par lettre)
// Maximum : 15 nouvelles lettres par mot.

const NEW_LETTER_BONUS = [0, 1, 4, 9, 16, 25, 36, 49, 64, 80, 90, 100, 110, 120, 130, 140]
//                        0  1  2  3  4   5   6   7   8   9  10   11   12   13   14   15

/**
 * Calcule les points gagnés pour un mot.
 *
 * @param {number} existingLetters - Nombre de lettres du mot déjà présentes sur le plateau
 * @param {number} newLetters - Nombre de nouvelles lettres posées par le joueur
 * @returns {number} Points gagnés
 */
export function calculateWordScore(existingLetters, newLetters) {
  if (newLetters < 0 || newLetters > 15) return 0
  return existingLetters + NEW_LETTER_BONUS[newLetters]
}

/**
 * Retourne le bonus de points pour un nombre donné de nouvelles lettres.
 * Utile pour afficher l'estimation avant validation.
 */
export function getNewLetterBonus(newLetters) {
  if (newLetters < 0 || newLetters > 15) return 0
  return NEW_LETTER_BONUS[newLetters]
}
