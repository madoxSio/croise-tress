<script setup lang="ts">
const route = useRoute()
// Invité (ou session pas encore ouverte) : on propose de se connecter ou de créer un compte.
const { status, error, isGuest, ensure } = useSession()
const accountLink = computed(() =>
  isGuest.value ? { to: '/login', label: 'Se connecter' } : { to: '/account', label: 'Mon compte' },
)

// En haut à partir de `sm`, en barre d'onglets fixe en bas sur mobile (5 entrées ne tiennent
// pas dans l'en-tête sous 390 px de large). Icônes décoratives : le libellé reste visible.
const links = [
  {
    to: '/',
    label: 'Accueil',
    icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  },
  {
    to: '/puzzles',
    label: 'Grilles',
    icon: 'M4 4h16v16H4zM4 9.33h16M4 14.66h16M9.33 4v16M14.66 4v16',
  },
  { to: '/duel', label: 'Duel', icon: 'M13 2 4 14h7l-1 8 9-12h-7z' },
  { to: '/history', label: 'Parties', icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z' },
  {
    to: '/preferences',
    label: 'Réglages',
    icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  },
] as const

const footerLinks = [
  { to: '/comment-jouer', label: 'Comment jouer' },
  { to: '/comment-jouer#compte', label: 'Sans compte ou avec' },
  { to: '/preferences', label: 'Accessibilité et réglages' },
] as const

const isCurrent = (to: string): boolean =>
  to === '/' ? route.path === '/' : route.path.startsWith(to)
</script>

<template>
  <div class="bg-bg text-fg relative flex min-h-dvh flex-col">
    <div aria-hidden="true" class="cv-backdrop" />
    <a
      href="#contenu"
      class="bg-accent text-accent-fg sr-only z-50 rounded-full px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Aller au contenu
    </a>
    <header
      class="sticky top-0 z-30 px-3 pt-3"
      :style="{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }"
    >
      <div
        class="cv-glass border-line shadow-card mx-auto flex h-14 max-w-6xl items-center gap-3 rounded-2xl border px-2 sm:px-3"
      >
        <NuxtLink
          to="/"
          class="mr-auto flex min-h-11 items-center gap-2 rounded-xl pr-2 pl-1"
          aria-label="Crossverse, accueil"
        >
          <img src="/favicon.svg" alt="" width="32" height="32" class="size-8 rounded-lg" />
          <span class="font-display text-lg font-extrabold tracking-tight">Crossverse</span>
        </NuxtLink>
        <nav aria-label="Navigation principale" class="hidden sm:block">
          <ul class="flex items-center gap-0.5 text-sm font-medium">
            <li v-for="link in links" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="inline-flex min-h-11 items-center rounded-xl px-3 transition-colors"
                :class="
                  isCurrent(link.to)
                    ? 'bg-accent-soft text-fg font-semibold'
                    : 'text-muted hover:text-fg hover:bg-surface-2'
                "
                :aria-current="isCurrent(link.to) ? 'page' : undefined"
              >
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
        <!-- Sur mobile, une icône (nom accessible conservé) ; l'inscription est proposée depuis /login. -->
        <div class="flex items-center gap-1 text-sm font-semibold">
          <NuxtLink
            :to="accountLink.to"
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl md:px-3"
            :class="
              isCurrent(accountLink.to) ? 'bg-accent-soft text-fg' : 'text-fg hover:bg-surface-2'
            "
            :aria-current="isCurrent(accountLink.to) ? 'page' : undefined"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="size-5 md:hidden"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            <span class="sr-only whitespace-nowrap md:not-sr-only">{{ accountLink.label }}</span>
          </NuxtLink>
          <NuxtLink
            v-if="isGuest"
            to="/register"
            class="bg-accent text-accent-fg shadow-cta hidden min-h-11 items-center rounded-xl px-4 whitespace-nowrap transition-transform hover:-translate-y-px lg:inline-flex"
            >Créer un compte</NuxtLink
          >
        </div>
      </div>
    </header>

    <div
      v-if="status === 'error'"
      role="alert"
      class="bg-danger-soft text-danger relative z-10 mx-3 mt-3 rounded-2xl px-4 py-3 text-sm"
    >
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span>Impossible d'ouvrir une session : {{ error }}</span>
        <button
          type="button"
          class="border-danger rounded-full border px-3 py-1 font-semibold"
          @click="ensure"
        >
          Réessayer
        </button>
      </div>
    </div>

    <main
      id="contenu"
      tabindex="-1"
      class="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none sm:px-6"
    >
      <slot />
    </main>

    <footer class="border-line relative z-10 mt-8 border-t">
      <div
        class="text-muted mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:px-6"
      >
        <p class="flex items-center gap-2">
          <img src="/favicon.svg" alt="" width="24" height="24" class="size-6 rounded-md" />
          <span
            ><span class="text-fg font-display font-bold">Crossverse</span> · avec Sougoudou</span
          >
        </p>
        <nav aria-label="Liens utiles" class="sm:ml-auto">
          <ul class="flex flex-wrap gap-x-5 gap-y-1">
            <li v-for="link in footerLinks" :key="link.to">
              <NuxtLink :to="link.to" class="hover:text-fg inline-flex min-h-11 items-center">{{
                link.label
              }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </footer>

    <!-- Réserve la hauteur de la barre d'onglets mobile pour ne rien masquer en bas de page. -->
    <div
      aria-hidden="true"
      class="sm:hidden"
      :style="{ height: 'calc(4.75rem + env(safe-area-inset-bottom))' }"
    />
    <nav
      aria-label="Navigation principale"
      class="fixed inset-x-0 bottom-0 z-30 px-3 sm:hidden"
      :style="{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }"
    >
      <ul
        class="cv-glass border-line shadow-card grid h-16 grid-cols-5 rounded-2xl border p-1 text-[0.6875rem] font-medium"
      >
        <li v-for="link in links" :key="link.to" class="flex">
          <NuxtLink
            :to="link.to"
            class="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors"
            :class="
              isCurrent(link.to)
                ? 'bg-accent-soft text-fg font-semibold'
                : 'text-muted hover:text-fg'
            "
            :aria-current="isCurrent(link.to) ? 'page' : undefined"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-5"
              :class="isCurrent(link.to) ? 'text-accent' : ''"
            >
              <path :d="link.icon" />
            </svg>
            {{ link.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
