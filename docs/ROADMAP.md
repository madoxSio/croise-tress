# Roadmap — Crossverse

> Statut au 2026-10-17 : phase 1 terminée, **phase 2 en cours** (2.1 partielle, 2.2 faite). Rien n'est encore commité.
>
> Légende : ☐ planifié · ◐ partiel · ☑ fait et vérifié (avec preuve : commande + résultat).

Chaque phase est découpée en tranches livrables séparément. Une phase ne commence qu'une fois les critères de la précédente vérifiés, sauf accord explicite.

## Phase 1 — Cadrage ☑

- ☑ Audit du dépôt et de CONTEXT.md
- ☑ CLAUDE.md, ARCHITECTURE, SECURITY, THREAT-MODEL, SECURITY-TEST-PLAN, README
- ☑ Décisions D1–D7 validées le 2026-10-17

**Critères d'acceptation** : documents relus et décisions validées ou amendées.

## Phase 2 — Socle et tranche verticale solo ◐

Dépend de : phase 1.

2.1 Socle outillage ◐

- ☑ monorepo pnpm, TS 6.0 strict, ESLint, Prettier, `.nvmrc`, `.env.example` — `make check` passe
- ◐ `docker-compose.yml` (PostgreSQL 18, Mailpit) : `docker compose config` valide, **jamais démarré** (pas de démon Docker ici) ; api et web à ajouter
- ◐ `Makefile` : `init install start stop restart logs test lint format typecheck check` ; `migrate seed reset-db` à venir avec l'API
- ◐ CI GitHub Actions écrite (lint, types, tests, audit, gitleaks), **jamais exécutée**

Cible initiale :

- monorepo pnpm, TS strict, ESLint, Prettier, `.nvmrc` (Node 24), `.env.example`
- `docker-compose.yml` : PostgreSQL 18 (volume persistant, healthcheck, publié sur 127.0.0.1), Mailpit, api, web
- `Makefile` : `init start stop restart logs test lint typecheck migrate seed reset-db`
- CI GitHub Actions : install figée, lint, typecheck, tests, `pnpm audit`, scan de secrets

2.2 ☑ Moteur `crossword-core` (52 tests verts) : modèle de grille, numérotation, croisements, normalisation (majuscules, accents retirés, apostrophes/espaces/traits d'union ignorés, ligatures développées), validation de cohérence d'un puzzle, vérification lettre/mot/grille, calcul de score.

2.3 API : config validée, plugins sécurité, Prisma + premières migrations, catalogue, sessions de jeu anonymes ou liées à un appareil (avant l'auth), vérification et indices côté serveur, seed de 5 à 10 puzzles validés par le moteur.

2.4 Web : grille responsive, saisie clavier/toucher/souris/stylet, tracé par pointeur, changement de direction, liste des définitions, sauvegarde automatique et reprise, vérification, indices avec confirmation, 2 thèmes initiaux (minimal, sombre/contraste élevé).

**Critères d'acceptation**

- `make init` puis `make start` démarrent tout depuis un clone propre ; `make test`, `make lint`, `make typecheck` passent en local et en CI.
- Chaque puzzle du seed passe la validation du moteur (test automatisé).
- Aucune réponse de l'API publique ne contient la solution avant révélation (test).
- E2E : jouer, tracer, utiliser un indice, actualiser et reprendre, terminer (desktop + mobile émulé).
- Navigation clavier complète, aucune erreur axe-core critique sur la page de jeu.

## Phase 3 — Comptes et authentification ☐

Dépend de : 2.3.

- inscription, confirmation e-mail obligatoire, connexion, déconnexion, liste et révocation des sessions
- réinitialisation et changement de mot de passe, changement d'e-mail avec reconfirmation, suppression de compte
- rattachement des parties anonymes au compte à la connexion
- limitation de débit sur toutes ces routes, CSRF, en-têtes, CSP

**Critères** : hash Argon2id vérifié en base (test), jetons hachés et à usage unique (tests), réponses génériques (test d'énumération), tests IDOR entre deux comptes sur toutes les routes privées, E2E inscription → e-mail Mailpit → confirmation → connexion → réinitialisation.

## Phase 4 — Défi quotidien, progression, thèmes ☐

Dépend de : 3.

- défi quotidien (unicité par date, fuseau documenté), calendrier, résultats
- historique, statistiques dérivées, favoris, succès non punitifs
- thèmes restants (Manga Premium original, papier/encre, cyberpunk, zen, rétro), taille du texte, réduction des animations

**Critères** : même puzzle pour tous à une date donnée (test autour de minuit), un succès n'est attribué qu'une fois (test de concurrence), contrastes AA vérifiés pour chaque thème.

## Phase 5 — Multijoueur ☐

Dépend de : 3 ; règles D6 validées.
5.1 Socket.IO authentifié, matchs privés par invitation · 5.2 matchmaking rapide · 5.3 reconnexion et délai de grâce · 5.4 classement.

**Critères** : test avec N joueurs concurrents dans la file → aucun joueur dans deux matchs ; double `match:submit-word` avec le même `clientEventId` → effet unique ; un client modifié ne peut ni déclarer sa victoire ni lire les lettres adverses ; redémarrage de l'API en plein match → état récupéré ; E2E à deux navigateurs avec résultat décidé par le serveur.

## Phase 6 — Durcissement et exploitation ☐

- revue SECURITY-TEST-PLAN complète, DAST (ZAP baseline) en CI
- sauvegardes PostgreSQL automatisées et **restauration testée**
- observabilité : logs structurés, métriques de base, alertes
- tests de charge du multijoueur pour mesurer la capacité d'une instance

## Phase 7 — PWA et Capacitor ☐

- manifeste, service worker, icônes, mode hors ligne défini
- prototype Capacitor Android puis iOS (macOS/Xcode), stratégie de session native (ARCHITECTURE §5)
- tests sur appareils réels, politique de confidentialité, préparation des stores
