// Mentions légales.
// Page statique, contenu dans src/i18n.js sous la clé `legal`.
// Accessible publiquement via /legal. Obligatoire en France (LCEN art. 6-III-1).

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function LegalPage() {
  const { t } = useTranslation()
  // returnObjects: true pour récupérer le tableau de sections directement
  const sections = t('legal.sections', { returnObjects: true }) ?? []

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <div className="max-w-3xl mx-auto px-5 py-10">
        {/* Lien retour */}
        <Link
          to="/"
          className="text-emerald-400 hover:text-emerald-300 text-sm mb-6 inline-block"
        >
          {t('legal.back')}
        </Link>

        <h1 className="text-3xl font-bold text-emerald-400 mb-6">
          {t('legal.title')}
        </h1>

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
