<script setup lang="ts">
/**
 * Cadre des pages d'administration : vérifie l'accès (le serveur décide), affiche le
 * sous-menu et ne rend le contenu qu'à un administrateur.
 */
defineProps<{ title: string }>()

const route = useRoute()
const { access, error, check } = useAdmin()
onMounted(() => void check(true))

const links = [
  { to: '/admin', label: 'Vue d’ensemble' },
  { to: '/admin/users', label: 'Joueurs' },
  { to: '/admin/puzzles', label: 'Grilles' },
  { to: '/admin/audit', label: 'Journal' },
] as const

const isCurrent = (to: string): boolean =>
  to === '/admin' ? route.path === '/admin' : route.path.startsWith(to)
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6">
    <p v-if="access === 'checking' || access === 'unknown'" role="status" class="text-muted">
      Chargement…
    </p>
    <div
      v-else-if="access === 'error'"
      role="alert"
      class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
    >
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="check(true)">
        Réessayer
      </button>
    </div>
    <div v-else-if="access === 'denied'" class="flex flex-col gap-2">
      <h1 class="text-3xl font-extrabold tracking-tight">Page introuvable</h1>
      <NuxtLink to="/" class="text-accent font-semibold underline">Retour à l'accueil</NuxtLink>
    </div>
    <template v-else>
      <nav aria-label="Administration" class="-mx-4 overflow-x-auto px-4">
        <ul class="flex gap-1 text-sm font-medium">
          <li v-for="link in links" :key="link.to">
            <NuxtLink
              :to="link.to"
              class="inline-flex min-h-11 items-center rounded-full px-3 whitespace-nowrap"
              :class="isCurrent(link.to) ? 'bg-accent-soft text-fg' : 'text-muted hover:text-fg'"
              :aria-current="isCurrent(link.to) ? 'page' : undefined"
              >{{ link.label }}</NuxtLink
            >
          </li>
        </ul>
      </nav>
      <h1 class="text-3xl font-extrabold tracking-tight">{{ title }}</h1>
      <slot />
    </template>
  </div>
</template>
