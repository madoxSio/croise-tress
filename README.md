# Crossverse

Application de mots croisés mobile-first : modes solo, défi quotidien, progression, thèmes, et duels multijoueur en ligne.

## État du projet

**MVP complet, vérifié hors Docker** (rien n'est encore commité). Le suivi détaillé, avec les preuves, est dans [docs/PROGRESS.md](docs/PROGRESS.md).

| Élément                                                               | État                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Moteur `packages/crossword-core`                                      | fait, 52 tests                                                                    |
| API : solo, défi du jour, comptes, progression, duels temps réel, Elo | fait, 92 tests d'intégration sur PostgreSQL réelle                                |
| Web : solo, compte, duel, classement                                  | fait, 60 tests + 15 parcours Playwright (`make e2e-local`)                        |
| `docker-compose.yml` et `make init` / `make start`                    | écrits, **jamais exécutés** (pas de démon Docker dans l'environnement de travail) |
| CI GitHub Actions                                                     | écrite, **jamais exécutée**                                                       |

## Documentation

| Document                                                 | Contenu                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| [CLAUDE.md](CLAUDE.md)                                   | règles permanentes de développement                          |
| [docs/CONTEXT.md](docs/CONTEXT.md)                       | cahier des charges fonctionnel et technique                  |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)             | architecture actuelle et cible, modèle de données, décisions |
| [docs/ROADMAP.md](docs/ROADMAP.md)                       | phases, dépendances, critères d'acceptation                  |
| [docs/SECURITY.md](docs/SECURITY.md)                     | règles de sécurité                                           |
| [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)             | modèle de menace                                             |
| [docs/SECURITY-TEST-PLAN.md](docs/SECURITY-TEST-PLAN.md) | plan de tests de sécurité                                    |
| [docs/ADMIN.md](docs/ADMIN.md)                           | espace d'administration, comptes de test et administrateurs  |

## Stack

TypeScript partout · Nuxt 4 / Vue 3 (SPA, prête pour Capacitor) · Fastify 5 · Socket.IO · PostgreSQL 18 · Prisma 7 · Vitest · Playwright · Docker Compose · pnpm.

## Prérequis

- Node.js 24 LTS (`.nvmrc` ; `engines` exige ≥ 24.15)
- pnpm 10 (`corepack enable`)
- Docker et Docker Compose v2 (pour `make start`)
- GNU Make

## Démarrage

Avec Docker (seul prérequis : Docker + Compose v2 et GNU Make) :

```sh
make init     # crée .env s'il n'existe pas, construit l'image, démarre tout, charge les grilles de démo
make start    # démarrages suivants
```

Puis : web sur http://localhost:3000, API sur http://localhost:3001/api/v1/health, e-mails de dev (Mailpit) sur http://localhost:8025.

Sans Docker (Node 24, pnpm 10 et un PostgreSQL local, `DATABASE_URL` dans `.env`) :

```sh
cp .env.example .env              # puis adapter DATABASE_URL
make install-local
pnpm --filter @crossverse/api db:migrate && pnpm --filter @crossverse/api db:seed
pnpm --filter @crossverse/api dev # API sur :3001
pnpm --filter @crossverse/web dev # web sur :3000
make check-local                  # lint, types et tests (la base <nom>_test doit exister)
```

## Mise en production (serveur unique)

Sur un serveur avec Docker, un nom de domaine pointant vers lui et un fournisseur SMTP :

```sh
cp .env.prod.example .env.prod   # remplir DOMAIN, POSTGRES_PASSWORD, SMTP_*, MAIL_FROM
make prod-up                     # construit, migre, démarre ; Caddy obtient le certificat TLS
make prod-seed                   # facultatif : grilles de démonstration
make prod-backup                 # sauvegarde dans backups/ (à planifier, par exemple via cron)
```

Ce chemin a été joué ici sans Docker (mêmes binaires : API en mode production + Caddy 2.10.2) : site en HTTPS, CSP sans violation, cookie `__Host-` sécurisé, partie solo et duel complet avec passage en WebSocket. Les images Docker elles-mêmes n'ont pas pu être construites ici.

## Déployer

- Serveur unique (cible) : section ci-dessus, `make prod-up` ou `make prod-pull` (images de la CI).
- Hébergement provisoire, CI/CD et TestFlight : [docs/deploy/README.md](docs/deploy/README.md).

## Commandes disponibles

`make help` liste toutes les cibles.

| Commande                                          | Rôle                                                    | Vérifiée ici                                                    |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `make init`                                       | `.env` (sans écraser l'existant), image, services, démo | non (Docker requis)                                             |
| `make start` / `stop` / `restart` / `logs` / `ps` | cycle de vie des services                               | non (Docker requis)                                             |
| `make migrate` / `migration name=…` / `seed`      | migrations versionnées, données de démo                 | non (Docker requis)                                             |
| `make reset-db`                                   | **destructif**, demande de taper `oui`                  | non (Docker requis)                                             |
| `make backup` / `make restore file=…`             | sauvegarde / restauration (**destructive**, confirmée)  | non (Docker requis) ; `pg_dump`/`pg_restore` vérifiés à la main |
| `make prod-check` / `prod-up` / `prod-backup` …   | production, voir ci-dessus                              | `docker compose config` oui ; démarrage non                     |
| `make test` / `lint` / `typecheck` / `check`      | qualité, dans le conteneur `api`                        | non (Docker requis)                                             |
| `make install-local`, `make check-local`          | mêmes contrôles sur la machine                          | oui                                                             |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`        | appelés par les cibles `*-local`                        | oui                                                             |
| `make e2e-local` / `make e2e` (`pnpm e2e`)        | parcours Playwright, voir `apps/e2e/README.md`          | `e2e-local` oui ; `e2e` non (Docker requis)                     |
| `make account-local email=… username=… [admin=1]` | compte confirmé (test, admin), voir `docs/ADMIN.md`     | oui                                                             |
| `make account` / `account-role` / `prod-account…` | idem dans Docker / en production                        | non (Docker requis)                                             |
