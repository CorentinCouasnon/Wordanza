// Initialisation Firebase.
// Les clés sont lues depuis les variables d'environnement (.env).
// Ne jamais committer le fichier .env: utiliser .env.example comme modèle.

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialiser l'app Firebase
const app = initializeApp(firebaseConfig)

// En dev (localhost), activer le debug token App Check.
// Le token UUID est imprimé dans la console au premier chargement.
// l'ajouter dans Firebase Console → App Check → Manage debug tokens.
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

// App Check, vérifie que les requêtes viennent bien de l'app (anti-abus)
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
})

// Exporter Firestore, Auth et Functions pour utilisation dans les services/hooks
export const db        = getFirestore(app)
export const auth      = getAuth(app)
export const functions = getFunctions(app, 'europe-west4')

export default app
