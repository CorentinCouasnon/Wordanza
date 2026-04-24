// Bouton DEV partagé (GamePage, ShopPage, etc.).
// Visible uniquement pour les comptes avec `users.isDev = true`.
// Centraliser le style ici garantit une apparence identique partout.

export default function DevButton({ onClick, children, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 bg-amber-200 hover:bg-amber-300 border border-amber-400 text-amber-900 text-xs font-semibold rounded-lg transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

// Séparateur avec label "DEV", utilisé au-dessus des groupes de boutons DEV.
export function DevDivider({ label = 'DEV' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px bg-slate-600" />
      <span className="text-slate-500 text-xs uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-slate-600" />
    </div>
  )
}
