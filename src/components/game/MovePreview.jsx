// Barre de validation du mot en cours.
// Taille FIXE (h-14) quelle que soit l'état, garantit que le board ne bouge pas.
// wordData : { word, existingCount, newCount, estimatedPoints, crossWords[] } ou null
// isValid  : le mot principal est dans le dictionnaire
// error    : message d'erreur de placement ou null

import { useTranslation } from 'react-i18next'
import Spinner from '../common/Spinner'

export default function MovePreview({ wordData, isValid, error, onValidate, onCancel, disabled, validating = false }) {
  const { t } = useTranslation()
  // crossWords peut être string[] (ancienne donnée) ou { word }[] (nouveau format)
  const crossWordStrings = (wordData?.crossWords ?? []).map(c => typeof c === 'string' ? c : c.word)
  // Mot à mettre en avant : le plus long parmi le mot principal et les mots croisés
  const allWords = wordData
    ? [wordData.word, ...crossWordStrings].filter(Boolean)
    : []
  const primaryWord = allWords.reduce((a, b) => (b.length > a.length ? b : a), wordData?.word ?? '')
  const secondaryWords = allWords.filter(w => w !== primaryWord)

  return (
    // h-14 = 56px, hauteur constante, pas de reflow possible
    <div className="h-14 flex items-center gap-3 px-4">
      {!wordData ? (
        // État repos : texte indicatif centré
        <span className="text-slate-600 text-sm select-none w-full text-center">
          {t('movePreview.placeholder')}
        </span>
      ) : (
        <>
          {/* Mots formés : principal en grand, croisés en discret */}
          <div className="flex items-baseline gap-2 flex-shrink-0 min-w-0">
            <span className={`text-xl font-bold tracking-widest ${isValid && !error ? 'text-slate-100' : 'text-slate-400'}`}>
              {primaryWord}
            </span>
            {secondaryWords.length > 0 && !error && (
              <span className="text-xs text-slate-500 truncate">
                +{secondaryWords.join(', ')}
              </span>
            )}
          </div>

          {/* Badge validité */}
          {error ? (
            <span className="text-xs text-red-800 bg-red-100 px-2 py-0.5 rounded flex-shrink-0">{error}</span>
          ) : isValid ? (
            <span className="text-xs text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded flex-shrink-0">{t('movePreview.valid')}</span>
          ) : (
            <span className="text-xs text-amber-800 bg-amber-100 px-2 py-0.5 rounded flex-shrink-0">{t('movePreview.unknown')}</span>
          )}

          {/* Score estimé */}
          {!error && (
            <span className="flex items-baseline gap-1.5 flex-shrink-0">
              <span className="text-slate-300 font-semibold">+{wordData.estimatedPoints} pts</span>
              {wordData.touchesBorder && (
                <span className="text-xs text-red-800 bg-red-100 px-1.5 py-0.5 rounded">{t('movePreview.border')}</span>
              )}
            </span>
          )}

          {/* Boutons, poussés à droite */}
          <div className="flex gap-2 ml-auto flex-shrink-0">
            <button
              onClick={onCancel}
              disabled={validating}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={onValidate}
              disabled={disabled || !isValid || !!error || validating}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors inline-flex items-center gap-2"
            >
              {validating && <Spinner size="xs" />}
              {validating ? t('common.validating') : t('movePreview.validate')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
