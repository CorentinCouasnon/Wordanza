// Profil public d'un joueur, accessible via /u/:username.
//
// Masque volontairement : langue, perles, type de compte (Google/anonyme), email.
// Affiche : pseudo, skills, parties jouées/gagnées, score cible, podium 1/2/3,
//           streak quotidien, power-ups débloqués.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SKILLS } from '../constants/SKILLS'
import { POWERUPS } from '../constants/POWERUPS'
import { getTargetScore, getTotalSkillPoints } from '../utils/handicap'
import { fetchPublicProfileByUsername } from '../services/userService'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { avatarUrl, resolveAvatarIndex } from '../constants/AVATARS'

export default function PublicProfilePage() {
  const { username } = useParams()
  const navigate     = useNavigate()
  const { t }        = useTranslation()

  const [state, setState] = useState({ status: 'loading', profile: null, userId: null })

  useDocumentTitle(username ? `${username}: Wordanza` : 'Wordanza')

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', profile: null, userId: null })

    fetchPublicProfileByUsername(username)
      .then(result => {
        if (cancelled) return
        if (!result) setState({ status: 'notfound', profile: null, userId: null })
        else         setState({ status: 'ready',    profile: result.profile, userId: result.userId })
      })
      .catch(() => { if (!cancelled) setState({ status: 'notfound', profile: null, userId: null }) })

    return () => { cancelled = true }
  }, [username])

  if (state.status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-slate-400">{t('common.loading')}</p>
      </div>
    )
  }

  if (state.status === 'notfound') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-200">{t('publicProfile.notFoundTitle')}</h1>
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
          >
            {t('common.back')}
          </button>
        </div>
        <p className="text-slate-400">{t('publicProfile.notFoundHint', { name: username })}</p>
      </div>
    )
  }

  const { profile, userId } = state
  const avatarIdx        = resolveAvatarIndex(profile, userId)
  const totalSkillPoints = getTotalSkillPoints(profile.skills)
  const handicap         = getTargetScore(totalSkillPoints)
  const podiumFirst      = profile?.stats?.podiumFirst  ?? 0
  const podiumSecond     = profile?.stats?.podiumSecond ?? 0
  const podiumThird      = profile?.stats?.podiumThird  ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-emerald-400">{t('publicProfile.title')}</h1>
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
        >
          {t('common.back')}
        </button>
      </div>

      {/* Bloc joueur */}
      <div className="p-5 bg-slate-800 rounded-xl mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-emerald-700 flex-shrink-0">
            <img
              src={avatarUrl(avatarIdx)}
              alt="avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-xl font-bold text-slate-100">{profile.displayName}</p>
          </div>
        </div>
      </div>

      {/* Stats principales */}
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
          <PodiumCard icon="🥇" value={podiumFirst}  label={t('publicProfile.firstPlace')}  />
          <PodiumCard icon="🥈" value={podiumSecond} label={t('publicProfile.secondPlace')} />
          <PodiumCard icon="🥉" value={podiumThird}  label={t('publicProfile.thirdPlace')}  />
        </div>
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

      {/* Power-ups débloqués */}
      <div>
        <h2 className="text-lg font-semibold text-slate-300 mb-3">{t('profile.unlockedPowerups')}</h2>
        <div className="flex flex-wrap gap-2">
          {/* Trash est toujours disponible pour tous */}
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
            <p className="text-slate-500 text-sm">{t('publicProfile.noPowerups')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function PodiumCard({ icon, value, label }) {
  return (
    <div className="p-4 bg-slate-800 rounded-xl text-center">
      <p className="text-2xl mb-1">{icon}</p>
      <p className="text-2xl font-bold text-slate-100 tabular-nums">{value}</p>
      <p className="text-slate-500 text-xs mt-1">{label}</p>
    </div>
  )
}
