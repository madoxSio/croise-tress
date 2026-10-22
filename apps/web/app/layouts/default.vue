<script setup lang="ts">
const route = useRoute()
// Invité (ou session pas encore ouverte) : on propose de se connecter ou de créer un compte.
const { status, error, isGuest, ensure } = useSession()
const accountLink = computed(() =>
  isGuest.value ? { to: '/login', label: 'Se connecter' } : { to: '/account', label: 'Mon compte' },
)

// En haut à partir de `sm`, en barre d'onglets fixe en bas sur mobile (5 entrées ne tiennent
// pas dans l'en-tête sous 390 px de large).
const links = [
  { to: '/', label: 'Accueil' },
  { to: '/puzzles', label: 'Grilles' },
  { to: '/duel', label: 'Duel' },
  { to: '/history', label: 'Parties' },
  { to: '/preferences', label: 'Réglages' },
] as const

const isCurrent = (to: string): boolean =>
  to === '/' ? route.path === '/' : route.path.startsWith(to)
</script>

<template>
  <div class="bg-bg text-fg flex min-h-dvh flex-col">
    <a
      href="#contenu"
      class="bg-accent text-accent-fg sr-only z-50 rounded-full px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Aller au contenu
    </a>
    <header
      class="border-line bg-surface/90 sticky top-0 z-30 border-b backdrop-blur"
      :style="{ paddingTop: 'env(safe-area-inset-top)' }"
    >
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <NuxtLink
          to="/"
          class="mr-auto flex min-h-11 items-center gap-2 font-extrabold tracking-tight"
          aria-label="Crossverse, accueil"
        >
          <span
            aria-hidden="true"
            class="bg-accent text-accent-fg grid size-8 place-items-center rounded-lg text-sm"
            >C</span
          >
          <span class="hidden sm:inline">Crossverse</span>
        </NuxtLink>
        <nav aria-label="Navigation principale" class="hidden sm:block">
          <ul class="flex items-center gap-1 text-sm font-medium">
            <li v-for="link in links" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="inline-flex min-h-11 items-center rounded-full px-3"
                :class="isCurrent(link.to) ? 'bg-accent-soft text-fg' : 'text-muted hover:text-fg'"
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
            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full md:px-3"
            :class="isCurrent(accountLink.to) ? 'bg-accent-soft text-fg' : 'text-fg'"
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
            <span class="sr-only md:not-sr-only">{{ accountLink.label }}</span>
          </NuxtLink>
          <NuxtLink
            v-if="isGuest"
            to="/register"
            class="bg-fg text-bg hidden min-h-11 items-center rounded-full px-4 md:inline-flex"
            >Créer un compte</NuxtLink
          >
        </div>
      </div>
    </header>

    <div
      v-if="status === 'error'"
      role="alert"
      class="bg-danger-soft text-danger border-line border-b px-4 py-3 text-sm"
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
      class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none"
      :style="{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }"
    >
      <slot />
    </main>

    <!-- Réserve la hauteur de la barre d'onglets mobile pour ne rien masquer en bas de page. -->
    <div aria-hidden="true" class="h-14 sm:hidden" />
    <nav
      aria-label="Navigation principale"
      class="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur sm:hidden"
      :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
    >
      <ul class="grid h-14 grid-cols-5 text-xs font-medium">
        <li v-for="link in links" :key="link.to" class="flex">
          <NuxtLink
            :to="link.to"
            class="m-1 flex flex-1 items-center justify-center rounded-xl"
            :class="isCurrent(link.to) ? 'bg-accent-soft text-fg' : 'text-muted hover:text-fg'"
            :aria-current="isCurrent(link.to) ? 'page' : undefined"
          >
            {{ link.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
