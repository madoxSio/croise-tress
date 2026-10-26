// Génère les icônes PNG (web et mobile) et l'image de Meyron pour l'app mobile, depuis les
// SVG de ce dossier et apps/web/public/favicon.svg.
// Usage (Chromium de Playwright requis) : node docs/brand/render-icons.mjs
// Lancé depuis la racine du dépôt ; @playwright/test est résolu depuis apps/e2e.
// Ensuite, retirer le canal alpha de icon.png et apple-touch-icon.png (refusé par l'App Store),
// par exemple : python3 -c "from PIL import Image; im = Image.open(p); im.convert('RGB').save(p)"
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(join(process.cwd(), 'apps/e2e/package.json'))
const { chromium } = require('@playwright/test')

const brand = 'docs/brand'
const outputs = [
  [`${brand}/icon-square.svg`, 'apps/web/public/apple-touch-icon.png', 180],
  [`${brand}/icon-square.svg`, 'apps/web/public/icon-192.png', 192],
  [`${brand}/icon-square.svg`, 'apps/web/public/icon-512.png', 512],
  [`${brand}/icon-square.svg`, 'apps/mobile/assets/icon.png', 1024],
  [`${brand}/icon-background.svg`, 'apps/mobile/assets/android-icon-background.png', 512],
  [`${brand}/icon-foreground.svg`, 'apps/mobile/assets/android-icon-foreground.png', 512],
  [`${brand}/icon-monochrome.svg`, 'apps/mobile/assets/android-icon-monochrome.png', 432],
  ['apps/web/public/favicon.svg', 'apps/mobile/assets/favicon.png', 48],
  ['apps/web/public/favicon.svg', 'apps/mobile/assets/splash-icon.png', 1024],
  [`${brand}/meyron.svg`, 'apps/mobile/assets/meyron.png', 480],
]

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
for (const [source, target, size] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const svg = readFileSync(source, 'utf8').replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  )
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`)
  await page.screenshot({ path: target, omitBackground: true })
  await page.close()
  process.stdout.write(`${target} (${size} px)\n`)
}
await browser.close()
