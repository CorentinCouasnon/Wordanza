// Définition de tous les power-ups du jeu.
// "trash" est disponible par défaut pour tous les joueurs, sans achat.
// Tous les autres doivent être achetés une fois dans le Shop (achat permanent).
//
// Les coûts (shopCost, apCost, usesPerGame, isDefault) viennent de
// shared/gameData.json pour rester synchro avec functions/constants.js.
// Les champs de présentation (name, icon, description) sont définis ici
// car ils ne concernent que le client.

import gameData from '../../shared/gameData.json'

// Métadonnées UI, id → { name, icon, description }
const UI_META = {
  trash:      { name: 'Trash',      icon: '/items/trash.png',      description: 'Discard all letters from your rack. Cannot be undone.' },
  binoculars: { name: 'Binoculars', icon: '/items/telescope.png',  description: "See an opponent's rack. Blocked by Shield." },
  recycle:    { name: 'Recycle',    icon: '/items/recycle.png',    description: 'Exchange one letter from your rack for a random one.' },
  vowel:      { name: 'Vowel',      icon: '/items/vowel.png',      description: 'Draw a random vowel. Requires a free slot in your rack.' },
  consonant:  { name: 'Consonant',  icon: '/items/consonant.png',  description: 'Draw a random consonant. Requires a free slot in your rack.' },
  boost:      { name: 'Boost',      icon: '/items/boost.png',      description: 'Draw 3 random letters at once. Requires 3 free slots in your rack.' },
  steal:      { name: 'Steal',      icon: '/items/steal.png',      description: 'Steal a random letter from an opponent. Blocked by Shield.' },
  twister:    { name: 'Twister',    icon: '/items/twister.png',    description: 'Replace all your letters with new random ones.' },
  switcheroo: { name: 'Switcheroo', icon: '/items/revolution.png', description: "Swap your entire rack with an opponent's. Both must have the same number of letters. Blocked by Shield." },
  joker:      { name: 'Joker',      icon: '/items/jocker.png',     description: 'Add any letter of your choice to your rack. Requires a free slot.' },
  shield:     { name: 'Shield',     icon: '/items/shield.png',     description: 'Activate protection against Binoculars, Steal, and Switcheroo for the rest of the game.' },
}

// Assemble la liste finale en fusionnant les coûts partagés + la meta UI.
// `usesPerGame` stocké -1 dans le JSON = Infinity (JSON ne supporte pas Infinity).
export const POWERUPS = Object.fromEntries(
  Object.entries(gameData.POWERUP_COSTS).map(([id, costs]) => [
    id,
    {
      id,
      ...UI_META[id],
      ...costs,
      usesPerGame: costs.usesPerGame === -1 ? Infinity : costs.usesPerGame,
    },
  ])
)

// Ordre d'affichage dans la barre de power-ups en jeu
export const POWERUP_ORDER = [
  'trash',
  'binoculars',
  'recycle',
  'vowel',
  'consonant',
  'boost',
  'steal',
  'twister',
  'switcheroo',
  'joker',
  'shield',
]

export const TARGETED_POWERUPS   = gameData.TARGETED_POWERUPS
export const SHIELDABLE_POWERUPS = gameData.SHIELDABLE_POWERUPS
