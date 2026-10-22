# Plan de tests de sécurité — Crossverse

> Statut : plan. **Aucun test n'existe ni n'a été exécuté** au 2026-10-17. Chaque ligne passera à « automatisé » avec le chemin du test quand il sera écrit et exécuté en CI.

## 1. Stratégie

| Niveau                                                                                  | Outil                                                            | Quand                          |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| Unitaires sécurité (normalisation, hachage, génération de jetons, transitions de match) | Vitest                                                           | chaque commit                  |
| Intégration API + PostgreSQL réelle (auth, autorisation, validation, débit)             | Vitest + `fastify.inject` + base de test jetable                 | chaque commit                  |
| Temps réel (deux clients Socket.IO ou plus)                                             | Vitest + `socket.io-client`                                      | chaque commit                  |
| E2E (cookies, CSRF, parcours)                                                           | Playwright                                                       | chaque PR                      |
| Statique : lint sécurité, types, secrets                                                | ESLint (`eslint-plugin-security`, règle anti `v-html`), gitleaks | chaque commit                  |
| Dépendances et images                                                                   | `pnpm audit`, Trivy                                              | chaque PR + hebdomadaire       |
| Dynamique                                                                               | OWASP ZAP baseline sur l'environnement de test                   | phase 6, chaque release        |
| Revue manuelle                                                                          | checklist §3 + revue de code des modules auth/match              | chaque PR touchant ces modules |

Principe : les tests d'autorisation utilisent **deux comptes réels** (A et B) et une fabrique de données ; pas de bouchon de la couche d'autorisation.

## 2. Cas de test

### Authentification et comptes (T1–T3)

- AUTH-01 Le mot de passe est stocké au format `$argon2id$v=19$m=…` avec les paramètres configurés ; jamais en clair.
- AUTH-02 Inscription avec e-mail existant : réponse identique (statut, corps) à une inscription nouvelle.
- AUTH-03 Mot de passe oublié sur e-mail inconnu : réponse identique.
- AUTH-04 6ᵉ tentative de connexion échouée en 15 min → 429 ; compteur par compte et par IP.
- AUTH-05 Jeton de confirmation : usage unique, expiré refusé, jeton d'un autre utilisateur refusé, jeton absent des logs.
- AUTH-06 Réinitialisation réussie → toutes les sessions existantes révoquées.
- AUTH-07 Action réservée aux comptes confirmés refusée pour un compte non confirmé.
- AUTH-08 Changement d'e-mail : effectif seulement après confirmation sur la nouvelle adresse.

### Sessions et CSRF (T4–T5)

- SESS-01 Cookie émis avec `HttpOnly`, `Secure` (prod), `SameSite=Lax`, préfixe `__Host-`.
- SESS-02 L'identifiant change après connexion (anti-fixation).
- SESS-03 Session révoquée ou expirée → 401 immédiat.
- CSRF-01 Requête mutante avec `Origin` étrangère → 403.
- CSRF-02 Requête mutante sans jeton CSRF → 403.
- CSRF-03 Aucune route `GET` ne modifie d'état (test de parcours des routes).

### Autorisation (T6, T17)

- AUTHZ-01 B lit/modifie/supprime la partie de A → 404, données inchangées.
- AUTHZ-02 Idem pour préférences, favoris, sessions, invitations, historique.
- AUTHZ-03 Utilisateur `player` sur toute route `/admin` → 403/404.
- AUTHZ-04 Champ `role`, `emailVerifiedAt` ou `userId` ajouté au corps → rejeté (schéma strict).

### Confidentialité des solutions et intégrité solo (T7–T9)

- SOL-01 Aucune réponse de `/puzzles*` ne contient la clé `solution` ni les lettres (inspection récursive du JSON).
- SOL-02 Le bundle de production et les source maps publiées ne contiennent aucune donnée de seed de solution.
- SOL-03 `check` au-delà de la limite → 429.
- SOL-04 Envoi d'une durée ou d'un score par le client → ignoré ; la durée provient des horodatages serveur.
- SOL-05 Marquer terminée une grille incorrecte → refusé.

### Entrées et injections

- VAL-01 Corps > limite → 413 ; message WS > limite → rejeté.
- VAL-02 Charges SQLi courantes dans recherche/filtres → aucune erreur 500, résultats normaux.
- VAL-03 Pseudo contenant `<script>` → rejeté par le schéma ; contenu éditorial avec HTML affiché comme texte (E2E).
- VAL-04 Pagination : `limit=100000` → borné à la valeur maximale.
- VAL-05 Erreur interne en mode prod → corps générique sans pile ni requête SQL.

### Multijoueur (T10–T14)

- WS-01 Connexion sans session ou avec `Origin` étrangère → refusée.
- WS-02 C (non participant) émet un événement sur le match de A et B → erreur, aucun effet, aucune donnée reçue.
- WS-03 Événements `match:ended`, `score`, `winner` forgés par un client → ignorés.
- WS-04 Même `clientEventId` envoyé deux fois → un seul effet.
- WS-05 50 joueurs rejoignent la file simultanément → aucun joueur dans deux matchs, nombre de matchs = ⌊50/2⌋.
- WS-06 Deux soumissions gagnantes simultanées → un seul résultat, récompenses attribuées une fois.
- WS-07 Déconnexion < délai de grâce puis reconnexion → état restauré ; > délai → abandon enregistré.
- WS-08 Redémarrage de l'API pendant un match → état et échéance restaurés depuis la base.
- WS-09 Trafic reçu par un joueur pendant le match : aucune lettre de l'adversaire ni de la solution.
- WS-10 Inondation d'événements → limitée, socket coupée au-delà du seuil.

### Configuration et en-têtes

- CFG-01 En-têtes présents : CSP, HSTS (prod), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- CFG-02 CORS : origine non autorisée → aucun en-tête `Access-Control-Allow-Origin`.
- CFG-03 Démarrage avec configuration invalide ou secret manquant → échec explicite.
- CFG-04 PostgreSQL non joignable depuis l'extérieur du réseau Docker (publication `127.0.0.1` uniquement en dev).

### Journaux, secrets, chaîne

- LOG-01 Connexion, réinitialisation et changement de mot de passe : aucun mot de passe, jeton ni cookie dans les logs capturés.
- SEC-01 gitleaks sans alerte sur l'historique.
- DEP-01 `pnpm audit --audit-level high` sans vulnérabilité non traitée (exceptions documentées et datées).

### Sauvegarde

- BAK-01 Sauvegarde puis restauration sur une base vierge → données et contraintes identiques (phase 6).

## 3. Checklist de revue manuelle (PR auth / match / admin)

- [ ] Toute nouvelle route a un schéma strict et une politique d'autorisation explicite.
- [ ] Les requêtes sur des ressources possédées filtrent par propriétaire.
- [ ] Aucune donnée sensible dans les DTO de réponse ni dans les logs.
- [ ] Les nouvelles transitions d'état sont protégées contre la concurrence (contrainte ou `UPDATE … WHERE`).
- [ ] Limites de débit et de taille définies.
- [ ] Tests ajoutés pour le chemin nominal **et** les refus.
