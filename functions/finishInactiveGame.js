// Scheduled, toutes les 6 heures.
// Termine les parties actives dont le dernier coup date de plus de 24h.
//
// Ce cas peut survenir si tous les joueurs abandonnent le jeu sans forfait :
// le check côté client (useGame.js) ne tourne que si quelqu'un a la page ouverte.
// Cette fonction garantit la clôture même si personne ne revient.
//
// La mise à jour de status → 'finished' déclenchera automatiquement onGameEnd,
// qui distribuera les Pearls pour les joueurs ayant terminé leur score.

'use strict'

const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')

const INACTIVITY_MS = 24 * 60 * 60 * 1000 // 24 heures

const db = () => admin.firestore()

exports.finishInactiveGames = onSchedule({ schedule: 'every 6 hours', region: 'europe-west4' }, async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - INACTIVITY_MS)

  // Rechercher les parties actives dont le dernier mouvement est trop ancien.
  // lastMoveAt est un Firestore Timestamp (serverTimestamp()).
  const snap = await db().collection('games')
    .where('status', '==', 'active')
    .where('lastMoveAt', '<', cutoff)
    .get()

  if (snap.empty) return

  console.log(`finishInactiveGames: ${snap.size} game(s) to close`)

  // Traiter chaque partie dans sa propre transaction pour éviter les doublons
  for (const gameDoc of snap.docs) {
    await db().runTransaction(async (t) => {
      const ref  = gameDoc.ref
      const data = (await t.get(ref)).data()

      // Revérifier dans la transaction (la partie a pu être terminée entre-temps)
      if (data.status !== 'active') return

      // Attribuer un rang aux joueurs qui n'ont pas encore terminé
      // (pour que onGameEnd puisse distribuer les Pearls de participation)
      const alreadyFinished = data.players.filter(p => p.finished).length
      let nextRank          = alreadyFinished + 1

      const players = data.players.map(p => {
        if (p.finished) return p
        // Joueur inactif → forfait sans Pearls de classement, rang attribué
        const rank = nextRank++
        return { ...p, finished: true, forfeited: true, rank, finishedAt: Date.now() }
      })

      t.update(ref, {
        status:            'finished',
        finishedAt:        admin.firestore.FieldValue.serverTimestamp(),
        endedByInactivity: true,
        players,
      })
    })
  }
})
