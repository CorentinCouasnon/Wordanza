// Hook de logique de jeu multijoueur (Firestore).
//
// Modèle mental :
//   board, score, players, lastWords  → viennent de Firestore (onSnapshot)
//   rack, draft, selected             → état local React (non synchronisé)
//
// La validation d'un mot humain passe par la Cloud Function validateWord.
// Les bots sont joués côté serveur par la scheduled function playBotTurns
// (toutes les 2h, un bot par partie, round-robin).

import { useState, useEffect, useCallback, useRef } from 'react'
import i18next from 'i18next'
import {
  subscribeToGame,
  joinGame,
  validateWordCallable,
  updatePlayerAP,
  callGameAction,
} from '../services/gameService'
import { validatePlacement } from '../utils/boardValidation'
import { calculateWordScore } from '../utils/scoring'
import { getCurrentAP } from '../utils/ap'
import { useAP } from './useAP'
import { POWERUPS } from '../constants/POWERUPS'

// Compteur local pour les IDs de tuiles (non stocké dans Firestore)
let _id = 0
const newTile = (letter) => ({ id: `t${++_id}`, letter })

/**
 * Convertit la main Firestore (string[]) en rack React ([{ id, letter } | null, ...]).
 * Le rack a toujours handSize slots, les slots vides sont null.
 *
 * @param {string[]} hand     - Lettres en main depuis Firestore
 * @param {number}  handSize  - Taille totale de la réglette
 */
function handToRack(hand, handSize) {
  const rack = Array(handSize).fill(null)
  hand.forEach((letter, i) => {
    if (i < handSize) rack[i] = newTile(letter)
  })
  return rack
}

/**
 * Hook de jeu multijoueur.
 *
 * @param {string}  gameId      - ID Firestore de la partie
 * @param {string}  userId      - UID Firebase du joueur courant
 * @param {string}  displayName - Nom affiché
 * @param {boolean} profileReady - true quand le profil Auth est chargé (évite de rejoindre avec 'Player')
 * @param {{ speed, creativity, wisdom }} skills - Compétences du joueur
 */
export function useGame({ gameId, userId, displayName, profileReady = false, skills = {} }) {
  const speed      = skills.speed      ?? 0
  const creativity = skills.creativity ?? 0
  const wisdom     = skills.wisdom     ?? 0
  const drawCost   = Math.max(1, 20 - speed)
  const handSize   = 6 + creativity

  // ── State Firestore ──────────────────────────────────────────────────────
  const [gameDoc,   setGameDoc]   = useState(null)
  const [gameError, setGameError] = useState(null)

  // ── State local ──────────────────────────────────────────────────────────
  const [rack,     setRack]     = useState(() => Array(handSize).fill(null))
  const [draft,    setDraft]    = useState({})
  const [selected, setSelected] = useState(null)
  const [message,  setMessage]  = useState(null)
  // Résultat des Jumelles : { displayName, hand } | null
  const [binocularsView, setBinocularsView] = useState(null)

  // Le rack est initialisé depuis Firestore une seule fois (ou quand le joueur rejoint)
  const rackInitialized = useRef(false)

  // ── Feedback visuel : actions en cours ──────────────────────────────────
  // pendingAction : 'draw' | 'validate' | 'powerup:<id>' | null
  //   → lu par les composants pour afficher spinners / overlays.
  // pendingTargetSlot : index du slot rack ciblé par la pioche (shimmer).
  // pendingTargetUserId : userId du joueur ciblé par un power-up (pulse sur sa carte).
  // pendingDraft : snapshot du draft au moment du submit, gardé affiché en
  //   "pending" jusqu'au retour serveur (les tuiles sont grisées + pulse bordure).
  const [pendingAction,       setPendingAction]       = useState(null)
  const [pendingTargetSlot,   setPendingTargetSlot]   = useState(null)
  const [pendingTargetUserId, setPendingTargetUserId] = useState(null)
  const [pendingDraft,        setPendingDraft]        = useState(null)

  // Empêche les clics multiples sur un power-up (double-clic → double dépense de PA).
  // Flag local, suffisant car un joueur donné ne peut lancer un power-up que depuis
  // cette instance de hook (un seul onglet actif).
  const usingPowerupRef = useRef(false)

  // Ref pour toujours avoir le displayName le plus récent dans le callback onSnapshot.
  // Sans ça, si le profil se charge après le premier render, joinGame() serait
  // appelé avec 'Player' (valeur par défaut) au lieu du vrai pseudo.
  const displayNameRef = useRef(displayName)
  useEffect(() => { displayNameRef.current = displayName }, [displayName])

  const msgTimer = useRef(null)
  function showMessage(text, type = 'error') {
    if (msgTimer.current) clearTimeout(msgTimer.current)
    setMessage({ text, type })
    msgTimer.current = setTimeout(() => setMessage(null), 4000)
  }

  // ── Abonnement Firestore ─────────────────────────────────────────────────
  useEffect(() => {
    rackInitialized.current = false  // Réinitialiser si gameId change

    const unsub = subscribeToGame(gameId, async (game) => {
      if (!game) {
        setGameError('Game not found')
        return
      }

      setGameDoc(game)

      // If the board was updated by the other player, remove any draft tiles
      // that now overlap with validated cells and return them to the rack.
      const newBoard = game.board ?? {}
      setDraft(prevDraft => {
        const conflicting = Object.keys(prevDraft).filter(key => newBoard[key])
        if (conflicting.length === 0) return prevDraft

        // Return conflicting tiles to the rack
        const tilesToReturn = conflicting.map(key => prevDraft[key])
        setRack(prevRack => {
          const r = [...prevRack]
          for (const tile of tilesToReturn) {
            const slot = r.findIndex(s => s === null)
            if (slot !== -1) r[slot] = tile
          }
          return r
        })

        const updated = { ...prevDraft }
        for (const key of conflicting) delete updated[key]
        return updated
      })

      // Trouver les données du joueur courant
      const playerData = game.players.find(p => p.userId === userId)

      // Si le joueur n'est pas encore dans la partie (rejoindre auto en "waiting")
      if (!playerData) {
        if (game.status === 'waiting') {
          // Attendre que le profil soit chargé avant de rejoindre,
          // sinon displayName vaut encore 'Player' (valeur par défaut)
          if (!profileReady) return
          try {
            // Utiliser displayNameRef.current pour avoir le pseudo à jour,
            // même si le profil s'est chargé après le premier render
            await joinGame(gameId, userId, displayNameRef.current, skills)
            // L'onSnapshot refira une mise à jour avec le joueur ajouté
          } catch (err) {
            setGameError(err.message)
          }
        } else {
          setGameError('You are not a participant in this game.')
        }
        return
      }

      // Initialiser le rack depuis Firestore (une seule fois par session)
      if (!rackInitialized.current) {
        setRack(handToRack(playerData.hand, handSize))
        rackInitialized.current = true
      }

    })

    return () => unsub()
    // `profileReady` est en dep pour relancer la logique de join quand le profil
    // se charge (évite de rejoindre avec 'Player' comme pseudo).
    // `skills` et `displayName` ne sont pas en deps : ils ne changent pas en partie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, userId, handSize, profileReady])

  // ── Sync AP ↔ wisdom en salle d'attente ──────────────────────────────────
  //
  // Si le joueur améliore wisdom après avoir rejoint (ex: onglet Shop),
  // on met à jour apStored en Firestore immédiatement, sans toucher à la main.
  // Au démarrage de la partie, la valeur est déjà correcte → rien à corriger.
  useEffect(() => {
    if (gameDoc?.status !== 'waiting') return
    const pData = gameDoc?.players?.find(p => p.userId === userId)
    if (!pData) return
    const expectedAP = 160 + wisdom * 20
    if (pData.apStored !== expectedAP) {
      updatePlayerAP(gameId, userId, expectedAP)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wisdom, gameDoc?.status])

  // ── Données dérivées de gameDoc ──────────────────────────────────────────
  const playerData  = gameDoc?.players?.find(p => p.userId === userId) ?? null
  const board       = gameDoc?.board    ?? {}
  const score       = playerData?.score ?? 0
  const targetScore = playerData?.targetScore ?? 250
  const players     = gameDoc?.players  ?? []
  const lastWords   = gameDoc?.lastWords ?? []
  const finished    = playerData?.finished ?? false

  // Calcul des AP en temps réel
  const apStored     = playerData?.apStored     ?? 0
  const lastApUpdate = playerData?.lastApUpdate ?? Date.now()
  // useAP recalculates AP every 10s to reflect passive regen (1 AP/min)
  const currentAP    = useAP(apStored, lastApUpdate)

  // Helper : lettres actuellement en draft, envoyées au serveur pour qu'il
  // puisse calculer la "main effective" (stored hand - drafts): voir
  // functions/gameAction.js pour le détail.
  function currentDraftLetters() {
    return Object.values(draft).map(t => t.letter)
  }

  // ── Piocher une lettre (server-authoritative) ────────────────────────────
  // Validation locale (PA, slot libre) uniquement pour l'UX: le serveur
  // revalide et est la seule source de vérité.
  const drawLetter = useCallback(async () => {
    const ap        = getCurrentAP(apStored, lastApUpdate)
    const emptySlot = rack.findIndex(s => s === null)
    if (emptySlot === -1) { showMessage('Your rack is full!'); return }
    if (ap < drawCost)    { showMessage(`Need ${drawCost} AP (you have ${ap})`); return }
    // Garde anti-double-clic : un seul appel drawLetter à la fois
    if (pendingAction === 'draw') return

    // Feedback visuel : shimmer sur le slot cible + disable bouton + PA grisés
    setPendingAction('draw')
    setPendingTargetSlot(emptySlot)
    try {
      const result = await callGameAction(gameId, 'drawLetter', {
        draftLetters: currentDraftLetters(),
      })
      if (!result?.success) {
        showMessage(result?.error ?? 'Draw failed')
        return
      }
      // Le serveur a tiré la lettre, on l'insère localement dans le premier slot libre
      setRack(prev => {
        const r    = [...prev]
        const slot = r.findIndex(s => s === null)
        if (slot !== -1) r[slot] = newTile(result.newLetter)
        return r
      })
    } finally {
      setPendingAction(null)
      setPendingTargetSlot(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apStored, lastApUpdate, rack, drawCost, draft, gameId, pendingAction])

  // ── Jeter la main (server-authoritative, gratuit) ────────────────────────
  const trashHand = useCallback(async () => {
    // Mise à jour optimiste : l'action est idempotente et ne peut pas échouer
    // pour des raisons gameplay (pas de coût, pas de condition).
    setRack(Array(handSize).fill(null))
    setDraft({})
    setSelected(null)
    const result = await callGameAction(gameId, 'trash', {
      draftLetters: currentDraftLetters(),
    })
    if (!result?.success) {
      showMessage(result?.error ?? 'Trash failed')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handSize, gameId, draft])

  // ── Clic sur la réglette ─────────────────────────────────────────────────
  // Même logique que useLocalGame.
  const handleRackClick = useCallback((index) => {
    const tile = rack[index]

    if (selected === null) {
      if (tile) setSelected({ source: 'rack', index })
      return
    }

    if (selected.source === 'rack') {
      if (selected.index === index) { setSelected(null); return }
      setRack(prev => {
        const r = [...prev]
        ;[r[selected.index], r[index]] = [r[index], r[selected.index]]
        return r
      })
      setSelected(null)
      return
    }

    if (selected.source === 'draft') {
      const draftTile = draft[selected.key]
      setRack(prev => { const r = [...prev]; r[index] = draftTile; return r })
      setDraft(prev => {
        const d = { ...prev }
        if (tile) { d[selected.key] = tile } else { delete d[selected.key] }
        return d
      })
      setSelected(null)
    }
  }, [rack, draft, selected])

  // ── Clic sur le plateau ──────────────────────────────────────────────────
  // Même logique que useLocalGame.
  const handleCellClick = useCallback((row, col) => {
    const key           = `${row}_${col}`
    const draftTile     = draft[key]
    const validatedCell = board[key]

    if (validatedCell) return  // Tuile validée = intouchable

    if (selected === null) {
      if (draftTile) setSelected({ source: 'draft', key })
      return
    }

    if (selected.source === 'rack') {
      const rackTile = rack[selected.index]
      if (draftTile) {
        setRack(prev => { const r = [...prev]; r[selected.index] = draftTile; return r })
        setDraft(prev => ({ ...prev, [key]: rackTile }))
      } else {
        setRack(prev => { const r = [...prev]; r[selected.index] = null; return r })
        setDraft(prev => ({ ...prev, [key]: rackTile }))
      }
      setSelected(null)
      return
    }

    if (selected.source === 'draft') {
      if (selected.key === key) { setSelected(null); return }
      if (draftTile) {
        setDraft(prev => ({ ...prev, [selected.key]: prev[key], [key]: prev[selected.key] }))
      } else {
        setDraft(prev => {
          const d = { ...prev }
          d[key] = d[selected.key]
          delete d[selected.key]
          return d
        })
      }
      setSelected(null)
    }
  }, [rack, draft, board, selected])

  // ── Double-clic sur une tuile draft → retour au rack ─────────────────────
  const handleCellDoubleClick = useCallback((row, col) => {
    const key       = `${row}_${col}`
    const draftTile = draft[key]
    if (!draftTile) return
    setDraft(prev => { const d = { ...prev }; delete d[key]; return d })
    setRack(prev => {
      const r    = [...prev]
      const slot = r.findIndex(s => s === null)
      if (slot !== -1) r[slot] = draftTile
      return r
    })
    setSelected(null)
  }, [draft])

  // ── Annuler le draft ──────────────────────────────────────────────────────
  const cancelDraft = useCallback(() => {
    setRack(prev => {
      const r = [...prev]
      for (const tile of Object.values(draft)) {
        const slot = r.findIndex(s => s === null)
        if (slot !== -1) r[slot] = tile
      }
      return r
    })
    setDraft({})
    setSelected(null)
  }, [draft])

  // ── Valider le mot (transaction Firestore) ───────────────────────────────
  const validateWord = useCallback(async (isValidWord) => {
    const placedLetters = Object.entries(draft).map(([key, tile]) => {
      const [row, col] = key.split('_').map(Number)
      return { row, col, letter: tile.letter }
    })
    if (placedLetters.length === 0) { showMessage('Place at least one letter'); return false }

    // Validation locale (placement + dictionnaire) avant d'envoyer la transaction
    const { valid, error, wordData } = validatePlacement(placedLetters, board)
    if (!valid)                  { showMessage(error); return false }
    if (!isValidWord(wordData.word)) { showMessage(`"${wordData.word}" is not in the dictionary`); return false }

    // Valider les mots croisés formés perpendiculairement (règle Scrabble)
    for (const cross of wordData.crossWords ?? []) {
      if (!isValidWord(cross.word)) { showMessage(`"${cross.word}" is not a valid word`); return false }
    }

    // Score = mot principal + score de chaque mot croisé formé
    const rawPoints = calculateWordScore(wordData.existingCount, wordData.newCount)
      + (wordData.crossWords ?? []).reduce(
          (sum, cross) => sum + calculateWordScore(cross.existingCount, cross.newCount),
          0
        )
    // Lettres restant dans le rack (les tuiles draft ne sont plus dans le rack)
    const remainingHand = rack.filter(Boolean).map(t => t.letter)
    // Sauvegarder les entrées draft avant de vider l'état
    const draftEntries  = Object.entries(draft)

    // Snapshot du draft conservé pour l'affichage "en attente" pendant l'appel.
    // On vide le draft actif pour empêcher toute édition pendant la validation,
    // mais on garde les tuiles visibles via pendingDraft (cf. Board).
    const snapshot = { ...draft }
    setPendingDraft(snapshot)
    setPendingAction('validate')
    setDraft({})
    setSelected(null)

    try {
      // Validation côté serveur via Cloud Function (recalcul du score + vérif dictionnaire)
      const result = await validateWordCallable({
        gameId,
        userId,
        currentBoardVersion: gameDoc?.boardVersion ?? 0,
        draftEntries,
        remainingHand,
      })

      if (!result.success) {
        // Échec : restaurer le draft pour laisser le joueur corriger
        setDraft(snapshot)
        showMessage(result.error ?? i18next.t('game.validationFailed'))
        return false
      }

      // Le board et le score seront mis à jour via onSnapshot automatiquement
      if (result.touchesBorder) {
        showMessage(i18next.t('game.borderCleared', { word: wordData.word }), 'warning')
      } else {
        showMessage(i18next.t('game.wordScored', { word: wordData.word, points: result.finalPoints }), 'success')
      }
      return true
    } finally {
      setPendingAction(null)
      setPendingDraft(null)
    }
  }, [draft, board, rack, gameId, userId, gameDoc?.boardVersion])

  // ── Utilisation d'un power-up ─────────────────────────────────────────────
  //
  // Appelé par la PowerupBar. Valide les contraintes (PA, limites d'utilisation)
  // côté client, puis exécute l'action locale + l'écriture Firestore.
  //
  // @param {string} powerupId
  // @param {object} params   - { targetId?, letter? }
  // @returns {Promise<boolean>} true si l'action a réussi
  const usePowerup = useCallback(async (powerupId, params = {}) => {
    const { targetId = null, letter = null } = params
    const powerup  = POWERUPS[powerupId]
    if (!powerup) return false

    // Garde anti-double-clic : si un power-up est déjà en cours de traitement,
    // refuser immédiatement. Utile pour l'UX (évite d'envoyer deux appels
    // en parallèle), mais la vraie protection contre la double-dépense est
    // serveur-side dans la transaction gameAction.
    if (usingPowerupRef.current) {
      showMessage('Please wait...')
      return false
    }
    usingPowerupRef.current = true
    // Flags d'affichage parallèles à la ref (la ref reste la garde synchrone
    // authoritative contre la double-dépense de PA ; les states ne servent
    // qu'à l'UI et peuvent se déclencher au tick suivant sans risque).
    setPendingAction(`powerup:${powerupId}`)
    if (targetId) setPendingTargetUserId(targetId)
    try {
      return await runPowerup()
    } finally {
      usingPowerupRef.current = false
      setPendingAction(null)
      setPendingTargetUserId(null)
    }

    async function runPowerup() {

    // ── Pré-validation locale (UX uniquement) ────────────────────────────
    // Ces checks évitent un aller-retour serveur pour des cas évidemment
    // invalides. Le serveur revalide tout de manière authoritative.
    const ap    = getCurrentAP(apStored, lastApUpdate)
    const usage = playerData?.powerupUsage ?? {}
    if (ap < powerup.apCost) {
      showMessage(`Need ${powerup.apCost} AP (you have ${ap})`)
      return false
    }
    if (powerup.usesPerGame !== Infinity) {
      if (powerup.usesPerGame === 1 && usage[powerupId]) {
        showMessage(`${powerup.name} already used this game`)
        return false
      }
      if (typeof powerup.usesPerGame === 'number' && powerup.usesPerGame > 1) {
        if ((usage[powerupId] ?? 0) >= powerup.usesPerGame) {
          showMessage(`${powerup.name} usage limit reached`)
          return false
        }
      }
    }

    // Pour chaque power-up : on appelle la callable, on attend la réponse,
    // puis on applique la modification locale à partir des données renvoyées
    // par le serveur (nouvelle lettre tirée, lettre volée, etc.).
    // La main serveur sera aussi mise à jour via onSnapshot, mais on met à
    // jour l'état local tout de suite pour la réactivité visuelle.
    const draftLetters = currentDraftLetters()

    switch (powerupId) {

      // ── Poubelle : vider le rack (gratuit) ────────────────────────────────
      case 'trash': {
        setRack(Array(handSize).fill(null))
        setDraft({})
        setSelected(null)
        const r = await callGameAction(gameId, 'trash', { draftLetters })
        if (!r?.success) { showMessage(r?.error ?? 'Trash failed'); return false }
        break
      }

      // ── Recyclage : échanger la tuile sélectionnée contre une aléatoire ──
      case 'recycle': {
        if (!selected || selected.source !== 'rack' || !rack[selected.index]) {
          showMessage('Select a rack tile first')
          return false
        }
        const idx        = selected.index
        const oldLetter  = rack[idx].letter
        const r = await callGameAction(gameId, 'recycle', {
          draftLetters, letter: oldLetter,
        })
        if (!r?.success) { showMessage(r?.error ?? 'Recycle failed'); return false }
        setRack(prev => {
          const next = [...prev]
          next[idx]  = newTile(r.newLetter)
          return next
        })
        setSelected(null)
        showMessage(`Recycled → ${r.newLetter}`, 'success')
        break
      }

      // ── Voyelle / Consonne : piocher une lettre ciblée ───────────────────
      case 'vowel':
      case 'consonant': {
        const slot = rack.findIndex(s => s === null)
        if (slot === -1) { showMessage('Rack is full'); return false }
        const r = await callGameAction(gameId, powerupId, { draftLetters })
        if (!r?.success) { showMessage(r?.error ?? 'Action failed'); return false }
        setRack(prev => {
          const next = [...prev]
          const s    = next.findIndex(x => x === null)
          if (s !== -1) next[s] = newTile(r.newLetter)
          return next
        })
        showMessage(`Drew ${powerupId}: ${r.newLetter}`, 'success')
        break
      }

      // ── Boost : ajouter 3 lettres aléatoires ─────────────────────────────
      case 'boost': {
        const emptySlots = rack.reduce((acc, s, i) => (s === null ? [...acc, i] : acc), [])
        if (emptySlots.length < 3) { showMessage('Need 3 free slots for Boost'); return false }
        const r = await callGameAction(gameId, 'boost', { draftLetters })
        if (!r?.success) { showMessage(r?.error ?? 'Boost failed'); return false }
        setRack(prev => {
          const next    = [...prev]
          const empties = []
          for (let i = 0; i < next.length && empties.length < 3; i++) {
            if (next[i] === null) empties.push(i)
          }
          r.newLetters.forEach((l, i) => { next[empties[i]] = newTile(l) })
          return next
        })
        showMessage(`Boost: +${r.newLetters.join(', ')}`, 'success')
        break
      }

      // ── Tornade : remplacer toutes les lettres par de nouvelles ─────────
      case 'twister': {
        const count = rack.filter(Boolean).length
        if (count === 0) { showMessage('No letters to replace'); return false }
        const r = await callGameAction(gameId, 'twister', { draftLetters })
        if (!r?.success) { showMessage(r?.error ?? 'Twister failed'); return false }
        setRack(prev => {
          const next = [...prev]
          let li = 0
          for (let i = 0; i < next.length; i++) {
            if (next[i] !== null && li < r.newLetters.length) {
              next[i] = newTile(r.newLetters[li++])
            }
          }
          return next
        })
        setDraft({})
        setSelected(null)
        showMessage('Twister! All letters replaced.', 'success')
        break
      }

      // ── Joker : ajouter la lettre choisie ────────────────────────────────
      case 'joker': {
        if (!letter) { showMessage('Pick a letter'); return false }
        const slot = rack.findIndex(s => s === null)
        if (slot === -1) { showMessage('Rack is full'); return false }
        const r = await callGameAction(gameId, 'joker', {
          draftLetters, letter: letter.toUpperCase(),
        })
        if (!r?.success) { showMessage(r?.error ?? 'Joker failed'); return false }
        setRack(prev => {
          const next = [...prev]
          const s    = next.findIndex(x => x === null)
          if (s !== -1) next[s] = newTile(r.newLetter)
          return next
        })
        showMessage(`Joker: +${r.newLetter}`, 'success')
        break
      }

      // ── Jumelles : voir la main d'un adversaire ──────────────────────────
      case 'binoculars': {
        if (!targetId) { showMessage('Select a target'); return false }
        const r = await callGameAction(gameId, 'binoculars', { draftLetters, targetId })
        if (r?.blocked) {
          showMessage('Shield blocked Binoculars!', 'warning')
          return false
        }
        if (!r?.success) { showMessage(r?.error ?? 'Binoculars failed', 'warning'); return false }
        setBinocularsView({ displayName: r.targetName, hand: r.targetHand })
        showMessage(`Viewing ${r.targetName}'s rack`, 'success')
        break
      }

      // ── Vol : prendre une lettre aléatoire ───────────────────────────────
      case 'steal': {
        if (!targetId) { showMessage('Select a target'); return false }
        const r = await callGameAction(gameId, 'steal', { draftLetters, targetId })
        if (r?.blocked) {
          showMessage('Steal blocked by Shield!', 'warning')
          return false
        }
        if (!r?.success) { showMessage(r?.error ?? 'Steal failed', 'warning'); return false }
        setRack(prev => {
          const next = [...prev]
          const slot = next.findIndex(s => s === null)
          if (slot !== -1) next[slot] = newTile(r.stolen)
          return next
        })
        showMessage(`Stole: ${r.stolen}`, 'success')
        break
      }

      // ── Bouclier : activer la protection ─────────────────────────────────
      case 'shield': {
        if (playerData?.shieldActive) {
          showMessage('Shield is already active')
          return false
        }
        const r = await callGameAction(gameId, 'shield', { draftLetters })
        if (!r?.success) { showMessage(r?.error ?? 'Shield failed'); return false }
        showMessage('Shield activated!', 'success')
        break
      }

      // ── Révolution : échanger sa main avec un adversaire ─────────────────
      case 'switcheroo': {
        if (!targetId) { showMessage('Select a target'); return false }
        // Check local UX: le serveur revalide aussi
        const target = players.find(p => p.userId === targetId)
        if (target && target.handSize !== playerData?.handSize) {
          showMessage("Can't swap with a player with a different rack size", 'warning')
          return false
        }
        const r = await callGameAction(gameId, 'switcheroo', { draftLetters, targetId })
        if (r?.blocked) {
          showMessage('Switcheroo blocked by Shield!', 'warning')
          return false
        }
        if (!r?.success) { showMessage(r?.error ?? 'Switcheroo failed', 'warning'); return false }
        // Reconstruire le rack local avec la main reçue
        setRack(handToRack(r.newHand, handSize))
        setDraft({})
        setSelected(null)
        showMessage('Switcheroo! Hands swapped!', 'success')
        break
      }

      default:
        showMessage(`Unknown power-up: ${powerupId}`)
        return false
    }

    return true
    } // fin runPowerup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apStored, lastApUpdate, rack, selected, playerData, players, gameDoc, gameId, userId, handSize, draft])

  // ── Aperçu du mot en cours ────────────────────────────────────────────────
  // Utilise pendingDraft pendant la validation pour que la MovePreview continue
  // d'afficher le mot et le score en attente de la réponse serveur.
  function getDraftWordData() {
    const source = pendingDraft ?? draft
    const placedLetters = Object.entries(source).map(([key, tile]) => {
      const [row, col] = key.split('_').map(Number)
      return { row, col, letter: tile.letter }
    })
    if (placedLetters.length === 0) return null
    const { valid, error, wordData, touchesBorder } = validatePlacement(placedLetters, board)
    if (!valid || !wordData) return { error, word: null }
    const estimatedPoints = calculateWordScore(wordData.existingCount, wordData.newCount)
      + (wordData.crossWords ?? []).reduce(
          (sum, cross) => sum + calculateWordScore(cross.existingCount, cross.newCount),
          0
        )
    return {
      ...wordData,
      touchesBorder: !!touchesBorder,
      estimatedPoints,  // points bruts du mot, la pénalité -10 est prélevée sur la cagnotte séparément
      error: null,
    }
  }

  const tilesInRack = rack.filter(Boolean).length

  // Données power-ups dérivées de playerData
  const powerupUsage = playerData?.powerupUsage ?? {}
  const shieldActive = playerData?.shieldActive ?? false

  return {
    // Depuis Firestore
    board, score, targetScore, players, lastWords, finished,
    gameDoc, gameError,

    // State local
    rack, draft, selected, message, currentAP,

    // Constantes
    drawCost, handSize,

    // Actions de jeu
    drawLetter, trashHand,
    handleRackClick, handleCellClick, handleCellDoubleClick,
    cancelDraft, validateWord, getDraftWordData,

    // Power-ups
    usePowerup,
    powerupUsage,
    shieldActive,
    binocularsView,
    clearBinocularsView: () => setBinocularsView(null),

    canDraw: tilesInRack + Object.keys(draft).length < handSize && currentAP >= drawCost,
    hasDraft: Object.keys(draft).length > 0,

    // ── Feedback : actions en cours côté serveur ──
    pendingAction,
    pendingTargetSlot,
    pendingTargetUserId,
    pendingDraft,
    isPending: pendingAction !== null,
  }
}
