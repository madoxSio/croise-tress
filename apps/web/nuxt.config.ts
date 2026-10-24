import tailwindcss from '@tailwindcss/vite'

// Cible du proxy de développement : l'API Fastify. Le navigateur ne parle qu'à l'origine
// du serveur Nuxt (même origine → cookie SameSite=Lax et en-tête Origin cohérents).
const apiProxyTarget = (process.env['NUXT_API_PROXY_TARGET'] ?? 'http://127.0.0.1:3001').replace(
  /\/+$/,
  '',
)

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  // SPA statique : build embarquable tel quel dans Capacitor (décision D2).
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  // Polices auto-hébergées (CSP font-src 'self') : Inter pour le texte, Bricolage pour les titres.
  css: [
    '@fontsource-variable/inter/wght.css',
    '@fontsource-variable/bricolage-grotesque/wght.css',
    '~/assets/css/main.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Crossverse',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'Mots croisés en solo, défi du jour et duels en ligne, sur mobile, tablette et ordinateur.',
        },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#f7f6fb', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0d0b17', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    // Pré-groupées dès le démarrage de `nuxt dev` : sinon Vite les découvre au premier
    // chargement et recharge la page en pleine navigation (parcours E2E interrompus).
    optimizeDeps: { include: ['socket.io-client', 'zod'] },
  },
  nitro: {
    // Le préfixe `/api` est retiré puis ajouté à la cible : on le remet explicitement.
    devProxy: {
      '/api': { target: `${apiProxyTarget}/api` },
      // Temps réel (Socket.IO) : même origine que la page, donc cookie et Origin cohérents.
      '/ws': { target: `${apiProxyTarget}/ws`, ws: true },
    },
  },
  typescript: {
    strict: true,
    // Le contrôle de types est lancé explicitement (`pnpm typecheck`), pas pendant le build.
    typeCheck: false,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noFallthroughCasesInSwitch: true,
        noPropertyAccessFromIndexSignature: true,
      },
    },
  },
})
