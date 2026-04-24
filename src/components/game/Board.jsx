// Plateau de jeu 19x19.
// board    : { "row_col": { letter, playedBy } }: lettres validées
// draft    : { "row_col": { id, letter } }      , lettres en cours de placement
// selected : { source, key } | null             , sélection globale
// fill     : si true, le plateau remplit tout l'espace vertical disponible (mode multijoueur)
//            si false (défaut), taille fixe adaptative pour le mode solo et le lobby

import { useState, useEffect, useRef } from 'react'
import { BOARD_SIZE } from '../../utils/boardValidation'
import BoardCell from './BoardCell'

export default function Board({ board = {}, draft = {}, selected = null, onCellClick, onCellDoubleClick, fill = false, pendingDraft = null, interactive = true }) {
  // Détecte le board reset : quand le board passe de non-vide à vide,
  // on joue le flash rouge sur les cases de bordure.
  const [flashBorder, setFlashBorder] = useState(false)
  const prevBoardSizeRef = useRef(0)

  useEffect(() => {
    const currentSize = Object.keys(board).length
    const prevSize = prevBoardSizeRef.current
    // Toujours mettre à jour avant le return pour éviter les re-triggers
    prevBoardSizeRef.current = currentSize
    if (prevSize > 0 && currentSize === 0) {
      setFlashBorder(true)
      // L'animation dure 3 × 0.4s = 1.2s, on retire la classe après
      const t = setTimeout(() => setFlashBorder(false), 1400)
      return () => clearTimeout(t)
    }
  }, [board])

  // Quand une validation est en cours, on superpose pendingDraft au draft vide
  // pour continuer d'afficher les tuiles "en attente" avec un style différent.
  const effectiveDraft = pendingDraft ?? draft
  const isPending      = !!pendingDraft

  const cells = Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => {
      const key = `${row}_${col}`
      return (
        <BoardCell
          key={key}
          row={row}
          col={col}
          cell={board[key] ?? null}
          draftTile={effectiveDraft[key] ?? null}
          isPendingDraft={isPending && !!effectiveDraft[key]}
          isSelected={selected?.source === 'draft' && selected?.key === key}
          onClick={() => { if (interactive) onCellClick(row, col) }}
          onDoubleClick={onCellDoubleClick && interactive ? () => onCellDoubleClick(row, col) : undefined}
          flashBorder={flashBorder}
        />
      )
    })
  )

  if (fill) {
    // Mode fill : le board doit toujours être visible en entier, sans scroll ni redimensionnement.
    //
    // Problème : CSS ne peut pas exprimer min(containerWidth, containerHeight) sans aide.
    // Solution : CSS Container Query units (cqw / cqh, Chrome 105+, Firefox 110+, Safari 16+).
    //   - containerType: 'size' sur le wrapper active les unités cq pour les descendants
    //   - 100cqw = 100% de la largeur du container, 100cqh = 100% de sa hauteur
    //   - min(100cqw, 100cqh) = côté du plus grand carré inscrit dans le rectangle
    //   - gridTemplateRows explicite pour que les cellules soient carrées sans aspect-square
    return (
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ containerType: 'size' }}
      >
        <div
          className="grid border border-slate-600 flex-shrink-0"
          style={{
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
            gridTemplateRows:    `repeat(${BOARD_SIZE}, 1fr)`,
            width:  'min(100cqw, 100cqh)',
            height: 'min(100cqw, 100cqh)',
          }}
        >
          {cells}
        </div>
      </div>
    )
  }

  // Mode normal : taille fixe adaptative (solo, lobby preview)
  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid border border-slate-600 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          width: `min(95vw, 600px)`,
          minWidth: '285px',
        }}
      >
        {cells}
      </div>
    </div>
  )
}
