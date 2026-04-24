// Hook utilitaire : enveloppe un appel async pour exposer un état de chargement.
//
// Deux états distincts :
//   - isPending : true dès le début de l'appel (pour disabled/spinner sur le bouton)
//   - showSlow  : true SEULEMENT si l'appel dépasse un seuil (400ms par défaut).
//                 Utile pour afficher un overlay ou un toast global sans flash
//                 sur les appels rapides.
//
// Usage :
//   const { isPending, showSlow, run } = usePending()
//   await run(() => myCallable(args))

import { useState, useRef, useCallback, useEffect } from 'react'

export function usePending(slowThresholdMs = 400) {
  const [isPending, setIsPending] = useState(false)
  const [showSlow,  setShowSlow]  = useState(false)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const run = useCallback(async (asyncFn) => {
    setIsPending(true)
    setShowSlow(false)
    // Arme le timer : showSlow basculera à true seulement si l'appel dure assez
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setShowSlow(true)
    }, slowThresholdMs)
    try {
      return await asyncFn()
    } finally {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      if (mountedRef.current) {
        setIsPending(false)
        setShowSlow(false)
      }
    }
  }, [slowThresholdMs])

  return { isPending, showSlow, run }
}
