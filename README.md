# Wordanza

Un jeu de mots multijoueur asynchrone, avec des power-ups. Pose des mots sur une grille 19×19, améliore tes compétences et des utilise des capacités pour prendre l'avantage sur ton adversaire.

**Stack** : React 19 + Vite + Tailwind CSS v4 + Firebase (Firestore, Auth, Hosting, Cloud Functions).

**Langues supportées** : Français, Anglais, Espagnol, Allemand.

---

## Fonctionnalités

- **Parties multijoueur asynchrones** en temps réel (Firestore onSnapshot)
- **Matchmaking automatique** avec tolérance de handicap et filtre de langue
- **Bots** joués côté serveur quand personne n'est trouvé
- **Défi quotidien** (1 grille par jour par langue, classement par score)
- **Power-ups** (Bouclier, Binoculars, Switcheroo, Poubelle, etc.)
- **Système de progression** : skill points, handicap ajustable, slots de parties simultanées
- **Chat en partie**, notifications, onboarding guidé
- **App Check (reCAPTCHA Enterprise)** pour bloquer les requêtes hors-app

---

## Architecture

```
src/
  components/      UI components (lobby, game, common, onboarding)
  pages/           Routes (Lobby, Game, Profile, DailyChallenge...)
  hooks/           Logique réutilisable (useGame, useAuth, useMatchmaking, useDictionary)
  services/        Appels Firestore et Cloud Functions (gameService, userService...)
  contexts/        Auth, Toasts
  constants/       Constantes de jeu (POWERUPS, LETTERS, SKILLS...)
  firebase/        Initialisation Firebase + App Check
  utils/           Helpers (validation plateau, scoring, temps)

functions/         Cloud Functions (validateWord, gameAction, matchmaking,
                   playBotTurns, dailyChallenge, onGameEnd...)

public/
  dictionaries/    Dictionnaires de mots par langue
```

**Modèle server-authoritative** : toute action sensible (validation de mot, achat, action bot) passe par une Cloud Function qui revalide. Le client ne fait que l'UI et l'état transitoire (draft, rack local).

Voir [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md) pour le schéma Firestore détaillé, les formules de scoring et les règles de jeu.

---

## Licence

[MIT](LICENSE)
