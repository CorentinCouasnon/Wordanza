// Callable HTTPS: met à jour le pseudo du joueur.
//
// Uniqueness par réservation atomique dans la collection `displayNames` :
//   - clé = nom en minuscules (ex: "alice")
//   - valeur = { userId, displayName: <nom avec casse d'origine> }
//
// La transaction sur displayNames/{nameLower} garantit qu'aucun deux utilisateurs
// ne peuvent prendre simultanément le même pseudo, ce que la vérif par query
// côté client ne pouvait pas garantir (race condition).
//
// Pour la compatibilité avec les utilisateurs existants qui n'ont pas encore
// changé de pseudo (et n'ont donc pas de réservation), on complète avec une
// vérif par query sur `users.displayName`.
//
// Paramètres : { displayName: string }
// Retour     : { displayName: string }

'use strict'

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

const db = () => admin.firestore()

const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9_\- ]+$/

exports.updateDisplayName = onCall({ region: 'europe-west4', enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in')
  }

  const uid     = request.auth.uid
  const raw     = request.data?.displayName
  const trimmed = typeof raw === 'string' ? raw.trim() : ''

  // Validation format
  if (trimmed.length < 2 || trimmed.length > 16) {
    throw new HttpsError('invalid-argument', 'Name must be between 2 and 16 characters')
  }
  if (!DISPLAY_NAME_REGEX.test(trimmed)) {
    throw new HttpsError('invalid-argument', 'Only letters, numbers, spaces, hyphens and underscores are allowed')
  }

  const nameLower  = trimmed.toLowerCase()
  const userRef    = db().doc(`users/${uid}`)
  const newNameRef = db().doc(`displayNames/${nameLower}`)

  // Vérif legacy : un autre utilisateur détient-il déjà ce nom via son profil ?
  // (Utilisateurs qui n'ont jamais renommé leur compte → pas de réservation.)
  // Cette query a une fenêtre de race, mais la transaction qui suit verrouille
  // la réservation pour toutes les utilisations futures.
  const usersSnap = await db().collection('users')
    .where('displayName', '==', trimmed)
    .get()
  if (usersSnap.docs.some(d => d.id !== uid)) {
    throw new HttpsError('already-exists', 'This name is already taken')
  }

  // Transaction : réserver le nouveau nom, libérer l'ancien, mettre à jour le profil.
  await db().runTransaction(async (t) => {
    const userSnap    = await t.get(userRef)
    const newNameSnap = await t.get(newNameRef)

    if (!userSnap.exists) throw new HttpsError('not-found', 'User not found')

    // Si le nom est déjà réservé par quelqu'un d'autre → refuser.
    if (newNameSnap.exists && newNameSnap.data().userId !== uid) {
      throw new HttpsError('already-exists', 'This name is already taken')
    }

    const currentName  = userSnap.data().displayName
    const currentLower = typeof currentName === 'string' ? currentName.toLowerCase() : null

    // Réserver le nouveau nom
    t.set(newNameRef, { userId: uid, displayName: trimmed })

    // Libérer l'ancienne réservation si elle différait
    if (currentLower && currentLower !== nameLower) {
      t.delete(db().doc(`displayNames/${currentLower}`))
    }

    // Mettre à jour le profil
    t.update(userRef, { displayName: trimmed, displayNameChanged: true })
  })

  // Propagation du nouveau displayName dans les parties du joueur (best-effort,
  // hors transaction). Les règles Firestore acceptent l'Admin SDK sans restriction.
  const gamesSnap = await db().collection('games')
    .where('playerIds', 'array-contains', uid)
    .get()

  if (!gamesSnap.empty) {
    // Firestore limite à 500 opérations par batch, on découpe au besoin.
    const commits = []
    let batch = db().batch()
    let count = 0
    for (const gameDoc of gamesSnap.docs) {
      const players = gameDoc.data().players ?? []
      const updated = players.map(p =>
        p.userId === uid ? { ...p, displayName: trimmed } : p
      )
      batch.update(gameDoc.ref, { players: updated })
      count++
      if (count === 450) {
        commits.push(batch.commit())
        batch = db().batch()
        count = 0
      }
    }
    if (count > 0) commits.push(batch.commit())
    await Promise.all(commits)
  }

  return { displayName: trimmed }
})
