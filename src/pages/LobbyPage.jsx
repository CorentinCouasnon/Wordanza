// Page Lobby, "My Games"
//
// Affiche toutes les parties du joueur en 3 sections :
//   • In Progress , active ET le joueur n'a pas encore atteint son score
//   • Waiting     , en attente de joueurs
//   • Finished    , terminée globalement OU le joueur a atteint son score

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuthContext } from '../contexts/AuthContext'
import { createGame } from '../services/gameService'
import { getCurrentAP } from '../utils/ap'
import { toMs } from '../utils/time'
import { useMatchmaking, MAX_WAIT_MS, SCHEDULE_BUFFER_MS } from '../hooks/useMatchmaking'
import { getMaxGameSlots } from '../constants/GAME_SLOTS'
import ChangelogModal from '../components/lobby/ChangelogModal'
import Spinner from '../components/common/Spinner'

export default function LobbyPage() {
  const { user, profile, isAnonymous, signInWithGoogle, signOut } = useAuthContext()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [games, setGames]               = useState([])
  const [loadingGames, setLoadingGames] = useState(true)
  const [creating, setCreating]         = useState(false)
  const [createError, setCreateError]   = useState(null)

  const { status, queueSize, gameId, joinedAt, startSearch, cancelSearch } = useMatchmaking()

  // Modal changelog / roadmap, ouverte par le bouton flottant en bas à droite
  const [changelogOpen, setChangelogOpen] = useState(false)

  // Tick chaque seconde pour mettre à jour l'affichage "en file depuis X"
  const [now, setNow] = useState(Date.now())
  // Cycle 0→1→2→0 pour les points "." / ".." / "..."
  const [dotPhase, setDotPhase] = useState(0)
  useEffect(() => {
    if (status !== 'searching') return
    const id = setInterval(() => {
      setNow(Date.now())
      setDotPhase(p => (p + 1) % 3)
    }, 500)
    return () => clearInterval(id)
  }, [status])

  // Transition fade-out avant redirection quand la partie est trouvée :
  // le composant "Match found" reste visible ~250ms avec animate-fade-in,
  // puis on navigue vers la partie (la GamePage fait son propre mount frais).
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (status === 'found' && gameId) {
      setLeaving(true)
      const timer = setTimeout(() => navigate(`/game/${gameId}`), 400)
      return () => clearTimeout(timer)
    }
  }, [status, gameId, navigate])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(collection(db, 'games'), where('playerIds', 'array-contains', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadingGames(false)
    })
    return () => unsub()
  }, [user?.uid])

  async function handleCreateGame() {
    if (!user) return
    setCreating(true)
    setCreateError(null)
    try {
      const gameId = await createGame(
        user.uid,
        profile?.displayName ?? 'Player',
        profile?.skills ?? {},
        profile?.language ?? 'en',
      )
      navigate(`/game/${gameId}`)
    } catch (err) {
      setCreateError(err.message ?? 'Failed to create game')
    } finally {
      setCreating(false)
    }
  }

  // Classer chaque partie dans une section selon l'état du joueur courant.
  // Un joueur ayant atteint son score dans une partie active → section "finished" pour lui.
  const myFinished = (game) => game.players?.find(p => p.userId === user?.uid)?.finished ?? false

  const activeGames   = games.filter(g => g.status === 'active'  && !myFinished(g))
  const waitingGames  = games.filter(g => g.status === 'waiting')
  const finishedGames = games.filter(g => g.status === 'finished' || myFinished(g))

  // Trie les parties par activité récente (lastMoveAt desc, puis createdAt desc)
  function sortByRecent(list) {
    return [...list].sort((a, b) => {
      const ta = toMs(a.lastMoveAt) || toMs(a.createdAt) || 0
      const tb = toMs(b.lastMoveAt) || toMs(b.createdAt) || 0
      return tb - ta
    })
  }

  // Le joueur est limité à `maxSlots` parties simultanées (active + waiting).
  // Limite de base : 1, +1 par slot acheté en boutique (jusqu'à 20 max).
  const maxSlots          = getMaxGameSlots(profile?.extraGameSlots ?? 0)
  const ongoingCount      = activeGames.length + waitingGames.length
  const hasOngoingGame    = ongoingCount >= maxSlots

  const sections = [
    { key: 'active',   label: t('lobby.inProgress'),        dot: 'bg-emerald-400 animate-pulse', color: 'text-emerald-400', games: sortByRecent(activeGames) },
    { key: 'waiting',  label: t('lobby.waitingForPlayers'), dot: 'bg-amber-400 animate-pulse',   color: 'text-amber-400',   games: sortByRecent(waitingGames) },
    { key: 'finished', label: t('lobby.finished'),          dot: 'bg-slate-500',                 color: 'text-slate-400',   games: sortByRecent(finishedGames) },
  ].filter(s => s.games.length > 0)

  return (
    <div className={`max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8 ${leaving ? 'animate-fade-out' : ''}`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Wordanza logo" className="h-8 w-8 object-contain" />
          <h1 className="text-3xl font-bold text-emerald-400">Wordanza</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-300 font-medium">🦪 {profile?.pearls ?? 0}</span>
          <button onClick={() => navigate('/shop')}    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors">{t('shop.title')}</button>
          <button onClick={() => navigate('/profile')} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors">{t('nav.profile')}</button>
          {/* Bouton de déconnexion, visible pour tous */}
          <button
            onClick={async () => { await signOut(); navigate('/') }}
            title="Sign out"
            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-700"
          >
            {/* Icone logout : rectangle + flèche sortante */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bandeau anonyme */}
      {isAnonymous && (
        <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700/50 rounded-xl">
          <p className="text-amber-300 text-sm">
            {t('lobby.guestWarning')}{' '}
            <button onClick={signInWithGoogle} className="underline hover:text-amber-200">{t('home.signInGoogle')}</button>
            {' '}{t('lobby.guestWarningLink')}
          </p>
        </div>
      )}

      {/* Matchmaking */}
      <div className="mb-10">
        {/* Bloqué si le joueur a déjà une partie active ou en attente */}
        {hasOngoingGame && status === 'idle' && (
          <p className="text-center text-amber-400 text-sm mb-3">
            {maxSlots === 1
              ? t('lobby.activeGameWarning')
              : t('lobby.slotLimitReached', { count: maxSlots })}
          </p>
        )}

        {(status === 'idle' || status === 'joining') && (
          <button
            onClick={startSearch}
            disabled={hasOngoingGame || status === 'joining'}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2"
          >
            {status === 'joining' && <Spinner size="sm" />}
            {status === 'joining' ? t('lobby.connecting') : t('lobby.findGame')}
          </button>
        )}

        {status === 'searching' && (
          <div className="flex flex-col items-center gap-4 py-5 px-6 bg-slate-800 border border-slate-700 rounded-xl">
            {/* Indicateur de recherche */}
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-slate-200 font-semibold">{t('lobby.searching')}</span>
            </div>

            {/* Durée en file + ETA */}
            {joinedAt && (() => {
              const elapsedMs  = Math.max(0, now - joinedAt)
              const elapsedMin = Math.floor(elapsedMs / 60_000)
              const elapsedSec = Math.floor((elapsedMs % 60_000) / 1000)
              // +SCHEDULE_BUFFER_MS : worst-case de la scheduled function (10 min)
              const launchDate = new Date(joinedAt + MAX_WAIT_MS + SCHEDULE_BUFFER_MS)
              const launchStr  = launchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div className="text-center space-y-1">
                  <p className="text-slate-400 text-sm text-center">
                    {elapsedMin > 0
                      ? t('lobby.searchingFor', { min: elapsedMin, sec: String(elapsedSec).padStart(2, '0') })
                      : t('lobby.searchingForSec', { sec: elapsedSec })}
                    {'.'.repeat(dotPhase + 1)}
                  </p>
                  <p className="text-slate-500 text-xs">
                    {t('lobby.launchTime', { time: launchStr })}
                  </p>
                  <p className="text-slate-600 text-xs italic">
                    {t('lobby.botsDisclaimer')}
                  </p>
                </div>
              )
            })()}

            {/* Nombre de joueurs en file */}
            <p className="text-slate-400 text-sm">
              {t('lobby.queueSize', { count: queueSize })}
            </p>
            <button
              onClick={cancelSearch}
              className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {status === 'found' && (
          <div className="flex items-center justify-center gap-3 py-5 px-6 bg-emerald-900/30 border border-emerald-700/50 rounded-xl animate-fade-in">
            <span className="w-3 h-3 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-300 font-semibold">{t('lobby.matchFound')}</span>
          </div>
        )}

        {/* Défi quotidien, secondaire, sous la recherche de partie */}
        <button
          onClick={() => navigate('/daily')}
          className="mt-3 w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-700/40 text-slate-300 hover:text-amber-300 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <span>🎯</span>
          <span>{t('dailyChallenge.title')}</span>
        </button>
      </div>

      {/* Création manuelle de partie (lien d'invitation): masquée si déjà en jeu */}
      {!hasOngoingGame && (
        <details className="mb-10">
          <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-400 select-none">
            {t('lobby.manualCreate')}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <button
              onClick={handleCreateGame}
              disabled={creating}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 text-sm font-semibold rounded-xl transition-colors"
            >
              {creating ? t('lobby.creatingGame') : t('lobby.startNewGame')}
            </button>
            {createError && <p className="text-red-400 text-sm text-center">{createError}</p>}
            <p className="text-center text-slate-600 text-xs">
              {t('lobby.createGameHint')}
            </p>
          </div>
        </details>
      )}

      {/* Sections */}
      {loadingGames && <p className="text-slate-500 text-sm text-center py-4">{t('common.loading')}</p>}

      {!loadingGames && games.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p>{t('lobby.noGames')}</p>
          <p className="text-sm mt-1">{t('lobby.noGamesHint')}</p>
        </div>
      )}

      {!loadingGames && games.length > 0 && (
        <h2 className="text-xl font-semibold text-slate-300 mb-6">{t('lobby.myGames')}</h2>
      )}

      {!loadingGames && sections.map(section => (
        <div key={section.key} className="mb-8">
          {/* Titre de section */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${section.dot}`} />
            <h2 className={`text-base font-semibold ${section.color}`}>{section.label}</h2>
            <span className="text-slate-600 text-sm">· {section.games.length}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.games.map(game => (
              <GameCard
                key={game.id}
                game={game}
                sectionKey={section.key}
                currentUserId={user?.uid}
                onResume={() => navigate(`/game/${game.id}`)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Bouton flottant, ouvre la modal roadmap/changelog */}
      <button
        onClick={() => setChangelogOpen(true)}
        title="Roadmap"
        className="fixed bottom-5 right-5 z-40 w-12 h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-600/50 text-slate-300 hover:text-emerald-400 rounded-full shadow-lg flex items-center justify-center transition-colors"
      >
        {/* Icone : liste / feuille de route */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </button>

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  )
}

// ── Carte d'une partie ────────────────────────────────────────────────────────

function GameCard({ game, sectionKey, currentUserId, onResume }) {
  const [linkCopied, setLinkCopied] = useState(false)
  const { t } = useTranslation()

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/game/${game.id}`)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch { /* Clipboard non dispo */ }
  }

  const me    = game.players?.find(p => p.userId === currentUserId)
  const myAP  = me ? getCurrentAP(me.apStored, me.lastApUpdate) : null

  // Joueurs triés : finis par rang, puis les autres par % de progression
  const playersSorted = [...(game.players ?? [])].sort((a, b) => {
    if (a.finished && b.finished) return a.rank - b.rank
    if (a.finished) return -1
    if (b.finished) return 1
    return (b.score / b.targetScore) - (a.score / a.targetScore)
  })

  const medals = ['🥇', '🥈', '🥉']

  // Une partie peut se terminer normalement ou par inactivité (24h sans coup)
  const inactivity = !!game.endedByInactivity

  const borderColor = {
    active:   'border-emerald-700/30',
    waiting:  'border-amber-700/30',
    finished: inactivity ? 'border-slate-600/50' : 'border-slate-700',
  }[sectionKey] ?? 'border-slate-700'

  return (
    <div className={`bg-slate-800 border ${borderColor} rounded-2xl overflow-hidden`}>

      {/* En-tête : nb joueurs + langue + action */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">{game.players?.length ?? 0} / 5 players</span>
          {game.language && (
            <span className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 text-xs uppercase tracking-wide">
              {game.language}
            </span>
          )}
          {/* Badge affiché quand la partie s'est terminée automatiquement faute d'activité */}
          {inactivity && (
            <span className="px-1.5 py-0.5 bg-slate-700/80 border border-slate-600 rounded text-slate-500 text-xs">
              {t('lobby.inactivityEnded')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sectionKey === 'waiting' && (
            <button
              onClick={handleCopyLink}
              className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                linkCopied ? 'bg-emerald-700 text-emerald-200' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {linkCopied ? t('common.copied') : t('lobby.copyLink')}
            </button>
          )}
          {sectionKey === 'active' && (
            <button onClick={onResume} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors">
              {t('lobby.resume')}
            </button>
          )}
          {sectionKey === 'waiting' && (
            <button onClick={onResume} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors">
              {t('lobby.view')}
            </button>
          )}
          {sectionKey === 'finished' && (
            <button onClick={onResume} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold rounded-lg transition-colors">
              {t('lobby.viewResults')}
            </button>
          )}
        </div>
      </div>

      {/* Corps : mini plateau + classement */}
      <div className="flex gap-3 p-3">
        <MiniBoardPreview board={game.board ?? {}} />

        {/* Classement */}
        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
          {playersSorted.map((player, i) => {
            const isMe      = player.userId === currentUserId
            const forfeited = !!player.forfeited
            // Joueur non-fini dans une partie terminée (inactivité ou autre) : n'est plus "en cours"
            const abandoned = !player.finished && game.status === 'finished'
            const pct       = Math.round(Math.min(1, player.score / player.targetScore) * 100)
            const medal     = player.finished
              ? (forfeited ? '🏳️' : (medals[player.rank - 1] ?? `#${player.rank}`))
              : null
            // Pour les abandonnés, on affiche ", " plutôt que leur position provisoire
            const rankLabel = medal ?? (abandoned ? ', ' : `#${i + 1}`)

            return (
              <div key={player.userId} className={`flex items-center gap-1.5 ${forfeited || abandoned ? 'opacity-50' : ''}`}>
                {/* Rang */}
                <span className={`text-xs w-5 text-center flex-shrink-0 leading-none ${
                  forfeited ? 'text-red-400/70' : player.finished ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  {rankLabel}
                </span>

                {/* Nom */}
                <span className={`text-xs truncate w-24 flex-shrink-0 ${
                  forfeited ? 'text-slate-600 line-through'
                  : abandoned ? 'text-slate-600'
                  : isMe ? 'text-emerald-300 font-semibold'
                  : player.finished ? 'text-slate-300'
                  : 'text-slate-500'
                }`}>
                  {player.displayName}
                </span>

                {/* Barre */}
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-0">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      forfeited ? 'bg-red-900/50'
                      : abandoned ? 'bg-slate-600/50'
                      : player.finished ? 'bg-emerald-500'
                      : isMe ? 'bg-blue-400'
                      : 'bg-slate-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Score */}
                <span className={`text-xs tabular-nums w-8 text-right flex-shrink-0 ${
                  forfeited || abandoned ? 'text-slate-600' : player.finished ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  {player.score}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rack + AP: uniquement si en cours et pas encore fini */}
      {me && !me.finished && sectionKey === 'active' && (
        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="flex gap-1 flex-wrap">
            {me.hand?.length > 0
              ? me.hand.map((letter, i) => (
                  <span key={i} className="w-6 h-6 bg-slate-700 border border-slate-600 rounded text-xs font-bold text-slate-200 flex items-center justify-center">
                    {letter}
                  </span>
                ))
              : <span className="text-slate-600 text-xs italic">{t('lobby.emptyRack')}</span>
            }
          </div>
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <span className="text-amber-400 text-xs font-semibold tabular-nums">{myAP}</span>
            <span className="text-slate-600 text-xs">{t('playerList.apLabel')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Mini plateau ──────────────────────────────────────────────────────────────

function MiniBoardPreview({ board }) {
  const CELL = 6
  const SIZE = 19

  return (
    <div
      className="flex-shrink-0 rounded-lg overflow-hidden bg-slate-900"
      style={{ width: CELL * SIZE, height: CELL * SIZE }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, ${CELL}px)` }}>
        {Array.from({ length: SIZE * SIZE }).map((_, idx) => {
          const row      = Math.floor(idx / SIZE)
          const col      = idx % SIZE
          const tile     = board[`${row}_${col}`]
          const isBorder = row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1
          const isCenter = row === 9 && col === 9

          let bg
          if (tile)          bg = '#60a5fa'
          else if (isBorder) bg = '#78523a'
          else if (isCenter) bg = '#34d399'
          else               bg = 'transparent'

          return <div key={idx} style={{ width: CELL, height: CELL, backgroundColor: bg }} />
        })}
      </div>
    </div>
  )
}
