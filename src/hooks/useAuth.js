// Main hook for Firebase authentication.
//
// Handles:
// - Explicit anonymous sign-in on demand (signInAsGuest): appelé depuis
//   les CTA "Jouer en invité" / "Défi quotidien" uniquement, pour éviter
//   de créer un compte à chaque visite de la landing page (crawlers, bots).
// - Google sign-in (optional, lets the user recover their account)
// - Sign-out
// - Firestore profile creation on first login
// - Live subscription to the Firestore profile: any server-side write
//   (Cloud Function, shop purchase, daily challenge, onGameEnd) est
//   reflété instantanément dans l'UI sans refresh manuel.
//
// Usage:
//   const { user, profile, loading, signInWithGoogle, signOut } = useAuth()

import { useState, useEffect, useRef } from 'react'
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  linkWithPopup,
  linkWithRedirect,
} from 'firebase/auth'
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { randomAvatarIndex } from '../constants/AVATARS'

const googleProvider = new GoogleAuthProvider()

export function useAuth() {
  const [user, setUser] = useState(null)       // Firebase Auth user object
  const [profile, setProfile] = useState(null) // Firestore player profile (live)
  const [loading, setLoading] = useState(true) // true during initialization

  // Unsubscriber courant de l'écoute onSnapshot sur users/{uid}.
  // Conservé dans une ref pour pouvoir nettoyer lors des changements d'utilisateur
  // ou au signOut (évite "permission-denied" après déconnexion).
  const profileUnsubRef = useRef(null)

  useEffect(() => {
    // Handle the return from a Google redirect (after the browser comes back)
    getRedirectResult(auth).catch((error) => {
      if (error.code === 'auth/credential-already-in-use') {
        // Google account already linked to another UID - sign in directly
        const credential = GoogleAuthProvider.credentialFromError(error)
        if (credential) {
          signInWithCredential(auth, credential)
        }
      } else if (error.code) {
        console.error('Redirect sign-in failed:', error)
      }
    })

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Nettoie l'écoute précédente (changement d'utilisateur ou signOut)
      if (profileUnsubRef.current) {
        profileUnsubRef.current()
        profileUnsubRef.current = null
      }

      if (firebaseUser) {
        setUser(firebaseUser)
        // S'assurer que le document existe (création au premier login)
        // ou mettre à jour authProvider si l'utilisateur vient de lier Google.
        await ensureProfile(firebaseUser)
        // Abonnement live au profil: toute écriture serveur remonte ici.
        const userDocRef = doc(db, 'users', firebaseUser.uid)
        profileUnsubRef.current = onSnapshot(
          userDocRef,
          (snap) => {
            if (snap.exists()) setProfile(snap.data())
            setLoading(false)
          },
          (err) => {
            // Erreur de permission après signOut par exemple: on ignore
            console.error('Profile snapshot error:', err)
            setLoading(false)
          }
        )
      } else {
        // Pas de connexion automatique: on laisse l'utilisateur visiter la
        // landing page sans créer de compte. signInAsGuest() sera appelé
        // explicitement depuis les CTA.
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      unsubscribe()
      if (profileUnsubRef.current) {
        profileUnsubRef.current()
        profileUnsubRef.current = null
      }
    }
  }, [])

  /**
   * S'assure que le document Firestore du joueur existe.
   * - S'il n'existe pas: crée le profil avec les valeurs par défaut.
   * - S'il existe et que le compte vient d'être lié à Google: met à jour
   *   authProvider et displayName.
   * Ne met pas à jour le state local: c'est l'écoute onSnapshot qui s'en charge.
   */
  async function ensureProfile(firebaseUser) {
    const userDocRef = doc(db, 'users', firebaseUser.uid)
    const snapshot = await getDoc(userDocRef)

    if (snapshot.exists()) {
      const data = snapshot.data()
      if (data.authProvider === 'anonymous' && !firebaseUser.isAnonymous) {
        await setDoc(userDocRef, {
          authProvider: 'google',
          displayName: firebaseUser.displayName || data.displayName,
        }, { merge: true })
      }
      return
    }

    // First login: create the profile with default values
    const newProfile = {
      displayName: firebaseUser.displayName || `Player_${firebaseUser.uid.slice(0, 5)}`,
      authProvider: firebaseUser.isAnonymous ? 'anonymous' : 'google',
      avatarIndex: randomAvatarIndex(),
      pearls: 0,
      totalSkillPoints: 0,
      skills: {
        speed: 0,
        creativity: 0,
        wisdom: 0,
      },
      unlockedPowerups: [],
      extraGameSlots: 0,
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        totalPearlsEarned: 0,
      },
      language: navigator.language?.startsWith('fr') ? 'fr' : 'en',
      createdAt: serverTimestamp(),
    }

    await setDoc(userDocRef, newProfile)
  }

  /**
   * Signs in with Google.
   * Tries popup first. If the browser blocks the popup,
   * automatically falls back to redirect-based sign-in.
   * Guard against multiple concurrent calls (double-click, etc.)
   */
  const [signingIn, setSigningIn] = useState(false)

  async function signInWithGoogle() {
    if (signingIn) return  // already in progress, ignore extra clicks
    setSigningIn(true)
    try {
      if (user?.isAnonymous) {
        await linkWithPopup(user, googleProvider)
      } else {
        await signInWithPopup(auth, googleProvider)
      }
    } catch (error) {
      // Popup blocked by the browser - fall back to redirect
      if (error.code === 'auth/popup-blocked') {
        if (user?.isAnonymous) {
          await linkWithRedirect(user, googleProvider)
        } else {
          await signInWithRedirect(auth, googleProvider)
        }
        return
      }
      // Google account already linked to another UID -
      // reuse the credential from the popup error to sign in directly
      if (error.code === 'auth/credential-already-in-use') {
        const credential = GoogleAuthProvider.credentialFromError(error)
        if (credential) {
          await signInWithCredential(auth, credential)
        } else {
          // Rare fallback: no credential recoverable from error
          await signInWithPopup(auth, googleProvider)
        }
      } else {
        console.error('Google sign-in failed:', error)
        throw error
      }
    } finally {
      setSigningIn(false)
    }
  }

  /**
   * Connexion invité explicite: crée un compte anonyme Firebase Auth.
   * Appelée depuis les CTA "Jouer en invité" et "Défi quotidien".
   * onAuthStateChanged se chargera ensuite de créer le profil Firestore.
   */
  async function signInAsGuest() {
    if (user) return user // déjà connecté (anonyme ou Google)
    try {
      const cred = await signInAnonymously(auth)
      return cred.user
    } catch (error) {
      console.error('Failed to sign in as guest:', error)
      throw error
    }
  }

  /**
   * Signs out. Aucune re-connexion automatique: l'utilisateur retombe
   * sur la landing page jusqu'à ce qu'il clique à nouveau sur un CTA.
   */
  async function signOut() {
    // Désabonner AVANT le signOut pour éviter une erreur "permission-denied"
    // transitoire de l'écoute Firestore sur un utilisateur déconnecté.
    if (profileUnsubRef.current) {
      profileUnsubRef.current()
      profileUnsubRef.current = null
    }
    await firebaseSignOut(auth)
    setUser(null)
    setProfile(null)
  }

  return {
    user,           // Firebase Auth user (uid, isAnonymous, etc.)
    profile,        // Firestore profile (live via onSnapshot)
    loading,        // true during initialization
    signingIn,      // true while Google sign-in popup is open
    signInWithGoogle,
    signInAsGuest,
    signOut,
    isAnonymous: user?.isAnonymous ?? true,
  }
}
