// Hook de matchmaking.
//
// La création de partie et le bot-fill sont gérés par les Cloud Functions
// (onMatchmakingJoin + matchmakingBotFill). Ce hook se contente de :
//   1. Rejoindre / quitter la file (enterQueue / leaveQueue)
//   2. Observer la file pour afficher la taille et l'ETA
//   3. Détecter quand son entrée disparaît → le serveur a créé la partie

import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, collection, query, where, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuthContext } from '../contexts/AuthContext'
import { getTargetScore, getTotalSkillPoints } from '../utils/handicap'
import { enterQueue, leaveQueue, subscribeToQueue } from '../services/matchmakingService'
import { toMs } from '../utils/time'

// Délai max annoncé côté serveur avant bot-fill (60 min)
export const MAX_WAIT_MS = 60 * 60 * 1000

// Délai supplémentaire côté client pour le worst-case de la scheduled function (10 min)
export const SCHEDULE_BUFFER_MS = 10 * 60 * 1000

export function useMatchmaking() {
  const { user, profile } = useAuthContext()

  const [status,    setStatus]    = useState('idle')
  const [queueSize, setQueueSize] = useState(0)
  const [gameId,    setGameId]    = useState(null)
  // Timestamp (ms) depuis lequel ce joueur est en file, pour l'affichage ETA
  const [joinedAt,  setJoinedAt]  = useState(null)

  const unsubRef       = useRef(null)
  const isSearchingRef = useRef(false)
  const joinedAtRef    = useRef(null)
  // Langue de la file à laquelle on est abonné. Si l'utilisateur change de langue
  // dans son profil pendant la recherche, on quitte et on rejoint la nouvelle file.
  const queueLangRef   = useRef(null)

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (unsubRef.current) {
        unsubRef.current()
        unsubRef.current = null
      }
    }
  }, [])

  /**
   * Cherche la partie active la plus récente contenant le joueur courant.
   * Appelé quand notre entrée matchmaking disparaît (le serveur a créé la partie).
   */
  async function findMyActiveGame(userId) {
    const q    = query(
      collection(db, 'games'),
      where('playerIds', 'array-contains', userId),
      where('status', '==', 'active'),
    )
    const snap = await getDocs(q)
    if (snap.empty) return null

    const docs = [...snap.docs].sort(
      (a, b) => toMs(b.data().startedAt) - toMs(a.data().startedAt)
    )
    return docs[0].id
  }

  /**
   * Callback snapshot, appelé à chaque changement de la file.
   * Se contente d'afficher la taille et de détecter la disparition de notre entrée.
   */
  function handleQueueSnapshot(entries) {
    if (!isSearchingRef.current) return

    const myEntry = entries.find(e => e.id === user?.uid)

    if (!myEntry) {
      // Notre entrée a disparu → le serveur a créé une partie pour nous
      isSearchingRef.current = false
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
      findMyActiveGame(user?.uid).then(foundId => {
        if (foundId) { setGameId(foundId); setStatus('found') }
      })
      return
    }

    setQueueSize(entries.length)
  }

  // ── Reconnexion après F5 ──────────────────────────────────────────────────────
  // Si le joueur était en file avant de recharger la page, on restaure l'état.
  //
  // Si le joueur change de langue pendant qu'il est en file (via ProfilePage),
  // on détecte ce changement et on quitte + rejoint la nouvelle file automatiquement.
  useEffect(() => {
    if (!user || !profile) return

    const currentLang = profile?.language ?? 'en'

    // Cas 1 : déjà en recherche, mais la langue a changé → re-enrôler dans la nouvelle file
    if (isSearchingRef.current && queueLangRef.current && queueLangRef.current !== currentLang) {
      (async () => {
        try {
          await leaveQueue(user.uid)
        } catch { /* Ignoré : l'entrée a peut-être déjà été supprimée */ }
        if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
        isSearchingRef.current = false
        queueLangRef.current   = null
        setQueueSize(0)

        // Rejoindre avec la nouvelle langue
        const skills     = profile?.skills ?? {}
        const myHandicap = getTargetScore(getTotalSkillPoints(skills))
        try {
          await enterQueue(user.uid, profile?.displayName ?? 'Player', myHandicap, currentLang)
        } catch {
          return
        }
        isSearchingRef.current = true
        queueLangRef.current   = currentLang
        const joinTime         = Date.now()
        joinedAtRef.current    = joinTime
        setJoinedAt(joinTime)
        const unsub = subscribeToQueue(currentLang, handleQueueSnapshot)
        unsubRef.current = unsub
      })()
      return
    }

    // Cas 2 : pas encore en recherche → tenter une reconnexion F5
    if (isSearchingRef.current) return

    async function rejoinIfNeeded() {
      const mmDoc = await getDoc(doc(db, 'matchmaking', user.uid))
      if (!mmDoc.exists()) return

      const language = currentLang
      isSearchingRef.current = true
      queueLangRef.current   = language

      const firestoreJoinedAt = mmDoc.data().joinedAt
      const joinedMs          = toMs(firestoreJoinedAt) || Date.now()
      joinedAtRef.current     = joinedMs
      setJoinedAt(joinedMs)
      setStatus('searching')

      const unsub = subscribeToQueue(language, handleQueueSnapshot)
      unsubRef.current = unsub
    }

    rejoinIfNeeded()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.uid, profile?.language])

  /**
   * Lance la recherche de partie, inscrit le joueur dans la file.
   * Le serveur (onMatchmakingJoin) prend le relais pour créer la partie.
   */
  const startSearch = useCallback(async () => {
    if (!user || isSearchingRef.current) return

    const language   = profile?.language ?? 'en'
    const skills     = profile?.skills   ?? {}
    const myHandicap = getTargetScore(getTotalSkillPoints(skills))

    isSearchingRef.current = true

    const joinTime      = Date.now()
    joinedAtRef.current = joinTime
    setJoinedAt(joinTime)

    // État intermédiaire 'joining' : affiché pendant le round-trip enterQueue
    // pour que le bouton "Trouver une partie" bascule immédiatement en "Connexion…"
    // au lieu de rester cliquable pendant l'appel réseau.
    setStatus('joining')

    try {
      await enterQueue(user.uid, profile?.displayName ?? 'Player', myHandicap, language)
    } catch {
      isSearchingRef.current = false
      setStatus('idle')
      return
    }

    queueLangRef.current = language
    setStatus('searching')

    const unsub = subscribeToQueue(language, handleQueueSnapshot)
    unsubRef.current = unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile])

  /**
   * Annule la recherche et retire le joueur de la file.
   */
  const cancelSearch = useCallback(async () => {
    isSearchingRef.current = false
    queueLangRef.current   = null
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    if (user?.uid) await leaveQueue(user.uid)
    setStatus('idle')
    setQueueSize(0)
    setJoinedAt(null)
    joinedAtRef.current = null
  }, [user])

  return { status, queueSize, gameId, joinedAt, startSearch, cancelSearch }
}
