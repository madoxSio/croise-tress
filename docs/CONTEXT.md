# CROSSVERSE — CONTEXTE PRODUIT, ARCHITECTURE ET SÉCURITÉ

> Document de référence pour l'agent de développement. Les règles générales de l'agent existant restent prioritaires lorsqu'elles ne sont pas contradictoires avec les exigences explicites du projet. Ne jamais prétendre qu'une fonctionnalité, un test ou une protection fonctionne sans l'avoir vérifié.

## 1. Vision

Crossverse est une application de mots croisés nouvelle génération : expérience mobile-first, interface premium inspirée de la fluidité iOS, thèmes manga originaux et autres thèmes sélectionnables, défis quotidiens, progression, historique, aide/solution et mode multijoueur compétitif en ligne dans l'esprit d'une plateforme de jeu comme Chess.com, sans copier son interface.

Le produit doit être ludique sans être enfantin, facile à utiliser pour des publics d'âges différents, accessible, rapide, sécurisé et maintenable.

Dépôt GitHub : https://github.com/madoxSio/croise-tress

Le dépôt peut être vide. Inspecter son état réel et les fichiers locaux avant de supposer qu'une structure ou un code existe.

## 2. Méthode de travail

Ne pas générer tout le projet en une seule opération.

1. Lire `CLAUDE.md` et les autres instructions existantes.
2. Auditer le dépôt, son historique, les fichiers, les outils disponibles et leurs versions.
3. Vérifier la compatibilité des versions et les contraintes de déploiement.
4. Proposer un cadrage, une architecture, un modèle de données, une stratégie de sécurité et une roadmap avec critères d'acceptation.
5. Développer ensuite par tranches verticales fonctionnelles, en testant et documentant chaque étape.
6. Corriger les erreurs avant de passer à l'étape suivante.
7. Distinguer explicitement ce qui est implémenté, testé, partiellement réalisé et encore planifié.

Commencer par l'audit et le plan. Éviter de bloquer sur des choix secondaires : recommander une solution raisonnable et expliquer brièvement les compromis. Ne pas écraser les fichiers existants sans les avoir lus.

## 3. Stack recommandé et choix du backend

Évaluer puis privilégier, sauf incompatibilité démontrée :

- Frontend : Nuxt 4, Vue 3, TypeScript strict.
- UI : Tailwind CSS et composants accessibles réutilisables.
- Backend dédié : Node.js, Fastify et TypeScript strict.
- API : REST versionnée pour les opérations classiques.
- Temps réel : WebSockets via Socket.IO pour le matchmaking et les matchs.
- Base : PostgreSQL.
- ORM/migrations : Prisma si sa version est compatible et adaptée.
- Tests : Vitest et Playwright, plus tests d'intégration avec une vraie base de test.
- Infrastructure locale : Docker Compose et Makefile.
- Mobile futur : évaluer Capacitor, avec une vérification explicite de la compatibilité Nuxt, du mode de rendu et des dépendances natives.

**Décision recommandée : créer un backend API dédié.** Une simple application front-end ou un accès direct du client à PostgreSQL ne convient pas aux comptes, à la confirmation e-mail, aux ressources privées, aux scores compétitifs et au multijoueur. REST et WebSockets sont complémentaires : REST pour comptes/catalogue/profil/historique, WebSockets pour matchmaking et événements en direct.

Privilégier un monolithe modulaire, pas des microservices. Ne pas ajouter Redis, Kubernetes ou une infrastructure complexe sans besoin démontré. Redis pourra être introduit si la coordination de plusieurs instances ou la présence/mise en file le justifie.

## 4. Architecture et organisation

Séparer clairement :
- interface et composants visuels ;
- moteur de mots croisés indépendant du framework UI ;
- règles métier ;
- API et validation des entrées ;
- authentification et autorisations ;
- catalogue et validation des puzzles ;
- parties solo et progression ;
- matchmaking et parties multijoueurs ;
- persistance ;
- e-mails ;
- administration ;
- observabilité.

Exemple d'organisation indicative à adapter après audit :

```text
crossverse/
├── CLAUDE.md
├── docs/
│   ├── CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── SECURITY.md
│   ├── SECURITY-TEST-PLAN.md
│   └── THREAT-MODEL.md
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── crossword-core/
│   └── contracts/
├── prisma/
├── docker-compose.yml
├── Makefile
├── .env.example
└── README.md
```

Ne pas imposer ces dossiers si une meilleure organisation, plus simple, est justifiée. Ne pas partager du code côté client contenant des secrets ou des réponses qui doivent rester confidentielles.

## 5. Fonctionnalités produit

### MVP solo
- Accueil simple : défi du jour, reprendre la partie, jouer.
- Catalogue avec filtres de difficulté, thème, durée et statut.
- Niveaux découverte, facile, intermédiaire, difficile, expert.
- Grilles réellement jouables, définitions horizontales/verticales, cases bloquées, numéros, croisements cohérents.
- Saisie clavier, toucher, souris et stylet.
- Sélection d'une case ou d'un mot ; tracé par glissement sur les cases à la souris/au doigt/stylet.
- Déplacement automatique, changement de direction, navigation clavier et focus visible.
- Sauvegarde automatique et reprise.
- Vérification d'une lettre/d'un mot/de la grille.
- Indice pour révéler une lettre ou un mot, explication supplémentaire et solution complète, avec confirmation avant révélation totale.
- Historique, statistiques de base, favoris et préférences.
- Défi quotidien stable pour une date et un fuseau horaire documentés.
- Thèmes visuels réellement différents : Manga Premium original, minimal/iOS, papier et encre, cyberpunk, zen japonais, rétro arcade, sombre et contraste élevé.
- Option pour réduire les animations et ajuster la taille du texte.
- Succès et progression non punitifs.

Le catalogue initial doit contenir un petit nombre de puzzles cohérents, testés et reproductibles. Ne pas prétendre qu'un contenu est validé éditorialement s'il ne l'est pas.

### Moteur et tracé
Modéliser séparément la structure du puzzle, la solution attendue et l'état de résolution du joueur. Valider les coordonnées, croisements, numéros, définitions et normalisation des réponses (accents, apostrophes, espaces selon des règles explicites).

Le tracé doit utiliser les événements de pointeur adaptés (`pointerdown`, `pointermove`, `pointerup`, capture du pointeur si utile) et une gestion réfléchie de `touch-action`. Ne pas désactiver globalement le défilement de la page. Le tracé ne doit pas être le seul moyen de sélectionner un mot.

Ne pas transmettre au client plus de solutions que nécessaire. Le serveur doit vérifier les réponses et les opérations sensibles. Le moteur de jeu doit être testable indépendamment de l'UI.

### Progression et parcours
Prévoir ensuite un mode Parcours en chapitres thématiques, avec courtes introductions facultatives, collections, succès et récompenses cosmétiques. Le joueur doit pouvoir accéder au mode classique sans être forcé de suivre le parcours. Utiliser des illustrations originales, sans reprendre des personnages, logos ou univers protégés.

### Défi quotidien
Le défi du jour doit être identique pour tous les utilisateurs pour une date et un fuseau définis. L'association date-puzzle doit être déterministe et protégée par une contrainte d'unicité. Commencer par un catalogue préparé et validé plutôt qu'une génération automatique non contrôlée. Ajouter calendrier, résultats et historique.

## 6. Comptes, authentification et e-mails

Prévoir un système complet :
- inscription avec e-mail, nom d'utilisateur et mot de passe ;
- confirmation d'adresse e-mail obligatoire avant les actions qui nécessitent un compte confirmé ;
- connexion, déconnexion, révocation des sessions ;
- réinitialisation du mot de passe ;
- modification de l'e-mail avec nouvelle confirmation ;
- changement de mot de passe ;
- suppression du compte et gestion des données personnelles ;
- profil, préférences et progression synchronisée.

### Hashage des mots de passe
Interdiction de stocker des mots de passe en clair. Ne jamais utiliser MD5, SHA-1 ou SHA-256 seul comme fonction de stockage de mots de passe. Utiliser une bibliothèque maintenue qui implémente Argon2id, avec des paramètres documentés et adaptés à l'environnement. Ne pas implémenter soi-même un algorithme cryptographique.

### Jetons
Jetons de confirmation et de réinitialisation : aléatoires, à usage unique, à durée limitée, liés au compte, stockés sous forme protégée (par exemple hash du jeton), invalidés après usage/expiration et jamais journalisés. Limiter les demandes de renvoi et de réinitialisation. Réponses génériques lorsque nécessaire pour limiter l'énumération de comptes.

### Sessions
Pour l'application web, privilégier des sessions sûres via cookies `HttpOnly`, `Secure` en production et `SameSite` approprié, avec protection CSRF selon le modèle retenu, renouvellement après connexion, expiration et révocation. Ne pas stocker de jeton de longue durée dans `localStorage` sans justification documentée. Pour Capacitor, décider explicitement d'une stratégie compatible avec les plateformes mobiles ; ne pas supposer que le modèle de cookie web se comporte de manière identique partout.

Ne jamais exposer les secrets dans le frontend, les logs ou Git. L'envoi d'e-mails doit être derrière une abstraction de fournisseur, configurée par variables d'environnement. En développement, utiliser un mécanisme de capture/test d'e-mails sans envoi involontaire à de vrais destinataires.

## 7. Sécurité applicative : exigences obligatoires

La sécurité est intégrée dès la conception. S'appuyer sur les versions maintenues des dépendances et les références OWASP pertinentes : OWASP Top 10, OWASP API Security Top 10, ASVS et Cheat Sheet Series. Créer `THREAT-MODEL.md`, `SECURITY.md` et `SECURITY-TEST-PLAN.md`.

Ne pas promettre une sécurité absolue ou une conformité OWASP complète sans audit adapté.

### Contrôles requis
- **SQLi** : requêtes paramétrées/ORM correctement utilisé ; auditer les requêtes SQL brutes ; pas de concaténation non contrôlée ; compte PostgreSQL à privilèges minimaux.
- **XSS** : échappement contextuel ; éviter `v-html` et l'équivalent sur du contenu non fiable ; assainir si du HTML est réellement nécessaire ; CSP adaptée ; tester contenus stockés et réfléchis.
- **IDOR/BOLA** : vérifier côté serveur la propriété et l'autorisation sur chaque ressource, pas seulement l'identifiant ; tester explicitement les accès entre comptes.
- **CSRF** : protections adaptées à l'authentification par cookies, `SameSite`, vérification d'origine lorsque pertinente.
- **SSRF** : si des URL distantes sont récupérées, liste d'autorisation, contrôle des redirections et blocage des réseaux internes/métadonnées ; ne pas ajouter cette fonction sans besoin.
- **Injection de commandes** : ne jamais interpoler une entrée utilisateur dans un shell ; éviter les processus externes ; si nécessaires, arguments contrôlés, exécutable fixe, délais et ressources limités.
- **Auth/session** : limitation des tentatives, protection contre force brute, énumération, fixation de session, réinitialisation abusive et élévation de privilèges.
- **Validation/désérialisation** : schémas stricts à toutes les frontières HTTP, WebSocket, import et configuration ; contrôler les propriétés autorisées et prévenir l'affectation massive.
- **Mauvaise configuration** : CORS explicite, en-têtes de sécurité, CSP, erreurs non verbeuses en production, secrets absents du bundle, administration protégée, base non exposée à Internet.
- **WebSockets** : authentification de connexion et autorisation par événement, contrôle d'origine, validation de schéma, limites de taille/fréquence, contrôle des rooms, absence de fuite de données et gestion sûre des reconnexions.
- **Dépendances/chaîne CI** : lockfiles, audit des dépendances, mises à jour contrôlées, analyse des images, secrets CI protégés, conteneurs non-root lorsque possible.
- **DoS/abus** : limites de taille, débit, durée et concurrence ; protection contre abus de matchmaking, invitations, indices et opérations coûteuses.
- **Fichiers** : si import/téléversement ajouté, contrôler contenu, type, taille et chemin ; stocker hors des chemins exécutables ; ne pas faire confiance au MIME fourni.
- **Journalisation** : logs structurés sans mots de passe, jetons ou secrets ; minimiser les données personnelles et protéger les journaux.
- **Données/sauvegardes** : migrations versionnées, sauvegardes et procédure de restauration testée, contraintes d'intégrité et suppression maîtrisée.
- **Autorisation admin** : privilèges séparés, vérification côté serveur, journalisation des actions sensibles.

Pour chaque risque pertinent, documenter les mesures, les tests et les limites restantes. Les scanners automatisés ne remplacent pas les tests d'autorisation ni la revue de code.

## 8. Multijoueur compétitif en ligne

Créer un mode de duel inspiré de la fluidité de Chess.com, sans copier son interface. Prioriser d'abord les parties privées et le matchmaking rapide, puis le classement.

### Parcours
1. Le joueur authentifié demande un match.
2. Le serveur vérifie son éligibilité.
3. Le matchmaking attribue deux joueurs compatibles sans double affectation.
4. Le serveur crée un match et son état initial.
5. Les deux joueurs reçoivent la même grille et les mêmes règles.
6. Les actions sont envoyées et validées côté serveur.
7. La progression adverse est diffusée en temps réel.
8. Le serveur décide du résultat et le persiste.
9. L'historique et les statistiques sont mis à jour.

### Règles à définir avant codage
- Type de compétition : course de vitesse, score ou autre.
- Même puzzle, mêmes conditions de départ.
- Réponses et chronomètre officiels côté serveur.
- Conditions de victoire, égalité, abandon et expiration.
- Politique de déconnexion/reconnexion.
- Effet des indices sur le score, clairement expliqué.
- Idempotence des événements et prévention des récompenses en double.
- Historique des matchs et règles du classement.

Le client ne doit jamais pouvoir imposer son score, déclarer sa victoire ou envoyer un état complet arbitraire qui devient automatiquement officiel. Le serveur doit contrôler les réponses et les transitions d'état. Ne pas envoyer la solution complète avant qu'elle soit nécessaire.

### WebSockets
Définir des événements documentés pour rejoindre/quitter la file, créer le match, démarrer, soumettre une action, diffuser la progression, abandonner, terminer, se reconnecter et signaler les erreurs. Un identifiant de room n'est pas une autorisation. Chaque événement sensible doit vérifier l'identité, l'appartenance au match, la validité de l'action et les limites de débit.

### Concurrence et montée en charge
Utiliser transactions/contraintes ou mécanisme de coordination pour éviter doubles affectations et doubles résultats. Commencer simplement avec une instance. Si plusieurs instances deviennent nécessaires, documenter comment coordonner les WebSockets, la présence, le matchmaking et les états ; envisager Redis et un adaptateur compatible. Ne pas garder l'unique état officiel d'un match en mémoire sans stratégie de récupération.

## 9. Modèle de données indicatif

Évaluer les entités nécessaires, sans créer une table pour chaque concept par réflexe :
- utilisateurs/profils ;
- sessions ;
- jetons de confirmation et de réinitialisation ;
- puzzles, définitions et catégories ;
- défi quotidien ;
- sessions de jeu et progression ;
- matchs et participants ;
- événements de match si utiles ;
- statistiques ;
- succès et succès obtenus ;
- préférences ;
- favoris ;
- invitations.

Utiliser clés étrangères, contraintes d'unicité, index justifiés et transactions. Ne stocker aucune donnée sensible inutile. Les contraintes de base doivent protéger les invariants critiques même en cas de requêtes concurrentes.

## 10. Design et UX

L'interface doit être mobile-first, premium, lisible, ludique et rapide. Le jeu reste prioritaire : ne pas surcharger l'écran avec des cartes ou statistiques.

- Accueil : défi quotidien, reprendre, jouer, modes, progression.
- Mobile : grille lisible, grandes zones tactiles, définition active visible, clavier adapté, gestion du clavier virtuel et des zones de sécurité.
- Desktop : grille et définitions disposées efficacement, navigation clavier.
- Micro-interactions courtes et utiles pour sélection, saisie, bonne réponse et fin de partie.
- Respect de `prefers-reduced-motion`, contrastes et focus visible.
- Thèmes : Manga Premium original, minimal premium, papier/encre, cyberpunk, zen, rétro, sombre, contraste élevé.
- Taille de texte adaptable et alternatives au tracé tactile.
- Illustrations originales, sans copier d'œuvres ou de marques.

## 11. PWA et future publication iOS/Android

La première priorité est une application web fonctionnelle et responsive. Préparer une voie réaliste vers une PWA et une application mobile via Capacitor, sans retarder le MVP.

Avant de choisir le mode de rendu, vérifier la compatibilité réelle de Nuxt avec Capacitor. Documenter les fonctionnalités SSR qui nécessitent une adaptation et les dépendances web incompatibles avec un conteneur mobile.

Séparer le frontend et l'API. Ne jamais embarquer PostgreSQL dans le téléphone. Centraliser la configuration de l'API et isoler les capacités natives derrière des services. Préserver le moteur de jeu et les contrats API partagés.

Prévoir les contraintes mobile : clavier virtuel, reprise après arrière-plan, réseau instable, synchronisation, état hors ligne défini, encoches/zones de sécurité, performance sur appareils moyens et tests sur appareils réels.

Documenter les builds Android (Android Studio) et iOS (macOS/Xcode, certificats et signatures). Ne pas prétendre pouvoir signer un build iOS depuis n'importe quel environnement Linux. Prévoir icônes, écran de lancement, identifiants, politique de confidentialité et exigences des stores.

## 12. Docker, Makefile et configuration

Commandes attendues :
- `make init`
- `make start`
- `make stop`
- `make restart`
- `make logs`
- `make test`
- `make lint`
- `make typecheck`
- `make migrate`
- `make seed`
- `make reset-db`

`make init` doit préparer la configuration sans écraser un `.env` existant, construire les images nécessaires, démarrer les dépendances, attendre PostgreSQL, appliquer les migrations et charger des données de démonstration reproductibles.

`make start` démarre les services nécessaires au développement. Prévoir hot reload si pertinent. Ajouter healthchecks, volume PostgreSQL persistant, logs exploitables, ports documentés et `.env.example` sans secret. Ne pas publier PostgreSQL sur Internet. `make reset-db` doit annoncer clairement son caractère destructif et demander confirmation ou proposer une procédure sûre.

## 13. Tests, CI et critères de livraison

Prévoir :
- Tests unitaires du moteur, normalisation, intersections, indices, progression et transitions d'état.
- Tests d'intégration API/PostgreSQL.
- Tests d'authentification, confirmation e-mail, réinitialisation et révocation.
- Tests de contrôle d'accès/IDOR entre utilisateurs.
- Tests de validation des entrées et gestion des erreurs.
- Tests du matchmaking concurrent, double affectation, déconnexion/reconnexion et résultats.
- Tests E2E des parcours essentiels mobile/desktop avec Playwright.
- Lint, typecheck, tests et audit de dépendances dans la CI.

Parcours E2E minimum :
1. ouvrir l'application ;
2. jouer et remplir une grille ;
3. sélectionner horizontal/vertical et tracer ;
4. utiliser un indice ;
5. actualiser et reprendre ;
6. terminer la grille et vérifier l'historique ;
7. s'inscrire et confirmer l'e-mail en environnement de test ;
8. se connecter puis réinitialiser un mot de passe ;
9. vérifier qu'un compte ne peut pas accéder aux ressources privées d'un autre ;
10. démarrer un match avec deux clients et vérifier que le serveur valide le résultat.

Livrable seulement lorsque :
- le projet démarre avec les commandes documentées ;
- PostgreSQL persiste les données ;
- les puzzles de démonstration sont cohérents ;
- la sélection tactile/souris/clavier fonctionne ;
- les parties se reprennent ;
- l'authentification n'est pas simulée ;
- les mots de passe sont hashés correctement ;
- les contrôles d'accès sont testés ;
- le serveur est autoritaire pour les matchs ;
- les tests essentiels passent ;
- le responsive est vérifié ;
- les fonctionnalités non faites sont listées honnêtement ;
- aucun secret n'est commité.

## 14. Roadmap conseillée

Phase 1 — Audit, décisions, modèle de menace, architecture et critères d'acceptation.

Phase 2 — Vertical slice : puzzle validé, moteur, UI responsive, API, PostgreSQL, persistance et tests.

Phase 3 — Authentification réelle, confirmation e-mail, sessions, réinitialisation et contrôles d'accès.

Phase 4 — Défi quotidien, historique, thèmes, progression et succès.

Phase 5 — Matchs privés, matchmaking rapide, WebSockets, état serveur autoritaire, reconnexion et tests de concurrence.

Phase 6 — Renforcement sécurité, CI, sauvegardes, observabilité et documentation.

Phase 7 — PWA, prototype Capacitor, tests appareils réels et préparation stores.

## 15. Première réponse attendue de l'agent

Pour commencer, ne génère pas encore toute l'application. Présente :
1. le diagnostic du dépôt ;
2. les instructions existantes prises en compte ;
3. le stack recommandé et les raisons ;
4. l'architecture et l'arborescence proposées ;
5. le modèle de données initial ;
6. les flux d'inscription, de confirmation et de réinitialisation ;
7. le protocole du multijoueur et ses règles ;
8. les principaux risques de sécurité et les tests correspondants ;
9. la stratégie PWA/Capacitor ;
10. une roadmap ordonnée avec critères d'acceptation.

Après le cadrage, développe progressivement. Priorité : moteur fiable, sécurité vérifiable, UX tactile et code maintenable.
