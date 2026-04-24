// Modale de sélection d'avatar.
// Affiche la grille d'avatars disponibles, l'avatar actif est mis en évidence.
// Le changement est persisté en Firestore via updateAvatarIndex.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AVATARS, avatarUrl } from '../../constants/AVATARS'
import { updateAvatarIndex } from '../../services/userService'

export default function AvatarPickerModal({ userId, currentIndex, onSuccess, onClose }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  // Fermer sur Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handlePick(index) {
    if (saving || index === currentIndex) {
      if (index === currentIndex) onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateAvatarIndex(userId, index)
      onSuccess(index)
    } catch {
      setError(t('profile.avatarSaveFailed'))
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.closeOnUp = '1' }}
      onMouseUp={(e)   => { if (e.currentTarget.dataset.closeOnUp === '1') onClose(); delete e.currentTarget.dataset.closeOnUp }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">{t('profile.chooseAvatar')}</h2>

        <div className="grid grid-cols-3 gap-3">
          {AVATARS.map((avatar, index) => {
            const active = index === currentIndex
            return (
              <button
                key={avatar.id}
                onClick={() => handlePick(index)}
                disabled={saving}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all disabled:opacity-50
                  ${active
                    ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                    : 'border-slate-700 hover:border-slate-500'
                  }`}
              >
                <img
                  src={avatarUrl(index)}
                  alt={avatar.id}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            )
          })}
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition-colors"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
