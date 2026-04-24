// Helpers pour normaliser les timestamps entre Firestore et JS.
//
// Firestore peut renvoyer des timestamps sous plusieurs formes :
//   - un nombre (ms depuis epoch): quand le champ est écrit avec Date.now()
//   - un objet Timestamp, quand écrit avec serverTimestamp()
//   - null, pendant une fraction de seconde après un serverTimestamp
// Ce helper unifie ces trois cas en millisecondes.

/**
 * Convertit une valeur timestamp (number | Firestore Timestamp | null) en ms.
 * Retourne 0 pour les valeurs invalides.
 */
export function toMs(value) {
  if (typeof value === 'number') return value
  if (value?.toMillis) return value.toMillis()
  return 0
}
