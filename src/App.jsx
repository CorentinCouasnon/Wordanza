// Point d'entrée de l'application React.
// Définit le routeur et enveloppe l'app dans le contexte d'authentification.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuthContext } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import HomePage from './pages/HomePage'
import LobbyPage from './pages/LobbyPage'
import GamePage from './pages/GamePage'
import ShopPage from './pages/ShopPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfilePage from './pages/PublicProfilePage'
import DailyChallengePage from './pages/DailyChallengePage'
import PrivacyPage from './pages/PrivacyPage'
import LegalPage from './pages/LegalPage'

// Composant racine : redirige vers le lobby si l'utilisateur est connecté via Google.
// Les utilisateurs anonymes (premier accès) voient la landing page.
function RootRedirect() {
  const { user, loading, isAnonymous } = useAuthContext()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <p className="text-slate-400">Loading Wordanza...</p>
      </div>
    )
  }

  // Utilisateur Google authentifié → aller directement au lobby
  if (user && !isAnonymous) return <Navigate to="/lobby" replace />

  return <HomePage />
}

// Protection des routes qui requièrent un compte: si l'utilisateur n'est
// pas connecté (ni invité ni Google), on le renvoie sur la landing page.
// Évite de créer un compte anonyme automatiquement quand un crawler
// ou un visiteur atteint directement une URL interne.
function RequireAuth({ children }) {
  const { user, loading } = useAuthContext()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <p className="text-slate-400">Loading Wordanza...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/lobby" element={<RequireAuth><LobbyPage /></RequireAuth>} />
          <Route path="/game/:gameId" element={<RequireAuth><GamePage /></RequireAuth>} />
          <Route path="/shop" element={<RequireAuth><ShopPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/u/:username" element={<PublicProfilePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/daily" element={<RequireAuth><DailyChallengePage /></RequireAuth>} />
          {/* Fallback : toute URL inconnue → lobby */}
          <Route path="*" element={<Navigate to="/lobby" replace />} />
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
