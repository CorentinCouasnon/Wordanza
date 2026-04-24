// Page de profil du joueur, statistiques, compétences, power-ups débloqués.

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthContext } from '../contexts/AuthContext'
import { SKILLS } from '../constants/SKILLS'
import { POWERUPS } from '../constants/POWERUPS'
import { getTargetScore, getTotalSkillPoints } from '../utils/handicap'
import { updateLanguage, updateDisplayName } from '../services/userService'
import { avatarUrl, resolveAvatarIndex } from '../constants/AVATARS'
import AvatarPickerModal from '../components/common/AvatarPickerModal'

export default function ProfilePage() {
  const { profile, user, isAnonymous, signInWithGoogle } = useAuthContext()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [langSaving, setLangSaving]     = useState(false)
  const [renameOpen, setRenameOpen]     = useState(false)
  const [avatarOpen, setAvatarOpen]     = useState(false)

  const avatarIndex = resolveAvatarIndex(profile, user?.uid)

  const totalSkillPoints = profile ? getTotalSkillPoints(profile.skills) : 0
  const handicap = getTargetScore(totalSkillPoints)

  async function handleLanguageChange(lang) {
    if (!user || langSaving || profile?.language === lang) return
    setLangSaving(true)
    try {
      await updateLanguage(user.uid, lang)
      // Profil mis à jour automatiquement via onSnapshot.
    } finally {
      setLangSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-emerald-400">{t('profile.title')}</h1>
        <button
          onClick={() => navigate('/lobby')}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
        >
          {t('common.back')}
        </button>
      </div>

      {/* Infos joueur */}
      <div className="p-5 bg-slate-800 rounded-xl mb-6">
        <div className="flex items-center gap-4">
          {/* Avatar cliquable : ouvre la modale de sélection */}
          <button
            onClick={() => setAvatarOpen(true)}
            title={t('profile.changeAvatar')}
            className="relative w-14 h-14 rounded-full overflow-hidden bg-emerald-700 ring-2 ring-transparent hover:ring-emerald-500 transition-all group flex-shrink-0"
          >
            <img
              src={avatarUrl(avatarIndex)}
              alt="avatar"
              className="w-full h-full object-cover"
            />
            {/* Icône crayon au survol */}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
              </svg>
            </span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-slate-100">{profile?.displayName ?? 'Loading...'}</p>
              {/* Crayon désactivé si le changement a déjà été utilisé */}
              <button
                onClick={() => !profile?.displayNameChanged && setRenameOpen(true)}
                title={profile?.displayNameChanged ? t('profile.nameAlreadyChanged') : t('profile.editName')}
                className={`transition-colors ${profile?.displayNameChanged ? 'text-slate-600 cursor-not-allowed' : 'text-slate-500 hover:text-slate-300 cursor-pointer'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                </svg>
              </button>
            </div>
            <p className="text-slate-500 text-sm">
              {isAnonymous ? t('profile.guestAccount') : t('profile.googleAccount')}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-slate-100">🦪 {profile?.pearls ?? 0}</p>
            <p className="text-slate-500 text-sm">{t('profile.pearls')}</p>
          </div>
        </div>
        {isAnonymous && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <button
              onClick={signInWithGoogle}
              className="text-sm text-emerald-400 hover:text-emerald-300 underline"
            >
              {t('profile.linkGoogle')}
            </button>
          </div>
        )}
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 bg-slate-800 rounded-xl text-center">
          <p className="text-2xl font-bold text-slate-100">{profile?.stats?.gamesPlayed ?? 0}</p>
          <p className="text-slate-500 text-sm">{t('profile.gamesPlayed')}</p>
        </div>
        <div className="p-4 bg-slate-800 rounded-xl text-center">
          <p className="text-2xl font-bold text-slate-100">{profile?.stats?.gamesWon ?? 0}</p>
          <p className="text-slate-500 text-sm">{t('profile.wins')}</p>
        </div>
        <div className="p-4 bg-slate-800 rounded-xl text-center">
          <p className="text-2xl font-bold text-slate-100">{handicap}</p>
          <p className="text-slate-500 text-sm">{t('profile.targetScore')}</p>
        </div>
        <div className="p-4 bg-slate-800 rounded-xl text-center">
          <p className="text-2xl font-bold text-emerald-400">🔥 {profile?.dailyStreak ?? 0}</p>
          <p className="text-slate-500 text-sm">{t('profile.dailyStreak')}</p>
        </div>
      </div>

      {/* Podium */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{t('publicProfile.podium')}</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 bg-slate-800 rounded-xl text-center">
            <p className="text-2xl mb-1">🥇</p>
            <p className="text-2xl font-bold text-slate-100 tabular-nums">{profile?.stats?.podiumFirst ?? 0}</p>
            <p className="text-slate-500 text-xs mt-1">{t('publicProfile.firstPlace')}</p>
          </div>
          <div className="p-4 bg-slate-800 rounded-xl text-center">
            <p className="text-2xl mb-1">🥈</p>
            <p className="text-2xl font-bold text-slate-100 tabular-nums">{profile?.stats?.podiumSecond ?? 0}</p>
            <p className="text-slate-500 text-xs mt-1">{t('publicProfile.secondPlace')}</p>
          </div>
          <div className="p-4 bg-slate-800 rounded-xl text-center">
            <p className="text-2xl mb-1">🥉</p>
            <p className="text-2xl font-bold text-slate-100 tabular-nums">{profile?.stats?.podiumThird ?? 0}</p>
            <p className="text-slate-500 text-xs mt-1">{t('publicProfile.thirdPlace')}</p>
          </div>
        </div>
      </div>

      {/* Langue préférée */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{t('profile.gameLanguage')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { code: 'en', label: 'English',  flag: '🇬🇧' },
            { code: 'fr', label: 'Français', flag: '🇫🇷' },
            { code: 'es', label: 'Español',  flag: '🇪🇸' },
            { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
          ].map(({ code, label, flag }) => {
            const active = (profile?.language ?? 'en') === code
            return (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                disabled={langSaving}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors flex-1 text-left disabled:opacity-50
                  ${active
                    ? 'bg-emerald-100 border-emerald-600 text-emerald-900'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
              >
                <span className="text-xl">{flag}</span>
                <span className="text-sm font-medium">{label}</span>
                {active && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
        <p className="text-slate-500 text-xs mt-2">
          {t('profile.languageHint')}
        </p>
      </div>

      {/* Compétences */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{t('profile.skills')}</h2>
        <div className="flex flex-col gap-2">
          {Object.values(SKILLS).map(skill => {
            const level = profile?.skills?.[skill.id] ?? 0
            return (
              <div key={skill.id} className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
                <img src={skill.icon} alt={t(`skills.${skill.id}.name`)} className="w-8 h-8" />
                <span className="text-slate-300 flex-1">{t(`skills.${skill.id}.name`)}</span>
                {/* Barre de progression */}
                <div className="flex gap-0.5">
                  {Array.from({ length: skill.maxLevel }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-sm ${i < level ? 'bg-emerald-500' : 'bg-slate-600'}`}
                    />
                  ))}
                </div>
                <span className="text-slate-500 text-sm w-12 text-right">
                  {level}/{skill.maxLevel}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modale de renommage */}
      {renameOpen && (
        <RenameModal
          currentName={profile?.displayName ?? ''}
          onSuccess={() => setRenameOpen(false)}
          onClose={() => setRenameOpen(false)}
        />
      )}

      {/* Power-ups débloqués */}
      <div>
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{t('profile.unlockedPowerups')}</h2>
        <div className="flex flex-wrap gap-2">
          {/* Trash est toujours disponible */}
          <div className="flex flex-col items-center gap-1 p-2 bg-slate-800 rounded-lg">
            <img src={POWERUPS.trash.icon} alt={t('powerups.trash.name')} className="w-8 h-8" />
            <span className="text-slate-400 text-xs">{t('powerups.trash.name')}</span>
          </div>
          {(profile?.unlockedPowerups ?? []).map(id => {
            const powerup = POWERUPS[id]
            if (!powerup) return null
            return (
              <div key={id} className="flex flex-col items-center gap-1 p-2 bg-slate-800 rounded-lg">
                <img src={powerup.icon} alt={t(`powerups.${id}.name`)} className="w-8 h-8" />
                <span className="text-slate-400 text-xs">{t(`powerups.${id}.name`)}</span>
              </div>
            )
          })}
          {(profile?.unlockedPowerups ?? []).length === 0 && (
            <p className="text-slate-500 text-sm">
              {t('profile.noPowerups')}{' '}
              <button onClick={() => navigate('/shop')} className="underline text-emerald-500">
                {t('profile.visitShop')}
              </button>
            </p>
          )}
        </div>
      </div>

      {avatarOpen && user && (
        <AvatarPickerModal
          userId={user.uid}
          currentIndex={avatarIndex}
          onSuccess={() => setAvatarOpen(false)}
          onClose={() => setAvatarOpen(false)}
        />
      )}

    </div>
  )
}

// ── Modale de renommage ───────────────────────────────────────────────────────

function RenameModal({ currentName, onSuccess, onClose }) {
  const [value, setValue]   = useState(currentName)
  const [error, setError]   = useState(null)
  const [saving, setSaving] = useState(false)
  const inputRef            = useRef(null)
  const { t }               = useTranslation()

  // Focus automatique à l'ouverture
  useEffect(() => { inputRef.current?.focus() }, [])

  // Fermer sur Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const saved = await updateDisplayName(value)
      onSuccess(saved)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const trimmed = value.trim()
  // Validation locale pour feedback immédiat
  const tooShort  = trimmed.length > 0 && trimmed.length < 2
  const tooLong   = trimmed.length > 16
  const badChars  = trimmed.length > 0 && !/^[a-zA-Z0-9_\- ]+$/.test(trimmed)
  const unchanged = trimmed === currentName
  const invalid   = tooShort || tooLong || badChars || trimmed.length === 0 || unchanged

  return (
    /* Overlay, on ferme uniquement si mousedown ET mouseup sont sur l'overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.closeOnUp = '1' }}
      onMouseUp={(e)   => { if (e.currentTarget.dataset.closeOnUp === '1') onClose(); delete e.currentTarget.dataset.closeOnUp }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-3">{t('profile.changeName')}</h2>

        {/* Avertissement one-shot bien visible */}
        <div className="flex gap-2 p-3 bg-amber-900/30 border border-amber-700/40 rounded-lg mb-4">
          <span className="text-amber-400 text-base leading-none mt-0.5">⚠</span>
          <p className="text-amber-300 text-sm leading-snug">
            {t('profile.changeNameWarning')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              maxLength={16}
              placeholder="Your name"
              disabled={saving}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60"
            />
            {/* Compteur de caractères */}
            <div className="flex justify-between mt-1">
              <span className="text-xs text-slate-500">
                {t('profile.nameCharHint')}
              </span>
              <span className={`text-xs ${trimmed.length > 16 ? 'text-red-400' : 'text-slate-500'}`}>
                {trimmed.length}/16
              </span>
            </div>
          </div>

          {/* Erreurs de validation locale */}
          {tooShort && <p className="text-red-400 text-sm -mt-2">{t('profile.nameTooShort')}</p>}
          {badChars && <p className="text-red-400 text-sm -mt-2">{t('profile.nameInvalidChars')}</p>}

          {/* Erreur Firestore (ex: pseudo déjà pris) */}
          {error && <p className="text-red-400 text-sm -mt-2">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={invalid || saving}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-colors inline-flex items-center justify-center gap-2"
            >
              {saving && <span className="inline-block w-3 h-3 rounded-full border border-current border-t-transparent animate-spin-slow" />}
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
