// Hook pour les Action Points (AP) d'un joueur.
//
// Gère la régénération en temps réel : 1 AP par minute, plafonné à 500.
// En Phase 1 (solo), les données viennent du state local.
// En Phase 2 (multijoueur), apStored et lastApUpdate viendront de Firestore.
//
// Retourne l'AP actuel recalculé chaque seconde côté client.

import { useState, useEffect } from 'react'
import { getCurrentAP, AP_MAX } from '../utils/ap'

export function useAP(apStored, lastApUpdate) {
  const [currentAP, setCurrentAP] = useState(() => getCurrentAP(apStored, lastApUpdate))

  useEffect(() => {
    // Recalculer immédiatement quand apStored ou lastApUpdate changent
    setCurrentAP(getCurrentAP(apStored, lastApUpdate))

    // Mettre à jour toutes les 10 secondes pour afficher la progression
    // (inutile de faire chaque seconde, la regen est de 1/min)
    const interval = setInterval(() => {
      const updated = getCurrentAP(apStored, lastApUpdate)
      setCurrentAP(updated)

      // Arrêter le tick si on est au plafond
      if (updated >= AP_MAX) clearInterval(interval)
    }, 10_000)

    return () => clearInterval(interval)
  }, [apStored, lastApUpdate])

  return currentAP
}
