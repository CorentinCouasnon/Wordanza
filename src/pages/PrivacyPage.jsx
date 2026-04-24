// Politique de confidentialité.
// Page statique, contenu dans src/i18n.js sous la clé `privacy`.
// Accessible publiquement via /privacy.

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

// Date de dernière mise à jour, à bumper quand on modifie le contenu
const LAST_UPDATED = '2026-04-24'

export default function PrivacyPage() {
  const { t, i18n } = useTranslation()
  // returnObjects: true pour récupérer le tableau de sections directement
  const sections = t('privacy.sections', { returnObjects: true }) ?? []
  // Formatte la date selon la langue active
  const formattedDate = new Date(LAST_UPDATED + 'T00:00:00').toLocaleDateString(
    i18n.language,
    { year: 'numeric', month: 'long', day: 'numeric' }
  )

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <div className="max-w-3xl mx-auto px-5 py-10">
        {/* Lien retour */}
        <Link
          to="/"
          className="text-emerald-400 hover:text-emerald-300 text-sm mb-6 inline-block"
        >
          {t('privacy.back')}
        </Link>

        <h1 className="text-3xl font-bold text-emerald-400 mb-2">
          {t('privacy.title')}
        </h1>
        <p className="text-slate-500 text-xs mb-6">
          {t('privacy.lastUpdated', { date: formattedDate })}
        </p>

        {/* Intro */}
        <p className="text-slate-300 text-sm leading-relaxed mb-8">
          {t('privacy.intro')}
        </p>

        {/* Sections: rendues depuis le tableau i18n */}
        <div className="space-y-6">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-slate-100 text-base font-semibold mb-2">
                {s.heading}
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
