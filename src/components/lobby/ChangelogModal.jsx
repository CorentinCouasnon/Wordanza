// ChangelogModal, journal des nouveautés du produit
//
// Liste anti-chronologique des mises à jour marquantes. Accessible via un bouton
// flottant en bas à droite du Lobby.
//
// Le contenu (titres + bullets) vit dans src/i18n.js sous `changelog.entries.<key>`.
// Ici on ne garde que la métadonnée structurelle: l'ordre et la date associée.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthContext } from '../../contexts/AuthContext'
import BugReportModal from '../common/BugReportModal'

// Liste ordonnée (plus récent en haut) des entrées du changelog.
// `key` correspond à la clé dans i18n: changelog.entries.<key>.title / .items
// `version` est affichée à la place de la date, incrémentée de 0.1 par entrée.
const ENTRIES = [
  { key: 'apr24', version: 'v1.0' },
  { key: 'apr22', version: 'v0.6' },
  { key: 'apr19', version: 'v0.5' },
  { key: 'apr18', version: 'v0.4' },
  { key: 'apr16', version: 'v0.3' },
  { key: 'apr14', version: 'v0.2' },
  { key: 'apr11', version: 'v0.1' },
]

// Handle Discord affiché dans l'onglet Crédits.
const DISCORD_HANDLE = 'krantt'
// Repo open source et licence affichés dans l'onglet Crédits.
const REPO_URL = 'https://github.com/CorentinCouasnon/Wordanza'
const LICENSE = 'MIT'

export default function ChangelogModal({ open, onClose }) {
  const { t } = useTranslation()
  const { user, profile } = useAuthContext()
  const [bugOpen, setBugOpen] = useState(false)
  // Onglet actif: 'updates' (changelog) ou 'credits'
  const [tab, setTab] = useState('updates')

  if (!open) return null

  return (
    // Backdrop, cliquer en dehors ferme la modal
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Panneau, stopPropagation pour éviter la fermeture au clic interne */}
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: onglets à gauche (tiennent lieu de titre), croix à droite */}
        <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex gap-1">
            {['updates', 'credits'].map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-2 text-lg font-bold rounded-t-lg transition-colors ${
                  tab === k
                    ? 'text-emerald-400 border-b-2 border-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t(`changelog.tabs.${k}`)}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 mb-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label={t('changelog.close')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {tab === 'credits' ? (
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
              <p>
                {/* Pseudo coloré dans madeBy pour faire ressortir l'auteur */}
                {(() => {
                  const raw = t('changelog.credits.madeBy', { handle: '{{handle}}' })
                  const [before, after] = raw.split('{{handle}}')
                  return (
                    <>
                      {before}
                      <span className="text-emerald-400 font-semibold">@{DISCORD_HANDLE}</span>
                      {after}
                    </>
                  )
                })()}
              </p>
              <p className="text-slate-400 text-xs italic">
                {t('changelog.credits.inspiredBy')}
              </p>

              {/* Ligne open source, le lien repo est rendu comme un vrai <a> */}
              <p className="text-slate-400 text-xs">
                {(() => {
                  const raw = t('changelog.credits.openSource', {
                    license: LICENSE,
                    repo: '{{repo}}',
                  })
                  const [before, after] = raw.split('{{repo}}')
                  return (
                    <>
                      {before}
                      <a
                        href={REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 underline"
                      >
                        GitHub
                      </a>
                      {after}
                    </>
                  )
                })()}
              </p>

              {/* Bloc dictionnaires, sources des dicos par langue */}
              <div>
                <h4 className="text-slate-200 text-xs font-semibold uppercase tracking-wider mb-2">
                  {t('changelog.credits.dictionariesTitle')}
                </h4>
                <ul className="space-y-0.5 ml-1">
                  {['en', 'fr', 'es', 'de'].map((lang) => (
                    <li key={lang} className="text-slate-400 text-xs leading-relaxed">
                      <span className="text-slate-600 mr-1.5">›</span>
                      {t(`changelog.credits.dictionaries.${lang}`)}
                    </li>
                  ))}
                </ul>
              </div>

              <p>
                {/* Pseudo neutre ici pour éviter la redondance visuelle */}
                {t('changelog.credits.lookingForHelp', { handle: `@${DISCORD_HANDLE}` })}
              </p>
            </div>
          ) : ENTRIES.map((entry) => {
            // returnObjects: true permet de récupérer le tableau d'items tel quel depuis i18n
            const items = t(`changelog.entries.${entry.key}.items`, { returnObjects: true }) ?? []
            return (
              <div key={entry.key} className="pl-4 border-l-2 border-emerald-700/40">
                <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                    {entry.version}
                  </span>
                  <h4 className="text-slate-200 text-sm font-semibold">
                    {t(`changelog.entries.${entry.key}.title`)}
                  </h4>
                </div>
                <ul className="space-y-0.5 ml-1">
                  {items.map((item, i) => (
                    <li key={i} className="text-slate-400 text-xs leading-relaxed">
                      <span className="text-slate-600 mr-1.5">›</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Footer, accès au rapport de bug, uniquement sur l'onglet Nouveautés */}
        {tab === 'updates' && (
          <div className="px-6 py-3 border-t border-slate-800 flex-shrink-0 text-center">
            <button
              onClick={() => setBugOpen(true)}
              className="text-slate-500 hover:text-slate-300 text-xs underline transition-colors"
            >
              {t('profile.reportBug')}
            </button>
          </div>
        )}
      </div>

      {bugOpen && (
        <BugReportModal
          user={user}
          displayName={profile?.displayName}
          onClose={() => setBugOpen(false)}
        />
      )}
    </div>
  )
}
