// Liste des avatars pré-créés, stockés dans public/avatars/.
// L'utilisateur choisit un avatar via son index dans ce tableau.
// Ne pas réordonner : l'index est persisté dans Firestore (users.avatarIndex)
// et changer l'ordre modifierait l'avatar des comptes existants.

export const AVATARS = [
  { id: 'owl',     file: 'owl.png' },
  { id: 'mouse',   file: 'mouse.png' },
  { id: 'dog',     file: 'dog.png' },
  { id: 'panda',   file: 'panda.png' },
  { id: 'giraffe', file: 'giraffe.png' },
  { id: 'cat',     file: 'cat.png' },
  { id: 'fox',     file: 'fox.png' },
  { id: 'lion',    file: 'lion.png' },
  { id: 'rabbit',  file: 'rabbit.png' },
]

// URL publique d'un avatar à partir de son index.
export function avatarUrl(index) {
  const safe = AVATARS[index] ?? AVATARS[0]
  return `/avatars/${safe.file}`
}

// Index aléatoire, utilisé à la création d'un nouveau profil.
export function randomAvatarIndex() {
  return Math.floor(Math.random() * AVATARS.length)
}

// Fallback déterministe pour les comptes existants qui n'ont pas encore
// d'avatarIndex en base : hash simple du uid → index stable.
// Évite que l'avatar change à chaque rechargement avant que le joueur n'en choisisse un.
export function avatarIndexForUid(uid) {
  if (!uid) return 0
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0
  }
  return hash % AVATARS.length
}

// Retourne l'index d'avatar à afficher pour un profil, avec fallback sur le uid.
export function resolveAvatarIndex(profile, uid) {
  if (profile && typeof profile.avatarIndex === 'number') return profile.avatarIndex
  return avatarIndexForUid(uid)
}
