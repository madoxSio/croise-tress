# Sécurité — règles et pratiques de développement

> Statut : règles applicables dès la première ligne de code. Aucune protection n'est implémentée au 2026-10-17. Ce document ne constitue pas une certification OWASP ; il fixe des exigences à vérifier par des tests (SECURITY-TEST-PLAN.md).

Références : OWASP Top 10 (2021/2025), OWASP API Security Top 10 (2023), ASVS 4/5 (niveau 2 visé pour auth, sessions, contrôle d'accès), OWASP Cheat Sheet Series.

## 1. Principes

- **Serveur autoritaire** : score, résultat, chrono, récompenses, progression validée, permissions et état des matchs sont calculés par le serveur. Le client envoie des intentions, pas des résultats.
- **Moindre privilège** : compte PostgreSQL applicatif sans droits DDL (les migrations utilisent un compte distinct), conteneurs non-root, rôles applicatifs `player`/`admin`.
- **Défense en profondeur** : validation de schéma + autorisation au service + contraintes en base.
- **Refus par défaut** : une route sans politique d'autorisation explicite ne passe pas la revue.

## 2. Validation des entrées

- Schémas Zod stricts (`.strict()`) pour corps, paramètres, query, en-têtes utiles, événements WebSocket, fichiers d'import de puzzles et variables d'environnement.
- Limites : corps HTTP ≤ 64 Kio par défaut, message WS ≤ 4 Kio, longueur des chaînes bornée (nom d'utilisateur 3–24 caractères `[a-zA-Z0-9_-]`, e-mail ≤ 254).
- Pas d'affectation massive : les services reçoivent des objets construits explicitement, jamais `req.body` transmis tel quel à Prisma.

## 3. Authentification et comptes

- **Hash** : `argon2` (Argon2id), paramètres de départ m=19 456 Kio, t=2, p=1 (recommandation OWASP minimale), calibrés pour ≈ 100–300 ms sur la cible ; ré-hachage transparent à la connexion si les paramètres évoluent. Longueur de mot de passe 12–128, vérification contre une liste de mots de passe courants, pas de règles de composition arbitraires.
- **Inscription** : réponse identique que l'e-mail existe ou non ; un e-mail « vous avez déjà un compte » est envoyé au propriétaire existant.
- **Confirmation e-mail** : jeton 32 octets aléatoires (`crypto.randomBytes`), stocké en SHA-256 (acceptable pour un jeton à haute entropie, pas pour un mot de passe), validité 24 h, usage unique, invalidation des précédents à chaque renvoi. Renvoi limité (ex. 3/heure).
- **Réinitialisation** : même schéma, validité 30 min ; réussite → révocation de toutes les sessions et e-mail de notification.
- **Changement d'e-mail** : confirmation sur la nouvelle adresse, notification à l'ancienne, mot de passe requis.
- **Force brute** : limitation par IP et par compte (ex. 5 échecs/15 min puis délai croissant), sans verrouillage permanent exploitable pour bloquer une victime.
- Actions sensibles (mot de passe, e-mail, suppression) : ré-authentification exigée.

## 4. Sessions et CSRF

- Identifiant opaque 32 octets, stocké haché en table `sessions`, cookie `__Host-cv_session` : `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Nouvel identifiant à chaque connexion (anti-fixation), expiration glissante 30 jours avec plafond absolu, révocation individuelle et globale.
- CSRF : vérification stricte de `Origin` (liste blanche) sur toute requête mutante + jeton CSRF (double soumission signée, `@fastify/csrf-protection`). Aucune action mutante en `GET`.
- Natif (Capacitor) : stratégie Bearer décrite dans ARCHITECTURE §5, à valider.

## 5. Autorisation (IDOR/BOLA)

- Toute requête sur une ressource possédée filtre par `user_id = session.userId` **dans la requête** (pas de lecture puis comparaison facultative).
- Un objet absent ou non autorisé renvoie la même réponse (404) pour ne pas révéler son existence.
- Routes admin sous préfixe dédié, garde de rôle côté serveur, actions journalisées dans `audit_log`.

## 6. Injections et contenu

- SQL : Prisma ; `$queryRaw` uniquement en gabarit balisé paramétré, `$queryRawUnsafe` interdit.
- XSS : interpolation Vue uniquement ; `v-html` interdit sur toute donnée utilisateur ou éditoriale non assainie. Définitions et pseudos traités comme texte.
- CSP : `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; connect-src 'self' wss://<domaine>` (ajustée et testée, sans `unsafe-inline` pour les scripts).
- Commandes système : aucune. SSRF : aucune récupération d'URL distante prévue.

## 7. WebSockets

- Handshake authentifié par la session, `Origin` vérifiée, refus si compte non confirmé pour le classé.
- Chaque événement : schéma Zod, appartenance au match, statut du match, transition autorisée, limite de débit par socket et par utilisateur (ex. 10 événements/s), taille ≤ 4 Kio.
- Rooms rejointes **uniquement par le serveur**. Aucune donnée privée de l'adversaire (lettres, solution) diffusée avant la fin.
- Une seule connexion de jeu active par joueur et par match ; la nouvelle remplace l'ancienne.

## 8. Abus et disponibilité

- `@fastify/rate-limit` (mémoire, une instance) sur auth, renvoi d'e-mail, indices, vérifications, invitations, file de matchmaking.
- Limite globale : 300 requêtes/min par IP toutes routes confondues (`RATE_LIMIT_MAX`, 300 par défaut, non défini en production). Seuls les E2E la relèvent (1000), parce que toute la suite passe par une seule IP ; les limites par route restent celles de la production.
- Délais d'attente côté serveur, pagination maximale (ex. 50), limites de connexions WS par utilisateur.
- Invitations : expiration, plafond d'invitations en attente, blocage possible d'un utilisateur.

## 9. Configuration, en-têtes, TLS

- `@fastify/helmet` : HSTS (prod), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive, CSP ci-dessus.
- CORS : désactivé par défaut (même origine) ; si nécessaire, liste blanche explicite, jamais `*` avec identifiants.
- TLS terminé au reverse proxy (TLS 1.2+), redirection HTTP→HTTPS.
- Erreurs : format générique `{ error: { code, message } }` en prod, détails uniquement dans les logs.

## 10. Journaux et données personnelles

- pino avec `redact` sur `password`, `token`, `authorization`, `cookie`, `set-cookie`.
- Journaliser : connexions (succès/échec), changements d'identifiants, actions admin, refus d'autorisation, dépassements de débit.
- RGPD : minimisation, export et suppression de compte, durée de conservation des logs et IP documentée.

## 11. Secrets, dépendances, CI

- Secrets uniquement en variables d'environnement / gestionnaire de secrets ; `.env` dans `.gitignore` ; scan de secrets (gitleaks) en CI et en pre-commit.
- Lockfile commité, `pnpm install --frozen-lockfile`, `pnpm audit` en CI, Dependabot/Renovate avec revue, versions stables uniquement.
- GitHub Actions : actions épinglées par SHA, `permissions:` minimales, pas de `pull_request_target` sur du code non fiable.
- Images : base officielle épinglée, utilisateur non-root, scan (Trivy) en CI.

## 12. Données et sauvegardes

- Migrations versionnées et revues ; contraintes d'intégrité en base pour les invariants critiques.
- Sauvegardes quotidiennes chiffrées, rétention documentée, **restauration testée** périodiquement (phase 6).

## 13. Signalement d'une vulnérabilité

Tant qu'aucune adresse dédiée n'existe, signaler en privé au propriétaire du dépôt (GitHub Security Advisories), pas dans une issue publique.
