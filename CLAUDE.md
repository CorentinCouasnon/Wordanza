# CLAUDE.md: Wordanza

Lis ce fichier au début de chaque session. Il contient tout ce qu'il faut pour te remettre dans le contexte du projet.

---

## Le projet

**Wordanza** est un jeu de mots multijoueur asynchrone, avec des power-ups. Stack : React 18 + Vite + Tailwind CSS v4 + Firebase (Firestore, Auth, Hosting, Cloud Functions).

- **TECHNICAL_SPEC.md**: schéma Firestore, formules, règles de jeu, cas limites

---

## Règles de développement

- **Commente le code** pour expliquer la logique non évidente
- Ne pas ajouter de fonctionnalités hors scope de la demande
- Ne pas créer de fichiers inutiles
- Préférer éditer un fichier existant plutôt qu'en créer un nouveau
- Pas d'emojis dans le code sauf si demandé
- Réponses courtes et directes

---

## Stack et conventions

- **Tailwind CSS v4** via `@tailwindcss/vite`: pas de `tailwind.config.js`
- **React Router v6**: routes dans `src/App.jsx`
- **Firebase** initialisé dans `src/firebase/config.js`, variables dans `.env` (jamais committé)
- Chemins d'import avec `src/` comme racine (alias `@` non configuré)
- Langue du code : **anglais** (noms de variables, commentaires dans le code)
- Langue des échanges avec l'utilisateur : **français**

---

## Modèle de données: tuiles

Une tuile existe à **un seul endroit** à la fois :

```javascript
rack     // [{ id, letter } | null, ...] , tableau fixe, les slots vides sont null
draft    // { "row_col": { id, letter } }: tuiles posées, non encore validées
board    // { "row_col": { letter, playedBy } }: tuiles validées, permanentes
selected // { source: 'rack', index } | { source: 'draft', key } | null
```

---

## Règles du jeu (résumé)

- Plateau 19×19, centre (9,9), bordure = lignes/colonnes 0 et 18
- Premier mot : doit passer par le centre
- Mots suivants : doivent s'appuyer sur des lettres existantes
- Toucher un bord → reset du plateau (les lettres disparaissent)
- **Score** : `existingLetters + NEW_LETTER_BONUS[newLetters]` (bonus quadratique jusqu'à 8, +10/lettre ensuite)
- **PA** : départ 160 + wisdom×20, regen 1/min, max 500, pioche coûte 20 − speed
- **Handicap** (score cible) : 250 pts à 0 skill points → 650 pts à 30 skill points

---

## Points d'attention

- Les dictionnaires (`public/dictionaries/{en,fr,es,de}.json`) sont committés dans le repo. Ils sont copiés automatiquement vers `functions/dictionaries/` au déploiement (predeploy dans `firebase.json`). Pour les régénérer à partir d'un .txt : `node scripts/convert-dict.js <input.txt> public/dictionaries/<lang>.json`
- Les règles Firestore sont dans `firestore.rules`
- Le `.env` ne se committe jamais, template dans `.env.example`
- Les power-ups sont définis dans `src/constants/POWERUPS.js`: la Poubelle (`trash`) est toujours disponible sans achat
- `devAddScore` dans `gameService.js` est un bypass de développement, conditionné sur `users.isDev` (champ à poser manuellement en Firestore)
- **isDev** : champ booléen `users/{uid}.isDev` à mettre à `true` manuellement: active les boutons DEV (Force start, +pts, Manual game creation)
- La validation de mots vérifie aussi les mots croisés perpendiculaires (`crossWords[]` dans `wordData`): validés côté client dans `useGame` + recalculés côté serveur dans la Cloud Function `validateWord`
- **Connexion au plateau** : un placement est valide si une lettre posée est inline avec une lettre existante OU adjacente perpendiculairement: vérifier `isAdjacentToExisting` dans `boardValidation.js`
- **Pénalité bord** : -10 pts prélevés sur la cagnotte totale du joueur (`score + rawPoints - 10`), pas soustraits des points du mot en cours
- **Double-clic** sur tuile draft (board) → retour au premier slot vide du rack (`handleCellDoubleClick` dans `useGame.js`)
- **Matchmaking** : `src/services/matchmakingService.js` + `src/hooks/useMatchmaking.js`: le client rejoint/quitte la file et observe sa taille ; la création de partie et le bot-fill sont gérés par les Cloud Functions (`onMatchmakingJoin` + `matchmakingBotFill`): tolérance handicap = 100 pts, filtre langue côté serveur: nécessite un index composite Firestore `(language ASC, joinedAt ASC)`: `MAX_WAIT_MS = 60 min` + `SCHEDULE_BUFFER_MS = 10 min` pour l'ETA affiché
- **Bots** : joués côté serveur par `functions/playBotTurns.js` (scheduled toutes les 2h, un bot par partie en round-robin déterministe via `cycleIndex % bots.length`). La logique de recherche de mot (`findBotMove`) vit dans `functions/botLogic.js`. Nécessite un index composite Firestore `(status ASC, hasBots ASC)`.
- **Cloud Functions** : dossier `functions/`: `validateWord` (callable, validation humaine), `buyItem` (callable, achats), `onGameEnd` (trigger fin de partie), `matchmakingBotFill` (scheduled 10 min), `onMatchmakingJoin` (trigger file), `finishInactiveGames` (scheduled 6h), `playBotTurns` (scheduled 2h). Chargement des dictionnaires partagé via `functions/dictionary.js`.
- **PA** : `computeNewAP` préserve la fraction de minute (`lastApUpdate = now - remainingMs`) pour éviter la dérive entre joueurs
- **Langue** : stockée dans `users.language`, modifiable dans ProfilePage: affecte la file de matchmaking et le dictionnaire. Le dictionnaire utilisé en partie est celui de `gameDoc.language` (pas du profil individuel)
- **Switcheroo** : rejeté si les deux joueurs ont des `handSize` différents (compétence Imagination asymétrique)
- **Chat** : `src/components/game/GameChat.jsx`: sous-collection `games/{gameId}/chat`, max 20 messages, scroll automatique, uniquement en mode multijoueur
- **Règles Firestore `games`** : l'update sur une partie `waiting` par un non-participant est autorisé UNIQUEMENT s'il s'ajoute à `playerIds[]` (join legit). Éviter d'écrire sur une partie `waiting` sans d'abord y rejoindre.
- **Anti-double-clic power-up** : `usingPowerupRef` dans `useGame` empêche deux clics rapides de déduire deux fois les PA: toute nouvelle action avec dépense AP devrait utiliser le même pattern
- **Binoculars atomique** : `binocularsTransaction` dans `gameService.js` (ne pas revenir à `updatePlayerHand` + `deactivateShield` séparés: désync possible si la cible désactive son bouclier entre les deux appels)
- **Timestamps** : utiliser `toMs()` de `src/utils/time.js` pour normaliser les timestamps Firestore (number | Timestamp | null → ms)
- **Slots de parties simultanées** : `users.extraGameSlots` (0..19) → max parties simultanées = 1 + extraGameSlots (jusqu'à 20). Achat via `buyItem` type `gameSlot` (coût fixe 2000 Pearls). Limite enforced dans `gameService.hasReachedSlotLimit` (createGame + joinGame) et dans LobbyPage (désactive le bouton matchmaking). Constantes : `src/constants/GAME_SLOTS.js` + miroir dans `functions/constants.js`.
- **Défi quotidien** : `functions/dailyChallenge.js` (scheduled `generateDailyChallenge` TZ `Europe/Paris` + callable `submitDailyChallenge`), `functions/dailyChallengeGen.js` (PRNG mulberry32 seedé sur `date_lang` + simulation bot), `functions/dailyChallengeSolver.js` (dict-driven, trouve le meilleur mot). Docs : `dailyChallenges/{YYYY-MM-DD}_{lang}` (lecture publique, écrit par Admin SDK) et `users/{uid}/dailyResults/{YYYY-MM-DD}`. Verrou cross-langues via `users.lastDailyDate`. Tiers : 100% = 3 perles, ≥ 60% = 2, sinon 1. Streak reset à 1 si un jour est sauté. Fuite acceptée de `bestWord` dans le doc public (simplicité).
