// Landing page, affichée aux visiteurs anonymes (premier accès).
// Les joueurs déjà connectés via Google sont redirigés vers le Lobby.

import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthContext } from '../contexts/AuthContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Carte pour une feature de la landing page
function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col gap-3">
      <span className="text-3xl">{icon}</span>
      <h3 className="text-slate-300 font-semibold text-lg">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

// Étape de la section "How it works"
function StepCard({ title, description }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
      <h3 className="text-slate-300 font-semibold text-base mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

// Bloc FAQ (question + réponse)
function FaqItem({ question, answer }) {
  return (
    <div className="border-b border-slate-700 py-4">
      <h3 className="text-slate-300 font-semibold text-base mb-1">{question}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{answer}</p>
    </div>
  )
}

export default function HomePage() {
  const { signInWithGoogle, signInAsGuest, signingIn } = useAuthContext()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useDocumentTitle(`Wordanza, ${t('home.tagline')}`)

  // Crée le compte anonyme seulement au clic sur un CTA (pas à la visite
  // de la landing page): évite de générer un compte par crawler ou rebond.
  async function playAsGuest() {
    try {
      await signInAsGuest()
      navigate('/lobby')
    } catch {
      // l'erreur est déjà loggée dans signInAsGuest
    }
  }

  async function goToDaily() {
    try {
      await signInAsGuest()
      navigate('/daily')
    } catch {
      // idem
    }
  }

  return (
    <div className="with-grid min-h-screen text-slate-300 flex flex-col">

      {/* Hero */}
      <main className="flex flex-col items-center justify-center px-4 py-16 gap-6 text-center">
        <div>
          <div className="flex items-center justify-center gap-4">
            <img src="/logo.png" alt="Wordanza logo" className="h-20 w-20 object-contain" />
            <h1 className="text-7xl font-black text-emerald-400 tracking-tight">Wordanza</h1>
          </div>
          <p className="text-slate-300 text-xl mt-3">
            {t('home.tagline')}
          </p>
        </div>

        <p className="text-slate-400 max-w-md text-base leading-relaxed">
          {t('home.description')}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full max-w-sm">
          <button
            onClick={playAsGuest}
            className="flex-1 py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
          >
            {t('home.playAsGuest')}
          </button>
          <button
            onClick={signInWithGoogle}
            disabled={signingIn}
            className="flex-1 py-3 px-6 bg-slate-400 hover:bg-slate-300 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingIn ? t('common.loading') : t('home.signInGoogle')}
          </button>
        </div>
        <p className="text-slate-500 text-xs">
          {t('home.signInHint')}
        </p>
      </main>

      {/* Features */}
      <section className="px-4 pb-12 max-w-3xl mx-auto w-full">
        <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-widest text-center mb-6">
          {t('home.featuresTitle')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            icon="⚔️"
            title={t('home.feature1Title')}
            description={t('home.feature1Desc')}
          />
          <FeatureCard
            icon="⚡"
            title={t('home.feature2Title')}
            description={t('home.feature2Desc')}
          />
          <FeatureCard
            icon="🦪"
            title={t('home.feature3Title')}
            description={t('home.feature3Desc')}
          />
        </div>
      </section>

      {/* Daily CTA: lien interne vers /daily (important pour le maillage SEO) */}
      <section className="px-4 pb-12 max-w-3xl mx-auto w-full">
        <div className="bg-gradient-to-br from-amber-100 to-orange-50 border border-amber-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-amber-950 font-bold text-xl mb-1">{t('home.dailyCtaTitle')}</h2>
            <p className="text-amber-900/80 text-sm">{t('home.dailyCtaDesc')}</p>
          </div>
          <button
            onClick={goToDaily}
            className="py-3 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors whitespace-nowrap"
          >
            {t('home.dailyCtaButton')}
          </button>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 pb-12 max-w-3xl mx-auto w-full">
        <h2 className="text-slate-300 text-2xl font-bold text-center mb-6">
          {t('home.howItWorksTitle')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StepCard title={t('home.howStep1Title')} description={t('home.howStep1Desc')} />
          <StepCard title={t('home.howStep2Title')} description={t('home.howStep2Desc')} />
          <StepCard title={t('home.howStep3Title')} description={t('home.howStep3Desc')} />
          <StepCard title={t('home.howStep4Title')} description={t('home.howStep4Desc')} />
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 pb-16 max-w-3xl mx-auto w-full">
        <h2 className="text-slate-300 text-2xl font-bold text-center mb-6">
          {t('home.faqTitle')}
        </h2>
        <div>
          <FaqItem question={t('home.faqQ1')} answer={t('home.faqA1')} />
          <FaqItem question={t('home.faqQ2')} answer={t('home.faqA2')} />
          <FaqItem question={t('home.faqQ3')} answer={t('home.faqA3')} />
          <FaqItem question={t('home.faqQ4')} answer={t('home.faqA4')} />
          <FaqItem question={t('home.faqQ5')} answer={t('home.faqA5')} />
        </div>
      </section>

      {/* Footer minimaliste, liens vers les pages légales */}
      <footer className="px-4 py-6 border-t border-slate-700 text-center space-x-4">
        <Link
          to="/privacy"
          className="text-slate-500 hover:text-slate-300 text-xs underline transition-colors"
        >
          {t('privacy.title')}
        </Link>
        <Link
          to="/legal"
          className="text-slate-500 hover:text-slate-300 text-xs underline transition-colors"
        >
          {t('legal.title')}
        </Link>
      </footer>

    </div>
  )
}
