// Barre de power-ups affichée en partie.
//
// Affiche la Poubelle (toujours disponible) + les power-ups débloqués par le joueur.
// Gère en interne les modals de sélection de cible (Jumelles, Vol, Révolution)
// et de choix de lettre (Joker).

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { POWERUPS, POWERUP_ORDER, TARGETED_POWERUPS } from '../../constants/POWERUPS'
import Spinner from '../common/Spinner'
import { useToast } from '../../contexts/ToastContext'

/**
 * Retourne true si le power-up est utilisable dans l'état actuel.
 *
 * @param {string} powerupId
 * @param {object} powerupUsage - { [id]: boolean | number }
 * @param {number} currentAP
 */
function isPowerupUsable(powerupId, powerupUsage, currentAP) {
  const powerup = POWERUPS[powerupId]
  if (!powerup) return false
  if (currentAP < powerup.apCost) return false
  if (powerup.usesPerGame === Infinity) return true
  if (powerup.usesPerGame === 1) return !powerupUsage?.[powerupId]
  // Compteur (ex: steal max 3)
  return (powerupUsage?.[powerupId] ?? 0) < powerup.usesPerGame
}

/**
 * Retourne le label d'utilisation à afficher sur le badge (ex: "1/3"), ou null.
 */
function getUsageLabel(powerupId, powerupUsage) {
  const powerup = POWERUPS[powerupId]
  if (!powerup || powerup.usesPerGame === Infinity) return null
  if (powerup.usesPerGame === 1) return powerupUsage?.[powerupId] ? '✓' : null
  const used = powerupUsage?.[powerupId] ?? 0
  return `${used}/${powerup.usesPerGame}`
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function PowerupBar({
  unlockedPowerups = [],    // string[]: IDs des power-ups achetés (depuis le profil)
  powerupUsage = {},        // depuis game state
  currentAP = 0,
  shieldActive = false,     // le bouclier du joueur courant est-il actif ?
  players = [],             // tous les joueurs (pour cibler)
  currentUserId = '',
  onUsePowerup,             // async (id, { targetId?, letter? }) => boolean
  binocularsView = null,    // { displayName, hand } | null, résultat Jumelles
  onClearBinoculars,        // () => void
  // Feedback : power-up en cours côté serveur (ring animé sur l'icône)
  pendingPowerupId = null,
  language = 'en',          // langue de la partie, détermine les lettres du Joker
}) {
  // ID du power-up ciblé en attente de sélection de cible
  const [targetPicker, setTargetPicker] = useState(null)
  const [jokerOpen, setJokerOpen]       = useState(false)
  const [pending, setPending]           = useState(false)
  const { t }   = useTranslation()
  const toast   = useToast()

  // Power-ups à afficher : poubelle toujours présente + ceux débloqués
  const toShow = POWERUP_ORDER.filter(id =>
    id === 'trash' || unlockedPowerups.includes(id)
  )

  // Adversaires disponibles comme cibles (non-finis, pas soi-même)
  const opponents = players.filter(p => p.userId !== currentUserId && !p.finished)

  // Wrapper commun : lance un toast "Action en cours…" seulement si l'appel
  // dépasse 500ms, évite le flash sur les appels rapides.
  async function runWithSlowToast(fn) {
    setPending(true)
    const slowTimer = setTimeout(() => { toast.info(t('common.actionInProgress')) }, 500)
    try {
      return await fn()
    } finally {
      clearTimeout(slowTimer)
      setPending(false)
    }
  }

  async function handleClick(powerupId) {
    if (pending) return
    if (!isPowerupUsable(powerupId, powerupUsage, currentAP)) return

    // Les power-ups ciblés ouvrent d'abord le sélecteur de cible
    if (TARGETED_POWERUPS.includes(powerupId)) {
      setTargetPicker(powerupId)
      return
    }

    if (powerupId === 'joker') {
      setJokerOpen(true)
      return
    }

    // Power-up sans paramètre → exécution directe
    await runWithSlowToast(() => onUsePowerup(powerupId, {}))
  }

  async function handleTargetSelect(targetId) {
    const id = targetPicker
    setTargetPicker(null)
    await runWithSlowToast(() => onUsePowerup(id, { targetId }))
  }

  async function handleJokerSelect(letter) {
    setJokerOpen(false)
    await runWithSlowToast(() => onUsePowerup('joker', { letter }))
  }

  return (
    <div>
      {/* Rangée de boutons ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto py-2 px-3">
        {toShow.map(powerupId => {
          const powerup  = POWERUPS[powerupId]
          const usable   = isPowerupUsable(powerupId, powerupUsage, currentAP)
          const usageTag = getUsageLabel(powerupId, powerupUsage)
          const isShieldOn = powerupId === 'shield' && shieldActive
          const isActive   = pendingPowerupId === powerupId

          return (
            <button
              key={powerupId}
              onClick={() => handleClick(powerupId)}
              disabled={!usable || pending}
              title={`${t(`powerups.${powerupId}.name`)}${powerup.apCost > 0 ? ` (${powerup.apCost} AP)` : ''}\n${t(`powerups.${powerupId}.description`)}`}
              className={`relative flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all
                ${usable && !pending
                  ? 'bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 shadow-md'
                  : 'bg-slate-800/50 cursor-not-allowed opacity-40'
                }
                ${isShieldOn ? 'ring-2 ring-blue-400 bg-blue-900/30' : ''}
                ${isActive ? 'ring-2 ring-emerald-400 animate-pulse' : ''}
              `}
            >
              <img src={powerup.icon} alt={powerup.name} className={`w-8 h-8 object-contain ${isActive ? 'opacity-40' : ''}`} />
              {/* Spinner superposé, action en cours */}
              {isActive && (
                <span className="absolute inset-0 flex items-center justify-center text-emerald-300">
                  <Spinner size="sm" />
                </span>
              )}

              {/* Badge coût AP */}
              {powerup.apCost > 0 && (
                <span className="absolute -bottom-1 -right-1 text-[10px] bg-slate-900 text-slate-400 rounded px-0.5 leading-tight border border-slate-700">
                  {powerup.apCost}
                </span>
              )}

              {/* Badge utilisation */}
              {usageTag && (
                <span className="absolute -top-1 -right-1 text-[10px] bg-amber-700 text-amber-100 rounded-full px-1 leading-tight">
                  {usageTag}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Modal : sélecteur de cible ──────────────────────────────────────────*/}
      {targetPicker && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setTargetPicker(null)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-slate-200 font-semibold">
                {t(`powerups.${targetPicker}.name`)}: {t('powerups.chooseTarget')}
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">{t(`powerups.${targetPicker}.description`)}</p>
            </div>

            <div className="px-4 pb-3 flex flex-col gap-2">
              {opponents.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-3">{t('powerups.noTargets')}</p>
              ) : opponents.map(p => (
                <button
                  key={p.userId}
                  onClick={() => handleTargetSelect(p.userId)}
                  className={`w-full flex items-center gap-3 p-3 bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors text-left
                    ${p.shieldActive ? 'border border-blue-500/50' : ''}
                  `}
                >
                  <span className="text-slate-200 text-sm flex-1 truncate">{p.displayName}</span>
                  {p.shieldActive && (
                    <span className="text-blue-400 text-xs flex-shrink-0">{t('powerups.shielded')}</span>
                  )}
                  <span className="text-slate-500 text-xs flex-shrink-0">
                    {t('powerups.tiles', { count: p.hand?.length ?? 0 })}
                  </span>
                </button>
              ))}
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={() => setTargetPicker(null)}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 text-sm rounded-xl transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : Joker, sélecteur de lettre ────────────────────────────────*/}
      {jokerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setJokerOpen(false)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3">
              <h3 className="text-slate-200 font-semibold">{t('powerups.jokerTitle')}</h3>
              <p className="text-slate-400 text-xs mt-0.5">{t('powerups.jokerDesc')}</p>
            </div>

            <div className="px-4 pb-3 grid grid-cols-7 gap-1.5">
              {/* En allemand, on ajoute ß à la fin du sélecteur. */}
              {('ABCDEFGHIJKLMNOPQRSTUVWXYZ' + (language === 'de' ? 'ß' : '')).split('').map(l => (
                <button
                  key={l}
                  onClick={() => handleJokerSelect(l)}
                  className="h-9 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 text-amber-900 font-bold text-sm rounded-lg transition-colors"
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={() => setJokerOpen(false)}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 text-sm rounded-xl transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : Jumelles, affiche la main d'un adversaire ─────────────────*/}
      {binocularsView && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClearBinoculars}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-slate-200 font-semibold">{t('powerups.opponentRack', { name: binocularsView.displayName })}</h3>
            </div>

            <div className="px-4 pb-3 flex gap-2 flex-wrap justify-center min-h-12">
              {binocularsView.hand.length === 0 ? (
                <p className="text-slate-500 text-sm self-center">Empty rack</p>
              ) : binocularsView.hand.map((letter, i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center font-bold text-amber-900 shadow-sm"
                >
                  {letter}
                </div>
              ))}
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={onClearBinoculars}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-400 text-sm rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
