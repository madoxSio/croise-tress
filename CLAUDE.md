# CLAUDE.md — Règles permanentes du projet Crossverse

Crossverse est une application de mots croisés (solo + multijoueur compétitif en ligne), mobile-first, avec une future publication PWA/Capacitor.

- **Cahier des charges fonctionnel** : [`docs/CONTEXT.md`](docs/CONTEXT.md) (source de vérité produit, ne pas le recopier ici).
- **Architecture** : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · **Roadmap** : [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **Sécurité** : [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) · [`docs/SECURITY-TEST-PLAN.md`](docs/SECURITY-TEST-PLAN.md)

En cas de conflit : les instructions explicites de l'utilisateur > ce fichier > `docs/CONTEXT.md` > les autres documents. Un conflit détecté se signale, il ne se tranche pas en silence.

## 0. État du projet (à tenir à jour)

Au 2026-10-23 (dépôt GitHub `madoxSio/croise-tress`, qui fait foi) — détail et preuves dans [`docs/PROGRESS.md`](docs/PROGRESS.md) :

- **Fait et testé** (287 tests Vitest et 13 E2E Playwright verts, lint et types verts) : socle, moteur, contrats, API complète (solo, défi, comptes, progression, duels, Elo, administration), web complet dont l'espace `/admin` ([`docs/ADMIN.md`](docs/ADMIN.md)), script de comptes de test et d'administrateurs, parcours à étapes, indices limités et Coumba points, pile de production (Caddy + API) jouée hors Docker, app mobile Expo.
- **Points ouverts** : voir PROGRESS.md.
- **Écrit, non vérifié** : `docker-compose.yml`, `compose.prod.yml` et les cibles Docker du `Makefile` (`make init`, `make start`, `make prod-up` : jamais exécutés faute de démon Docker dans l'environnement de travail) ; la CI GitHub Actions tourne et est verte, le déploiement provisoire (Render + Vercel) est suivi dans `docs/deploy/README.md`.
- **Pas commencé** : MFA admin, modération, observabilité, PWA/Capacitor.

Mettre à jour cette section à chaque étape livrée.

## 1. Méthode de travail (obligatoire)

1. **Inspecter avant de modifier** : lire les fichiers concernés, `git status`, l'état réel. Ne jamais supposer qu'une fonctionnalité existe parce qu'un document la décrit.
2. **Avancer par petites tranches verticales vérifiables** (cf. ROADMAP). Pas de réécriture massive.
3. Pour chaque étape : résultat attendu → implémentation → tests → vérifications (lint, types, tests) → correction → documentation → résumé honnête (fait / testé / partiel / planifié).
4. **Ne jamais inventer** un résultat de test, une commande qui fonctionne ou une fonctionnalité terminée. Citer la commande exécutée et sa sortie réelle.
5. **Demander l'accord** avant : toute opération destructive (suppression de fichiers ou de données, `reset-db`, réécriture d'historique), tout changement architectural majeur non validé, tout changement de technologie, tout ajout d'infrastructure (Redis, file de messages, service externe payant).
6. **Git** : pas de commit ni de push sans demande explicite. Jamais de déploiement en production sans autorisation explicite. Préserver les changements non commités.
7. Signaler hypothèses, limites et risques. Documenter les décisions importantes dans `docs/ARCHITECTURE.md` (section « Décisions »).
8. Ne jamais écraser un fichier existant (dont `.env`) sans l'avoir lu et sans justification.

## 2. Principes de code

- Lisibilité et maintenabilité d'abord. KISS, DRY sans abstraction prématurée, SOLID quand il apporte une vraie valeur.
- **TypeScript strict** partout (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Pas de `any` non justifié, pas de `@ts-ignore` sans commentaire expliquant pourquoi.
- Respecter les conventions de chaque outil (Nuxt/Vue SFC + Composition API, plugins Fastify, schéma Prisma).
- Fonctions petites, nommage explicite, pas de code mort, commentaires sur le _pourquoi_.
- Accessibilité (WCAG 2.2 AA visé), responsive mobile-first, navigation clavier complète, focus visible, `prefers-reduced-motion`, alternative au tracé tactile.
- Dépendances : versions stables (pas de RC/beta) épinglées par lockfile ; justifier chaque nouvelle dépendance (maintenance, licence, taille, sécurité).

## 3. Architecture (monolithe modulaire)

Organisation cible (monorepo pnpm) — détails dans ARCHITECTURE.md :

```text
apps/web            Nuxt 4 + Vue 3 : présentation uniquement
apps/api            Fastify : HTTP REST /api/v1 + Socket.IO, seul accès à PostgreSQL
packages/crossword-core   moteur pur TS (sans DOM, sans I/O), partagé client/serveur
packages/contracts        schémas Zod des requêtes/réponses/événements WS (aucune solution)
```

Règles de frontières :

- **Le frontend n'accède jamais à la base** ni à un secret. Il ne parle qu'à l'API.
- Dans l'API, chaque module (`auth`, `users`, `puzzles`, `play`, `daily`, `progress`, `match`, `mail`, `admin`) suit : `routes` (transport + validation) → `service` (règles métier) → `repository` (Prisma). Pas de Prisma dans les routes, pas de HTTP dans les services.
- Les règles métier (validation de réponse, normalisation, score, transitions de match) vivent **une seule fois** dans `crossword-core` ou dans un service API, jamais dupliquées dans le client.
- Le moteur sépare **structure du puzzle**, **solution** et **état du joueur**. La solution ne quitte le serveur que lorsqu'elle est explicitement révélée.
- Configuration centralisée dans `apps/api/src/config.ts`, validée par Zod au démarrage (échec immédiat si invalide). Seules les variables `NUXT_PUBLIC_*` peuvent atteindre le navigateur.
- Contrats d'API explicites et versionnés (`/api/v1`). Un changement incompatible = nouvelle version ou migration coordonnée.
- Pas de microservices, Kubernetes, Redis ni cache sans besoin mesuré et accord préalable.

## 4. Sécurité (non négociable)

Références : OWASP Top 10, OWASP API Security Top 10, ASVS (niveau 2 visé pour auth/session), Cheat Sheet Series. Détails et justification dans SECURITY.md.

- **Le serveur fait autorité.** Ne jamais faire confiance au client pour : résultat d'une partie, score officiel, récompenses, permissions, progression validée, identité d'un autre joueur, état officiel d'un match, chronomètre officiel.
- **Mots de passe** : Argon2id via une bibliothèque maintenue (`argon2`), paramètres ≥ m=19 MiB, t=2, p=1, calibrés et documentés. Jamais en clair, jamais MD5/SHA-1/SHA-256 simple. Aucun algorithme cryptographique maison.
- **Validation stricte côté serveur** de toutes les entrées (HTTP, WebSocket, import, config) par schéma Zod avec rejet des propriétés inconnues (anti mass-assignment). Les validations frontend sont un confort, pas un contrôle.
- **Autorisation côté serveur sur chaque ressource** : vérifier la propriété / l'appartenance, pas seulement l'identifiant (anti IDOR/BOLA). Un identifiant de room WebSocket n'est pas une autorisation.
- **Sessions** : identifiant opaque aléatoire en cookie `HttpOnly`, `Secure` (prod), `SameSite=Lax`, stocké haché en base, renouvelé à la connexion, expirant et révocable. Pas de jeton longue durée dans `localStorage`. Protection CSRF (vérification d'`Origin` + jeton pour les requêtes mutantes).
- **Jetons e-mail** (confirmation, réinitialisation) : aléatoires ≥ 256 bits, usage unique, durée limitée, stockés hachés, jamais journalisés. Réponses génériques contre l'énumération de comptes.
- **Injections** : ORM ou requêtes paramétrées uniquement ; tout SQL brut est revu et paramétré. Pas de `v-html` sur contenu non fiable. Jamais d'entrée utilisateur dans un shell.
- **Abus** : limitation de débit (connexion, inscription, renvoi d'e-mail, indices, matchmaking, événements WS), limites de taille des corps et messages, pagination obligatoire sur les collections.
- **Configuration** : CORS en liste blanche explicite, CSP stricte, en-têtes de sécurité (`@fastify/helmet`), TLS en production, erreurs génériques en production, PostgreSQL jamais exposé publiquement, compte BD à privilèges minimaux.
- **Journaux** structurés (pino) sans mots de passe, jetons, cookies ni secrets ; données personnelles minimisées.
- **Secrets** : jamais dans Git, le bundle frontend ou les logs. `.env.example` sans valeur réelle.
- Ne jamais désactiver une règle de sécurité ou un test pour obtenir un build vert. Ne jamais prétendre qu'une application est invulnérable : documenter les risques résiduels.

## 5. Tests et qualité

- **Unitaires (Vitest)** : moteur, normalisation, intersections, indices, score, transitions d'état de match.
- **Intégration (Vitest + vraie PostgreSQL de test)** : API, repositories, contraintes d'intégrité, auth.
- **Sécurité** : contrôle d'accès entre deux comptes, validation d'entrées, limites de débit, scénarios de SECURITY-TEST-PLAN.md.
- **Multijoueur** : concurrence du matchmaking (pas de double affectation), reconnexion, idempotence, double résultat.
- **E2E (Playwright)** : parcours essentiels mobile et desktop listés dans CONTEXT.md §13.
- Avant de déclarer une tâche terminée : exécuter `make lint`, `make typecheck`, `make test` (dès qu'ils existent) et rapporter leurs sorties réelles. Un test non exécuté est déclaré « non exécuté ».
- Un bug corrigé reçoit un test de non-régression.

## 6. Performance

- Requêtes SQL indexées de façon justifiée, pas de N+1 (`include`/`select` Prisma maîtrisés), `select` explicite des colonnes.
- Pagination et limites sur toute collection ; taille maximale des requêtes HTTP et des messages WS.
- Frontend : code-splitting par route, images optimisées, pas de dépendance lourde pour un besoin trivial.
- Mesurer avant d'optimiser. Pas de cache sans mesure.
- Une seule instance API au départ ; état officiel des matchs persisté en base (récupérable après redémarrage). Le passage multi-instance (adaptateur Redis Socket.IO, verrous) est documenté dans ARCHITECTURE.md et soumis à validation.

## 7. Environnement, Docker et commandes

- Environnement reproductible via Docker Compose (PostgreSQL, API, web, Mailpit pour capturer les e-mails en dev). Node 24 LTS dans les images et `.nvmrc`. TypeScript épinglé en 6.0.x : `typescript-eslint` n'accepte pas encore TS 7 (`<6.1.0`).
- `make init` crée `.env` depuis `.env.example` **seulement s'il n'existe pas**.
- Volume PostgreSQL persistant ; PostgreSQL publié uniquement sur `127.0.0.1` en dev.
- Migrations Prisma versionnées et commitées ; jamais de `db push` hors prototypage local.
- Cibles du `Makefile` : voir `make help`. `reset-db` est destructif : il affiche un avertissement et exige une confirmation.
- **Ne jamais documenter une commande comme fonctionnelle avant qu'elle soit implémentée et exécutée.** La liste des commandes réellement disponibles est dans README.md.

## 8. CI/CD

- La CI (GitHub Actions, à créer) exécute : installation `--frozen-lockfile`, lint, typecheck, tests unitaires et d'intégration (service PostgreSQL), E2E, `pnpm audit`, scan de secrets.
- Actions tierces épinglées par SHA, permissions `GITHUB_TOKEN` minimales, pas de secrets exposés aux PR de forks.
- Ne pas modifier un workflow sans comprendre et expliquer ses conséquences. Aucun déploiement automatique en production sans validation.

## 9. Définition de « terminé »

Une tâche est terminée quand : le code respecte ce fichier, les tests pertinents existent et passent réellement, lint et typecheck passent, la documentation est à jour, et le résumé distingue ce qui fonctionne, ce qui est partiel et ce qui reste à faire.
