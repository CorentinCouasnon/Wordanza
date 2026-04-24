// Service Firestore pour le matchmaking.
//
// Le client gère uniquement son entrée dans la file (rejoindre / quitter / observer).
// La création de parties est entièrement gérée par les Cloud Functions :
//   - onMatchmakingJoin   : tente de créer un match dès qu'un joueur rejoint
//   - matchmakingBotFill  : scheduled toutes les 10 min, complète avec des bots après MAX_WAIT_MS

import { db } from '../firebase/config'
import {
  doc, collection, query, where, setDoc, deleteDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore'

/**
 * Inscrit le joueur dans la file d'attente.
 * Utilise setDoc (idempotent): sécurisé même si appelé plusieurs fois.
 */
export async function enterQueue(userId, displayName, handicap, language) {
  await setDoc(doc(db, 'matchmaking', userId), {
    userId,
    displayName,
    handicap,
    language,
    joinedAt: serverTimestamp(),
  })
}

/**
 * Retire le joueur de la file d'attente.
 */
export async function leaveQueue(userId) {
  await deleteDoc(doc(db, 'matchmaking', userId))
}

/**
 * S'abonne aux entrées de la file pour une langue donnée.
 *
 * @param {string}   language - Langue filtrée ("en" | "fr")
 * @param {function} callback - Appelé avec un tableau d'entrées [{ id, userId, displayName, handicap, ... }]
 * @returns {function} Fonction de désabonnement
 */
export function subscribeToQueue(language, callback) {
  // Filtre par langue côté serveur pour réduire les lectures Firestore.
  // Nécessite un index composite Firestore sur (language ASC, joinedAt ASC).
  const q = query(
    collection(db, 'matchmaking'),
    where('language', '==', language),
  )
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    callback(entries)
  })
}
