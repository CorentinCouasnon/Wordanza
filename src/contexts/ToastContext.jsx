// Système de toasts global.
//
// Usage :
//   const toast = useToast()
//   toast.success('Achat réussi')
//   toast.error('Échec')
//   toast.info('Action en cours…')
//
// Chaque toast s'empile en bas à droite et se retire automatiquement après 3s
// (ou à la main via le bouton de fermeture). Pas de dépendance externe.

import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

let _id = 0
const DEFAULT_DURATION = 3000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Stocke les timers actifs pour pouvoir les nettoyer si besoin
  const timersRef = useRef({})

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current[id]
    if (timer) { clearTimeout(timer); delete timersRef.current[id] }
  }, [])

  const push = useCallback((type, message, duration = DEFAULT_DURATION) => {
    const id = ++_id
    setToasts(prev => [...prev, { id, type, message }])
    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => remove(id), duration)
    }
    return id
  }, [remove])

  const api = {
    success: (msg, dur) => push('success', msg, dur),
    error:   (msg, dur) => push('error',   msg, dur),
    info:    (msg, dur) => push('info',    msg, dur),
    dismiss: remove,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ── Viewport ─────────────────────────────────────────────────────────────

const TYPE_STYLES = {
  success: 'bg-emerald-900/90 text-emerald-200 border-emerald-700/50',
  error:   'bg-red-900/90    text-red-200     border-red-700/50',
  info:    'bg-slate-800/90  text-slate-200   border-slate-700',
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto cursor-pointer px-4 py-2.5 rounded-lg shadow-lg border backdrop-blur-sm text-sm animate-fade-in ${TYPE_STYLES[t.type] ?? TYPE_STYLES.info}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
