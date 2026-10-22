# Proposition pour `apps/api`, `compose.prod.yml` et la documentation

Pour le fil « Audit et cadrage » (propriétaire de `apps/api`, `compose.prod.yml`, Makefile et
`docs/PROGRESS.md`). Rien n'a été modifié dans ces fichiers.

## 1. `TRUST_PROXY` : nombre de proxys de confiance (sécurité, avant ouverture publique)

Aujourd'hui `TRUST_PROXY=true` fait lire à Fastify l'adresse **la plus à gauche** de
`X-Forwarded-For`. Derrière Caddy seul (VPS) c'est sûr, Caddy réécrit l'en-tête. Sur Render,
un client qui appelle l'API en direct (c'est le cas de l'app iOS) peut envoyer son propre
`X-Forwarded-For` et contourner les limites par IP (inscription, connexion, mot de passe oublié).

Proposition : accepter aussi un entier, transmis tel quel à `trustProxy` (Fastify fait alors
confiance à exactement N sauts depuis la droite).

```ts
TRUST_PROXY: z
  .string()
  .default('false')
  .transform((v, ctx) => {
    if (v === 'true' || v === 'false') return v === 'true'
    const hops = Number(v)
    if (Number.isInteger(hops) && hops >= 1 && hops <= 5) return hops
    ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY : true, false ou un entier 1-5' })
    return z.NEVER
  }),
```

`readonly trustProxy: boolean | number` dans `Config`. Valeurs : `1` derrière Caddy (VPS) ;
sur Render à mesurer (`request.ips` journalisé une fois, via Vercel puis en direct) avant de
fixer la valeur. Test à ajouter : une requête avec `X-Forwarded-For: 1.2.3.4` forgé ne change
pas l'IP retenue par le rate limit.

## 2. `compose.prod.yml` : tirer les images GHCR au lieu de les construire sur le VPS

```yaml
api:
  image: ghcr.io/madoxsio/crossverse-api:${CROSSVERSE_VERSION:-latest}
  build: { context: ., dockerfile: docker/prod.Dockerfile, target: api } # garder pour `make prod-up` local
web:
  image: ghcr.io/madoxsio/crossverse-web:${CROSSVERSE_VERSION:-latest}
  build: { context: ., dockerfile: docker/prod.Dockerfile, target: web }
```

Avec `pull_policy: missing`, `docker compose pull && docker compose up -d` suffit sur le VPS ;
`CROSSVERSE_VERSION=sha-<commit>` permet un retour arrière immédiat. Ajouter
`CROSSVERSE_VERSION=` à `.env.prod.example` et une cible `make prod-pull`.

## 3. CI : branche `main` et protections

`ci.yml` n'a plus de déclencheur `push` : sur `main`, il est appelé par `release.yml` (et par
`mobile.yml` avant un build iOS). Recommandé dans GitHub : protéger `main` (PR obligatoire,
statut « CI / quality » et « CI / secrets » requis).

## 4. Documentation

- `docs/PROGRESS.md` : ajouter l'étape « CI/CD et déploiement provisoire » (🟡 écrite, jamais
  exécutée) avec renvoi vers `docs/deploy/README.md`.
- `docs/ARCHITECTURE.md` : hébergement provisoire Vercel + Render + Neon, et le long polling
  Socket.IO côté web tant que Vercel relaie `/ws`.
- `README.md` : section « Déployer » qui renvoie vers `docs/deploy/`.
