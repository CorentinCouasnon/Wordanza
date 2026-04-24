// Contexte React pour rendre l'état d'authentification accessible
// dans toute l'application sans prop drilling.
//
// Utilisation dans un composant :
//   const { user, profile, loading } = useAuthContext()

import { createContext, useContext } from 'react'
import { useAuth } from '../hooks/useAuth'

const AuthContext = createContext(null)

// Provider à placer à la racine de l'app (dans App.jsx)
export function AuthProvider({ children }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

// Hook raccourci pour consommer le contexte
export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used inside <AuthProvider>')
  }
  return context
}
