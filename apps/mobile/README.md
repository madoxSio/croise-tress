# Crossverse mobile (Expo / React Native)

Application iOS et Android de Crossverse, avec une version web issue du même code. Présentation
uniquement : toutes les règles (vérification, score, fin de partie) restent dans l'API.

## Pile

- Expo SDK 58 (React Native 0.88, React 19.3), Expo Router (navigation par fichiers dans `app/`).
- TypeScript strict (mêmes options que le reste du monorepo).
- Réutilise `@crossverse/contracts` (schémas Zod, chaque réponse est validée) et
  `@crossverse/crossword-core` (navigation dans la grille, normalisation des lettres).
- `metro.config.js` résout les imports `./x.js` des paquets partagés vers leurs sources `./x.ts`.

## Organisation

```text
app/                 écrans (Expo Router) : onglets Accueil, Grilles, Compte ; partie ; connexion
src/api/             client HTTP unique, transports d'authentification, coffre du jeton
src/game/state.ts    état de jeu pur (sélection, saisie, marques) : testé sans appareil
src/play/controller.ts  partie solo (sauvegarde différée avec révision, vérifications, indices)
src/match/           duel : connexion Socket.IO, logique pure, contrôleur (soumission par mot)
src/components/      grille, clavier de jeu AZERTY, barre de définition, feuilles d'actions
test/                Vitest (état de jeu, client HTTP, partie solo, duel)
```

## Authentification

- **Web** : cookie `HttpOnly` de même origine, comme `apps/web` (l'app doit être servie avec l'API
  sous la même origine, ex. derrière Caddy).
- **iOS / Android** : jeton porteur rangé dans le coffre du système. **Nécessite l'ajout côté API
  décrit dans [`docs/proposals/mobile-native-auth.md`](../../docs/proposals/mobile-native-auth.md)**
  (validé et testé, en cours d'intégration dans `apps/api`). En-tête `x-crossverse-client: native`,
  `Authorization: Bearer`, jeton CSRF toujours exigé ; pour les duels, jeton dans `auth.token`.

## Commandes

```sh
pnpm --filter @crossverse/mobile dev          # Expo : QR code (Expo Go), émulateur Android ou iOS
pnpm --filter @crossverse/mobile test         # tests unitaires
pnpm --filter @crossverse/mobile typecheck
pnpm --filter @crossverse/mobile export:web   # version web statique dans dist/
```

L'API visée est `EXPO_PUBLIC_API_URL` (HTTPS en production) ; à défaut, `http://10.0.2.2:3001`
sur l'émulateur Android, `http://localhost:3001` sur le simulateur iOS, la même origine sur le web.
Sur un téléphone réel, utiliser l'adresse IP de la machine de développement.

## État (2026-10-20)

- Fait et testé : solo complet (accueil et défi du jour, catalogue filtré et paginé, partie avec
  sauvegarde, reprise, vérifications, indices, solution, fin de partie), compte (connexion,
  inscription, mot de passe oublié, statistiques et succès, déconnexion), duel (file rapide,
  invitation par code, match en direct avec soumission par mot, score adverse en direct, abandon,
  résultat, historique et classement). 37 tests Vitest ; parcours solo et duel à deux comptes
  joués dans Chromium (version web exportée) contre l'API et PostgreSQL réelles.
- Non vérifié : exécution sur iOS et Android (pas d'émulateur dans l'environnement de travail) ;
  l'authentification native est testée côté API (13 tests) mais pas encore intégrée à `apps/api`.
- Publication : `eas.json` (profils `preview` et `production`, cf. `docs/deploy/IOS-TESTFLIGHT.md`) ;
  écran « Supprimer mon compte » exigé par l'App Store (5.1.1(v)), vérifié dans Chromium.
- À faire : préférences, historique solo, favoris, confirmation d'e-mail par lien
  profond (`crossverse://`).
- Dette assumée : `src/game/labels.ts`, `puzzle.ts`, `src/validation.ts`, `src/match/connection.ts` et
  `logic.ts` reprennent du code de `apps/web` ; à extraire dans un paquet partagé quand le web pourra migrer.
