# Architecture — Crossverse

> Statut : décisions D1–D7 **validées le 2026-10-17** (madox a délégué le choix de la stack). Implémenté : socle outillage et `packages/crossword-core`. Le reste est la cible.

## 1. Architecture actuelle

> Mise à jour 2026-10-17 : le socle monorepo et `packages/crossword-core` existent désormais (non commités) ; voir le §2.5.

Au 2026-10-17, le dépôt `madoxSio/croise-tress` est **vide** : aucune branche n'a de commit (`git ls-remote` ne renvoie aucune référence). Il n'existe ni code, ni `package.json`, ni Docker, ni tests, ni CI. Les seuls fichiers sont ceux du cadrage (`CLAUDE.md`, `README.md`, `docs/`), non commités.

Environnement d'audit constaté (conteneur de travail, pas forcément celui de l'utilisateur) : Node 22.22.0, pnpm 10.28.0, GNU Make 4.3, Docker CLI 29.8.2 + Compose 5.6.0 **sans démon disponible**, client psql 16.15.

## 2. Architecture cible

### 2.1 Vue d'ensemble

```text
                 navigateur / PWA / Capacitor
                          │ HTTPS (cookies HttpOnly)          WSS (Socket.IO)
                          ▼                                       ▼
   ┌──────────── reverse proxy (prod : Caddy ou équivalent, TLS) ────────────┐
   │   /            → apps/web (fichiers statiques Nuxt)                       │
   │   /api/v1/*    → apps/api (Fastify REST)                                  │
   │   /ws          → apps/api (Socket.IO, même processus)                     │
   └──────────────────────────────────────────────────────────────────────────┘
                          │
                    apps/api (monolithe modulaire, 1 instance au départ)
                          │ Prisma (compte BD à privilèges minimaux)
                          ▼
                     PostgreSQL 18          Fournisseur SMTP (Mailpit en dev)
```

Servir web et API **sous la même origine** (via le reverse proxy en prod, le proxy de dev Nuxt en local) supprime la plupart des problèmes CORS et permet des cookies `SameSite=Lax` simples.

### 2.2 Monorepo

```text
croise-tress/
├── CLAUDE.md  README.md  Makefile  docker-compose.yml  .env.example  .nvmrc
├── pnpm-workspace.yaml  package.json  tsconfig.base.json  eslint.config.js
├── docs/
├── apps/
│   ├── web/                 Nuxt 4 (ssr: false), Tailwind 4, composants accessibles
│   │   ├── app/pages, components, composables, stores
│   │   └── app/services/api.ts   seul point d'appel HTTP/WS
│   └── api/
│       ├── prisma/          schema.prisma, migrations/, seed.ts
│       └── src/
│           ├── config.ts    validation Zod de l'environnement
│           ├── app.ts       construction Fastify (plugins sécurité)
│           ├── plugins/     helmet, cookies, csrf, rate-limit, auth, errors
│           └── modules/     auth, users, puzzles, play, daily, progress,
│                            match, mail, admin  (routes → service → repository)
└── packages/
    ├── crossword-core/      moteur pur TS : grille, numérotation, croisements,
    │                        normalisation, vérification, score — aucune I/O
    └── contracts/           schémas Zod partagés + types inférés (aucune solution)
```

Justification : deux applications avec des cycles de vie différents (statique mobile/web vs serveur), deux paquets réellement partagés. Pas d'autre paquet tant qu'un besoin concret n'apparaît pas.

### 2.3 Responsabilités des modules API

| Module     | Responsabilité                                                                                          | Données faisant autorité                               |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `auth`     | inscription, connexion, sessions, confirmation e-mail, réinitialisation, changement e-mail/mot de passe | users, sessions, auth_tokens                           |
| `users`    | profil public, préférences, suppression de compte                                                       | users, preferences                                     |
| `puzzles`  | catalogue, filtres, structure publique (sans solution), validation éditoriale à l'import                | puzzles, clues                                         |
| `play`     | parties solo : sauvegarde, vérification lettre/mot/grille, indices, révélation, fin                     | play_sessions                                          |
| `daily`    | association date → puzzle, résultats du jour                                                            | daily_challenges                                       |
| `progress` | historique, statistiques, succès, favoris (dérivés des parties terminées)                               | achievements_unlocked, favorites                       |
| `match`    | file, invitations, matchs, état officiel, chrono, résultat, classement                                  | match_queue, matches, match_participants, match_events |
| `mail`     | abstraction fournisseur (SMTP), gabarits                                                                | —                                                      |
| `admin`    | import/publication de puzzles, modération ; rôle séparé, actions journalisées                           | audit_log                                              |

### 2.4 Flux principaux

**Partie solo**

1. `GET /api/v1/puzzles/:id` → structure (dimensions, cases noires, numéros, définitions, longueurs). Jamais la solution.
2. `POST /api/v1/play-sessions` (ou reprise de la session existante, unique par joueur et puzzle).
3. Le client saisit localement ; `PUT /api/v1/play-sessions/:id/grid` sauvegarde l'état (débouncé, avec numéro de révision pour éviter l'écrasement par un onglet plus ancien).
4. `POST .../check` (`scope: cell|word|grid`) → le serveur compare et renvoie seulement juste/faux par case concernée.
5. `POST .../hints` (`type: letter|word|explain|solution`) → le serveur enregistre l'aide utilisée (impacte le score) et renvoie uniquement la partie révélée. `solution` exige `confirm: true`.
6. Grille complète et correcte → le serveur marque la session terminée, calcule temps et score, met à jour la progression.

**Inscription / confirmation / réinitialisation** : voir SECURITY.md §3.

**Match multijoueur** : voir §4.

### 2.5 Moteur `crossword-core` (implémenté)

Paquet pur TypeScript, sans DOM ni E/S, testé par Vitest.

| Fichier         | Rôle                                                                                                                                                 | Côté                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `normalize.ts`  | majuscules, accents/cédilles retirés, ligatures (Œ → OE), espaces/apostrophes/traits d'union ignorés ; tout autre caractère rejeté                   | client et serveur      |
| `parse.ts`      | valide un `PuzzleSource` (taille 3–25, caractères A–Z ou `#`, chaque case dans un mot, grille connexe, une définition par mot) et numérote les cases | serveur (import, seed) |
| `public.ts`     | `toPublicPuzzle` : projection sans aucune lettre ni explication                                                                                      | serveur → client       |
| `grid.ts`       | saisie immuable, assainissement d'une grille reçue, vérification case/mot/grille, révélation d'un mot                                                | serveur (vérification) |
| `navigation.ts` | mot sous une case, changement de direction, déplacement, sélection par tracé                                                                         | client                 |
| `score.ts`      | score solo v1 : 1000 − pénalités d'aide + bonus de rapidité ≤ 500, 0 si solution révélée                                                             | serveur                |

Le type `Puzzle` (avec solution) n'est destiné qu'au serveur ; le client ne reçoit que `PublicPuzzle`. Le paquet unique reste acceptable car le client n'importe que des fonctions pures sans données ; un test vérifie que la projection publique ne contient aucune lettre.

### 2.6 Choix techniques

| Sujet      | Choix proposé                                               | Raisons                                                                                                                              | Inconvénients / points à vérifier                                                  |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Runtime    | **Node 24 LTS**                                             | Nuxt 4.6.2 exige Node `^22.22.3 \|\| ^24.15.0` ; le Node 22.22.0 local est trop ancien                                               | images Docker et `.nvmrc` à épingler                                               |
| Frontend   | Nuxt 4 + Vue 3 + TS strict, **`ssr: false`** (SPA statique) | build statique directement embarquable dans Capacitor ; pas de besoin SEO pour un jeu connecté ; un seul serveur à sécuriser (l'API) | pas de rendu serveur ; pages publiques (accueil marketing) prérendues si besoin    |
| UI         | Tailwind CSS 4 + composants maison accessibles              | thèmes via variables CSS (`data-theme`), poids faible                                                                                | vérifier l'intégration Tailwind 4 / Nuxt au bootstrap                              |
| Backend    | Fastify 5 + TS strict                                       | performances, plugins officiels (helmet, cookie, rate-limit, csrf), validation par schéma                                            | —                                                                                  |
| Validation | Zod 4 (paquet `contracts`)                                  | un schéma = validation serveur + types client                                                                                        | adaptateur Fastify (`fastify-type-provider-zod`) à valider                         |
| Temps réel | Socket.IO 4                                                 | reconnexion, rooms, accusés de réception, adaptateur Redis disponible pour le multi-instance                                         | protocole propriétaire (client Socket.IO requis)                                   |
| ORM        | **Prisma 7.x stable**                                       | migrations versionnées, types générés                                                                                                | le tag `latest` npm pointe sur `8.0.0-rc.23` : **ne pas l'utiliser**, épingler 7.x |
| BD         | PostgreSQL 18                                               | contraintes, transactions, index partiels, `SKIP LOCKED` ; la v18 fournit `uuidv7()` en natif                                        | —                                                                                  |
| Hash       | `argon2` (node-argon2), Argon2id                            | bibliothèque maintenue, binaires précompilés                                                                                         | dépendance native : tester le build dans l'image Docker                            |
| TypeScript | **6.0.x** sur tout le monorepo                              | `typescript-eslint` 8.71 exige TS `<6.1.0` ; TS 7.0 (portage natif) sera adopté quand l'outillage le supportera                      | `vue-tsc` à vérifier à l'ajout du web                                              |
| E-mail     | SMTP via abstraction ; **Mailpit** en dev                   | aucun envoi réel en dev, e-mails consultables pour les tests E2E                                                                     | —                                                                                  |
| Tests      | Vitest 5, Playwright 1.64                                   | demandés par CONTEXT, standards                                                                                                      | —                                                                                  |

## 3. Modèle de données initial

Conventions : UUID v7 en clé primaire (non séquentiels, ordonnables ; l’autorisation ne repose jamais sur leur caractère imprévisible), `created_at`/`updated_at` en `timestamptz`, suppression logique uniquement si justifiée. Les statistiques sont **dérivées** des parties terminées (vues ou requêtes agrégées), pas stockées en double au départ.

| Table                | Colonnes clés                                                                                                                                                                                                                  | Contraintes / index                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | id, email (citext), username (citext), password_hash, email_verified_at, role (`player`/`admin`), deleted_at                                                                                                                   | UNIQUE(email), UNIQUE(username)                                                                                                  |
| `sessions`           | id, user_id → users, token_hash, created_at, last_seen_at, expires_at, revoked_at, user_agent, ip_hash                                                                                                                         | UNIQUE(token_hash), INDEX(user_id)                                                                                               |
| `auth_tokens`        | id, user_id, purpose (`verify_email`/`reset_password`/`change_email`), token_hash, new_email, expires_at, used_at                                                                                                              | UNIQUE(token_hash), INDEX(user_id, purpose)                                                                                      |
| `preferences`        | user_id PK → users, theme, text_scale, reduced_motion, …                                                                                                                                                                       | 1-1 avec users ; préférences d'interface aussi gardées en local pour les invités                                                 |
| `themes`             | id, slug, name, description, parent_id → themes (deux niveaux au plus), skin, icon, accent, accent_alt, sort_order                                                                                                             | UNIQUE(slug), INDEX(parent_id, sort_order) ; parent `ON DELETE RESTRICT`                                                         |
| `puzzles`            | id, slug, title, theme_id → themes, difficulty (enum 5 niveaux), width, height, layout (JSONB : cases noires), solution (JSONB, **jamais sérialisé vers le client**), status (`draft`/`published`), estimated_minutes, version | UNIQUE(slug), INDEX(status, difficulty, theme) ; CHECK sur dimensions                                                            |
| `clues`              | id, puzzle_id, direction (`across`/`down`), number, row, col, length, text, explanation                                                                                                                                        | UNIQUE(puzzle_id, direction, number)                                                                                             |
| `daily_challenges`   | date (PK), puzzle_id                                                                                                                                                                                                           | PK(date) garantit un seul puzzle par jour ; fuseau de référence documenté                                                        |
| `play_sessions`      | id, user_id, puzzle_id, grid_state (JSONB), revision, hints_used (JSONB), started_at, completed_at, duration_ms, score, status                                                                                                 | UNIQUE(user_id, puzzle_id) WHERE status = 'in_progress' ; INDEX(user_id, completed_at)                                           |
| `achievements`       | id, code, title, description                                                                                                                                                                                                   | UNIQUE(code)                                                                                                                     |
| `user_achievements`  | user_id, achievement_id, unlocked_at                                                                                                                                                                                           | PK(user_id, achievement_id) → pas de double récompense                                                                           |
| `favorites`          | user_id, puzzle_id                                                                                                                                                                                                             | PK(user_id, puzzle_id)                                                                                                           |
| `match_queue`        | user_id PK, mode, rating, enqueued_at                                                                                                                                                                                          | PK garantit une seule entrée par joueur                                                                                          |
| `matches`            | id, puzzle_id, mode (`private`/`quick`/`ranked`), status (`waiting`/`active`/`finished`/`aborted`), started_at, deadline_at, ended_at, winner_user_id, end_reason                                                              | INDEX(status)                                                                                                                    |
| `match_participants` | match_id, user_id, slot, progress (JSONB : cases validées), solved_words, hints_used, finished_at, result (`win`/`loss`/`draw`/`abandon`), last_seen_at                                                                        | PK(match_id, user_id) ; **UNIQUE(user_id) WHERE match actif** (via colonne `active` + index partiel) → pas de double affectation |
| `match_events`       | id, match_id, user_id, seq, client_event_id, type, payload, created_at                                                                                                                                                         | UNIQUE(match_id, user_id, client_event_id) → idempotence                                                                         |
| `invitations`        | id, from_user_id, to_user_id ou code, status, expires_at, match_id                                                                                                                                                             | INDEX(to_user_id, status)                                                                                                        |
| `ratings` (phase 5+) | user_id, mode, rating, games_played                                                                                                                                                                                            | PK(user_id, mode)                                                                                                                |
| `audit_log`          | id, actor_user_id, action, target, created_at                                                                                                                                                                                  | actions admin et sécurité                                                                                                        |

**Autorité** : serveur pour tout ce qui précède. **Préférences d'interface** (thème, taille, animation, dernière case active) : client, synchronisées pour les comptes mais sans valeur officielle.

Données personnelles minimisées : pas de date de naissance, IP stockées hachées et purgées.

## 4. Multijoueur

### 4.1 Règles retenues (D6)

- **Format** : course sur la **même grille**, mêmes conditions de départ, limite de temps (ex. 15 min).
- Le joueur soumet un **mot** ; le serveur le valide. Mot juste → verrouillé et compté. Pas de solution envoyée avant la fin.
- **Victoire** : premier à compléter la grille. À expiration : plus de mots validés, puis moins d'indices, puis temps du dernier mot validé ; égalité sinon.
- **Indices** : désactivés en classé ; en partie privée, chaque indice ajoute une pénalité de temps affichée avant usage.
- **Déconnexion** : délai de grâce de 30 s (chrono qui continue) ; au-delà, abandon. Reconnexion → le serveur renvoie l'état complet du match pour ce joueur.
- **Progression adverse diffusée** : nombre de mots/cases validés, jamais les lettres.

### 4.2 Événements Socket.IO (namespace `/match`)

Client → serveur (tous validés par Zod, limités en taille et en débit, avec `clientEventId` pour l'idempotence) :
`queue:join`, `queue:leave`, `invite:create`, `invite:accept`, `match:ready`, `match:submit-word`, `match:hint`, `match:forfeit`, `match:resync`.

Serveur → client : `queue:matched`, `match:state` (état complet, à la connexion ou au resync), `match:started` (structure de la grille + `deadlineAt` serveur), `match:word-result`, `match:opponent-progress`, `match:opponent-presence`, `match:ended` (résultat officiel + solution), `error` (code générique).

Handshake : authentifié par le cookie de session (vérification d'`Origin`), rejet sinon. Chaque événement vérifie appartenance au match, statut, et transition autorisée.

### 4.3 Concurrence

- Appariement dans une **transaction** : `SELECT … FROM match_queue … FOR UPDATE SKIP LOCKED LIMIT 2`, création du match, suppression des entrées. L'index partiel sur `match_participants` empêche toute double affectation même en cas de bug applicatif.
- Fin de match : `UPDATE matches SET status='finished' … WHERE id=$1 AND status='active'` ; seule la requête qui modifie une ligne attribue les récompenses (pas de double résultat).
- État officiel en base ; la mémoire du processus ne sert que de cache et de minuteurs, reconstruits depuis la base au redémarrage.

### 4.4 Passage à plusieurs instances (non prévu au MVP)

Déclencheurs : CPU/connexions d'une instance saturés (à mesurer). Il faudrait alors : adaptateur Redis Socket.IO (diffusion entre instances), sessions collantes ou transport WebSocket seul, minuteurs de match sous verrou (advisory lock PostgreSQL ou Redis), limiteur de débit partagé. Le matchmaking par transaction PostgreSQL fonctionne déjà en multi-instance.

## 5. PWA et Capacitor

- `ssr: false` produit un build statique embarquable tel quel par Capacitor 8.
- **Sessions natives** : le cookie web ne se comporte pas de façon identique dans les WebViews (origine `capacitor://localhost` / `https://localhost`, cookies tiers). Proposition : en natif, jeton de session opaque (même table `sessions`) transmis en `Authorization: Bearer`, stocké dans le stockage sécurisé natif (Keychain/Keystore) ; en web, cookie. À décider en phase 7.
- URL de l'API centralisée dans la config runtime ; capacités natives isolées derrière des services.
- Hors ligne : parties solo déjà ouvertes jouables, synchronisées au retour réseau (révision + règle « serveur gagne » sur les champs officiels). Multijoueur exige le réseau.
- iOS : build et signature sur macOS/Xcode uniquement.

## 6. Coûts et exploitation

MVP hébergeable sur une petite VM (1–2 vCPU) ou une plateforme conteneurs + PostgreSQL managé avec sauvegardes. Une seule instance API suffit tant que les mesures ne montrent pas le contraire. Coûts principaux : base managée et fournisseur e-mail.

## 7. Décisions

| #   | Date       | Décision                                                                      | Statut    |
| --- | ---------- | ----------------------------------------------------------------------------- | --------- |
| D1  | 2026-10-17 | Monolithe modulaire, monorepo pnpm (web, api, crossword-core, contracts)      | validée   |
| D2  | 2026-10-17 | Nuxt en `ssr: false`                                                          | validée   |
| D3  | 2026-10-17 | Sessions serveur opaques en cookie, même origine via reverse proxy            | validée   |
| D4  | 2026-10-17 | Vérification des réponses solo côté serveur (pas de solution chez le client)  | validée   |
| D5  | 2026-10-17 | Prisma 7.x stable, Node 24 LTS, PostgreSQL 18                                 | validée   |
| D6  | 2026-10-17 | Format de duel : course sur la même grille, validation par mot                | validée   |
| D7  | 2026-10-17 | Fuseau du défi quotidien : UTC (bascule à 00:00 UTC)                          | validée   |
| D8  | 2026-10-20 | Production MVP : un serveur, Caddy (TLS, SPA, proxy) + API + PostgreSQL       | appliquée |
| D9  | 2026-10-20 | Socket.IO en transports par défaut (polling puis WebSocket)                   | appliquée |
| D10 | 2026-10-23 | Admin : rôle relu en base, 404 aux non-admins, rôle donné en CLI seulement    | appliquée |
| D11 | 2026-10-23 | Invité : solo seulement ; suivi (historique, stats, succès, favoris) = compte | demandée  |
| D12 | 2026-10-23 | Catalogue : table `themes` à deux niveaux, contenu chargé sans écrasement     | appliquée |

### Notes sur D8 et D9

- **D8** (`compose.prod.yml`, `docker/prod.Dockerfile`, `docker/Caddyfile`) : Caddy est l'unique point d'entrée (80/443, certificat Let's Encrypt automatique), sert le build statique et relaie `/api` et `/ws` vers l'API ; PostgreSQL et l'API ne sont pas publiés. Les migrations sont appliquées au démarrage de l'API. La CSP du web est générée au build (`docker/csp.mjs`) avec les empreintes SHA-256 des scripts inline de Nuxt, sans `'unsafe-inline'` pour les scripts. L'API s'exécute avec `tsx` (pas d'étape de compilation) : coût au démarrage seulement, à remplacer par une compilation si la mesure le justifie. En production, la configuration refuse toute origine ou URL publique non HTTPS.
- **D9** : le proxy de développement de Nuxt ne relaie pas l'upgrade WebSocket ; le client démarre donc en long polling puis passe en WebSocket quand le chemin le permet (vérifié derrière Caddy). Le long polling de même origine n'envoie pas d'en-tête `Origin` : la passerelle l'accepte seulement si `Sec-Fetch-Site` vaut `same-origin` (ou est absent, client non navigateur), et refuse toute origine hors liste blanche.
- **D11** (demande de madox, 2026-10-23) : on joue sans compte (toutes les grilles solo, défi du jour, indices, reprise de la partie en cours), mais l'historique, les statistiques, les succès, les favoris et les duels exigent un compte. Côté API, garde `requireAccount` (403 `forbidden` pour un invité) sur `/me/history`, `/me/stats`, `/me/achievements` et `/me/favorites*` ; les duels exigeaient déjà un compte confirmé. Les parties jouées en invité restent en base et rejoignent le compte à la connexion ou à l'inscription. Expliqué aux joueurs sur `/comment-jouer#compte`.

### Note sur D10

Module `apps/api/src/modules/admin` (routes → service, Prisma dans le service comme `play` et `progress`) : indicateurs, parcours des joueurs, catalogue (brouillon → publication), journal `audit_log` (migration `20261023201031_admin_audit`, auteur `ON DELETE SET NULL`). Le rôle n'est pas exposé dans `currentUser` (schéma strict partagé avec l'app mobile déjà distribuable : un champ de plus casserait les anciennes versions) ; le web interroge `GET /admin/me`. Une grille déjà jouée garde ses lettres (parties en cours et scores en dépendent). Détails : `docs/ADMIN.md`.

### Note sur D12

Les thèmes sont des données (table `themes`, gérée par `/admin/themes`), pas un enum : en ajouter un ne demande ni migration ni déploiement. Deux niveaux suffisent (Football > Ligue des champions) et gardent les requêtes simples (un `OR` sur le slug ou celui du parent, pas de requête récursive). L'habillage est une clé ouverte (`skin`) que le client interprète, avec repli. Le contenu éditorial versionné (`apps/api/prisma/seed/`) est chargé à chaque démarrage de l'API en **insertion seule** : une grille déjà en base n'est jamais réécrite, car l'administration a pu la corriger et une grille jouée ne doit plus changer. Détails : `docs/CATALOGUE.md`.

### Hébergement (2026-10-23)

Cible D8 : un VPS (VM Azure for Students ; DigitalOcean a quitté le Student Pack en 2026) avec Caddy, l'API et PostgreSQL via `compose.prod.yml`, images tirées de GHCR et déployées par `release.yml` (SSH, `make prod-pull`). En attendant, hébergement provisoire : web sur Vercel, API sur Render (image GHCR), base sur Neon. Ce provisoire impose le long polling aux duels web (Vercel ne relaie pas l'upgrade WebSocket, D9) et laisse l'API joignable hors du proxy : `TRUST_PROXY=2` y est un compromis accepté jusqu'au VPS. Guide : `docs/deploy/README.md`.
