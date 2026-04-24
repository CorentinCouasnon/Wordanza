// Une tuile lettre dans la réglette du joueur.
//
// États :
// - Normal : cliquable pour la sélectionner
// - Sélectionné : mise en avant, prochain clic sur le plateau la posera
// - En cours de placement (onBoard) : la lettre est sur le plateau en draft,
//   la case dans la réglette apparaît vide mais réservée

export default function LetterTile({ letter, isSelected, onBoard, onClick }) {
  if (onBoard) {
    // Slot réservé, la lettre est actuellement sur le plateau (draft)
    return (
      <div
        className="w-10 h-10 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/30 cursor-pointer hover:border-blue-500/50"
        onClick={onClick}
        title="Click to retrieve this letter"
      />
    )
  }

  let tileClass = 'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base cursor-pointer select-none transition-all '

  if (isSelected) {
    tileClass += 'bg-blue-500 text-white ring-2 ring-blue-300 scale-110 shadow-lg shadow-blue-500/30'
  } else {
    tileClass += 'bg-amber-100 text-amber-900 hover:bg-amber-200 hover:scale-105 shadow-md'
  }

  return (
    <div className={tileClass} onClick={onClick}>
      {letter}
    </div>
  )
}
