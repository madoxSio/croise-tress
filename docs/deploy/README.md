# Déploiement de Crossverse

> État au 2026-10-23 : CI et publication des images GHCR **exécutées et vertes** sur `main`. Le
> déploiement sur le VPS est écrit (`actionlint`, `shellcheck`) mais **jamais exécuté** : il
> attend le serveur. Les étapes marquées 👤 sont à faire par le porteur du projet.

## Vue d'ensemble

```text
pull request      ──► ci.yml        lint, types, tests (PostgreSQL), E2E Playwright, audit, gitleaks
push sur main     ──► release.yml
                       ├─ ci          (ci.yml)
                       ├─ images      ghcr.io/madoxsio/crossverse-api et crossverse-web
                       │              tags : sha-<commit>, latest, X.Y.Z (sur tag vX.Y.Z)
                       └─ deploy-vps  SSH → git checkout <commit> → make prod-pull  (si VPS_HOST)
tag mobile-vX.Y.Z ──► mobile.yml ── ci ── EAS Build (iOS) ── EAS Submit ──► TestFlight
```

| Fichier                                | Rôle                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `.github/workflows/ci.yml`             | Contrôles qualité (PR, et appelé par les deux autres) |
| `.github/workflows/release.yml`        | Images GHCR + déploiement sur le VPS                  |
| `.github/workflows/mobile.yml`         | Build iOS signé et envoi TestFlight                   |
| [vps-bootstrap.sh](vps-bootstrap.sh)   | Préparation unique d'un VPS Ubuntu 24.04              |
| [IOS-TESTFLIGHT.md](IOS-TESTFLIGHT.md) | Pas à pas Apple, Expo, TestFlight puis App Store      |

## Hébergement : un VPS

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
