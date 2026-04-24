// Callable HTTPS: achat d'un item dans la boutique.
//
// Vérifie le solde de Pearls et effectue la déduction côté serveur dans une
// transaction, empêchant toute manipulation côté client.
//
// Paramètres : { type: 'skill' | 'powerup', itemId: string }
// Retour skill   : { newLevel, newPearls, newTotalSkillPoints }
// Retour powerup : { newPearls, newUnlocked }

'use strict'

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

const {
  getSkillLevelCost,
  getTotalSkillPoints,
  getTargetScore,
  SKILL_IDS,
  SKILL_MAX,
  POWERUPS,
  GAME_SLOT_COST,
  MAX_EXTRA_GAME_SLOTS,
} = require('./constants')

const db = () => admin.firestore()

exports.buyItem = onCall({ region: 'europe-west4', enforceAppCheck: true }, async (request) => {
  // 1. Vérification d'authentification
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in')
  }

  const userId = request.auth.uid
  const { type, itemId } = request.data

  if (!type || !itemId) {
    throw new HttpsError('invalid-argument', 'Missing type or itemId')
  }

  const userRef = db().doc(`users/${userId}`)

  // 2. Transaction, relit les données pour éviter les races conditions
  return await db().runTransaction(async (t) => {
    const snap = await t.get(userRef)
    if (!snap.exists) throw new HttpsError('not-found', 'User not found')

    const data   = snap.data()
    const pearls = data.pearls ?? 0

    if (type === 'skill') {
      // ── Achat de compétence ──────────────────────────────────────────────
      if (!SKILL_IDS.includes(itemId)) {
        throw new HttpsError('invalid-argument', `Unknown skill: ${itemId}`)
      }

      const level = data.skills?.[itemId] ?? 0

      if (level >= SKILL_MAX) {
        throw new HttpsError('failed-precondition', 'Skill is already at max level')
      }

      const cost = getSkillLevelCost(level + 1)

      if (pearls < cost) {
        throw new HttpsError('failed-precondition', 'Not enough Pearls')
      }

      const newLevel  = level + 1
      const newSkills = { ...(data.skills ?? {}), [itemId]: newLevel }
      const newTotal  = getTotalSkillPoints(newSkills)
      const newPearls = pearls - cost

      t.update(userRef, {
        [`skills.${itemId}`]: newLevel,
        totalSkillPoints:     newTotal,
        // Mettre à jour le handicap stocké pour que le matchmaking soit à jour
        handicap:             getTargetScore(newTotal),
        pearls:               newPearls,
      })

      return { newLevel, newPearls, newTotalSkillPoints: newTotal }

    } else if (type === 'powerup') {
      // ── Achat de power-up ────────────────────────────────────────────────
      const powerup = POWERUPS[itemId]
      if (!powerup)          throw new HttpsError('invalid-argument', `Unknown power-up: ${itemId}`)
      if (powerup.isDefault) throw new HttpsError('failed-precondition', 'This power-up is free by default')

      const owned = data.unlockedPowerups ?? []
      if (owned.includes(itemId)) {
        throw new HttpsError('already-exists', 'Power-up already owned')
      }

      if (pearls < powerup.shopCost) {
        throw new HttpsError('failed-precondition', 'Not enough Pearls')
      }

      const newPearls   = pearls - powerup.shopCost
      const newUnlocked = [...owned, itemId]

      t.update(userRef, {
        pearls:           newPearls,
        unlockedPowerups: newUnlocked,
      })

      return { newPearls, newUnlocked }

    } else if (type === 'gameSlot') {
      // ── Achat d'un slot de partie simultanée ────────────────────────────
      // Coût fixe, achetable jusqu'à MAX_EXTRA_GAME_SLOTS fois.
      const current = data.extraGameSlots ?? 0

      if (current >= MAX_EXTRA_GAME_SLOTS) {
        throw new HttpsError('failed-precondition', 'Game slots are already at max')
      }

      if (pearls < GAME_SLOT_COST) {
        throw new HttpsError('failed-precondition', 'Not enough Pearls')
      }

      const newExtraSlots = current + 1
      const newPearls     = pearls - GAME_SLOT_COST

      t.update(userRef, {
        extraGameSlots: newExtraSlots,
        pearls:         newPearls,
      })

      return { newExtraSlots, newPearls }

    } else {
      throw new HttpsError('invalid-argument', `Unknown type: ${type}`)
    }
  })
})
