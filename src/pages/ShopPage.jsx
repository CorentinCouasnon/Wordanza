// Page Shop, achat de compétences et power-ups avec les Pearls.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthContext } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { SKILLS, getSkillLevelCost } from '../constants/SKILLS'
import { POWERUPS, POWERUP_ORDER } from '../constants/POWERUPS'
import { GAME_SLOT_COST, MAX_EXTRA_GAME_SLOTS, BASE_GAME_SLOTS, getMaxGameSlots } from '../constants/GAME_SLOTS'
import { buyItemCallable, devAddPearls } from '../services/userService'
import Spinner from '../components/common/Spinner'
import DevButton, { DevDivider } from '../components/common/DevButton'

export default function ShopPage() {
  const { user, profile } = useAuthContext()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const toast = useToast()

  // ID (skill ou powerup) en cours d'achat → spinner sur ce bouton uniquement
  const [buying, setBuying] = useState(null)
  // Message d'erreur ou de confirmation : { id, text, type }
  const [feedback, setFeedback] = useState(null)

  async function handleBuySkill(skillId) {
    if (buying) return
    setBuying(skillId)
    setFeedback(null)
    try {
      const { newLevel } = await buyItemCallable({ type: 'skill', itemId: skillId })
      // Le profil se met à jour automatiquement via l'écoute onSnapshot dans useAuth.
      const msg = t('shop.levelUnlocked', { level: newLevel })
      setFeedback({ id: skillId, text: msg, type: 'success' })
      toast.success(msg)
    } catch (err) {
      const msg = err.message ?? t('shop.purchaseFailed')
      setFeedback({ id: skillId, text: msg, type: 'error' })
      toast.error(msg)
    } finally {
      setBuying(null)
    }
  }

  async function handleBuyGameSlot() {
    if (buying) return
    setBuying('gameSlot')
    setFeedback(null)
    try {
      const { newExtraSlots } = await buyItemCallable({ type: 'gameSlot', itemId: 'gameSlot' })
      const msg = t('shop.gameSlot.purchased', { count: getMaxGameSlots(newExtraSlots) })
      setFeedback({ id: 'gameSlot', text: msg, type: 'success' })
      toast.success(msg)
    } catch (err) {
      const msg = err.message ?? t('shop.purchaseFailed')
      setFeedback({ id: 'gameSlot', text: msg, type: 'error' })
      toast.error(msg)
    } finally {
      setBuying(null)
    }
  }

  async function handleBuyPowerup(powerupId) {
    if (buying) return
    setBuying(powerupId)
    setFeedback(null)
    try {
      await buyItemCallable({ type: 'powerup', itemId: powerupId })
      const msg = t('shop.unlocked')
      setFeedback({ id: powerupId, text: msg, type: 'success' })
      toast.success(msg)
    } catch (err) {
      const msg = err.message ?? t('shop.purchaseFailed')
      setFeedback({ id: powerupId, text: msg, type: 'error' })
      toast.error(msg)
    } finally {
      setBuying(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400">{t('shop.title')}</h1>
          <p className="text-slate-400 text-sm mt-1">{t('shop.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-lg font-semibold text-slate-200 transition-opacity ${buying ? 'opacity-50 animate-pulse' : ''}`}>
            🦪 {profile?.pearls ?? 0}
          </span>
          <button
            onClick={() => navigate('/lobby')}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
          >
            {t('common.back')}
          </button>
        </div>
      </div>

      {/* Section Compétences */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-slate-300 mb-4">{t('profile.skills')}</h2>
        <div className="flex flex-col gap-3">
          {Object.values(SKILLS).map(skill => {
            const currentLevel = profile?.skills?.[skill.id] ?? 0
            const isMax        = currentLevel >= skill.maxLevel
            const nextCost     = isMax ? null : getSkillLevelCost(currentLevel + 1)
            const canAfford    = nextCost !== null && (profile?.pearls ?? 0) >= nextCost
            const isBuying     = buying === skill.id
            const msg          = feedback?.id === skill.id ? feedback : null

            return (
              <div key={skill.id} className="p-4 bg-slate-800 rounded-xl">
                <div className="flex items-center gap-4">
                  <img src={skill.icon} alt={t(`skills.${skill.id}.name`)} className="w-10 h-10" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">{t(`skills.${skill.id}.name`)}</span>
                      <span className="text-slate-500 text-sm">{t('shop.skillLevel', { current: currentLevel, max: skill.maxLevel })}</span>
                    </div>
                    <p className="text-slate-400 text-sm">{t(`skills.${skill.id}.description`)}</p>
                  </div>

                  {isMax ? (
                    <span className="text-emerald-400 text-sm font-medium flex-shrink-0">{t('shop.max')}</span>
                  ) : (
                    <button
                      onClick={() => handleBuySkill(skill.id)}
                      disabled={!canAfford || isBuying || !!buying}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0
                        ${canAfford && !buying
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                          : 'bg-emerald-900/40 text-emerald-700 cursor-not-allowed'
                        }`}
                    >
                      {isBuying ? <Spinner size="xs" /> : `🦪 ${nextCost}`}
                    </button>
                  )}
                </div>

                {/* Barre de progression */}
                <div className="mt-3 flex gap-0.5">
                  {Array.from({ length: skill.maxLevel }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 h-1.5 rounded-full ${i < currentLevel ? 'bg-emerald-500' : 'bg-slate-600'}`}
                    />
                  ))}
                </div>

                {/* Feedback d'achat */}
                {msg && (
                  <p className={`mt-2 text-xs ${msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {msg.text}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Section Power-ups */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-slate-300 mb-4">{t('shop.powerups')}</h2>
        <div className="flex flex-col gap-3">
          {POWERUP_ORDER.filter(id => id !== 'trash').map(id => {
            const powerup  = POWERUPS[id]
            const owned    = profile?.unlockedPowerups?.includes(id) ?? false
            const canAfford = (profile?.pearls ?? 0) >= powerup.shopCost
            const isBuying  = buying === id
            const msg       = feedback?.id === id ? feedback : null

            return (
              <div key={id} className="p-4 bg-slate-800 rounded-xl">
                <div className="flex items-center gap-4">
                  <img src={powerup.icon} alt={t(`powerups.${id}.name`)} className="w-10 h-10 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-200">{t(`powerups.${id}.name`)}</span>
                    <p className="text-slate-400 text-sm">{t(`powerups.${id}.description`)}</p>
                  </div>
                  {owned ? (
                    <span className="text-emerald-400 text-sm font-medium flex-shrink-0">{t('shop.owned')}</span>
                  ) : (
                    <button
                      onClick={() => handleBuyPowerup(id)}
                      disabled={!canAfford || isBuying || !!buying}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0
                        ${canAfford && !buying
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                          : 'bg-emerald-900/40 text-emerald-700 cursor-not-allowed'
                        }`}
                    >
                      {isBuying ? <Spinner size="xs" /> : `🦪 ${powerup.shopCost}`}
                    </button>
                  )}
                </div>
                {msg && (
                  <p className={`mt-2 text-xs ${msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {msg.text}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Section Slots de parties simultanées, placée en dernier (achat de confort, pas une mécanique de jeu) */}
      <section>
        <h2 className="text-xl font-semibold text-slate-300 mb-4">{t('shop.gameSlot.section')}</h2>
        {(() => {
          const extraSlots = profile?.extraGameSlots ?? 0
          const maxSlots   = getMaxGameSlots(extraSlots)
          const isMax      = extraSlots >= MAX_EXTRA_GAME_SLOTS
          const canAfford  = (profile?.pearls ?? 0) >= GAME_SLOT_COST
          const isBuying   = buying === 'gameSlot'
          const msg        = feedback?.id === 'gameSlot' ? feedback : null

          return (
            <div className="p-4 bg-slate-800 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center bg-slate-700 rounded-lg text-emerald-400 font-bold text-lg flex-shrink-0">+1</div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-200">{t('shop.gameSlot.name')}</span>
                  <p className="text-slate-400 text-sm">{t('shop.gameSlot.description')}</p>
                  <p className="text-slate-300 text-sm mt-1">
                    {t('shop.gameSlot.current', { count: maxSlots, max: BASE_GAME_SLOTS + MAX_EXTRA_GAME_SLOTS })}
                  </p>
                </div>
                {isMax ? (
                  <span className="text-emerald-400 text-sm font-medium flex-shrink-0">{t('shop.max')}</span>
                ) : (
                  <button
                    onClick={handleBuyGameSlot}
                    disabled={!canAfford || isBuying || !!buying}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0
                      ${canAfford && !buying
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                        : 'bg-emerald-900/40 text-emerald-700 cursor-not-allowed'
                      }`}
                  >
                    {isBuying ? <Spinner size="xs" /> : `🦪 ${GAME_SLOT_COST}`}
                  </button>
                )}
              </div>
              {msg && (
                <p className={`mt-2 text-xs ${msg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {msg.text}
                </p>
              )}
            </div>
          )
        })()}
      </section>

      {/* Section DEV: visible uniquement si isDev */}
      {profile?.isDev && (
        <section className="mt-10">
          <div className="mb-3">
            <DevDivider />
          </div>
          <div className="flex gap-2">
            {[50, 200, 1000].map(amount => (
              <DevButton key={amount} onClick={() => devAddPearls(user.uid, amount)}>
                +🦪{amount}
              </DevButton>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
