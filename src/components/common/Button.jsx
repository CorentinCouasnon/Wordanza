// Bouton standardisé avec état "loading".
// - loading=true → disabled + spinner + swap du label visible (mais garde
//   children pour les lecteurs d'écran via sr-only si loadingLabel fourni).
// - variant : 'primary' (emerald), 'secondary' (slate), 'danger' (red), 'ghost'
//
// Style volontairement simple, les composants existants ont souvent leurs
// propres classes Tailwind. Utiliser ce Button dans les nouveaux chemins
// et pour remplacer les patterns "disabled + '...'" qui fleurissent partout.

import Spinner from './Spinner'

const VARIANTS = {
  primary:   'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white',
  secondary: 'bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200',
  danger:    'bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white',
  ghost:     'bg-transparent hover:bg-slate-700/40 disabled:opacity-40 text-slate-300',
}

export default function Button({
  loading = false,
  loadingLabel,
  variant = 'primary',
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const variantClass = VARIANTS[variant] ?? VARIANTS.primary
  const isDisabled   = disabled || loading
  const label        = loading && loadingLabel ? loadingLabel : children

  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:cursor-not-allowed ${variantClass} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="xs" />}
      {label}
    </button>
  )
}
