// Service Firestore pour les opérations sur le profil joueur.
//
// Les achats (compétences, power-ups) passent par la Cloud Function buyItem.
// La distribution des Pearls est gérée entièrement par la Cloud Function onGameEnd
// (se déclenche dès qu'un joueur passe à finished: true).

import { db, functions } from '../firebase/config'
import { doc, getDoc, updateDoc, increment, collection, query, where, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

// Récompenses en Pearls selon le rang final (1 = 1er, 5 = dernier).
// Les joueurs qui n'ont pas atteint leur score cible (rank === null) reçoivent
// la récompense de participation.
const PEARL_REWARDS = { 1: 10, 2: 6, 3: 4, 4: 2, 5: 1 }
const PEARL_PARTICIPATION = 1

/**
 * Retourne la récompense en Pearls pour un rang donné.
 *
 * @param {number|null} rank - Rang final (1-5) ou null si non terminé
 * @returns {number}
 */
export function getPearlReward(rank) {
  return rank ? (PEARL_REWARDS[rank] ?? PEARL_PARTICIPATION) : PEARL_PARTICIPATION
}

// ── Achats via Cloud Function ────────────────────────────────────────────────

/**
 * Achète un item (compétence ou power-up) via la Cloud Function buyItem.
 *
 * Vérifie le solde de Pearls et effectue la déduction côté serveur dans une
 * transaction, empêchant toute manipulation côté client.
 *
 * @param {{ type: 'skill'|'powerup', itemId: string }} params
 * @returns {Promise<object>} Résultat selon le type :
 *   - skill   : { newLevel, newPearls, newTotalSkillPoints }
 *   - powerup : { newPearls, newUnlocked }
 * @throws si le serveur rejette l'achat (solde insuffisant, etc.)
 */
export async function buyItemCallable({ type, itemId }) {
  const fn     = httpsCallable(functions, 'buyItem')
  const result = await fn({ type, itemId })
  return result.data
}

// ── Dev bypass ───────────────────────────────────────────────────────────────

/**
 * Ajoute des Pearls directement au profil du joueur.
 * Utilisé uniquement pour les tests de développement.
 */
export async function devAddPearls(userId, amount) {
  await updateDoc(doc(db, 'users', userId), { pearls: increment(amount) })
}

// ── Pseudo ───────────────────────────────────────────────────────────────────

/**
 * Valide et met à jour le pseudo du joueur via la Cloud Function updateDisplayName.
 *
 * Le serveur :
 *   - valide le format
 *   - réserve le nom dans la collection `displayNames/{nameLower}` (atomique)
 *   - libère l'ancienne réservation
 *   - propage le nom dans les parties en cours (players[].displayName)
 *
 * @param {string} newName
 * @returns {Promise<string>} Le pseudo trimmed validé
 * @throws si le pseudo est invalide ou déjà pris
 */
export async function updateDisplayName(newName) {
  try {
    const fn     = httpsCallable(functions, 'updateDisplayName')
    const result = await fn({ displayName: newName })
    return result.data.displayName
  } catch (err) {
    // FirebaseFunctionsError → message clair pour l'UI
    throw new Error(err?.message ?? 'Failed to update display name')
  }
}

// ── Langue préférée ──────────────────────────────────────────────────────────

/**
 * Met à jour la langue préférée du joueur.
 * Affecte la file de matchmaking et le dictionnaire en mode solo.
 *
 * @param {string} userId
 * @param {'en'|'fr'|'es'|'de'} language
 */
export async function updateLanguage(userId, language) {
  await updateDoc(doc(db, 'users', userId), { language })
}

// ── Avatar ───────────────────────────────────────────────────────────────────

/**
 * Met à jour l'avatar choisi par le joueur.
 * L'avatar est stocké sous forme d'index dans le tableau AVATARS.
 *
 * @param {string} userId
 * @param {number} avatarIndex
 */
export async function updateAvatarIndex(userId, avatarIndex) {
  await updateDoc(doc(db, 'users', userId), { avatarIndex })
}

// ── Profil public ────────────────────────────────────────────────────────────

/**
 * Résout un pseudo public en profil utilisateur.
 *
 * Stratégie :
 *   1. Lookup dans `displayNames/{nameLower}` (chemin rapide, atomique)
 *   2. Fallback : query sur `users.displayName` (legacy, utilisateurs qui
 *      n'ont jamais renommé leur compte et n'ont donc pas de réservation)
 *
 * @param {string} username
 * @returns {Promise<{ userId: string, profile: object } | null>}
 */
export async function fetchPublicProfileByUsername(username) {
  const trimmed = typeof username === 'string' ? username.trim() : ''
  if (!trimmed) return null

  // 1. Réservation (chemin principal)
  const nameLower = trimmed.toLowerCase()
  const reservedSnap = await getDoc(doc(db, 'displayNames', nameLower))
  let userId = reservedSnap.exists() ? reservedSnap.data().userId : null

  // 2. Legacy : query par displayName (case-sensitive)
  if (!userId) {
    const q = query(
      collection(db, 'users'),
      where('displayName', '==', trimmed),
      limit(1)
    )
    const snap = await getDocs(q)
    if (!snap.empty) userId = snap.docs[0].id
  }

  if (!userId) return null

  const userSnap = await getDoc(doc(db, 'users', userId))
  if (!userSnap.exists()) return null

  return { userId, profile: userSnap.data() }
}

// ── Bug reports ──────────────────────────────────────────────────────────────

/**
 * Crée un rapport de bug dans `bugReports`.
 * Lecture uniquement via console Firebase, pas de retour visible côté joueur.
 *
 * @param {{ userId: string, displayName: string, title: string, message: string }} params
 */
export async function submitBugReport({ userId, displayName, title, message }) {
  await addDoc(collection(db, 'bugReports'), {
    userId,
    displayName: displayName ?? null,
    title:       title.trim().slice(0, 120),
    message:     message.trim().slice(0, 2000),
    url:         typeof window !== 'undefined' ? window.location.href : null,
    userAgent:   typeof navigator !== 'undefined' ? navigator.userAgent : null,
    createdAt:   serverTimestamp(),
  })
}

