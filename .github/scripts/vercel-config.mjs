// Écrit le vercel.json du déploiement provisoire du web (SPA statique sur Vercel) dans le
// dossier du build. Il reproduit docker/Caddyfile : /api et /ws relayés vers l'API (même
// origine pour le navigateur, donc cookie SameSite=Lax et connect-src 'self' inchangés),
// repli SPA, en-têtes de sécurité et CSP par empreintes (calculée par docker/csp.mjs).
// Usage : node .github/scripts/vercel-config.mjs <dossier public> <origine HTTPS de l'API>
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [root, apiOriginArg] = process.argv.slice(2)
if (!root || !apiOriginArg) {
  throw new Error('usage : node .github/scripts/vercel-config.mjs <dossier public> <origine API>')
}
const apiOrigin = new URL(apiOriginArg)
if (apiOrigin.protocol !== 'https:' || apiOrigin.pathname !== '/' || apiOrigin.search !== '') {
  throw new Error(`origine API invalide (https://hôte attendu) : ${apiOriginArg}`)
}
const api = apiOrigin.origin
if (!existsSync(join(root, '200.html'))) throw new Error(`${root}/200.html absent : build Nuxt ?`)

const caddyCsp = execFileSync('node', ['docker/csp.mjs', root], { encoding: 'utf8' })
const csp = /^header Content-Security-Policy "(.+)"\n$/.exec(caddyCsp)?.[1]
if (!csp) throw new Error(`sortie inattendue de docker/csp.mjs : ${caddyCsp}`)

const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  // Fichiers déjà construits par la CI : Vercel ne fait que les servir.
  framework: null,
  installCommand: '',
  buildCommand: '',
  outputDirectory: '.',
  // Les fichiers existants sont servis avant les réécritures ; le reste part vers l'API ou
  // vers la page SPA (équivalent du try_files de Caddy).
  rewrites: [
    { source: '/api/:path*', destination: `${api}/api/:path*` },
    // Vercel ne relaie pas l'upgrade WebSocket : Socket.IO reste en long polling ici.
    { source: '/ws/:path*', destination: `${api}/ws/:path*` },
    { source: '/:path*', destination: '/200.html' },
  ],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: csp },
      ],
    },
    {
      source: '/_nuxt/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
}

writeFileSync(join(root, 'vercel.json'), `${JSON.stringify(config, null, 2)}\n`)
process.stdout.write(`vercel.json écrit : API ${api}\n`)
