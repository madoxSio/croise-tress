# @crossverse/e2e — parcours Playwright

Parcours de bout en bout joués dans Chromium, en **mobile** (Pixel 7) et en **bureau** (1280×900),
contre une API et un web **déjà démarrés**. Exclus de `pnpm test` (ils exigent des serveurs).

Dépendance : `@playwright/test` 1.56.1 (Apache-2.0, Microsoft), épinglée exactement : son Chromium
(révision 1194) est celui préinstallé dans l'environnement de travail.

| Spec               | Contenu                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solo.spec.ts`     | accueil → défi du jour → saisie, « Vérifier le mot », indice lettre, grille terminée, historique, puis grille pré-remplie (choix du mode, glisser, clavier, « Où est-il ? », fin)            |
| `account.spec.ts`  | inscription → lien de confirmation (e-mail) → compte → déconnexion → connexion → mot de passe oublié / réinitialisation → suppression                                                        |
| `duel.spec.ts`     | deux comptes (bureau + mobile) : invitation par code, mot faux refusé puis mot juste validé, score adverse en direct et après rechargement, abandon, partie rapide, classement (bureau seul) |
| `security.spec.ts` | SOL-02 (aucune réponse dans le JavaScript servi ni dans `apps/web/.output/public` s'il existe), invité refusé en duel, pas de défilement horizontal à 320 px                                 |
| `a11y.spec.ts`     | un seul `h1`, un seul `main`, `lang="fr"` sur les pages principales                                                                                                                          |

Les solutions viennent du seed de l'API (`apps/api/prisma/seed/puzzles.ts`) : le client ne les
connaît pas. Les comptes créés (`e2e-*@example.org`, pseudo `e2e_*`) sont supprimés par l'interface.

## Lancer

```sh
# Stack Docker démarrée (make start), sur la machine (make install-local) : e-mails lus dans Mailpit.
make e2e

# API (:3001) et web (:3000) locaux sans Docker, SMTP de l'API sur 127.0.0.1:1025 :
# un faux Mailpit (SMTP :1025 + API HTTP :8025) est démarré par le globalSetup.
make e2e-local
```

Variables : `E2E_BASE_URL` (défaut `http://localhost:3000`), `MAILPIT_URL` (défaut
`http://localhost:8025`), `E2E_SMTP_SINK=1` (faux Mailpit), `E2E_SMTP_SINK_PORT` (défaut 1025),
`E2E_START_SERVERS=1` (lance l'API et le web locaux via `webServer` s'ils ne tournent pas).

Hors de l'environnement de travail, installer le navigateur une fois :
`pnpm --filter @crossverse/e2e exec playwright install chromium` (non exécuté ici).

## Limites de débit

Les limites de l'API sont en mémoire et comptées par IP (tout passe par le proxy Nuxt) :
5 inscriptions/h, 5 connexions/15 min, 3 « mot de passe oublié »/h, 30 sessions invitées/h,
et 300 requêtes/min toutes routes confondues. La suite dépasse cette dernière en moins d'une
minute : l'API lancée par `E2E_START_SERVERS=1` (CI) reçoit `RATE_LIMIT_MAX=1000` ; pour une API
lancée à la main, la démarrer avec `RATE_LIMIT_MAX=1000`.
Une exécution complète consomme 4 inscriptions, 4 connexions et 2 demandes de réinitialisation :
**redémarrer l'API entre deux exécutions** (`make restart`, ou relancer `pnpm --filter
@crossverse/api start`), sinon des 429 apparaissent.

Rapport HTML : `apps/e2e/playwright-report/` ; traces des échecs : `apps/e2e/test-results/`.
