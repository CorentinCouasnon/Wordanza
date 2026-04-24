// Purge hebdomadaire des comptes anonymes inactifs.
//
// Stratégie :
//   - Compte anonyme = providerData vide (aucun provider lié).
//   - "Vide"  = pearls == 0 ET totalSkillPoints == 0 ET stats.gamesPlayed == 0.
//   - Seuils d'inactivité (basés sur Firebase Auth `lastSignInTime`) :
//       • inactif > 30j           → suppression (vide ou pas).
//       • inactif 7j à 30j + vide → suppression.
//       • sinon                    → skip.
//   - Les comptes `isDev == true` sont épargnés.
//
// Coût Firestore : 1 query groupée pour les uids `isDev`, puis 1 read
// Firestore uniquement pour les candidats dans la fenêtre [7j, 30j] (pour
// checker si le profil est vide). Les users > 30j sont supprimés sans read.
// Les appels Admin Auth (listUsers / deleteUsers) ne sont pas facturés.

'use strict'

const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin          = require('firebase-admin')

const db = () => admin.firestore()

const EMPTY_INACTIVE_DAYS    = 7
const NONEMPTY_INACTIVE_DAYS = 30
const MAX_DELETIONS_PER_RUN  = 5000 // garde-fou pour éviter un run trop long

// Retourne la liste des uids ayant `isDev == true`.
async function fetchDevUids() {
  const snap = await db().collection('users').where('isDev', '==', true).get()
  return new Set(snap.docs.map(d => d.id))
}

// Supprime tous les docs d'une sous-collection par batchs de 500.
async function deleteSubcollection(parentRef, subName) {
  const snap = await parentRef.collection(subName).get()
  if (snap.empty) return
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 500) {
    const batch = db().batch()
    docs.slice(i, i + 500).forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

// Un doc manquant compte comme vide (profil jamais créé: cas rare mais possible
// si auth a réussi puis ensureProfile a échoué).
function isProfileEmpty(data) {
  if (!data) return true
  const pearls = data.pearls ?? 0
  const sp     = data.totalSkillPoints ?? 0
  const games  = data.stats?.gamesPlayed ?? 0
  return pearls === 0 && sp === 0 && games === 0
}

exports.cleanupAnonymousUsers = onSchedule(
  {
    // Dimanche 00h00 heure Paris
    schedule:       '0 0 * * 0',
    timeZone:       'Europe/Paris',
    region:         'europe-west4',
    timeoutSeconds: 540,
    memory:         '512MiB',
  },
  async () => {
    const now         = Date.now()
    const emptyCutoff = now - EMPTY_INACTIVE_DAYS    * 24 * 60 * 60 * 1000
    const hardCutoff  = now - NONEMPTY_INACTIVE_DAYS * 24 * 60 * 60 * 1000

    console.log(
      `[cleanupAnonymous] Début: vides > ${EMPTY_INACTIVE_DAYS}j, ` +
      `non-vides > ${NONEMPTY_INACTIVE_DAYS}j`,
    )

    const devUids = await fetchDevUids()
    console.log(`[cleanupAnonymous] ${devUids.size} compte(s) isDev protégé(s)`)

    let scanned         = 0
    let deleted         = 0
    let skippedDev      = 0
    let skippedRecent   = 0
    let skippedNotAnon  = 0
    let skippedHasValue = 0

    const pendingAuthDeletes = []

    async function flushAuthDeletes() {
      if (pendingAuthDeletes.length === 0) return
      try {
        const res = await admin.auth().deleteUsers(pendingAuthDeletes)
        if (res.failureCount > 0) {
          console.warn(
            `[cleanupAnonymous] deleteUsers: ${res.failureCount} échec(s)`,
            res.errors.slice(0, 3),
          )
        }
      } catch (err) {
        console.error('[cleanupAnonymous] deleteUsers a échoué:', err)
      }
      pendingAuthDeletes.length = 0
    }

    async function deleteUser(uid) {
      const userRef = db().doc(`users/${uid}`)
      try {
        await deleteSubcollection(userRef, 'dailyResults')
        await userRef.delete()
      } catch (err) {
        console.error(`[cleanupAnonymous] Erreur Firestore uid=${uid}:`, err)
        return false
      }
      pendingAuthDeletes.push(uid)
      if (pendingAuthDeletes.length >= 1000) {
        await flushAuthDeletes()
      }
      return true
    }

    let pageToken = undefined
    let capReached = false

    do {
      const page = await admin.auth().listUsers(1000, pageToken)
      pageToken = page.pageToken

      for (const record of page.users) {
        scanned += 1

        // Anonyme = aucun provider lié (Google = 'google.com' dans providerData)
        if (record.providerData && record.providerData.length > 0) {
          skippedNotAnon += 1
          continue
        }
        if (devUids.has(record.uid)) {
          skippedDev += 1
          continue
        }

        const lastSignIn = record.metadata?.lastSignInTime
          ? Date.parse(record.metadata.lastSignInTime)
          : 0

        // Inactif depuis < 7j: skip direct, pas de read profil.
        if (lastSignIn >= emptyCutoff) {
          skippedRecent += 1
          continue
        }

        // >= 30j: suppression inconditionnelle, pas de read profil.
        if (lastSignIn < hardCutoff) {
          if (await deleteUser(record.uid)) deleted += 1
          if (deleted >= MAX_DELETIONS_PER_RUN) { capReached = true; break }
          continue
        }

        // Entre 7j et 30j: supprime uniquement si le profil est vide.
        // Read Firestore nécessaire ici.
        let data = null
        try {
          const snap = await db().doc(`users/${record.uid}`).get()
          data = snap.exists ? snap.data() : null
        } catch (err) {
          console.error(`[cleanupAnonymous] Lecture profil échouée uid=${record.uid}:`, err)
          continue
        }

        if (!isProfileEmpty(data)) {
          skippedHasValue += 1
          continue
        }

        if (await deleteUser(record.uid)) deleted += 1
        if (deleted >= MAX_DELETIONS_PER_RUN) { capReached = true; break }
      }

      if (capReached) {
        console.warn(`[cleanupAnonymous] Cap atteint (${MAX_DELETIONS_PER_RUN}), arrêt`)
        break
      }
    } while (pageToken)

    await flushAuthDeletes()

    console.log(
      `[cleanupAnonymous] Fin: scanned=${scanned}, deleted=${deleted}, ` +
      `skippedDev=${skippedDev}, skippedNotAnon=${skippedNotAnon}, ` +
      `skippedRecent=${skippedRecent}, skippedHasValue=${skippedHasValue}`,
    )
  },
)
