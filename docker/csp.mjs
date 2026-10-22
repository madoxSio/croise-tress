// Génère la directive Caddy Content-Security-Policy du build web : chaque script inline
// exécutable (importmap, configuration Nuxt) est autorisé par son empreinte SHA-256, sans
// recourir à 'unsafe-inline'. Usage : node docker/csp.mjs <dossier public> > csp.caddy
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) throw new Error('usage : node docker/csp.mjs <dossier public>')

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(path)
    else if (entry.name.endsWith('.html')) yield path
  }
}

const hashes = new Set()
for (const file of htmlFiles(root)) {
  for (const [, attrs, body] of readFileSync(file, 'utf8').matchAll(
    /<script([^>]*)>([\s\S]*?)<\/script>/g,
  )) {
    if (/\bsrc=/.test(attrs) || /type="application\/json"/.test(attrs) || body === '') continue
    hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
  }
}

const policy = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].sort().join(' ')}`.trim(),
  // Vue lie des attributs style (taille de grille, zones sûres) : style inline nécessaire.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')
process.stdout.write(`header Content-Security-Policy "${policy}"\n`)
