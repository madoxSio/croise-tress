# Suivi de progression — Crossverse

> Document tenu à jour à chaque étape validée. Une étape n'est marquée **validée** qu'avec une preuve (commande exécutée et résultat réel). Rien n'est encore commité dans Git.
>
> Environnement de vérification : conteneur Linux, Node 24.22.0, pnpm 10.28.0, PostgreSQL 16.15 local (la cible Docker est PostgreSQL 18.6). **Pas de démon Docker disponible** : les commandes `make` basées sur Docker sont écrites mais n'ont pas pu être exécutées ici.

Légende : ✅ validée (preuve jointe) · 🟡 écrite, non vérifiée · ⏳ en cours · ⬜ à faire

## Vue d'ensemble

| Phase | Contenu                                                       | État                                           |
| ----- | ------------------------------------------------------------- | ---------------------------------------------- |
| 1     | Audit, cadrage, CLAUDE.md, documents de sécurité              | ✅                                             |
| 2     | Socle, moteur, API solo, web jouable                          | ✅ (Docker 🟡)                                 |
| 3     | Comptes : inscription, e-mail, connexion, mots de passe       | ✅                                             |
| 4     | Défi du jour, historique, succès, stats, favoris, préférences | ✅                                             |
| 5     | Multijoueur temps réel                                        | ✅ (points ouverts)                            |
| 6     | Durcissement, sauvegardes, production, E2E                    | ⏳ (E2E ✅, prod jouée hors Docker, CI E2E ⬜) |
| 7     | PWA et Capacitor                                              | ⬜                                             |

## Journal des étapes

### 2026-10-17 — Phase 1 : cadrage ✅

- Dépôt GitHub constaté vide (`git ls-remote` sans référence). CONTEXT.md lu intégralement et copié dans `docs/CONTEXT.md`.
- Créés : `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `ROADMAP.md`, `SECURITY.md`, `THREAT-MODEL.md`, `SECURITY-TEST-PLAN.md`.
- Décisions D1–D7 validées par le porteur du projet (choix de stack délégué).

### 2026-10-17 — Socle outillage ✅ (Docker 🟡)

- Monorepo pnpm, TypeScript 6.0.3 strict, ESLint 10 (`strictTypeChecked`), Prettier, `.nvmrc` (Node 24), `.env.example`.
- Preuve : `make check-local` → lint, types et tests verts (voir la dernière exécution en bas de page).
- 🟡 `docker-compose.yml` complet (PostgreSQL 18.6, Mailpit, API, web, image `docker/dev.Dockerfile`) : `docker compose config --quiet` valide, **jamais démarré**.
- 🟡 CI GitHub Actions (lint, types, tests avec service PostgreSQL, `pnpm audit`, gitleaks) : jamais exécutée.

### 2026-10-17 — Moteur `crossword-core` ✅

- Validation de grille, numérotation, normalisation (accents, ligatures, apostrophes), vérification case/mot/grille, indices, navigation et tracé, score.
- Preuve : 52 tests Vitest verts.

### 2026-10-17 — API solo ✅

- Fastify 5 + Prisma 7.10.1 (adaptateur `pg`) + migrations versionnées ; configuration validée par Zod au démarrage.
- Session invité (cookie HttpOnly, jeton haché en base), CSRF (Origin en liste blanche + jeton de session), en-têtes Helmet, limitation de débit, erreurs génériques.
- Catalogue paginé, puzzle public sans solution, défi du jour déterministe en UTC, parties solo avec révision optimiste, vérifications, indices, fin de partie et score calculés par le serveur, historique, reprise.
- Seed : 6 grilles 5×5 validées par le moteur (non validées éditorialement).
- Preuve : tests d'intégration sur PostgreSQL réelle (`session`, `puzzles`, `play`).

### 2026-10-17 — Comptes (API) ✅

- Inscription confirmée par e-mail (le compte invité devient un compte complet à la confirmation, sa progression est conservée), connexion avec rotation de session, déconnexion, mot de passe oublié/réinitialisation (révocation de toutes les sessions), changement de mot de passe et d'e-mail, liste/révocation des sessions, suppression du compte.
- Argon2id (m = 19 MiB, t = 2, p = 1), refus des mots de passe courants, réponses identiques contre l'énumération, jetons 256 bits hachés, à usage unique et expirants, limitation par IP et par adresse.
- E-mails via SMTP (Mailpit en dev), fournisseur mémoire en test.
- Preuve : `test/auth.test.ts` (19 tests).

### 2026-10-17 — Progression (API) ✅

- Succès (5, non punitifs, attribution unique garantie par clé primaire), statistiques dérivées, favoris, préférences synchronisées.
- Preuve : `test/progress.test.ts`.

### 2026-10-17 — Multijoueur (API) ✅

- Socket.IO sur `/ws`, authentifié par cookie, origine vérifiée, compte confirmé obligatoire, schéma strict par événement, taille ≤ 4 Kio, limitation de débit par connexion.
- Matchs privés par code d'invitation et matchmaking rapide (verrou consultatif PostgreSQL + index unique partiel : jamais deux matchs par joueur).
- Mots validés par le serveur, idempotence par `clientEventId`, fin de match unique (mise à jour conditionnelle), abandon, délai de grâce de 30 s à la déconnexion, échéance de 15 min avec départage, état en base récupéré après redémarrage.
- Preuve : `test/match.test.ts` (16 tests avec de vrais clients Socket.IO), suite complète exécutée 3 fois sans échec.

### 2026-10-17 — Application web ✅ (hors Docker)

- Nuxt 4 SPA (`nuxt generate`), Tailwind 4, 4 thèmes. Écrans : accueil et défi du jour, catalogue (favoris), jeu solo (clavier, tracé, aides, sauvegarde), historique, préférences.
- Compte : inscription, confirmation d'e-mail (jeton retiré de l'URL, confirmation par bouton contre les scanners de liens), connexion, mot de passe oublié/réinitialisation, page compte (profil, stats, succès, favoris, mot de passe, e-mail, sessions, suppression). Redirections internes uniquement.
- Duel : file rapide, invitation par code, match en direct (soumission par mot validée par le serveur, chrono d'affichage, score adverse en direct, reprise après rechargement, abandon), résultat avec variation Elo, classement, historique des duels.
- Navigation mobile en barre d'onglets en bas (l'en-tête débordait de 69 px à 320 px : mesuré avec Chromium, corrigé, plus de défilement horizontal de 320 à 414 px).
- Preuves : 60 tests Vitest web ; build OK (15 routes) ; deux parcours E2E Chromium réels contre l'API et PostgreSQL (compte complet ; duel à deux joueurs avec invitation, file rapide, abandon, classement), scripts hors dépôt, tous les contrôles « OK ».
- SOL-02 : le bundle généré ne contient aucun mot des 6 grilles de démo (recherche dans `.output/public`).

### 2026-10-17 — Corrections API issues des écrans ✅

- `currentUser.email` exposé à son seul titulaire (page compte).
- Panne SMTP : 503 `mail_unavailable` identique sur toutes les branches (pas d'énumération), journalisée ; test `mailer.test.ts`.
- Tâches temps réel détachées : toute erreur est journalisée (plus de rejet non géré).

### 2026-10-20 — MVP : mise en production et E2E ✅ (Docker 🟡)

- **Bug bloquant corrigé** : le proxy de dev Nuxt ne relaie pas l'upgrade WebSocket, donc les duels ne marchaient pas via `make start`. Le client démarre en long polling puis passe en WebSocket (D9). La passerelle accepte le polling de même origine (`Sec-Fetch-Site`) et refuse le reste (test `match.test.ts`).
- **Faille corrigée** : la limite « 5 connexions / 15 min par adresse » était en réalité par IP, car le corps n'était pas encore lu. Elle est maintenant par adresse, avec un second plafond par IP (30 connexions / 15 min, 10 « mot de passe oublié » / h). Tests de non-régression ajoutés.
- Connexion depuis un invité : parties, favoris et succès rejoignent le compte (test `auth.test.ts`). Depuis D10, l'invité n'a plus de favoris.
- Production (D8) : `compose.prod.yml`, `docker/prod.Dockerfile`, Caddy (TLS automatique, SPA, proxy `/api` et `/ws`), CSP générée au build sans `unsafe-inline` pour les scripts, HTTPS imposé par la configuration, `make prod-check|prod-up|prod-down|prod-logs|prod-seed|prod-backup`, `make backup|restore`.
- Preuve de la prod hors Docker : API en `NODE_ENV=production` derrière Caddy 2.10.2 (binaire officiel, somme SHA-512 vérifiée), en HTTPS. Dans Chromium : aucune violation CSP, cookie `__Host-` Secure, partie solo, puis duel complet à deux comptes, avec passage en WebSocket (`wss://…/ws`).
- Suite Playwright versionnée (`apps/e2e`, Playwright 1.56.1) : solo, compte, duel, sécurité, accessibilité, en mobile et en bureau. `make e2e-local` → **15 passed (44 s)**. Les e-mails sont lus via l'API de Mailpit, ou par un faux Mailpit en local.
- Installation `--frozen-lockfile` à partir des seuls manifestes copiés par les Dockerfiles : OK (liste de `COPY` complète).
- Non exécuté : construction des images, `make init`, `make start`, `make prod-up`, `make e2e` contre Mailpit réel (pas de démon Docker ici).

### 2026-10-20 — Sécurité du proxy et déploiement par images ✅ (Docker 🟡)

- `TRUST_PROXY` accepte un nombre de sauts (1 à 5) : seul ce nombre de proxys est cru dans `X-Forwarded-For`, un en-tête forgé par le client ne contourne plus les limites par IP. `compose.prod.yml` passe à `1` (Caddy seul). Test `production.test.ts`.
- `compose.prod.yml` tire les images GHCR publiées par la CI (`CROSSVERSE_VERSION`, retour arrière par `sha-<commit>`), `make prod-pull` ; `make prod-up` reconstruit toujours en local.
- CI/CD : ✅ CI (lint, types, tests, E2E, audit, gitleaks) et images GHCR exécutées et vertes sur GitHub (2026-10-22). 🟡 Déploiements Render + Vercel (provisoire), VPS (`deploy-vps`, `docs/deploy/vps-bootstrap.sh`) et TestFlight écrits, jamais exécutés. Voir `docs/deploy/README.md`.
- App mobile Expo (`apps/mobile`) : ajoutée par un autre fil. Son authentification native par jeton (validée par madox) attend son intégration dans l'API.

### 2026-10-23 — Refonte visuelle, landing page, mascotte Sougoudou ✅

- Identité : palette violet / corail / citron (thèmes clair et sombre, contraste élevé inchangé), Inter et Bricolage Grotesque auto-hébergées (Fontsource, OFL, `font-src 'self'`), fond d'ambiance, en-tête et barre d'onglets mobile « verre » avec icônes. Sources dans `docs/brand/`.
- Mascotte **Sougoudou** (`SougoudouMascot.vue`, SVG animé, décoratif) et sa phrase (`utils/mascot.ts`) sur l'accueil web et mobile.
- Accueil transformé en landing page : héros animé, défi du jour, trois modes, démonstration de grille animée (`HowToDemo.vue`), comparatif sans compte / avec compte. Nouvelle page `/comment-jouer` (règles, commandes, aides, duel, comparatif, FAQ). Apparitions au défilement (`v-reveal`) neutralisées par la réduction des animations.
- Icône d'application : `favicon.svg`, `apple-touch-icon.png`, `icon-192/512.png` ; icônes iOS/Android et écran de démarrage de l'app mobile régénérés (`docs/brand/render-icons.mjs`).
- Invité limité au solo (D10) : API `requireAccount`, encart `AccountRequired` sur `/history`, favoris masqués pour l'invité, onglet Compte mobile sans appel refusé. Correctif : `PuzzleCard` affichait le bouton favori sans favoris chargés (booléen absent converti en `false`).
- Vérifié : `pnpm lint`, `pnpm typecheck`, `pnpm test` (core 52, web 60, mobile 37, api 109), E2E locaux 15/15 (dont build statique), captures mobile / tablette / bureau en clair et sombre.

## Points ouverts (repérés pendant la construction)

- Classement et `/me/matches` : `limit` ≤ 100 sans curseur ; schémas de réponse à déplacer dans `contracts` ; variation Elo absente de `MatchState`.
- `queue:leave` sans `clientEventId` ; retrait silencieux de la file à la déconnexion (le client se réinscrit) ; heure de déconnexion adverse non transmise (compte à rebours de grâce estimé côté client) ; `endReason` non énuméré.
- Sessions sans libellé d'appareil ; favoris plafonnés à 100.
- E2E non branchés dans la CI ; limites d'inscription (5/h par IP, en mémoire) : redémarrer l'API entre deux exécutions E2E.
- Limites de débit en mémoire : remises à zéro au redémarrage, et une seule instance.

## Couverture du plan de tests de sécurité

Voir [SECURITY-TEST-PLAN.md](SECURITY-TEST-PLAN.md) pour le détail des cas.

| Cas                                | État | Test                                                                                                                                                                       |
| ---------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 à AUTH-06, AUTH-08         | ✅   | `apps/api/test/auth.test.ts` (dont limite par adresse **et** par IP, corrigée le 2026-10-20)                                                                               |
| AUTH-07 (compte confirmé requis)   | ✅   | `apps/api/test/match.test.ts` (WS-01)                                                                                                                                      |
| SESS-01 (attributs du cookie)      | ✅   | `production.test.ts` : `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, HSTS ; cookie vérifié dans Chromium derrière Caddy                                                 |
| SESS-02, SESS-03                   | ✅   | `auth.test.ts`, `session.test.ts`                                                                                                                                          |
| CSRF-01, CSRF-02                   | ✅   | `session.test.ts`                                                                                                                                                          |
| CSRF-03 (aucun GET mutant)         | 🟡   | revue manuelle ; `GET /daily` écrit l'attribution du jour (idempotente, sans donnée utilisateur)                                                                           |
| AUTHZ-01, AUTHZ-04                 | ✅   | `play.test.ts`, `auth.test.ts`                                                                                                                                             |
| AUTHZ-02                           | 🟡   | sessions et historique testés ; favoris et préférences filtrés par construction, sans test croisé                                                                          |
| AUTHZ-03 (admin)                   | ⬜   | pas encore de routes admin                                                                                                                                                 |
| SOL-01, SOL-03, SOL-04, SOL-05     | ✅   | `puzzles.test.ts`, `play.test.ts`                                                                                                                                          |
| SOL-02 (bundle sans solution)      | ✅   | `apps/e2e/tests/security.spec.ts` (JS servi et build)                                                                                                                      |
| VAL-01, VAL-04                     | ✅   | `session.test.ts`, `puzzles.test.ts`, `match.test.ts`                                                                                                                      |
| VAL-02, VAL-03, VAL-05             | 🟡   | partiels (identifiants SQLi refusés, pseudos filtrés, JSON invalide générique)                                                                                             |
| WS-01 à WS-05, WS-07, WS-09, WS-10 | ✅   | `match.test.ts`                                                                                                                                                            |
| WS-06, WS-08                       | 🟡   | fin unique testée via l'échéance ; reprise des minuteurs après redémarrage non vérifiée                                                                                    |
| CFG-01, CFG-02                     | ✅   | `session.test.ts` (HSTS en prod non testé)                                                                                                                                 |
| CFG-03                             | ✅   | `production.test.ts` (HTTPS imposé en production), échec explicite sans `DATABASE_URL`                                                                                     |
| CFG-04, SEC-01                     | ⬜   | nécessitent Docker / CI (en prod, PostgreSQL n'est publié sur aucun port par `compose.prod.yml`)                                                                           |
| BAK-01                             | 🟡   | `pg_dump` puis `pg_restore` sur base vierge vérifiés à la main (mêmes comptes de lignes, 34 contraintes, 32 index) ; cibles `make backup`/`restore` non exécutées (Docker) |
| DEP-01                             | ✅   | `pnpm audit --audit-level high` : aucune vulnérabilité connue                                                                                                              |

## Dernière vérification complète

2026-10-20 (soir), depuis la racine, Node 24.22.0, PostgreSQL 16.15 locale (hors Docker) :

| Commande         | Résultat réel                                                      |
| ---------------- | ------------------------------------------------------------------ |
| `pnpm lint`      | ESLint sans erreur, « All matched files use Prettier code style! » |
| `pnpm typecheck` | 5 paquets « Done » (core, contracts, e2e, api, web)                |
| `pnpm test`      | core 52/52, web 60/60, api 93/93 : **205 tests verts**             |
| `make e2e-local` | **15 passed (44.0s)**, mobile et bureau, API et web réels          |

Non exécuté : toutes les cibles Docker (`init`, `start`, `prod-up`, `e2e`), CI GitHub.
