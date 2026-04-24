// Affiche la liste des joueurs d'une partie multijoueur.
// - Classement temps réel trié par progression (% vers score cible)
// - Animation FLIP : les lignes glissent vers leur nouvelle position comme un drag & drop
// - Fond orangé sur le joueur qui vient de dépasser quelqu'un
// - Toggle absolu / pourcentage sur le score

import { useState, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getCurrentAP } from '../../utils/ap'
import { colorForUserId } from '../../utils/playerColors'

const MEDALS = ['🥇', '🥈', '🥉']

export default function PlayerList({ players, currentUserId, pendingTargetUserId = null }) {
  const [showPercent, setShowPercent] = useState(false)
  const { t } = useTranslation()

  // Refs pour l'animation FLIP
  const rowRefs   = useRef({})  // { userId: HTMLElement }
  const prevPos   = useRef({})  // { userId: top (px) }: positions avant le dernier render
  const prevOrder = useRef([])  // userId[]: ordre avant le dernier render

  if (!players || players.length === 0) return null

  // Trier par progression décroissante
  const sorted = [...players].sort((a, b) =>
    b.score / b.targetScore - a.score / a.targetScore
  )

  // ── Animation FLIP ─────────────────────────────────────────────────────────
  // useLayoutEffect s'exécute APRÈS chaque commit DOM, donc les éléments sont
  // déjà à leur nouvelle position dans le DOM.
  // On applique d'abord un transform inverse (position précédente), force un reflow,
  // puis on retire le transform pour que le browser anime jusqu'à la position finale.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    const currentOrder = sorted.map(p => p.userId)

    // Détecter qui a monté dans le classement (pour la couleur orange)
    const overtakers = new Set()
    currentOrder.forEach((uid, newIdx) => {
      const oldIdx = prevOrder.current.indexOf(uid)
      if (oldIdx !== -1 && newIdx < oldIdx) overtakers.add(uid)
    })
    prevOrder.current = currentOrder

    // Pas de dépassement → mettre à jour les positions et s'arrêter
    if (overtakers.size === 0) {
      for (const [userId, el] of Object.entries(rowRefs.current)) {
        if (el) prevPos.current[userId] = el.getBoundingClientRect().top
      }
      return
    }

    // FLIP : animer chaque ligne qui a changé de position
    for (const [userId, el] of Object.entries(rowRefs.current)) {
      if (!el) continue
      const oldTop = prevPos.current[userId]
      const newTop = el.getBoundingClientRect().top

      if (oldTop !== undefined && Math.abs(oldTop - newTop) > 1) {
        const delta = oldTop - newTop

        // 1. Snapback à l'ancienne position instantanément
        el.style.transition = 'none'
        el.style.transform  = `translateY(${delta}px)`
        if (overtakers.has(userId)) {
          el.style.backgroundColor = 'rgba(251, 146, 60, 0.18)'
        }

        // 2. Force le browser à calculer le layout (sinon la transition ne part pas)
        el.getBoundingClientRect()

        // 3. Relâcher → le browser anime jusqu'à la position naturelle
        el.style.transition      = 'transform 420ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 700ms ease'
        el.style.transform       = ''

        // 4. Effacer le fond orangé après la durée de transition
        if (overtakers.has(userId)) {
          setTimeout(() => { if (el) el.style.backgroundColor = '' }, 700)
        }
      }

      // Enregistrer la nouvelle position pour le prochain render
      prevPos.current[userId] = el.getBoundingClientRect().top
    }
  })
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-slate-800/80 rounded-xl border border-slate-700 px-4 py-3">
      {/* Header avec toggle */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-500 text-xs uppercase tracking-wider">{t('playerList.players')}</p>
        <button
          onClick={() => setShowPercent(v => !v)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showPercent ? t('playerList.showPts') : t('playerList.showPercent')}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {sorted.map((player, i) => {
          const ap       = getCurrentAP(player.apStored, player.lastApUpdate)
          const isMe     = player.userId === currentUserId
          const progress = Math.min(1, player.score / player.targetScore)
          const pct      = Math.round(progress * 100)
          const medal    = MEDALS[i] ?? null

          return (
            <div
              key={player.userId}
              ref={el => { rowRefs.current[player.userId] = el }}
              className={`flex items-center gap-3 rounded-lg ${pendingTargetUserId === player.userId ? 'ring-2 ring-emerald-400/60 animate-pulse' : ''}`}
              // Le background-color est géré via style JS pour l'animation
            >
              {/* Rang temps réel */}
              <div className="w-6 text-center flex-shrink-0">
                {player.finished ? (
                  <span className="text-xs font-bold text-emerald-400">#{player.rank}</span>
                ) : medal ? (
                  <span className="text-sm leading-none">{medal}</span>
                ) : (
                  <span className="text-xs text-slate-500 font-medium">#{i + 1}</span>
                )}
              </div>

              {/* Trait vertical, couleur stable par joueur */}
              <div
                className="w-1.5 h-9 rounded-full flex-shrink-0"
                style={{ backgroundColor: colorForUserId(player.userId, players) }}
              />

              <div className="flex-1 min-w-0">
                {/* Nom + score */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium truncate ${isMe ? 'text-slate-100' : 'text-slate-300'}`}>
                    {/* Les bots et soi-même ne sont pas cliquables, les autres ouvrent leur profil public */}
                    {player.isBot || isMe ? (
                      player.displayName
                    ) : (
                      <Link
                        to={`/u/${encodeURIComponent(player.displayName)}`}
                        className="hover:text-emerald-400 hover:underline transition-colors"
                      >
                        {player.displayName}
                      </Link>
                    )}
                    {player.isBot && (
                      <span className="ml-1.5 text-[10px] font-normal text-slate-500 border border-slate-600 rounded px-1 py-0.5 align-middle">
                        BOT
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                    {showPercent ? (
                      <>{pct}<span className="text-slate-600">%</span></>
                    ) : (
                      <>{player.score}<span className="text-slate-600"> / {player.targetScore}</span></>
                    )}
                  </span>
                </div>

                {/* Barre de progression, couleur stable par joueur */}
                <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: colorForUserId(player.userId, players),
                    }}
                  />
                </div>
              </div>

              {/* PA */}
              <div className="text-xs flex-shrink-0 text-right min-w-[3rem]">
                <span className="text-amber-400 tabular-nums">{ap}</span>
                <span className="text-slate-600"> {t('playerList.apLabel')}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
