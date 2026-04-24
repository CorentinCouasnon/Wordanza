// Modale de rapport de bug, accessible depuis le Changelog du Lobby.

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { submitBugReport } from '../../services/userService'
import { useToast } from '../../contexts/ToastContext'

export default function BugReportModal({ user, displayName, onClose }) {
  const [title, setTitle]     = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState(null)
  const titleRef              = useRef(null)
  const { t }                 = useTranslation()
  const toast                 = useToast()

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const trimmedTitle   = title.trim()
  const trimmedMessage = message.trim()
  const invalid = trimmedTitle.length < 3 || trimmedMessage.length < 10

  async function handleSubmit(e) {
    e.preventDefault()
    if (sending || invalid || !user?.uid) return
    setSending(true)
    setError(null)
    try {
      await submitBugReport({
        userId:      user.uid,
        displayName: displayName ?? null,
        title:       trimmedTitle,
        message:     trimmedMessage,
      })
      toast.success(t('profile.bugReportSent'))
      onClose()
    } catch {
      setError(t('profile.bugReportFailed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.closeOnUp = '1' }}
      onMouseUp={(e)   => { if (e.currentTarget.dataset.closeOnUp === '1') onClose(); delete e.currentTarget.dataset.closeOnUp }}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-1">{t('profile.reportBug')}</h2>
        <p className="text-slate-500 text-xs mb-4">{t('profile.bugReportHint')}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-slate-400 text-xs mb-1">{t('profile.bugReportTitle')}</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={sending}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">{t('profile.bugReportMessage')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              disabled={sending}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60 resize-none"
            />
            <div className="text-right text-xs text-slate-500 mt-1">{message.length}/2000</div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg text-sm transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={invalid || sending}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-colors inline-flex items-center justify-center gap-2"
            >
              {sending && <span className="inline-block w-3 h-3 rounded-full border border-current border-t-transparent animate-spin-slow" />}
              {sending ? t('common.saving') : t('profile.bugReportSend')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
