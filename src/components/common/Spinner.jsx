// Petit spinner SVG tournant, 3 tailles.
// aria-label pour les lecteurs d'écran.

const SIZES = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
}

export default function Spinner({ size = 'sm', className = '' }) {
  const sizeClass = SIZES[size] ?? SIZES.sm
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-current border-t-transparent animate-spin-slow ${sizeClass} ${className}`}
    />
  )
}
