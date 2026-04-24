import { useEffect } from 'react'

// Met à jour document.title le temps que la page est montée, puis restaure
// le titre précédent au démontage. Utile pour le SEO (titres par route dans
// les SERP) et l'UX (onglets du navigateur).
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
