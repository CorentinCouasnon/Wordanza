// Trigger Firestore, distribue les Pearls et met à jour les stats.
//
// Se déclenche à chaque write sur games/{gameId}.
// Distribue les Pearls pour TOUT joueur humain marqué `finished: true` dont
// `pearlsDistributed` est encore false, autrement dit :
//   - dès qu'un joueur atteint son score cible (partie encore active)
//   - ou quand la partie se termine globalement (inactivité, tous finis, etc.)
//
// Idempotence : le flag pearlsDistributed par joueur garantit qu'une double-exécution
// (Firebase garantit at-least-once) ne crédite pas deux fois les Pearls.
// La transaction protège contre deux exécutions parallèles qui liraient toutes deux
// pearlsDistributed: false avant que l'une ait pu écrire.

'use strict'

const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')

const { getPearlReward } = require('./constants')

const db = () => admin.firestore()

// Compte les joueurs humains qui doivent recevoir leurs Pearls.
function countPending(players) {
  return (players ?? []).filter(p => p.finished && !p.pearlsDistributed && !p.isBot).length
}

exports.onGameEnd = onDocumentUpdated({ document: 'games/{gameId}', region: 'europe-west4' }, async (event) => {
  const before = event.data.before.data()
  const after  = event.data.after.data()

  // Sortie rapide : ne rien faire si le nombre de joueurs à distribuer n'a pas augmenté.
  // Comme `pearlsDistributed` et `finished` ne peuvent que passer de false à true,
  // cela ne déclenche la transaction que quand un nouveau joueur vient de finir.
  if (countPending(after) <= countPending(before)) return

  const gameId  = event.params.gameId
  const gameRef = db().doc(`games/${gameId}`)

  // Transaction pour protéger contre la double-exécution
  await db().runTransaction(async (t) => {
    const snap = await t.get(gameRef)
    if (!snap.exists) return

    const game = snap.data()

    // Les parties privées (créées à la main via lien) n'accordent pas de Pearls.
    // On marque quand même les joueurs comme distribués pour court-circuiter
    // les prochains triggers sur cette partie, et on met à jour leurs stats.
    const isPrivate = game.isPrivate === true

    // Collecter les joueurs humains non encore distribués ET déjà finis
    const toDo = game.players
      .map((p, i) => ({ ...p, idx: i }))
      .filter(p => p.finished && !p.pearlsDistributed && !p.isBot)

    if (toDo.length === 0) return // Tout a déjà été distribué

    // Marquer les joueurs comme distribués dans le document de partie
    const newPlayers = game.players.map((p, i) => {
      const match = toDo.find(d => d.idx === i)
      return match ? { ...p, pearlsDistributed: true } : p
    })
    t.update(gameRef, { players: newPlayers })

    // Créditer les Pearls et mettre à jour les stats pour chaque joueur concerné
    for (const player of toDo) {
      // Parties privées = pas de Pearls, mais on garde le tracking de stats
      const reward  = (isPrivate || player.forfeited) ? 0 : getPearlReward(player.rank)
      const userRef = db().doc(`users/${player.userId}`)

      // Podium : incrémente le compteur correspondant au rang (1/2/3).
      // Les forfaits n'ont pas de rang valide → pas de podium.
      const podiumField =
        player.rank === 1 ? 'stats.podiumFirst'  :
        player.rank === 2 ? 'stats.podiumSecond' :
        player.rank === 3 ? 'stats.podiumThird'  : null

      t.update(userRef, {
        pearls:                    admin.firestore.FieldValue.increment(reward),
        'stats.gamesPlayed':       admin.firestore.FieldValue.increment(1),
        'stats.totalPearlsEarned': admin.firestore.FieldValue.increment(reward),
        ...(player.rank === 1 ? { 'stats.gamesWon': admin.firestore.FieldValue.increment(1) } : {}),
        ...(podiumField ? { [podiumField]: admin.firestore.FieldValue.increment(1) } : {}),
      })
    }

    console.log(`onGameEnd: ${gameId}: processed ${toDo.length} player(s)${isPrivate ? ' (private: no pearls)' : ''}`)
  })
})
