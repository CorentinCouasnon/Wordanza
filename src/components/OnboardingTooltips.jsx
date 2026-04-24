// Onboarding, guide contextuel au premier lancement.
//
// Flow :
//   1. Popup de confirmation "Veux-tu un guide ?"
//   2. Si oui → série de tooltips pointant vers les éléments de l'interface
//      via des attributs data-onboarding="<step>" posés dans GamePage.jsx
//   3. Fin → onDone() appelé, localStorage.onboardingDone = '1'
//
// Le positionnement utilise getBoundingClientRect() sur chaque cible.
// Le tooltip apparaît en dessous de la cible (ou au-dessus si peu de place).

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

// Définition des étapes dans l'ordre d'affichage.
// selector : valeur de l'attribut data-onboarding="..." dans la page cible.
// Le parent peut passer un tableau `steps` personnalisé (ex: défi quotidien),
// sinon on utilise l'onboarding par défaut des parties classiques.
const DEFAULT_STEPS = [
  { selector: 'rack',       titleKey: 'onboarding.step1Title', descKey: 'onboarding.step1Desc' },
  { selector: 'rack',       titleKey: 'onboarding.step2Title', descKey: 'onboarding.step2Desc' },
  { selector: 'board',      titleKey: 'onboarding.step3Title', descKey: 'onboarding.step3Desc' },
  { selector: 'validate',   titleKey: 'onboarding.step4Title', descKey: 'onboarding.step4Desc' },
  { selector: 'powerups',   titleKey: 'onboarding.step5Title', descKey: 'onboarding.step5Desc' },
  { selector: 'playerlist', titleKey: 'onboarding.step6Title', descKey: 'onboarding.step6Desc' },
]

/**
 * Calcule la position du tooltip par rapport à l'élément cible.
 * Retourne { top, left, arrowSide } pour placer le tooltip.
 */
function getTooltipPosition(el) {
  if (!el) return null
  const rect       = el.getBoundingClientRect()
  const TOOLTIP_W  = 280
  const TOOLTIP_H  = 120 // estimation
  const MARGIN     = 12
  const ARROW_H    = 8

  // Préférer afficher en dessous ; si pas de place → au-dessus
  const spaceBelow = window.innerHeight - rect.bottom
  const showBelow  = spaceBelow >= TOOLTIP_H + MARGIN + ARROW_H

  const top = showBelow
    ? rect.bottom + ARROW_H + MARGIN
    : rect.top - TOOLTIP_H - ARROW_H - MARGIN

  // Centrer horizontalement par rapport à la cible, sans déborder de l'écran
  let left = rect.left + rect.width / 2 - TOOLTIP_W / 2
  left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_W - 8))

  return { top, left, arrowSide: showBelow ? 'top' : 'bottom' }
}

export default function OnboardingTooltips({ onDone, steps, promptTitleKey, promptDescKey }) {
  const { t } = useTranslation()
  const STEPS = steps ?? DEFAULT_STEPS
  const titleKey = promptTitleKey ?? 'onboarding.promptTitle'
  const descKey  = promptDescKey  ?? 'onboarding.promptDesc'

  // null = afficher le prompt de confirmation ; -1 = fini ; 0..N = étape courante
  const [step, setStep] = useState(null)
  const [pos,  setPos]  = useState(null)

  // Mettre à jour la position quand l'étape change ou quand la fenêtre se redimensionne
  const updatePosition = useCallback(() => {
    if (step === null || step < 0 || step >= STEPS.length) { setPos(null); return }
    const selector = STEPS[step].selector
    const el       = document.querySelector(`[data-onboarding="${selector}"]`)
    setPos(el ? getTooltipPosition(el) : null)
  }, [step, STEPS])

  useEffect(() => {
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [updatePosition])

  function handleAccept() { setStep(0) }
  function handleDecline() { onDone() }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      onDone()
    }
  }

  // ── Prompt initial ──────────────────────────────────────────────────────────
  if (step === null) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xs shadow-2xl p-6 text-center">
          <div className="text-3xl mb-3">👋</div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">{t(titleKey)}</h3>
          <p className="text-slate-400 text-sm mb-6">{t(descKey)}</p>
          <div className="flex gap-3">
            <button
              onClick={handleDecline}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-xl transition-colors"
            >
              {t('onboarding.no')}
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {t('onboarding.yes')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Tooltip d'étape ─────────────────────────────────────────────────────────
  if (step >= 0 && step < STEPS.length) {
    const currentStep = STEPS[step]
    const isLast      = step === STEPS.length - 1

    return (
      // Overlay semi-transparent, cliquable pour passer à l'étape suivante
      <div
        className="fixed inset-0 z-50"
        onClick={handleNext}
      >
        {/* Tooltip positionné dynamiquement */}
        {pos && (
          <div
            className="absolute bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 pointer-events-auto"
            style={{ top: pos.top, left: pos.left, width: 280 }}
            // Empêcher le clic sur le tooltip de passer au suivant
            onClick={e => e.stopPropagation()}
          >
            {/* Flèche */}
            {pos.arrowSide === 'top' && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0
                border-l-8 border-r-8 border-b-8
                border-l-transparent border-r-transparent border-b-slate-600" />
            )}
            {pos.arrowSide === 'bottom' && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0
                border-l-8 border-r-8 border-t-8
                border-l-transparent border-r-transparent border-t-slate-600" />
            )}

            {/* Contenu */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-slate-100 text-sm font-semibold">{t(currentStep.titleKey)}</p>
              <span className="text-slate-600 text-xs flex-shrink-0 tabular-nums">
                {step + 1}/{STEPS.length}
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-3">
              {t(currentStep.descKey)}
            </p>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onDone}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 transition-colors"
              >
                {t('onboarding.skip')}
              </button>
              <button
                onClick={handleNext}
                className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {isLast ? t('onboarding.finish') : t('onboarding.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
