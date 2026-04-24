// Page de jeu, route /game/:gameId

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthContext } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useGame } from '../hooks/useGame'
import { useDictionary } from '../hooks/useDictionary'
import { startGame, devAddScore, forfeitGame, addBotToPrivateGame, removeBotFromPrivateGame } from '../services/gameService'
import { getPearlReward } from '../services/userService'
import Board from '../components/game/Board'
import PlayerHand from '../components/game/PlayerHand'
import MovePreview from '../components/game/MovePreview'
import PlayerList from '../components/game/PlayerList'
import PowerupBar from '../components/game/PowerupBar'
import GameChat from '../components/game/GameChat'
import OnboardingTooltips from '../components/OnboardingTooltips'
import { colorForUserId } from '../utils/playerColors'
import DevButton, { DevDivider } from '../components/common/DevButton'

export default function GamePage() {
  const { gameId } = useParams()
  return <MultiGame gameId={gameId} />
}

// ── Mode multijoueur ──────────────────────────────────────────────────────────

function MultiGame({ gameId }) {
  const navigate  = useNavigate()
  const { user, profile } = useAuthContext()
  const { t } = useTranslation()
  const toast = useToast()
  const skills = profile?.skills ?? { speed: 0, creativity: 0, wisdom: 0 }
  const game   = useGame({
    gameId,
    userId:       user?.uid ?? '',
    displayName:  profile?.displayName ?? 'Player',
    // profileReady évite de rejoindre la partie avec 'Player' comme pseudo
    // avant que le profil Firestore soit chargé
    profileReady: !!profile,
    skills,
  })

  // La langue vient du document de partie (pas du profil) pour que tous les joueurs
  // utilisent le même dictionnaire, quelle que soit leur préférence individuelle.
  const { isValidWord, loading: dictLoading } = useDictionary(game.gameDoc?.language)

  // Forfeit confirmation state
  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false)
  const [forfeiting, setForfeiting] = useState(false)

  // Onboarding, affiché une seule fois au premier chargement du plateau actif
  const [showOnboarding, setShowOnboarding] = useState(false)
  useEffect(() => {
    if (game.gameDoc?.status === 'active' && !localStorage.getItem('onboardingDone')) {
      setShowOnboarding(true)
    }
  }, [game.gameDoc?.status])

  // Erreur Firestore (partie introuvable, accès refusé…)
  if (game.gameError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-red-400 text-center">{game.gameError}</p>
        <button
          onClick={() => navigate('/lobby')}
          className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg"
        >
          {t('nav.backToLobby')}
        </button>
      </div>
    )
  }

  // Chargement initial (pas encore de snapshot Firestore)
  if (dictLoading || !game.gameDoc) return <LoadingScreen text={t('game.connecting')} />

  // ── Salle d'attente ───────────────────────────────────────────────────────
  // Tant que la partie n'est pas "active", on bloque l'accès au plateau.
  if (game.gameDoc.status === 'waiting') {
    return (
      <WaitingRoom
        gameId={gameId}
        players={game.players}
        onBack={() => navigate('/lobby')}
        currentUserId={user?.uid}
      />
    )
  }

  // ── Plateau de jeu (status === 'active' ou terminé pour ce joueur) ────────
  const currentPlayer = game.players.find(p => p.userId === user?.uid)
  const showEndPopup  = currentPlayer?.finished || game.gameDoc.status === 'finished'

  const draftWordData = game.getDraftWordData()
  // Valide le mot principal ET tous les mots croisés formés (même règle que validateWord)
  const wordIsValid   = draftWordData?.word
    ? isValidWord(draftWordData.word) && (draftWordData.crossWords ?? []).every(c => isValidWord(c.word))
    : false
  const playerCount   = game.players.length

  return (
    // h-[100dvh] = hauteur viewport dynamique (tient compte de la barre d'adresse mobile)
    // flex flex-col + overflow-hidden : on contrôle le scroll dans chaque zone séparément
    <div className="flex flex-col h-[100dvh] overflow-hidden">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <button onClick={() => navigate('/lobby')} className="text-slate-400 hover:text-slate-200 text-sm">
          {t('nav.myGames')}
        </button>
        <div className="flex items-center gap-1.5">
          <img src="/logo.png" alt="Wordanza logo" className="h-5 w-5 object-contain" />
          <h1 className="text-emerald-400 font-bold text-lg">Wordanza</h1>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <span className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400 uppercase tracking-wide">
            {game.gameDoc?.language ?? 'en'}
          </span>
          <span>{playerCount}p</span>
          {/* Forfeit button, only when game is active and player hasn't finished */}
          {game.gameDoc.status === 'active' && !currentPlayer?.finished && (
            <button
              onClick={() => setShowForfeitConfirm(true)}
              className="ml-1 px-2 py-0.5 bg-red-900/30 hover:bg-red-800/50 border border-red-700/30 text-red-400 rounded transition-colors"
            >
              {t('game.forfeit')}
            </button>
          )}
        </div>
      </div>

      {/* ── Corps principal, 2 colonnes sur desktop ───────────────────── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">

        {/* ── Colonne gauche : panel de contrôle + plateau ─────────────── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 p-2 gap-2">

          {/* Panel unifié : rack + powerups */}
          <div data-onboarding="rack" className="flex-shrink-0 bg-slate-800/80 rounded-xl border border-slate-700 overflow-hidden">
            <PlayerHand
              rack={game.rack}
              selected={game.selected}
              onSlotClick={game.handleRackClick}
              ap={game.currentAP}
              drawCost={game.drawCost}
              onDraw={game.drawLetter}
              onTrash={game.trashHand}
              canDraw={game.canDraw}
              pendingAction={game.pendingAction}
              pendingTargetSlot={game.pendingTargetSlot}
              containerClassName="flex flex-col items-center gap-2 px-3 pt-3 pb-2"
            />
            <div className="h-px bg-slate-700/60 mx-3" />
            <div data-onboarding="powerups">
              <PowerupBar
                unlockedPowerups={profile?.unlockedPowerups ?? []}
                powerupUsage={game.powerupUsage}
                currentAP={game.currentAP}
                shieldActive={game.shieldActive}
                players={game.players}
                currentUserId={user?.uid}
                onUsePowerup={game.usePowerup}
                binocularsView={game.binocularsView}
                onClearBinoculars={game.clearBinocularsView}
                pendingPowerupId={game.pendingAction?.startsWith('powerup:') ? game.pendingAction.slice('powerup:'.length) : null}
                language={game.gameDoc?.language ?? 'en'}
              />
            </div>
          </div>

          {/* Zone plateau, relative + overflow-hidden : clippe le board à ses bords */}
          {/* flex-1 min-h-0 → prend tout l'espace vertical restant, taille stable */}
          <div data-onboarding="board" className="flex-1 min-h-0 relative overflow-hidden">

            {/* Board : absolu dans son container → ne provoque aucun reflow */}
            <Board
              fill
              board={game.board}
              draft={game.draft}
              selected={game.selected}
              onCellClick={game.handleCellClick}
              onCellDoubleClick={game.handleCellDoubleClick}
              pendingDraft={game.pendingDraft}
              interactive={game.pendingAction !== 'validate'}
            />

            {/* Toast de message, absolu au-dessus du board, ne déplace rien */}
            {game.message && (
              <div
                key={game.message.text}
                className={`absolute top-3 left-1/2 -translate-x-1/2 z-10
                  animate-message-in text-sm px-4 py-2 rounded-lg shadow-lg
                  whitespace-nowrap pointer-events-none
                  ${game.message.type === 'error'   ? 'bg-red-900/90 text-red-200'         : ''}
                  ${game.message.type === 'warning' ? 'bg-amber-900/90 text-amber-200'     : ''}
                  ${game.message.type === 'success' ? 'bg-emerald-900/90 text-emerald-200' : ''}
                `}
              >
                {game.message.text}
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne droite : classement → historique → chat ──────────── */}
        <div className="flex flex-col gap-2 p-2 md:w-[380px] md:flex-shrink-0 md:border-l md:border-slate-800 md:overflow-y-auto">

          <div data-onboarding="playerlist">
            <PlayerList
              players={game.players}
              currentUserId={user?.uid}
              pendingTargetUserId={game.pendingTargetUserId}
            />
          </div>
          <LastWords words={game.lastWords} players={game.players} />
          <GameChat
            gameId={gameId}
            currentUserId={user?.uid}
            displayName={profile?.displayName}
          />

          {/* Boutons DEV: visibles uniquement si isDev */}
          {profile?.isDev && (
            <div className="flex flex-col gap-2">
              <DevDivider />
              <div className="flex gap-2">
                {[10, 50, 100].map(pts => (
                  <DevButton key={pts} onClick={() => devAddScore(gameId, user?.uid, pts)}>
                    +{pts} pts
                  </DevButton>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Barre de validation, taille fixe h-14, remplace ScoreDisplay ─ */}
      {/* md:mr-[380px] : s'arrête au bord du side panel pour rester centré sous le plateau */}
      <div data-onboarding="validate" className="flex-shrink-0 border-t border-slate-800 bg-slate-900/80 md:mr-[380px]">
        <MovePreview
          wordData={draftWordData}
          isValid={wordIsValid}
          error={draftWordData?.error ?? null}
          onValidate={() => game.validateWord(isValidWord)}
          onCancel={game.cancelDraft}
          disabled={!game.hasDraft}
          validating={game.pendingAction === 'validate'}
        />
      </div>

      {/* Forfeit confirmation dialog */}
      {showForfeitConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl p-6">
            <h3 className="text-lg font-bold text-slate-100 mb-2">{t('game.forfeitTitle')}</h3>
            <p className="text-slate-400 text-sm mb-6">{t('game.forfeitWarning')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForfeitConfirm(false)}
                disabled={forfeiting}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-xl transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={async () => {
                  setForfeiting(true)
                  try {
                    await forfeitGame(gameId, user?.uid)
                    setShowForfeitConfirm(false)
                  } catch (err) {
                    console.error('Forfeit failed:', err)
                    toast.error(err?.message ?? t('common.actionFailed'))
                  } finally {
                    setForfeiting(false)
                  }
                }}
                disabled={forfeiting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors inline-flex items-center justify-center gap-2"
              >
                {forfeiting && <span className="inline-block w-3 h-3 rounded-full border border-current border-t-transparent animate-spin-slow" />}
                {forfeiting ? t('game.forfeiting') : t('game.forfeitConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding, tooltip guide au premier lancement */}
      {showOnboarding && (
        <OnboardingTooltips onDone={() => {
          localStorage.setItem('onboardingDone', '1')
          setShowOnboarding(false)
        }} />
      )}

      {/* Popup de fin de partie */}
      {showEndPopup && (
        <EndScreen
          players={game.players}
          currentUserId={user?.uid}
          isPrivate={game.gameDoc?.isPrivate === true}
          onBack={() => navigate('/lobby')}
        />
      )}

    </div>
  )
}

// ── Salle d'attente ───────────────────────────────────────────────────────────

/**
 * Affiché tant que la partie n'a pas officiellement démarré (status === 'waiting').
 * Aucun joueur ne peut accéder au plateau avant que la partie soit active.
 *
 * Le créateur de la partie (premier joueur) peut la lancer manuellement
 * dès qu'il y a au moins 2 joueurs.
 */
function WaitingRoom({ gameId, players, onBack, currentUserId }) {
  const [starting, setStarting] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [botBusy, setBotBusy] = useState(false)
  const { t } = useTranslation()
  const toast = useToast()

  const isHost     = players[0]?.userId === currentUserId
  const canStart   = players.length >= 5
  const canAddBot  = players.length < 5

  async function handleForceStart() {
    if (!canStart) return
    setStarting(true)
    try {
      await startGame(gameId)
      // Le onSnapshot dans useGame va détecter le changement de statut
      // et réafficher automatiquement le plateau
    } catch (err) {
      console.error('Failed to start game:', err)
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setStarting(false)
    }
  }

  async function handleAddBot() {
    if (botBusy || !canAddBot) return
    setBotBusy(true)
    try {
      await addBotToPrivateGame(gameId)
    } catch (err) {
      console.error('Failed to add bot:', err)
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBotBusy(false)
    }
  }

  async function handleRemoveBot(botUserId) {
    if (botBusy) return
    setBotBusy(true)
    try {
      await removeBotFromPrivateGame(gameId, botUserId)
    } catch (err) {
      console.error('Failed to remove bot:', err)
      toast.error(err?.message ?? t('common.actionFailed'))
    } finally {
      setBotBusy(false)
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/game/${gameId}`)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // Clipboard API non disponible (HTTP)
    }
  }

  return (
    <div className="flex flex-col min-h-screen p-4">

      {/* Navigation */}
      <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm self-start mb-8">
        {t('nav.myGames')}
      </button>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-md mx-auto w-full">

        {/* Titre */}
        <div className="text-center">
          <div className="text-4xl mb-3">⏳</div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">{t('game.waitingTitle')}</h1>
          <p className="text-slate-400 text-sm">
            {t('game.waitingDesc')}
          </p>
          <p className="text-amber-400/70 text-xs mt-3">
            {t('game.privateNoPearls')}
          </p>
        </div>

        {/* Joueurs présents */}
        <div className="w-full bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">
            {t('game.playersCount', { count: players.length })}
          </p>
          <div className="flex flex-col gap-2">
            {players.map((p, i) => (
              <div key={p.userId} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center text-xs text-emerald-200 font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <span className="text-slate-200 text-sm">{p.displayName}</span>
                {i === 0 && <span className="text-xs text-emerald-400/70">{t('game.host')}</span>}
                {p.isBot && <span className="text-xs text-slate-500">{t('game.botLabel')}</span>}
                <span className="ml-auto text-xs text-slate-500">{t('game.targetScore', { score: p.targetScore })}</span>
                {isHost && p.isBot && (
                  <button
                    onClick={() => handleRemoveBot(p.userId)}
                    disabled={botBusy}
                    className="ml-2 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
                    title={t('game.removeBot')}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Ajout de bot, hôte uniquement, uniquement si pas encore 5 joueurs */}
          {isHost && canAddBot && (
            <button
              onClick={handleAddBot}
              disabled={botBusy}
              className="mt-3 w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              {t('game.addBot')}
            </button>
          )}
        </div>

        {/* Lien d'invitation */}
        <div className="w-full">
          <p className="text-slate-500 text-xs mb-2">{t('game.inviteLink')}</p>
          <div className="flex gap-2">
            <code className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 truncate">
              {window.location.origin}/game/{gameId}
            </code>
            <button
              onClick={handleCopyLink}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                linkCopied
                  ? 'bg-emerald-700 text-emerald-200'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
            >
              {linkCopied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
        </div>

        {/* Start button, only the room creator (first player) can start, needs 5 players (humans + bots) */}
        {isHost && (
          <div className="w-full">
            <button
              onClick={handleForceStart}
              disabled={starting || !canStart}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors"
            >
              {starting ? t('game.starting') : t('game.startGame')}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Écran de fin de partie globale ────────────────────────────────────────────

/**
 * Popup overlay affiché dès que le joueur courant atteint son score cible.
 * La distribution des Pearls est faite par la Cloud Function onGameEnd ;
 * le profil écoute users/{uid} via onSnapshot dans useAuth, donc les perles
 * apparaissent automatiquement dès que le trigger a écrit en Firestore.
 */
function EndScreen({ players, currentUserId, isPrivate, onBack }) {
  const { t } = useTranslation()

  const finished   = [...players]
    .filter(p => p.finished)
    .sort((a, b) => a.rank - b.rank)

  const stillPlaying = [...players]
    .filter(p => !p.finished)
    .sort((a, b) => (b.score / b.targetScore) - (a.score / a.targetScore))

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="text-center pt-6 pb-4 px-6">
          <div className="text-4xl mb-2">🏁</div>
          <h2 className="text-xl font-bold text-slate-100">{t('game.finished')}</h2>
        </div>

        {/* Joueurs ayant terminé */}
        <div className="px-4">
          <div className="bg-slate-900/50 rounded-xl divide-y divide-slate-700/50">
            {finished.map((player) => {
              const isMe      = player.userId === currentUserId
              const forfeited = !!player.forfeited
              const medal     = forfeited ? '🏳️' : (medals[player.rank - 1] ?? `#${player.rank}`)
              const reward    = forfeited ? 0 : getPearlReward(player.rank)

              return (
                <div
                  key={player.userId}
                  className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-emerald-900/20 rounded-xl' : ''}`}
                >
                  <span className="text-lg w-7 text-center flex-shrink-0">{medal}</span>
                  <span className={`flex-1 text-sm font-medium truncate ${forfeited ? 'text-slate-500' : isMe ? 'text-emerald-300' : 'text-slate-200'}`}>
                    {player.displayName}
                    {isMe && <span className="ml-1 text-xs text-slate-500">{t('game.you')}</span>}
                    {forfeited && <span className="ml-1 text-xs text-red-400/70">{t('game.forfeited')}</span>}
                  </span>
                  <span className="text-slate-400 text-xs tabular-nums">{player.score} pts</span>
                  {!isPrivate && (
                    <span className={`text-xs font-medium ml-2 ${reward > 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                      +🦪{reward}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Joueurs encore en jeu */}
        {stillPlaying.length > 0 && (
          <div className="px-4 mt-3">
            <p className="text-slate-600 text-xs uppercase tracking-wider mb-2 px-1">{t('game.stillPlaying')}</p>
            <div className="divide-y divide-slate-700/30">
              {stillPlaying.map((player) => {
                const pct = Math.round(Math.min(1, player.score / player.targetScore) * 100)
                return (
                  <div key={player.userId} className="flex items-center gap-3 px-1 py-2.5">
                    <span className="text-slate-600 text-xs w-7 text-center flex-shrink-0">···</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-500 text-sm truncate">{player.displayName}</span>
                        <span className="text-slate-600 text-xs tabular-nums ml-2">{pct}%</span>
                      </div>
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Bouton */}
        <div className="p-4 pt-4">
          <button
            onClick={onBack}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors"
          >
            {t('nav.backToLobby')}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Historique des mots ───────────────────────────────────────────────────────

/**
 * Formate un timestamp en durée relative : "2m ago", "1h ago", etc.
 * timestamp peut être un Firestore Timestamp ({seconds, nanoseconds}), un number (ms epoch), ou null.
 */
// Reçoit t() en paramètre pour éviter d'appeler useTranslation hors d'un composant
function formatRelativeTime(timestamp, t) {
  if (!timestamp) return ''
  // Firestore Timestamp → seconds, sinon on suppose ms epoch
  const ms = typeof timestamp === 'number'
    ? timestamp
    : (timestamp.seconds ? timestamp.seconds * 1000 : 0)
  const diff = Math.max(0, Date.now() - ms)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('game.justNow')
  if (mins < 60) return t('game.minsAgo', { mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('game.hoursAgo', { hours })
  return t('game.daysAgo', { days: Math.floor(hours / 24) })
}

function LastWords({ words = [], players = [] }) {
  const { t } = useTranslation()
  if (words.length === 0) return null
  return (
    <div className="px-3 py-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
      <p className="text-slate-500 text-xs mb-2 uppercase tracking-wide">{t('game.lastWords')}</p>
      <div className="flex flex-col gap-1">
        {words.map((w, i) => {
          // crossWords peut être string[] (ancienne donnée) ou { word }[] (nouveau format)
          const crossWordStrings = (w.crossWords ?? []).map(c => typeof c === 'string' ? c : c.word)
          // Mot le plus long en principal, les autres en discret
          const allWords = [w.word, ...crossWordStrings].filter(Boolean)
          const primaryWord = allWords.reduce((a, b) => (b.length > a.length ? b : a), w.word)
          const secondaryWords = allWords.filter(x => x !== primaryWord)
          return (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              {/* Mots, couleur du joueur auteur */}
              <span
                className="font-bold tracking-wide"
                style={{ color: colorForUserId(w.userId, players) }}
              >
                {primaryWord}
              </span>
              {secondaryWords.length > 0 && (
                <span className="text-slate-500">+{secondaryWords.join(', ')}</span>
              )}
              {/* Points */}
              <span className={w.touchesBorder ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                {w.points >= 0 ? `+${w.points}` : w.points}
              </span>
              {w.touchesBorder && (
                <span className="text-red-600 text-[10px]">{t('game.border')}</span>
              )}
              {/* Joueur */}
              {w.displayName && (
                <span className="text-slate-500 truncate flex-1">{w.displayName}</span>
              )}
              {/* Heure relative */}
              <span className="text-slate-600 flex-shrink-0 ml-auto">{formatRelativeTime(w.timestamp, t)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LoadingScreen({ text }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-slate-400">{text}</p>
    </div>
  )
}

