// Défi quotidien, page mono-coup (Phase C).
//
// Principe : un board pré-rempli + une réglette fixe, identiques pour tous
// les joueurs d'une même langue ce jour-là. Le joueur place un seul mot,
// soumet, reçoit 1/2/3 perles selon le % du meilleur score possible.
//
// Pas de PA, pas de power-ups, pas de pioche, les mécaniques méta ne
// s'appliquent pas. Reset à 00h00 heure Paris pour tout le monde.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthContext } from '../contexts/AuthContext'
import { useDictionary } from '../hooks/useDictionary'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { validatePlacement } from '../utils/boardValidation'
import Board from '../components/game/Board'
import MovePreview from '../components/game/MovePreview'
import OnboardingTooltips from '../components/OnboardingTooltips'
import { calculateWordScore } from '../utils/scoring'
import { useToast } from '../contexts/ToastContext'
import {
  getTodaysChallengeId,
  parisDateString,
  msUntilParisMidnight,
  subscribeToChallenge,
  subscribeToResult,
  submitDailyChallenge,
} from '../services/dailyChallengeService'

// Compteur local pour donner des IDs stables aux tuiles (React keys)
let _id = 0
const newTile = (letter) => ({ id: `d${++_id}`, letter })

// Étapes d'onboarding spécifiques au défi quotidien (dissocié de l'onboarding
// des parties classiques, clé localStorage séparée).
const DAILY_ONBOARDING_STEPS = [
  { selector: 'daily-board',    titleKey: 'onboarding.dailyStep1Title', descKey: 'onboarding.dailyStep1Desc' },
  { selector: 'daily-rack',     titleKey: 'onboarding.dailyStep2Title', descKey: 'onboarding.dailyStep2Desc' },
  { selector: 'daily-validate', titleKey: 'onboarding.dailyStep3Title', descKey: 'onboarding.dailyStep3Desc' },
  { selector: 'daily-header',   titleKey: 'onboarding.dailyStep4Title', descKey: 'onboarding.dailyStep4Desc' },
]

export default function DailyChallengePage() {
  const { user, profile } = useAuthContext()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const toast = useToast()

  useDocumentTitle(`${t('dailyChallenge.title')}: Wordanza`)

  const language    = profile?.language ?? 'en'
  const challengeId = getTodaysChallengeId(language)
  const today       = parisDateString()

  const { isValidWord, loading: dictLoading } = useDictionary(language)

  const [challenge, setChallenge] = useState(null)
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(true)

  // État local (placement)
  const [rack, setRack]         = useState([])
  const [draft, setDraft]       = useState({})
  const [selected, setSelected] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [message, setMessage]         = useState(null)

  // Onboarding spécifique au défi quotidien, affiché au premier chargement
  // (uniquement quand le challenge est chargé et non joué, pour que les cibles existent).
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Timer countdown
  const [remainingMs, setRemainingMs] = useState(msUntilParisMidnight())
  useEffect(() => {
    const id = setInterval(() => setRemainingMs(msUntilParisMidnight()), 1000)
    return () => clearInterval(id)
  }, [])

  // Subscribe challenge + result
  useEffect(() => {
    setLoading(true)
    const unsub1 = subscribeToChallenge(challengeId, (c) => {
      setChallenge(c)
      setLoading(false)
    })
    return () => unsub1()
  }, [challengeId])

  useEffect(() => {
    if (!user?.uid) return
    const unsub = subscribeToResult(user.uid, today, (r) => setResult(r))
    return () => unsub()
  }, [user?.uid, today])

  // Initialisation du rack une fois le challenge chargé, uniquement si non joué
  useEffect(() => {
    if (!challenge?.rack || result) return
    setRack(challenge.rack.map(letter => newTile(letter)))
    setDraft({})
    setSelected(null)
  }, [challenge, result])

  // Déclenche l'onboarding une fois le challenge visible et non joué,
  // et uniquement à la toute première visite (flag localStorage dédié).
  useEffect(() => {
    if (!challenge || result) return
    if (!localStorage.getItem('dailyOnboardingDone')) {
      setShowOnboarding(true)
    }
  }, [challenge, result])

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Mirror simplifié de useGame : rack ↔ draft uniquement, pas de PA/powerups.

  const handleRackClick = useCallback((index) => {
    const tile = rack[index]
    if (selected === null) {
      if (tile) setSelected({ source: 'rack', index })
      return
    }
    if (selected.source === 'rack') {
      if (selected.index === index) { setSelected(null); return }
      setRack(prev => {
        const r = [...prev]
        ;[r[selected.index], r[index]] = [r[index], r[selected.index]]
        return r
      })
      setSelected(null)
      return
    }
    if (selected.source === 'draft') {
      // Retourne la tuile draft dans le slot, si le slot contenait une tuile,
      // on permute (la tuile du slot va dans le draft).
      const draftTile = draft[selected.key]
      setRack(prev => { const r = [...prev]; r[index] = draftTile; return r })
      setDraft(prev => {
        const d = { ...prev }
        if (tile) d[selected.key] = tile
        else delete d[selected.key]
        return d
      })
      setSelected(null)
    }
  }, [rack, draft, selected])

  const handleCellClick = useCallback((row, col) => {
    const key = `${row}_${col}`
    if (challenge?.board?.[key]) return // case fixe intouchable
    const draftTile = draft[key]

    if (selected === null) {
      if (draftTile) setSelected({ source: 'draft', key })
      return
    }
    if (selected.source === 'rack') {
      const rackTile = rack[selected.index]
      if (draftTile) {
        setRack(prev => { const r = [...prev]; r[selected.index] = draftTile; return r })
        setDraft(prev => ({ ...prev, [key]: rackTile }))
      } else {
        setRack(prev => { const r = [...prev]; r[selected.index] = null; return r })
        setDraft(prev => ({ ...prev, [key]: rackTile }))
      }
      setSelected(null)
      return
    }
    if (selected.source === 'draft') {
      if (selected.key === key) { setSelected(null); return }
      const movingTile = draft[selected.key]
      setDraft(prev => {
        const d = { ...prev }
        delete d[selected.key]
        if (draftTile) d[selected.key] = draftTile
        d[key] = movingTile
        return d
      })
      setSelected(null)
    }
  }, [rack, draft, selected, challenge])

  const handleCellDoubleClick = useCallback((row, col) => {
    const key       = `${row}_${col}`
    const draftTile = draft[key]
    if (!draftTile) return
    setDraft(prev => { const d = { ...prev }; delete d[key]; return d })
    setRack(prev => {
      const r    = [...prev]
      const slot = r.findIndex(s => s === null)
      if (slot !== -1) r[slot] = draftTile
      return r
    })
    setSelected(null)
  }, [draft])

  const cancelDraft = useCallback(() => {
    setRack(prev => {
      const r = [...prev]
      for (const tile of Object.values(draft)) {
        const slot = r.findIndex(s => s === null)
        if (slot !== -1) r[slot] = tile
      }
      return r
    })
    setDraft({})
    setSelected(null)
  }, [draft])

  // ── Aperçu du mot en cours (pour MovePreview) ─────────────────────────────
  const draftWordData = useMemo(() => {
    const placedLetters = Object.entries(draft).map(([key, tile]) => {
      const [row, col] = key.split('_').map(Number)
      return { row, col, letter: tile.letter }
    })
    if (placedLetters.length === 0) return null
    if (!challenge) return null
    const { valid, error, wordData, touchesBorder } = validatePlacement(placedLetters, challenge.board)
    if (!valid || !wordData) return { error, word: null }
    const estimatedPoints = calculateWordScore(wordData.existingCount, wordData.newCount)
      + (wordData.crossWords ?? []).reduce(
          (sum, cross) => sum + calculateWordScore(cross.existingCount, cross.newCount),
          0
        )
    return { ...wordData, touchesBorder: !!touchesBorder, estimatedPoints, error: null }
  }, [draft, challenge])

  const wordIsValid = !!(draftWordData && !draftWordData.error && draftWordData.word && isValidWord(draftWordData.word)
    && (draftWordData.crossWords ?? []).every(cw => isValidWord(cw.word)))

  // ── Submit ────────────────────────────────────────────────────────────────
  const hasDraft = Object.keys(draft).length > 0

  async function handleSubmit() {
    if (submitting || !challenge) return
    setSubmitError(null)
    setMessage(null)

    const placedLetters = Object.entries(draft).map(([key, tile]) => {
      const [row, col] = key.split('_').map(Number)
      return { row, col, letter: tile.letter }
    })

    if (placedLetters.length === 0) {
      setMessage(t('dailyChallenge.placeAtLeastOne'))
      return
    }

    // Validation locale pour feedback rapide (le serveur revalide)
    const { valid, error, wordData } = validatePlacement(placedLetters, challenge.board)
    if (!valid) { setMessage(error); return }
    if (!isValidWord(wordData.word)) {
      setMessage(t('dailyChallenge.wordNotInDict', { word: wordData.word }))
      return
    }
    for (const cw of wordData.crossWords ?? []) {
      if (!isValidWord(cw.word)) {
        setMessage(t('dailyChallenge.wordNotInDict', { word: cw.word }))
        return
      }
    }

    setSubmitting(true)
    try {
      const draftEntries = Object.entries(draft).map(([key, tile]) => [key, { letter: tile.letter, id: tile.id }])
      const res = await submitDailyChallenge({ challengeId, draftEntries })
      if (!res?.success) {
        const msg = res?.error ?? t('dailyChallenge.submitFailed')
        setSubmitError(msg)
        toast.error(msg)
      }
      // En cas de succès, le snapshot `subscribeToResult` va afficher le résultat.
    } finally {
      setSubmitting(false)
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  const combinedBoard = useMemo(() => ({ ...(challenge?.board ?? {}) }), [challenge])

  return (
    <div className="min-h-screen">
     <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-emerald-400">{t('dailyChallenge.title')}</h1>
        <button
          onClick={() => navigate('/lobby')}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
        >
          {t('common.back')}
        </button>
      </div>

      {/* Timer + streak */}
      <div data-onboarding="daily-header" className="flex items-center justify-between mb-4 px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl">
        <span className="text-slate-400 text-sm">
          {t('dailyChallenge.nextReset')} <span className="text-slate-200 font-semibold tabular-nums">{formatCountdown(remainingMs)}</span>
        </span>
        <span className="text-slate-400 text-sm">
          🔥 <span className="text-emerald-400 font-semibold">{profile?.dailyStreak ?? 0}</span> {t('dailyChallenge.streakLabel')}
        </span>
      </div>

      {loading && <p className="text-center text-slate-500 py-8">{t('common.loading')}</p>}

      {!loading && !challenge && (
        <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl text-center">
          <p className="text-slate-400">{t('dailyChallenge.notAvailable')}</p>
          <p className="text-slate-600 text-xs mt-2">{t('dailyChallenge.notAvailableHint')}</p>
        </div>
      )}

      {!loading && challenge && result && (
        <ResultView
          result={result}
          t={t}
          toast={toast}
          language={language}
          dailyStreak={profile?.dailyStreak ?? 0}
          date={today}
        />
      )}

      {!loading && challenge && !result && (
        <>
          {/* Board */}
          <div data-onboarding="daily-board" className="flex justify-center mb-3">
            <Board
              board={combinedBoard}
              draft={draft}
              selected={selected}
              onCellClick={handleCellClick}
              onCellDoubleClick={handleCellDoubleClick}
            />
          </div>

          {/* MovePreview, aperçu du mot + score + validation */}
          <div data-onboarding="daily-validate" className="mb-3 border-y border-slate-800 bg-slate-900/80">
            <MovePreview
              wordData={draftWordData}
              isValid={wordIsValid}
              error={draftWordData?.error ?? null}
              onValidate={handleSubmit}
              onCancel={cancelDraft}
              disabled={!hasDraft || dictLoading}
              validating={submitting}
            />
          </div>

          {/* Rack simplifié, pas de AP ni pioche */}
          <div data-onboarding="daily-rack" className="flex flex-col items-center gap-3 p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <div className="flex gap-1 flex-wrap justify-center">
              {rack.map((tile, index) => {
                const isSelected = selected?.source === 'rack' && selected?.index === index
                if (!tile) {
                  const isDraftSelected = selected?.source === 'draft'
                  return (
                    <div
                      key={`empty_${index}`}
                      onClick={() => handleRackClick(index)}
                      className={`w-10 h-10 rounded-lg border-2 border-dashed transition-colors
                        ${isDraftSelected
                          ? 'border-blue-500 bg-blue-900/20 cursor-pointer hover:bg-blue-900/40'
                          : 'border-slate-600 bg-slate-800/30 cursor-default'
                        }`}
                    />
                  )
                }
                return (
                  <div
                    key={tile.id}
                    onClick={() => handleRackClick(index)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base cursor-pointer select-none transition-all shadow-md
                      ${isSelected
                        ? 'bg-blue-500 text-white ring-2 ring-blue-300 scale-110'
                        : 'bg-amber-100 text-amber-900 hover:bg-amber-200 hover:scale-105'
                      }`}
                  >
                    {tile.letter}
                  </div>
                )
              })}
            </div>

            {message && <p className="text-amber-400 text-sm">{message}</p>}
            {submitError && <p className="text-red-400 text-sm">{submitError}</p>}
          </div>
        </>
      )}
     </div>

      {showOnboarding && (
        <OnboardingTooltips
          steps={DAILY_ONBOARDING_STEPS}
          promptTitleKey="onboarding.dailyPromptTitle"
          promptDescKey="onboarding.dailyPromptDesc"
          onDone={() => {
            localStorage.setItem('dailyOnboardingDone', '1')
            setShowOnboarding(false)
          }}
        />
      )}
    </div>
  )
}

// ── Vue résultat (après soumission) ──────────────────────────────────────────

function ResultView({ result, t, toast, language, dailyStreak, date }) {
  const pearlsColor = result.pearlsEarned === 3 ? 'text-amber-300' : result.pearlsEarned === 2 ? 'text-slate-200' : 'text-amber-600'
  const bestCrossWords = Array.isArray(result.bestCrossWords) ? result.bestCrossWords : []
  const myCrossWords   = Array.isArray(result.crossWords) ? result.crossWords : []

  // Seuils en points pour chaque palier (même formule que computePearls côté serveur)
  const bestScore   = result.bestScore ?? 0
  const threeThres  = bestScore
  const twoThres    = Math.ceil(bestScore * 0.6)

  // Partage spoiler-free : pas de mot, pas de rack, juste date, %, perles, streak.
  async function handleShare() {
    const flag = { en: '🇬🇧', fr: '🇫🇷', es: '🇪🇸', de: '🇩🇪' }[language] ?? '🌐'
    // Médaille selon le tier de perles (3 = or, 2 = argent, 1 = bronze)
    const medal = result.pearlsEarned === 3 ? '🥇' : result.pearlsEarned === 2 ? '🥈' : result.pearlsEarned === 1 ? '🥉' : ''
    // Tuile colorée selon le tier (or/argent/bronze/échec), répétée sur la longueur du mot
    const tile = result.pearlsEarned === 3 ? '🟨' : result.pearlsEarned === 2 ? '⬜' : result.pearlsEarned === 1 ? '🟫' : '⬛'
    const wordTiles = tile.repeat(result.word?.length ?? 0)
    // Numéro du défi: jour 1 = 2026-04-19 (date de lancement), calculé en UTC pour éviter les décalages de fuseau
    const EPOCH_UTC = Date.UTC(2026, 3, 19)
    const [y, m, d] = date.split('-').map(Number)
    const dayNumber = Math.floor((Date.UTC(y, m - 1, d) - EPOCH_UTC) / 86400000) + 1
    const pct = result.bestScore > 0 ? Math.round((result.score / result.bestScore) * 100) : 0
    const text = [
      `Wordanza Daily #${dayNumber} ${flag}`,
      `${t('dailyChallenge.shareScore')} : ${result.score}/${result.bestScore}${medal ? ` ${medal}` : ''} (${pct}%)`,
      `${t('dailyChallenge.shareWord')} : ${wordTiles}`,
      `${t('dailyChallenge.shareStreak')} : ${dailyStreak} 🔥`,
      `https://wordanza.app/daily`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('dailyChallenge.shareCopied'))
    } catch {
      toast.error(t('dailyChallenge.shareFailed'))
    }
  }

  return (
    <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl text-center">
      <p className="text-slate-500 text-sm mb-1">{t('dailyChallenge.yourWord')}</p>
      <p className="text-3xl font-bold text-slate-100 tracking-wider">{result.word}</p>
      {myCrossWords.length > 0 && (
        <p className="text-slate-400 text-sm mb-4 tracking-wider">
          + {myCrossWords.join(', ')}
        </p>
      )}
      {myCrossWords.length === 0 && <div className="mb-4" />}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-slate-900/50 rounded-lg">
          <p className="text-2xl font-bold text-slate-100">{result.score}</p>
          <p className="text-slate-500 text-xs">{t('dailyChallenge.yourScore')}</p>
        </div>
        <div className="p-3 bg-slate-900/50 rounded-lg">
          <p className="text-2xl font-bold text-emerald-400">{result.bestScore}</p>
          <p className="text-slate-500 text-xs">{t('dailyChallenge.bestScore')}</p>
        </div>
      </div>

      {result.bestWord && (
        <p className="text-slate-500 text-sm mb-4">
          {t('dailyChallenge.bestWordReveal')}{' '}
          <span className="text-slate-200 font-semibold tracking-wider">{result.bestWord}</span>
          {bestCrossWords.length > 0 && (
            <span className="text-slate-500"> + <span className="text-slate-400 tracking-wider">{bestCrossWords.join(', ')}</span></span>
          )}
        </p>
      )}

      <div className={`text-4xl font-bold ${pearlsColor} mb-1`}>
        🦪 × {result.pearlsEarned}
      </div>
      <p className="text-slate-500 text-sm">{t('dailyChallenge.pearlsEarned')}</p>

      {/* Seuils de perles : affiche le nombre de points requis par palier */}
      <div className="mt-5 p-3 bg-slate-900/50 rounded-lg text-sm">
        <p className="text-slate-500 text-xs mb-2">{t('dailyChallenge.thresholdsTitle')}</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-amber-300 font-semibold">🦪 × 3</span>
            <span className="text-slate-300">{t('dailyChallenge.thresholdThree', { pts: threeThres })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-semibold">🦪 × 2</span>
            <span className="text-slate-300">{t('dailyChallenge.thresholdTwo', { pts: twoThres })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-amber-600 font-semibold">🦪 × 1</span>
            <span className="text-slate-300">{t('dailyChallenge.thresholdOne')}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleShare}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {t('dailyChallenge.shareResult')}
      </button>

      <p className="text-slate-600 text-xs mt-4">{t('dailyChallenge.comeBackTomorrow')}</p>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}
