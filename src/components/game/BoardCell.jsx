// Une case du plateau 19x19.
// cell      : { letter, playedBy }: lettre validée, ou null
// draftTile : { id, letter }      , lettre en cours de placement, ou null
// isSelected : cette case draft est sélectionnée
// onClick

import { BOARD_SIZE } from '../../utils/boardValidation'

export default function BoardCell({ row, col, cell, draftTile, isSelected, onClick, onDoubleClick, flashBorder = false, isPendingDraft = false }) {
  const isBorder = row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1
  const isCenter = row === 9 && col === 9

  const letter = cell?.letter ?? draftTile?.letter ?? null
  const isDraft = !!draftTile && !cell

  let cls = 'w-full aspect-square flex items-center justify-center text-xs font-bold select-none border border-slate-700/40 '

  if (cell) {
    cls += 'bg-amber-100 text-amber-900 cursor-default '
  } else if (isDraft) {
    // Tuile draft en attente de validation serveur : opacité réduite + pulse bordure
    if (isPendingDraft) {
      cls += 'bg-blue-500/60 text-white/80 animate-pulse-border cursor-wait '
    } else {
      cls += isSelected
        ? 'bg-blue-400 text-white ring-2 ring-blue-200 cursor-pointer '
        : 'bg-blue-500 text-white cursor-pointer '
    }
  } else if (isBorder) {
    // animate-border-flash joue quand le board vient d'être réinitialisé
    cls += flashBorder
      ? 'animate-border-flash cursor-pointer '
      : 'bg-red-950/40 cursor-pointer hover:bg-red-900/50 '
  } else if (isCenter) {
    cls += 'bg-emerald-900/40 cursor-pointer hover:bg-emerald-800/40 '
  } else {
    cls += 'bg-slate-800/60 cursor-pointer hover:bg-slate-700/60 '
  }

  return (
    <div className={cls} onClick={onClick} onDoubleClick={onDoubleClick} title={isBorder ? 'Border: clears the board!' : undefined}>
      {letter
        ? <span className="leading-none">{letter}</span>
        : isCenter && <span className="text-emerald-500/40 text-base leading-none">✦</span>
      }
    </div>
  )
}
