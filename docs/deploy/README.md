# Déploiement de Crossverse

> État au 2026-10-20 : workflows écrits et validés par `actionlint`, **jamais exécutés** (rien
> n'est encore poussé sur GitHub). Aucun compte externe n'est créé : les étapes marquées 👤 sont à
> faire par le porteur du projet, qui seul possède les comptes.

## Vue d'ensemble

```text
push sur main ──► release.yml
                   ├─ ci        lint, types, tests (PostgreSQL), audit, gitleaks (ci.yml)
                   ├─ images    ghcr.io/<owner>/crossverse-api et crossverse-web
                   │            tags : sha-<commit>, latest, X.Y.Z (sur tag vX.Y.Z)
                   ├─ deploy-api   Render tire crossverse-api:sha-<commit>   (si configuré)
                   └─ deploy-web   build Nuxt → Vercel (statique)             (si configuré)

tag mobile-vX.Y.Z ──► mobile.yml ── ci ── EAS Build (iOS) ── EAS Submit ──► TestFlight
pull request      ──► ci.yml
```

| Fichier                                | Rôle                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `.github/workflows/ci.yml`             | Contrôles qualité (PR, et appelé par les deux autres)    |
| `.github/workflows/release.yml`        | Images GHCR + déploiements web et API                    |
| `.github/workflows/mobile.yml`         | Build iOS signé et envoi TestFlight                      |
| `.github/scripts/vercel-config.mjs`    | Génère le `vercel.json` (relais `/api`, `/ws`, CSP)      |
| [IOS-TESTFLIGHT.md](IOS-TESTFLIGHT.md) | Pas à pas Apple, Expo, TestFlight puis App Store         |
| [proposals/](proposals/)               | Propositions : `apps/api` et compose (mobile : intégrée) |

Chaque déploiement ne s'exécute que si ses variables sont définies : sans configuration, la
release s'arrête proprement après la publication des images.

## Hébergement provisoire (avant le VPS)

Vercel ne convient qu'au **web** : ses fonctions serverless ne gardent ni connexion WebSocket
ni processus long, et l'API a besoin des deux (duels Socket.IO, rate limit en mémoire). D'où :

| Brique     | Hébergeur proposé                                  | Coût indicatif                                               |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Web (SPA)  | **Vercel** (Hobby)                                 | gratuit                                                      |
| API        | **Render**, service « Existing image » depuis GHCR | ~7 $/mois (Starter) ; l'offre gratuite s'endort après 15 min |
| PostgreSQL | **Neon** (Free)                                    | gratuit (0,5 Go)                                             |
| E-mails    | **Brevo** ou **Resend** (SMTP)                     | gratuit au début                                             |

Alternatives équivalentes pour l'API : Fly.io ou Railway (même image GHCR).

Comment le web parle à l'API : `vercel.json` relaie `/api/*` et `/ws/*` vers Render. Pour le
navigateur tout reste sur l'origine Vercel, donc le cookie de session (`SameSite=Lax`, même
origine) et la CSP `connect-src 'self'` fonctionnent sans changement. Limite connue : Vercel ne
relaie pas l'upgrade WebSocket, les duels web passent en **long polling** Socket.IO (fonctionnel,
un peu plus de latence). L'app iOS appelle Render directement (jeton porteur) et garde le
WebSocket.

## Ce qu'il faut fournir 👤

### Comptes

1. **GitHub** : dépôt `madoxSio/croise-tress` (existe). Rien à créer pour GHCR.
2. **Neon** (neon.tech) : un projet, région Europe (Francfort).
3. **Render** (render.com) : un compte, carte bancaire pour l'offre Starter.
4. **Vercel** (vercel.com) : un compte Hobby.
5. **Fournisseur SMTP** : Brevo ou Resend, avec un domaine d'envoi vérifié (sinon les e-mails de
   confirmation tombent en spam).
6. Pour l'iOS : voir [IOS-TESTFLIGHT.md](IOS-TESTFLIGHT.md) (Apple Developer 99 $/an, Expo).

### Secrets et variables GitHub

Dans **Settings → Secrets and variables → Actions** du dépôt :

| Type     | Nom                      | Valeur                                                            |
| -------- | ------------------------ | ----------------------------------------------------------------- |
| Secret   | `RENDER_DEPLOY_HOOK_URL` | Render → service API → Settings → Deploy Hook                     |
| Secret   | `VERCEL_TOKEN`           | Vercel → Account Settings → Tokens (portée : le projet)           |
| Secret   | `EXPO_TOKEN`             | expo.dev → Account Settings → Access Tokens                       |
| Variable | `API_PUBLIC_URL`         | `https://crossverse-api.onrender.com` (URL Render, sans `/`)      |
| Variable | `WEB_PUBLIC_URL`         | `https://crossverse.vercel.app` (ou domaine perso)                |
| Variable | `VERCEL_ORG_ID`          | `.vercel/project.json` après `vercel link`, ou Settings → General |
| Variable | `VERCEL_PROJECT_ID`      | idem                                                              |

Aucun secret de base de données ni SMTP dans GitHub : ils ne vivent que dans Render.

## Mise en place, pas à pas

### 1. Images GHCR

Rien à configurer : le premier push sur `main` publie `ghcr.io/madoxsio/crossverse-api` et
`crossverse-web`. Ensuite, 👤 sur github.com → profil → **Packages** → `crossverse-api` →
Package settings : passer la visibilité en **Public** (le dépôt l'est déjà, et Render pourra
tirer l'image sans identifiant). À défaut, donner à Render un jeton GitHub `read:packages`.

### 2. Base Neon

Créer le projet, copier la chaîne de connexion **directe** (pas celle avec `-pooler`, les
migrations Prisma en ont besoin), au format
`postgresql://user:motdepasse@ep-xxx.eu-central-1.aws.neon.tech/crossverse?sslmode=require`.

### 3. API sur Render

New → Web Service → **Existing image** → `ghcr.io/madoxsio/crossverse-api:latest`, région
Frankfurt, port **3001**, health check `/api/v1/health`. Variables d'environnement :

```sh
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001
DATABASE_URL=<chaîne Neon directe>
WEB_ORIGINS=https://crossverse.vercel.app
WEB_BASE_URL=https://crossverse.vercel.app
TRUST_PROXY=true
LOG_LEVEL=info
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<identifiant SMTP>
SMTP_PASSWORD=<mot de passe SMTP>
MAIL_FROM=Crossverse <no-reply@votre-domaine>
```

Les migrations s'appliquent au démarrage du conteneur (`prisma migrate deploy`). Copier ensuite
le **Deploy Hook** dans le secret `RENDER_DEPLOY_HOOK_URL`.

> Point à corriger avant d'ouvrir largement : avec `TRUST_PROXY=true`, l'API prend l'IP la plus
> à gauche de `X-Forwarded-For`. Via Vercel elle est fiable ; un client qui appelle Render en
> direct peut la falsifier et contourner les limites par IP. Correctif proposé :
> [proposals/api-and-compose.md](proposals/api-and-compose.md).

### 4. Web sur Vercel

Créer un projet vide (Add New → Project → sans dépôt, ou `npx vercel link` en local), puis
reporter `VERCEL_ORG_ID` et `VERCEL_PROJECT_ID`. Le build est fait par la CI ; le `vercel.json`
généré désactive tout build côté Vercel. Ne pas brancher l'intégration Git de Vercel (elle
lancerait ses propres builds et des aperçus que l'API refuserait, faute d'origine autorisée).

### 5. Premier déploiement

Pousser sur `main` (ou Actions → Release → Run workflow). Les environnements GitHub
`production-api` et `production-web` sont créés au premier passage ; on peut y ajouter une
validation manuelle obligatoire (Settings → Environments → Required reviewers).

## Passage au VPS

Les mêmes images servent sur le VPS : `compose.prod.yml` peut tirer `crossverse-api` et
`crossverse-web` depuis GHCR au lieu de les construire sur le serveur (proposition dans
[proposals/api-and-compose.md](proposals/api-and-compose.md)). Il suffira alors d'ajouter un job
`deploy-vps` (SSH : `docker compose pull && docker compose up -d`) et de retirer Render, Vercel
et Neon (export `pg_dump` depuis Neon, import sur le VPS).
