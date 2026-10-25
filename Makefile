# Commandes de développement Crossverse. `make help` liste les cibles.
# Seul prérequis pour init/start : Docker + Docker Compose v2. Les cibles `*-local`
# utilisent Node 24 et pnpm 10 installés sur la machine.

COMPOSE := docker compose
PROD := docker compose -f compose.prod.yml --env-file .env.prod
EXEC_API := $(COMPOSE) exec -T api
.DEFAULT_GOAL := help

.PHONY: help init start stop restart logs ps migrate migration seed reset-db backup restore test lint \
	typecheck check format install-local test-local lint-local typecheck-local check-local e2e e2e-local \
	prod-check prod-up prod-pull prod-down prod-logs prod-ps prod-seed prod-backup mobile \
	account account-role account-local prod-account prod-account-role

help: ## Affiche cette aide
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-16s %s\n", $$1, $$2}'

# --- Cycle de vie (Docker) ---------------------------------------------------

init: ## Premier lancement : .env (sans écraser), images, services, migrations, données de démo
	@if [ -f .env ]; then echo ".env existe déjà : conservé."; else cp .env.example .env && echo ".env créé depuis .env.example."; fi
	$(COMPOSE) build
	$(MAKE) start
	$(MAKE) seed
	@echo "Crossverse est prêt : http://localhost:$${WEB_PORT:-3000}"

start: ## Démarre PostgreSQL, Mailpit, l'API et le web, attend qu'ils soient prêts
	@test -f .env || { echo "Fichier .env absent : lancez d'abord 'make init'."; exit 1; }
	$(COMPOSE) up -d --build --renew-anon-volumes --wait
	@echo "Web    : http://localhost:$${WEB_PORT:-3000}"
	@echo "API    : http://localhost:$${API_PORT:-3001}/api/v1/health"
	@echo "E-mails: http://localhost:$${MAILPIT_UI_PORT:-8025}"

stop: ## Arrête les services (les données sont conservées)
	$(COMPOSE) stop

restart: stop start ## Redémarre les services

logs: ## Suit les journaux (make logs s=api pour un seul service)
	$(COMPOSE) logs -f --tail=100 $(s)

ps: ## État des services
	$(COMPOSE) ps

# --- Base de données ----------------------------------------------------------

migrate: ## Applique les migrations versionnées
	$(EXEC_API) pnpm --filter @crossverse/api db:migrate

migration: ## Crée une migration à partir du schéma Prisma (make migration name=ajout_x)
	@test -n "$(name)" || { echo "Usage : make migration name=<nom>"; exit 1; }
	$(EXEC_API) pnpm --filter @crossverse/api exec prisma migrate dev --name $(name)

seed: ## Charge les puzzles de démonstration (idempotent)
	$(EXEC_API) pnpm --filter @crossverse/api db:seed

# --- Comptes (test, équipe, administrateurs) ------------------------------------
# Mot de passe : variable ACCOUNT_PASSWORD (jamais en argument), sinon généré et affiché une fois.
ACCOUNT_ARGS = --email "$(email)" --username "$(username)" $(if $(admin),--admin)
ROLE_CMD = $(if $(filter admin,$(role)),promote,demote)
check-account = @test -n "$(email)" -a -n "$(username)" || { echo "Usage : make $@ email=<e-mail> username=<pseudo> [admin=1]"; exit 1; }
check-role = @test -n "$(email)" -a -n "$(role)" || { echo "Usage : make $@ email=<e-mail> role=admin|player"; exit 1; }

account: ## Crée un compte confirmé (make account email=… username=… [admin=1])
	$(check-account)
	$(COMPOSE) exec -T -e ACCOUNT_PASSWORD api pnpm --filter @crossverse/api account create $(ACCOUNT_ARGS)

account-role: ## Donne ou retire le rôle admin (make account-role email=… role=admin|player)
	$(check-role)
	$(COMPOSE) exec -T api pnpm --filter @crossverse/api account $(ROLE_CMD) --email "$(email)"

account-local: ## Comme `account`, sans Docker (base du .env)
	$(check-account)
	pnpm --filter @crossverse/api account create $(ACCOUNT_ARGS)

reset-db: ## DESTRUCTIF : vide la base de développement puis migre et recharge la démo
	@printf "Toutes les données de la base de développement seront supprimées. Taper 'oui' pour confirmer : "; \
	read answer; [ "$$answer" = "oui" ] || { echo "Annulé."; exit 1; }
	$(COMPOSE) exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
	$(MAKE) migrate
	$(MAKE) seed

backup: ## Sauvegarde la base de développement dans backups/ (format pg_dump personnalisé)
	@mkdir -p backups
	$(COMPOSE) exec -T postgres sh -c 'pg_dump -Fc -U "$$POSTGRES_USER" "$$POSTGRES_DB"' > backups/dev-$$(date +%Y%m%d-%H%M%S).dump
	@ls -1t backups | head -1

restore: ## DESTRUCTIF : remplace la base de développement par une sauvegarde (make restore file=backups/x.dump)
	@test -f "$(file)" || { echo "Usage : make restore file=backups/<fichier>.dump"; exit 1; }
	@printf "La base de développement sera remplacée par $(file). Taper 'oui' pour confirmer : "; \
	read answer; [ "$$answer" = "oui" ] || { echo "Annulé."; exit 1; }
	$(COMPOSE) exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' < $(file)

# --- Qualité (dans le conteneur api, qui contient tout le monorepo) -----------

test: ## Tous les tests (unitaires + intégration sur la base de test)
	$(EXEC_API) pnpm test

lint: ## ESLint + vérification du formatage
	$(EXEC_API) pnpm lint

typecheck: ## Contrôle de types
	$(EXEC_API) pnpm typecheck

check: lint typecheck test ## Lint, types et tests

format: ## Formate le code (Prettier)
	$(EXEC_API) pnpm format

# --- Variante sans Docker (Node 24 + pnpm 10 + PostgreSQL locaux) -------------

install-local: ## Installe les dépendances sur la machine
	pnpm install --frozen-lockfile
	pnpm --filter @crossverse/api db:generate

test-local: ## Tests sur la machine (DATABASE_URL du .env, base <nom>_test)
	pnpm test

lint-local: ## Lint sur la machine
	pnpm lint

typecheck-local: ## Types sur la machine
	pnpm typecheck

check-local: lint-local typecheck-local test-local ## Lint, types et tests sur la machine

# --- E2E Playwright (lancés sur la machine : `make install-local` requis) --------
# Chromium Playwright 1.56 requis (`pnpm --filter @crossverse/e2e exec playwright install chromium`).
# Les limites de débit de l'API (en mémoire, par IP) n'autorisent qu'une exécution complète
# par heure : redémarrer l'API entre deux exécutions (`make restart`), avec RATE_LIMIT_MAX=1000
# (la suite dépasse 300 requêtes/min depuis une seule IP). Voir apps/e2e/README.md.

e2e: ## E2E Playwright contre la stack Docker démarrée (make start ; e-mails lus dans Mailpit)
	pnpm e2e

e2e-local: ## E2E contre API (:3001) et web (:3000) locaux, avec un faux Mailpit intégré
	E2E_SMTP_SINK=1 pnpm e2e

# --- Mobile (Expo, sur la machine : `make install-local` requis) -----------------
# Voir apps/mobile/README.md (adresse de l'API, émulateurs, Expo Go).

mobile: ## Lance l'app mobile Expo (QR code pour Expo Go, émulateur Android ou iOS)
	pnpm --filter @crossverse/mobile dev

# --- Production (serveur unique : Caddy + API + PostgreSQL) -------------------
# Prérequis : Docker sur le serveur, DNS du domaine vers le serveur, .env.prod rempli.

prod-check: ## Vérifie .env.prod et la configuration Compose de production
	@test -f .env.prod || { echo "Créez .env.prod depuis .env.prod.example."; exit 1; }
	@grep -Eq '^POSTGRES_PASSWORD=.{16,}' .env.prod || { echo "POSTGRES_PASSWORD absent ou trop court (16 caractères minimum)."; exit 1; }
	$(PROD) config --quiet && echo "Configuration de production valide."

prod-up: prod-check ## Construit et démarre la production (migrations appliquées au démarrage de l'API)
	$(PROD) up -d --build --wait
	@echo "En ligne : https://$$(grep -E '^DOMAIN=' .env.prod | cut -d= -f2)"

prod-pull: prod-check ## Déploie les images publiées par la CI (CROSSVERSE_VERSION dans .env.prod)
	$(PROD) pull api web
	$(PROD) up -d --no-build --wait

prod-down: ## Arrête la production (données conservées)
	$(PROD) stop

prod-logs: ## Journaux de production (make prod-logs s=api)
	$(PROD) logs -f --tail=100 $(s)

prod-ps: ## État des services de production
	$(PROD) ps

prod-seed: ## Charge les grilles de démonstration en production (idempotent)
	$(PROD) exec -T api pnpm exec tsx prisma/seed.ts

prod-account: ## Crée un compte confirmé en production (make prod-account email=… username=… [admin=1])
	$(check-account)
	$(PROD) exec -T -e ACCOUNT_PASSWORD api pnpm exec tsx scripts/account.ts create $(ACCOUNT_ARGS)

prod-account-role: ## Rôle admin en production (make prod-account-role email=… role=admin|player)
	$(check-role)
	$(PROD) exec -T api pnpm exec tsx scripts/account.ts $(ROLE_CMD) --email "$(email)"

prod-backup: ## Sauvegarde la base de production dans backups/
	@mkdir -p backups
	$(PROD) exec -T postgres sh -c 'pg_dump -Fc -U "$$POSTGRES_USER" "$$POSTGRES_DB"' > backups/prod-$$(date +%Y%m%d-%H%M%S).dump
	@ls -1t backups | head -1
