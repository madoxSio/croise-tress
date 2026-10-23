# Déploiement de Crossverse

> État au 2026-10-23 : CI et publication des images GHCR **exécutées et vertes** sur `main`. Les
> déploiements (Render + Vercel en provisoire, VPS ensuite) sont écrits (`actionlint`,
> `shellcheck`) mais **jamais exécutés**. Les étapes marquées 👤 sont à faire par le porteur du
> projet.

## Vue d'ensemble

```text
pull request      ──► ci.yml        lint, types, tests (PostgreSQL), E2E Playwright, audit, gitleaks
push sur main     ──► release.yml
                       ├─ ci          (ci.yml)
                       ├─ images      ghcr.io/madoxsio/crossverse-api et crossverse-web
                       │              tags : sha-<commit>, latest, X.Y.Z (sur tag vX.Y.Z)
                       ├─ deploy-api  Render tire crossverse-api:sha-<commit>   (si API_PUBLIC_URL)
                       ├─ deploy-web  build Nuxt → Vercel (statique)             (si VERCEL_PROJECT_ID)
                       └─ deploy-vps  SSH → git checkout <commit> → make prod-pull  (si VPS_HOST)
tag mobile-vX.Y.Z ──► mobile.yml ── ci ── EAS Build (iOS) ── EAS Submit ──► TestFlight
```

| Fichier                                | Rôle                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| `.github/workflows/ci.yml`             | Contrôles qualité (PR, et appelé par les deux autres)   |
| `.github/workflows/release.yml`        | Images GHCR + déploiements Render, Vercel, VPS          |
| `.github/scripts/vercel-config.mjs`    | `vercel.json` : relais `/api` et `/ws` vers Render, CSP |
| `.github/workflows/mobile.yml`         | Build iOS signé et envoi TestFlight                     |
| [vps-bootstrap.sh](vps-bootstrap.sh)   | Préparation unique d'un VPS Ubuntu 24.04                |
| [IOS-TESTFLIGHT.md](IOS-TESTFLIGHT.md) | Pas à pas Apple, Expo, TestFlight puis App Store        |

## Provisoire : Render (API) + Vercel (web) + Neon (base)

Vercel n'héberge que le web statique : ses fonctions serverless ne gardent ni WebSocket ni
processus long. L'API tourne sur Render à partir de l'image GHCR, la base sur Neon. Le
`vercel.json` généré par la CI relaie `/api` et `/ws` vers Render : le navigateur reste sur
l'origine Vercel (cookie et CSP inchangés). Limite : Vercel ne relaie pas l'upgrade WebSocket,
les duels web passent en long polling. L'app iOS appelle Render directement.

1. 👤 **Neon** (neon.tech, connexion GitHub) : projet en région Frankfurt ; copier la chaîne de
   connexion **directe** (sans `-pooler`), avec `?sslmode=require`.
2. 👤 **Brevo** : compte, adresse d'envoi vérifiée, identifiants SMTP.
3. 👤 **Vercel** : Add New → Project → importer `madoxSio/croise-tress`, puis Settings → Git →
   **Disconnect** (c'est la CI qui construit et envoie ; un build Vercel n'aurait pas les
   relais vers l'API). Noter l'URL `https://<projet>.vercel.app`, l'ID d'équipe et l'ID du projet
   (Settings → General), et créer un jeton (Account Settings → Tokens).
4. 👤 **Render** : New → Web Service → **Existing Image** →
   `ghcr.io/madoxsio/crossverse-api:latest` (image publique, aucun identifiant), région
   Frankfurt, offre Starter (l'offre gratuite s'endort après 15 min), port 3001, health check
   `/api/v1/health`. Variables d'environnement :

   ```sh
   NODE_ENV=production
   API_HOST=0.0.0.0
   API_PORT=3001
   DATABASE_URL=<chaîne Neon directe>
   WEB_ORIGINS=https://<projet>.vercel.app
   WEB_BASE_URL=https://<projet>.vercel.app
   # Vercel puis le proxy de Render : 2 sauts. Un client qui appelle Render en direct peut
   # falsifier X-Forwarded-For : risque accepté en provisoire, absent sur le VPS (1 saut, Caddy).
   TRUST_PROXY=2
   LOG_LEVEL=info
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<identifiant Brevo>
   SMTP_PASSWORD=<clé SMTP Brevo>
   MAIL_FROM=Crossverse <adresse vérifiée chez Brevo>
   ```

   Puis Settings → **Deploy Hook** : copier l'URL.

5. 👤 **GitHub** (Settings → Secrets and variables → Actions) :

   | Type     | Nom                      | Valeur                           |
   | -------- | ------------------------ | -------------------------------- |
   | Secret   | `RENDER_DEPLOY_HOOK_URL` | Deploy Hook de Render            |
   | Secret   | `VERCEL_TOKEN`           | jeton Vercel                     |
   | Variable | `API_PUBLIC_URL`         | `https://<service>.onrender.com` |
   | Variable | `WEB_PUBLIC_URL`         | `https://<projet>.vercel.app`    |
   | Variable | `VERCEL_ORG_ID`          | ID d'équipe Vercel               |
   | Variable | `VERCEL_PROJECT_ID`      | ID du projet Vercel              |

6. Actions → Release → **Run workflow** sur `main` : images, puis Render, puis Vercel.

Au passage au VPS : supprimer `API_PUBLIC_URL` et `VERCEL_PROJECT_ID` (les deux jobs
s'arrêtent), exporter la base Neon (`pg_dump`) et l'importer sur le VPS.

## Cible : un VPS

Tout tourne sur une machine avec `compose.prod.yml` : Caddy (TLS Let's Encrypt automatique,
SPA, relais `/api` et `/ws`), l'API et PostgreSQL (jamais exposé). Les images viennent de GHCR,
le serveur ne compile rien. Le web et l'API partagent la même origine : cookie `SameSite=Lax`,
CSP `connect-src 'self'` et WebSocket fonctionnent sans réglage.

| Brique  | Choix                                                           | Coût                                                     |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Serveur | DigitalOcean Droplet, Ubuntu 24.04, 2 Go, Frankfurt             | ~12 $/mois, couvert par le crédit GitHub Student (200 $) |
| Domaine | `<nom>.duckdns.org` (DuckDNS) ou `.me` Namecheap (Student Pack) | gratuit                                                  |
| E-mails | Brevo (SMTP)                                                    | gratuit (300 e-mails/jour)                               |

## Mise en place 👤

1. **Droplet** : Ubuntu 24.04, 2 Go de RAM, région Frankfurt, authentification par clé SSH.
2. **DNS** : sur duckdns.org, créer le sous-domaine et y mettre l'IPv4 du Droplet.
3. **Brevo** : créer le compte, vérifier l'adresse d'envoi, récupérer les identifiants SMTP
   (Settings → SMTP & API).
4. **Bootstrap** (en root sur le Droplet, avec la clé publique de déploiement fournie) :

   ```sh
   curl -fsSL https://raw.githubusercontent.com/madoxSio/croise-tress/main/docs/deploy/vps-bootstrap.sh -o bootstrap.sh
   less bootstrap.sh
   bash bootstrap.sh crossverse.duckdns.org "ssh-ed25519 AAAA… crossverse-deploy"
   ```

   Il installe Docker, le pare-feu, les mises à jour de sécurité, l'utilisateur `deploy`, clone
   le dépôt dans `/opt/crossverse`, génère `.env.prod` (mot de passe PostgreSQL aléatoire) et
   programme une sauvegarde quotidienne (14 jours conservés dans `/opt/crossverse/backups`).

5. **SMTP** : compléter `SMTP_*` et `MAIL_FROM` dans `/opt/crossverse/.env.prod`.
6. **Premier démarrage** : `su - deploy -c 'cd /opt/crossverse && make prod-pull && make prod-seed'`,
   puis ouvrir `https://<domaine>`.

## Secrets et variables GitHub

Settings → Secrets and variables → Actions :

| Type     | Nom               | Valeur                                                              |
| -------- | ----------------- | ------------------------------------------------------------------- |
| Variable | `VPS_HOST`        | IPv4 du Droplet                                                     |
| Variable | `VPS_DOMAIN`      | `crossverse.duckdns.org`                                            |
| Variable | `VPS_USER`        | `deploy` (valeur par défaut)                                        |
| Secret   | `VPS_SSH_KEY`     | clé privée ed25519 dédiée à la CI (sa clé publique va au bootstrap) |
| Secret   | `VPS_KNOWN_HOSTS` | `<IP> ssh-ed25519 AAAA…` (ligne affichée à la fin du bootstrap)     |
| Secret   | `EXPO_TOKEN`      | expo.dev → Account Settings → Access Tokens (iOS)                   |

Les secrets de la base et du SMTP ne quittent pas le serveur (`.env.prod`, mode 600).

Ensuite chaque push sur `main` déploie en quelques minutes ; l'environnement GitHub
`production` peut exiger une validation manuelle (Settings → Environments → Required reviewers).
Retour arrière : relancer Release sur un ancien commit, ou sur le serveur
`CROSSVERSE_VERSION=sha-<commit> make prod-pull`.

## Application iOS

`apps/mobile/eas.json` pointe encore vers l'API provisoire Render : remplacer
`EXPO_PUBLIC_API_URL` par `https://<domaine>` dès que le domaine est fixé. Le reste est dans
[IOS-TESTFLIGHT.md](IOS-TESTFLIGHT.md).
