// Définition des 3 compétences achetables dans le Shop.
// Chaque niveau coûte 10 × n² Pearls (ex: niv 1 = 10, niv 5 = 250, niv 10 = 1000).

export const SKILLS = {
  speed: {
    id: 'speed',
    name: 'Speed',
    icon: '/items/speed.png',
    description: 'Reduces the AP cost to draw a letter by 1 per level.',
    maxLevel: 10,
    // Effet : coût de pioche = 20 - niveau
    getEffect: (level) => ({ drawCost: 20 - level }),
  },
  creativity: {
    id: 'creativity',
    name: 'Creativity',
    icon: '/items/creative.png',
    description: 'Increases your rack size by 1 per level.',
    maxLevel: 10,
    // Effet : taille de la réglette = 6 + niveau
    getEffect: (level) => ({ handSize: 6 + level }),
  },
  wisdom: {
    id: 'wisdom',
    name: 'Wisdom',
    icon: '/items/wisdom.png',
    description: 'Increases your starting AP by 20 per level.',
    maxLevel: 10,
    // Effet : AP de départ = 160 + (niveau × 20)
    getEffect: (level) => ({ startingAP: 160 + level * 20 }),
  },
}

// Calcule le coût en Pearls pour acheter un niveau donné d'une compétence.
// Formule : 10 × niveau²
// Niveau 1 = 10, Niveau 5 = 250, Niveau 10 = 1000
export function getSkillLevelCost(level) {
  return 10 * level * level
}

// Calcule le coût total cumulé pour atteindre un certain niveau depuis 0.
export function getTotalSkillCost(targetLevel) {
  let total = 0
  for (let i = 1; i <= targetLevel; i++) {
    total += getSkillLevelCost(i)
  }
  return total
}
