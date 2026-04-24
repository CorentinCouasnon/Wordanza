// Service client pour le défi quotidien (Phase C).
//
// Expose :
//   - getTodaysChallengeId(lang)     : "YYYY-MM-DD_{lang}" selon l'heure Paris
//   - subscribeToChallenge(id, cb)   : snapshot live du défi
//   - subscribeToResult(uid, date, cb) : snapshot du résultat du joueur pour today
//   - submitDailyChallenge(payload)  : wrapper callable
//   - msUntilParisMidnight()         : délai jusqu'au prochain reset (timer UI)

import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import i18next from 'i18next'
import { db, functions } from '../firebase/config'

// ── Dates en heure Paris ────────────────────────────────────────────────────

/** "YYYY-MM-DD" pour la date courante en heure Europe/Paris. */
export function parisDateString(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  })
  return fmt.format(date)
}

/** ID du défi aujourd'hui pour une langue donnée. */
export function getTodaysChallengeId(language) {
  return `${parisDateString()}_${language}`
}

/**
 * Retourne les ms restants jusqu'au prochain 00h00 heure Paris.
 * Utilisé pour le timer UI (compte à rebours).
 */
export function msUntilParisMidnight(now = new Date()) {
  // Récupère l'heure actuelle à Paris via Intl
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour12:   false,
    hour:     '2-digit',
    minute:   '2-digit',
    second:   '2-digit',
  }).formatToParts(now)

  const h = Number(parts.find(p => p.type === 'hour').value)
  const m = Number(parts.find(p => p.type === 'minute').value)
  const s = Number(parts.find(p => p.type === 'second').value)

  // Temps écoulé depuis minuit Paris, puis reste jusqu'à 24h
  const elapsedMs = ((h * 60 + m) * 60 + s) * 1000
  const dayMs     = 24 * 60 * 60 * 1000
  return dayMs - elapsedMs
}

// ── Subscriptions ───────────────────────────────────────────────────────────

export function subscribeToChallenge(challengeId, callback) {
  const ref = doc(db, 'dailyChallenges', challengeId)
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}

export function subscribeToResult(userId, date, callback) {
  const ref = doc(db, 'users', userId, 'dailyResults', date)
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? snap.data() : null)
  })
}

// ── Callable ────────────────────────────────────────────────────────────────

/**
 * Soumet le coup du joueur.
 *
 * @param {object}   p
 * @param {string}   p.challengeId   - "YYYY-MM-DD_{lang}"
 * @param {Array}    p.draftEntries  - [["row_col", { letter, id }], ...]
 * @returns {Promise<object>}         - { success, score, bestScore, bestWord, pearlsEarned, newStreak, word, touchesBorder, error? }
 */
export async function submitDailyChallenge({ challengeId, draftEntries }) {
  try {
    const fn     = httpsCallable(functions, 'submitDailyChallenge')
    const result = await fn({ challengeId, draftEntries })
    return result.data
  } catch (err) {
    return {
      success: false,
      error:   err?.message ?? i18next.t('dailyChallenge.submitFailed'),
      code:    err?.code,
    }
  }
}
