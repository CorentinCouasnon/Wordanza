// La réglette du joueur.
// rack     : [{ id, letter } | null, ...]: tableau fixe de handSize slots
// selected : { source, index|key } | null, sélection globale
// onSlotClick : (index) => void
//
// Feedback visuel des actions serveur :
//   pendingTargetSlot : index du slot en attente de pioche → animate-shimmer
//   pendingAction     : 'draw' → bouton pioche en loading, PA grisés+pulse
//                       autre non-null → PA grisés+pulse (action en cours)

import { useTranslation } from 'react-i18next'
import Spinner from '../common/Spinner'

export default function PlayerHand({
  rack = [],
  selected = null,
  onSlotClick,
  ap = 0,
  drawCost = 20,
  onDraw,
  onTrash,
  canDraw,
  pendingAction = null,
  pendingTargetSlot = null,
  // containerClassName permet d'override le style du conteneur externe.
  // Passer '' pour supprimer la carte par défaut (ex: quand intégré dans un panel parent).
  containerClassName = 'flex flex-col items-center gap-2 p-3 bg-slate-800/80 rounded-xl border border-slate-700',
}) {
  const { t } = useTranslation()
  const isDrawing   = pendingAction === 'draw'
  const anyPending  = pendingAction !== null

  return (
    <div className={containerClassName}>
      {/* Réglette, les tuiles se réduisent sur mobile pour tenir dans l'écran */}
      <div className="flex gap-1 flex-wrap justify-center">
        {rack.map((tile, index) => {
          const isSelected = selected?.source === 'rack' && selected?.index === index
          const isPendingSlot = pendingTargetSlot === index

          if (!tile) {
            // Slot vide, cliquable seulement si une tuile draft est sélectionnée
            const isDraftSelected = selected?.source === 'draft'
            return (
              <div
                key={`empty_${index}`}
                onClick={() => onSlotClick(index)}
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg border-2 border-dashed transition-colors
                  ${isPendingSlot
                    ? 'animate-shimmer border-slate-500'
                    : isDraftSelected
                      ? 'border-blue-500 bg-blue-900/20 cursor-pointer hover:bg-blue-900/40'
                      : 'border-slate-600 bg-slate-800/30 cursor-default'
                  }`}
              />
            )
          }

          return (
            <div
              key={tile.id}
              onClick={() => onSlotClick(index)}
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-bold text-sm sm:text-base cursor-pointer select-none transition-all shadow-md
                ${isSelected
                  ? 'bg-blue-500 text-white ring-2 ring-blue-300 scale-110 shadow-blue-500/30'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200 hover:scale-105'
                }`}
            >
              {tile.letter}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 items-center">
        <button
          onClick={onDraw}
          disabled={!canDraw || anyPending}
          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold text-sm transition-colors inline-flex items-center gap-2
            ${canDraw && !anyPending
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
        >
          {isDrawing && <Spinner size="xs" />}
          {t('playerHand.draw', { cost: drawCost })}
        </button>

        <button
          onClick={onTrash}
          disabled={rack.every(s => s === null) || anyPending}
          className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-300 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('playerHand.discard')}
        >
          🗑️
        </button>

        {/* PA : grisés + pulse pendant qu'une action serveur est en cours
            (le serveur recalcule la valeur, la valeur locale peut être stale). */}
        <div className={`ml-2 text-sm transition-opacity ${anyPending ? 'opacity-50 animate-pulse' : ''}`}>
          <span className="text-slate-200 font-semibold">{ap}</span>
          <span className="text-slate-500"> {t('playerList.apLabel')}</span>
        </div>
      </div>
    </div>
  )
}
