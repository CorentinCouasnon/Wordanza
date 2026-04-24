# TECHNICAL SPEC: Wordanza

---

## 1. Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v4 |
| Routage | React Router v6 |
| Base de données | Firebase Firestore |
| Authentification | Firebase Auth (anonyme + Google) |
| Hébergement | Firebase Hosting (plan Blaze) |
| Backend | Firebase Cloud Functions v2 (Node 20): matchmaking, validation, achats, fin de partie |

---

## 2. Structure des dossiers

```
wordanza/
├── public/
│   ├── dictionaries/
│   │   ├── en.json          # Dictionnaire anglais (généré via scripts/convert-dict.js)
│   │   └── fr.json          # Dictionnaire français (à venir)
│   └── items/               # GIFs des power-ups
│
├── scripts/
│   └── convert-dict.js      # Convertit words_alpha.txt → en.json
│
├── src/
│   ├── components/
│   │   ├── game/
│   │   │   ├── Board.jsx            # Grille 19×19
│   │   │   ├── BoardCell.jsx        # Une case du plateau
│   │   │   ├── LetterTile.jsx       # Tuile lettre (rack + plateau)
│   │   │   ├── PlayerHand.jsx       # La réglette (main du joueur)
│   │   │   ├── PlayerList.jsx       # Liste des joueurs + scores + PA
│   │   │   ├── ScoreDisplay.jsx     # Score actuel / score cible
│   │   │   ├── MovePreview.jsx      # Estimation des points avant validation
│   │   │   └── PowerupBar.jsx       # Barre de power-ups en partie
│   │
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── LobbyPage.jsx            # Parties en cours + recherche de partie
│   │   ├── GamePage.jsx             # WaitingRoom / plateau / EndScreen
│   │   ├── ShopPage.jsx
│   │   └── ProfilePage.jsx
│   │
│   ├── hooks/
│   │   ├── useAuth.js           # Gestion de l'état d'authentification
│   │   ├── useGame.js           # Logique de jeu multijoueur + sync Firestore
│   │   ├── useMatchmaking.js    # Rejoindre/observer la file de matchmaking
│   │   ├── useAP.js             # Calcul temps réel des PA
│   │   └── useDictionary.js     # Chargement et validation du dictionnaire
│   │
├── functions/                       # Cloud Functions Firebase (Node 20)
│   ├── index.js                     # Point d'entrée, exporte toutes les fonctions
│   ├── matchmaking.js               # onMatchmakingJoin + matchmakingBotFill
│   ├── onGameEnd.js                 # Trigger fin de partie (Pearls + stats)
│   ├── finishInactiveGame.js        # Scheduled 6h, clôture les parties inactives 24h
│   ├── playBotTurns.js              # Scheduled 2h, joue un coup pour un bot par partie
│   ├── validateWord.js              # Callable, validation mot côté serveur
│   ├── buyItem.js                   # Callable, achats sécurisés (skills, power-ups)
│   ├── constants.js                 # Copies serveur des constantes de jeu
│   ├── boardHelpers.js              # Port serveur de scoring.js + boardValidation.js
│   ├── botLogic.js                  # Recherche de coup pour les bots (findBotMove)
│   └── dictionary.js                # Chargement + cache des dictionnaires
│
├── src/
│   ├── services/
│   │   ├── gameService.js           # CRUD parties + transactions Firestore
│   │   ├── userService.js           # Profil joueur (pseudo, langue, Pearls dev)
│   │   └── matchmakingService.js    # Rejoindre/quitter/observer la file
│   │
│   ├── utils/
│   │   ├── scoring.js           # Formule de calcul des points
│   │   ├── handicap.js          # Table handicap + calcul du score cible
│   │   ├── boardValidation.js   # Validation du placement d'un mot
│   │   ├── ap.js                # Calcul des PA (getCurrentAP, computeNewAP)
│   │   └── time.js              # Helper toMs (normalise Timestamp Firestore / number)
│   │
│   ├── constants/
│   │   ├── POWERUPS.js
│   │   ├── SKILLS.js
│   │   └── LETTERS.js           # Distribution des lettres EN/FR
│   │
│   ├── contexts/
│   │   └── AuthContext.jsx
│   │
│   ├── firebase/
│   │   └── config.js
│   │
│   ├── App.jsx
│   └── main.jsx
│
├── .env
├── .env.example
├── firebase.json
├── firestore.rules
└── vite.config.js
```

---

## 3. Modèle de données: Tuiles (Phase 1)

Le modèle garantit qu'une tuile existe à **un seul endroit** à la fois.

```
rack  : [{ id, letter } | null, ...]  , tableau de taille fixe (handSize slots)
draft : { "row_col": { id, letter } } , tuiles posées sur le plateau, non validées
board : { "row_col": { letter, playedBy } }: tuiles validées, permanentes
selected : { source: 'rack', index } | { source: 'draft', key } | null
```

- Quand une tuile est placée sur le plateau → son slot rack devient `null`
- Quand une tuile est retirée du plateau → elle revient dans le premier slot `null` du rack
- L'ID unique (`t${n}`) permet de tracer chaque tuile sans ambiguïté

---

## 4. Schéma de données Firestore (Phase 2+)

### Collection `users`

```
users/{userId}
├── displayName        : string
├── authProvider       : string       , "anonymous" | "google"
├── pearls             : number       , Monnaie du jeu (🦪)
├── totalSkillPoints   : number       , Somme speed+creativity+wisdom (0-30)
├── skills
│   ├── speed          : number       , Rapidité (0-10) : -1 PA/pioche par niveau
│   ├── creativity     : number       , Imagination (0-10) : +1 slot réglette par niveau
│   └── wisdom         : number       , Sagesse (0-10) : +20 PA de départ par niveau
├── unlockedPowerups   : string[]     , Power-ups achetés ("trash" toujours dispo)
├── stats
│   ├── gamesPlayed    : number
│   ├── gamesWon       : number
│   └── totalPearlsEarned : number
├── language           : string       , "en" | "fr"
└── createdAt          : timestamp

```

### Collection `games`

```
games/{gameId}
├── status             : string       , "waiting" | "active" | "finished"
├── language           : string       , "en" | "fr"
├── boardVersion       : number       , Verrou optimiste (incrémenté à chaque mot validé)
├── board              : map          , { "row_col": { letter, playedBy } }
├── lastWords          : array        , 10 derniers mots posés
│   └── [{ word, playedBy, displayName, points, timestamp }]
├── playerIds          : string[]     , UIDs des joueurs (pour les Security Rules)
├── createdAt          : timestamp
├── startedAt          : timestamp | null
├── lastMoveAt         : timestamp
├── finishedAt         : timestamp | null
│
└── players            : array
    └── {
        userId, displayName,
        score          : number,
        targetScore    : number,      , Handicap calculé au démarrage
        apStored       : number,
        lastApUpdate   : number,      , ms epoch (number, pas Timestamp) pour l'arithmétique
        hand           : string[],    , Lettres en main (visibles → Jumelles)
        handSize       : number,      , 6 + niveau creativity
        finished           : boolean,
        rank               : number | null,
        finishedAt         : number | null, , ms epoch
        pearlsDistributed  : boolean,       , flag idempotent pour distributePlayerPearls
        shieldActive       : boolean,       , true tant que le Bouclier est actif
        powerupUsage       : map,           , { [powerupId]: boolean | number }
                                               boolean si usesPerGame===1, number si >1
    }

- Note : playerIds[] et players[] sont maintenus en sync.
  playerIds existe uniquement pour les Security Rules (array-contains sur objets non supporté).
  La partie démarre automatiquement quand players.length atteint 5.
  lastApUpdate est réinitialisé pour tous les joueurs au moment du startedAt.
```

### Collection `matchmaking`

```
matchmaking/{userId}
├── userId, displayName
├── handicap       : number
├── language       : string
└── joinedAt       : timestamp
```

- Écrit par le client via `enterQueue()` ; supprimé par la Cloud Function lors de la création de partie
- La Cloud Function `onMatchmakingJoin` s'y abonne pour tenter le match ; `matchmakingBotFill` la purge après `MAX_WAIT_MS`

---

## 5. Compétences et coûts

| Compétence | Effet | Coût niveau n |
|---|---|---|
| Rapidité (speed) | -1 PA par pioche par niveau | 10×n² Pearls |
| Imagination (creativity) | +1 slot réglette par niveau | 10×n² Pearls |
| Sagesse (wisdom) | +20 PA de départ par niveau | 10×n² Pearls |

Coûts par niveau : 10, 40, 90, 160, 250, 360, 490, 640, 810, 1000 Pearls

---

## 6. Handicap (score cible)

| Total skill points | Score cible |
|---|---|
| 0 | 250 |
| 3 | 280 |
| 6 | 310 |
| 9 | 340 |
| 12 | 370 |
| 15 | 400 |
| 18 | 450 |
| 21 | 490 |
| 24 | 530 |
| 27 | 590 |
| 30 | 650 |

---

## 7. Formule de score

```
score = existingLetters + NEW_LETTER_BONUS[newLetters]

NEW_LETTER_BONUS = [0, 1, 4, 9, 16, 25, 36, 49, 64, 74, 84, 94, 104, 114, 124]
                       1  2  3   4   5   6   7   8   9  10  11   12   13   14

Au-delà de 8 nouvelles lettres : +10 par lettre supplémentaire.
```

---

## 8. Points d'action (PA)

- Départ : 160 + wisdom × 20
- Régénération : 1 PA/minute
- Maximum : 500
- Coût pioche : 20 − speed (minimum 1)
- Calcul côté client : `min(500, apStored + floor((now − lastApUpdate) / 60000))`

---

## 9. Power-ups

Les valeurs ci-dessous correspondent à `src/constants/POWERUPS.js` (source de vérité).

| Nom | Coût shop | PA | Utilisations | Description |
|---|---|---|---|---|
| Poubelle (trash) | Gratuit (défaut) | 0 | ∞ | Jeter toutes ses lettres |
| Jumelles (binoculars) | 10 🦪 | 5 | ∞ | Voir la main d'un adversaire · bloqué par Bouclier |
| Recyclage (recycle) | 10 🦪 | 15 | ∞ | Échanger une lettre sélectionnée contre une aléatoire |
| Voyelle (vowel) | 20 🦪 | 25 | ∞ | Piocher une voyelle aléatoire |
| Consonne (consonant) | 20 🦪 | 25 | ∞ | Piocher une consonne aléatoire |
| Boost | 50 🦪 | 0 | 1/partie | Ajouter 3 lettres aléatoires (nécessite 3 slots libres) |
| Vol (steal) | 80 🦪 | 30 | 3/partie | Prendre une lettre aléatoire à un adversaire · bloqué par Bouclier |
| Tornade (twister) | 200 🦪 | 0 | 1/partie | Remplacer toutes ses lettres par de nouvelles |
| Révolution (switcheroo) | 500 🦪 | 0 | 1/partie | Échanger sa main avec un adversaire · bloqué par Bouclier |
| Joker | 1000 🦪 | 0 | 1/partie | Choisir n'importe quelle lettre |
| Bouclier (shield) | 1000 🦪 | 30 | 1/partie* | Protéger contre Jumelles, Vol et Révolution pour toute la partie |

*Le Bouclier reste actif jusqu'à la fin de la partie une fois activé (pas de durée limitée).

Power-ups ciblés (nécessitent de choisir un adversaire) : Jumelles, Vol, Révolution.
Power-ups bloqués par le Bouclier (`SHIELDABLE_POWERUPS`) : Jumelles, Vol, Révolution.

---

## 10. Résolution de conflits Firestore

### Humains: via Cloud Function `validateWord`
```
1. Client envoie draftEntries + boardVersion + remainingHand
2. Cloud Function relit le board depuis Firestore
3. Transaction Firestore :
   a. Re-lire boardVersion
   b. Si boardVersion ≠ valeur envoyée → ÉCHEC
   c. Valide le mot + recalcule le score côté serveur
   d. Écrire board + boardVersion+1 + score + PA + lastMoveAt
4. ÉCHEC → "Le plateau a été modifié, vérifiez votre mot"
```

### Bots: via scheduled function `playBotTurns`
```
Scheduled Cloud Function (europe-west4, toutes les 2h) :
1. Query games: status == 'active' AND hasBots == true
   (index composite requis: (status ASC, hasBots ASC))
2. Pour chaque partie, round-robin déterministe :
   botIndex = Math.floor(Date.now() / 7_200_000) % bots.length
3. Le bot sélectionné tente findBotMove (même algorithme que l'ancien client)
   a. Trouve un mot → transaction qui applique le coup (même logique que validateWord)
   b. Pas de mot → transaction qui pioche une lettre si assez de PA
4. boardVersion protège contre un humain qui jouerait en même temps (si le plateau
   a bougé entre la lecture initiale et la transaction, le tour est abandonné,
   le prochain cycle réessaiera)

Coût : ~1 read + ~N writes toutes les 2h, négligeable sur le free tier.
Le client n'a plus aucune logique bot.
```

---

## 11. Dictionnaire

- Format : tableau JSON de mots en majuscules, chargé en `Set` en mémoire
- Côté client : `fetch('/dictionaries/en.json')` au démarrage, utilisé pour la prévisualisation temps réel
- Côté serveur : chargé depuis `functions/dictionaries/` au cold start, mis en cache dans `dictCache`
- Validation : `dictionary.has(word)`: O(1)
- Génération : `node scripts/convert-dict.js words_alpha.txt public/dictionaries/en.json`
- Déploiement : script `predeploy` dans `firebase.json` copie les fichiers vers `functions/dictionaries/`

---

## 12. Distribution des lettres

### Anglais
```
A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1, K:1, L:4, M:2,
N:6, O:8, P:2, Q:1, R:6, S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1
```

### Français
```
A:9, B:2, C:2, D:3, E:15, F:2, G:2, H:2, I:8, J:1, K:1, L:5, M:3,
N:6, O:6, P:2, Q:1, R:6, S:6, T:6, U:6, V:2, W:1, X:1, Y:1, Z:1
```

---

## 13. Règles Firestore

```javascript
match /users/{userId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == userId;
}
match /games/{gameId} {
  allow read: if request.auth != null;
  // Création : le créateur doit être dans playerIds[]
  allow create: if request.auth != null
                && request.auth.uid in request.resource.data.playerIds;
  // Mise à jour : deux cas seulement
  //   1. Déjà participant (anti-triche géré par les transactions et validateWord)
  //   2. Join legit sur partie "waiting" : on s'ajoute à playerIds[]
  // L'ancienne règle permettait à TOUT utilisateur authentifié d'écrire sur une
  // partie "waiting", gros trou empêché désormais.
  allow update: if request.auth != null
                && (
                  request.auth.uid in resource.data.playerIds
                  || (
                    resource.data.status == 'waiting'
                    && !(request.auth.uid in resource.data.playerIds)
                    && request.auth.uid in request.resource.data.playerIds
                  )
                );
  match /chat/{messageId} {
    allow read: if request.auth != null;
    allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    allow update, delete: if false;
  }
}
match /matchmaking/{userId} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null && request.auth.uid == userId;
  // Le delete est restreint au propriétaire : la Cloud Function utilise l'Admin SDK
  // pour supprimer les entrées des autres joueurs lors de la création de partie.
  allow delete: if request.auth != null && request.auth.uid == userId;
}

// Note : playerIds[] (string[]) est utilisé à la place de players[].map(p => p.userId)
// car les Security Rules Firestore ne supportent pas .map() sur des tableaux d'objets.
```

---

## 14. Cas limites

| Cas | Comportement |
|---|---|
| Deux joueurs valident en même temps | Transaction : le premier gagne, le second voit un message d'erreur |
| Joueur déconnecté | Aucun impact (jeu asynchrone), PA régénérés pendant l'absence |
| Partie inactive 24h | Cloud Function `finishInactiveGames` (scheduled 6h) clôture la partie ; le client appelle aussi `finishInactiveGame()` à l'ouverture comme filet de sécurité: transaction idempotente |
| Bord touché | Board reset + message d'avertissement |
| Première lettre hors centre | Validation bloquée |
| Mot non connecté au plateau | Validation bloquée (sauf premier mot) |
| Réglette pleine lors d'une pioche | Bloqué avec message |
| Vol sur joueur avec Bouclier | Bloqué avec message "Ce joueur est protégé" |
| PA max 500 | `Math.min(500, calculatedAP)` toujours appliqué |
| Switcheroo entre joueurs de handSize différents | Rejeté avec message: évite de donner plus de lettres que la taille du rack |
| Double distribution de Pearls | `pearlsDistributed` flag par joueur: `onGameEnd` et `distributePlayerPearls` sont idempotents |
| 5 joueurs rejoignent la file simultanément | Transaction dans `onMatchmakingJoin`: un seul trigger crée la partie, les autres détectent la collision et passent |
| Double-clic sur un bouton power-up | `usingPowerupRef` dans `useGame` bloque le second clic tant que le premier n'a pas abouti: évite la double déduction de PA |
| Jumelles + bouclier cible | `binocularsTransaction` : déduction PA et désactivation du bouclier dans la même transaction Firestore (atomique) |
| Changement de langue pendant le matchmaking | `useMatchmaking` détecte le changement de `profile.language`, quitte la file et rejoint automatiquement la bonne langue |
| Humain joue pendant que le bot réfléchit | `playBotTurns` relit le board en transaction : si une cellule du move est occupée ou le board a changé, le tour bot est abandonné, le prochain cycle réessaiera |
