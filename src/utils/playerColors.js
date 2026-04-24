// Palette de couleurs par joueur (thème Soleil d'été).
// Les couleurs sont assignées par position stable dans le tableau players
// de la partie (ordre de join = ordre de tour), pour que chaque joueur
// garde sa couleur sur toute la durée de la partie.

export const PLAYER_COLORS = [
  'oklch(57% 0.230 48)',   // orange   (joueur 1)
  'oklch(62% 0.220 25)',   // rouge-corail
  'oklch(55% 0.200 260)',  // violet
  'oklch(62% 0.220 330)',  // rose
  'oklch(55% 0.180 200)',  // cyan
]

// Renvoie la couleur assignée à un joueur d'après sa position dans `players`.
export function colorForUserId(userId, players) {
  if (!players) return PLAYER_COLORS[0]
  const idx = players.findIndex(p => p.userId === userId)
  return PLAYER_COLORS[(idx >= 0 ? idx : 0) % PLAYER_COLORS.length]
}
