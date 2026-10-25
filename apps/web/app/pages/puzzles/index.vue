<script setup lang="ts">
import type { PuzzleFormat, PuzzleSummary } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { FORMATS, LEVELS, type LevelId } from '~/services/catalog'

useHead({ title: 'Grilles — Crossverse' })

const PAGE_SIZE = 20
const route = useRoute()
const router = useRouter()
const catalog = useCatalog()
const quickPlay = useQuickPlay()
const gate = useAccountGate()

/** Filtres portés par l'URL : partageables et conservés au retour arrière. */
const themeKey = computed(() =>
  typeof route.query['theme'] === 'string' ? route.query['theme'] : '',
)
const level = computed<LevelId | ''>(() => {
  const value = route.query['level']
  return LEVELS.some((l) => l.id === value) ? (value as LevelId) : ''
})

const format = computed<PuzzleFormat | ''>(() => {
  const value = route.query['type']
  return FORMATS.some((f) => f.id === value) ? (value as PuzzleFormat) : ''
})

function setFilter(patch: { theme?: string; level?: string; type?: string }): void {
  // Une valeur vide retire le filtre de l'URL.
  const query = Object.fromEntries(
    Object.entries({ ...route.query, ...patch }).filter(([, value]) => value !== ''),
  )
  void router.replace({ query })
}

const selected = computed(() => (themeKey.value ? catalog.find(themeKey.value) : null))
/** Thème principal affiché (le parent quand un sous-thème est choisi). */
const parentTheme = computed(() => {
  const key = themeKey.value
  if (!key) return null
  return (
    catalog.themes.value?.find((t) => t.slug === key || t.children.some((c) => c.slug === key)) ??
    null
  )
})
const look = computed(() => catalog.lookOf(themeKey.value))

const items = ref<PuzzleSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let requestId = 0

async function fetchPage(reset: boolean): Promise<void> {
  const id = ++requestId
  loading.value = true
  error.value = null
  const theme = themeKey.value || undefined
  const scope = {
    ...(theme ? { theme } : {}),
    ...(format.value ? { format: format.value } : {}),
  }
  try {
    if (level.value) {
      // Un niveau regroupe plusieurs difficultés : une requête par difficulté, sans pagination.
      const found = LEVELS.find((l) => l.id === level.value)
      const pages = await Promise.all(
        (found?.difficulties ?? []).map((difficulty) =>
          api.listPuzzles({ limit: 50, difficulty, ...scope }),
        ),
      )
      if (id !== requestId) return
      items.value = pages.flatMap((page) => page.items)
      nextCursor.value = null
      return
    }
    const page = await api.listPuzzles({
      limit: PAGE_SIZE,
      ...scope,
      ...(reset || nextCursor.value === null ? {} : { cursor: nextCursor.value }),
    })
    if (id !== requestId) return
    items.value = reset ? page.items : [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    if (id === requestId) error.value = errorMessage(cause)
  } finally {
    if (id === requestId) loading.value = false
  }
}

/** Favoris du compte ; l'invité voit l'étoile mais est invité à créer un compte. */
const { isGuest } = useSession()
const favoriteIds = ref<Set<string>>(new Set())
const favoriteError = ref<string | null>(null)

async function loadFavorites(): Promise<void> {
  try {
    const session = await api.ensureSession()
    if (session.user?.isGuest !== false) return
    favoriteIds.value = new Set((await api.getFavorites()).items.map((p) => p.id))
  } catch {
    // Confort seulement : sans favoris, le catalogue reste utilisable.
  }
}

async function toggleFavorite(puzzle: PuzzleSummary): Promise<void> {
  if (isGuest.value) {
    gate.open({
      title: 'Garde tes grilles préférées',
      reason: 'Les favoris sont enregistrés dans ton compte.',
    })
    return
  }
  const ids = favoriteIds.value
  const wasFavorite = ids.has(puzzle.id)
  favoriteError.value = null
  // Mise à jour optimiste, annulée si le serveur refuse.
  const next = new Set(ids)
  if (wasFavorite) next.delete(puzzle.id)
  else next.add(puzzle.id)
  favoriteIds.value = next
  try {
    await (wasFavorite ? api.removeFavorite(puzzle.id) : api.addFavorite(puzzle.id))
  } catch (cause) {
    favoriteIds.value = ids
    favoriteError.value = errorMessage(cause)
  }
}

watch([themeKey, level, format], () => void fetchPage(true))
onMounted(() => {
  void catalog.load()
  void fetchPage(true)
  void loadFavorites()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-wrap items-end gap-4">
      <!-- Largeur minimale : sur petit écran, le bouton passe sous le texte au lieu de l'écraser. -->
      <div class="min-w-64 flex-1">
        <p class="text-accent text-sm font-bold tracking-wider uppercase">Catalogue</p>
        <h1 class="mt-1 text-3xl font-extrabold sm:text-5xl">Grilles</h1>
        <p class="text-muted mt-2 max-w-xl">
          Choisissez un type de grille, un thème et un niveau, ou laissez Sougoudou choisir pour
          vous.
        </p>
      </div>
      <button
        type="button"
        class="bg-accent text-accent-fg shadow-cta inline-flex min-h-12 items-center gap-2 rounded-2xl px-6 font-bold disabled:opacity-60"
        :disabled="quickPlay.busy.value"
        @click="quickPlay.start(themeKey || undefined, format || undefined)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="currentColor">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
        {{ quickPlay.busy.value ? 'Préparation…' : 'Partie rapide' }}
      </button>
    </header>
    <p
      v-if="quickPlay.error.value"
      role="alert"
      class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
    >
      {{ quickPlay.error.value }}
    </p>

    <PlayModeSwitch />

    <NuxtLink
      to="/mots-meles"
      class="border-line bg-surface hover:border-accent shadow-card group flex items-center gap-4 rounded-2xl border p-4 transition-all hover:-translate-y-0.5"
    >
      <span
        aria-hidden="true"
        class="bg-accent-soft font-display grid size-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold"
        >ML</span
      >
      <span class="min-w-0 flex-1">
        <span class="block font-bold group-hover:underline">Envie de mots mêlés ?</span>
        <span class="text-muted block text-sm"
          >Une liste de mots à rayer dans la grille, et un mot mystère à découvrir.</span
        >
      </span>
      <span aria-hidden="true" class="text-accent text-xl">→</span>
    </NuxtLink>

    <!-- Filtres -->
    <div class="flex flex-col gap-4">
      <nav aria-label="Thèmes" class="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <ul class="flex w-max gap-2">
          <li>
            <NuxtLink
              :to="{ query: { ...route.query, theme: undefined } }"
              class="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
              :class="
                !themeKey ? 'bg-fg text-bg border-fg' : 'border-line bg-surface hover:border-accent'
              "
              :aria-current="!themeKey ? 'page' : undefined"
              >Tous les thèmes</NuxtLink
            >
          </li>
          <li v-for="theme in catalog.themes.value ?? []" :key="theme.slug">
            <NuxtLink
              :to="{ query: { ...route.query, theme: theme.slug } }"
              class="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap"
              :class="
                parentTheme?.slug === theme.slug
                  ? 'bg-fg text-bg border-fg'
                  : 'border-line bg-surface hover:border-accent'
              "
              :aria-current="themeKey === theme.slug ? 'page' : undefined"
              ><span aria-hidden="true">{{ theme.icon }}</span
              >{{ theme.name }}</NuxtLink
            >
          </li>
        </ul>
      </nav>

      <nav
        v-if="parentTheme && parentTheme.children.length > 0"
        aria-label="Sous-thèmes"
        class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        <ul class="flex w-max gap-2">
          <li>
            <NuxtLink
              :to="{ query: { ...route.query, theme: parentTheme.slug } }"
              class="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium"
              :class="
                themeKey === parentTheme.slug
                  ? 'bg-accent-soft text-fg'
                  : 'text-muted hover:text-fg'
              "
              :aria-current="themeKey === parentTheme.slug ? 'page' : undefined"
              >Tout « {{ parentTheme.name }} »</NuxtLink
            >
          </li>
          <li v-for="child in parentTheme.children" :key="child.slug">
            <NuxtLink
              :to="{ query: { ...route.query, theme: child.slug } }"
              class="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap"
              :class="
                themeKey === child.slug ? 'bg-accent-soft text-fg' : 'text-muted hover:text-fg'
              "
              :aria-current="themeKey === child.slug ? 'page' : undefined"
              ><span aria-hidden="true">{{ child.icon }}</span
              >{{ child.name }}</NuxtLink
            >
          </li>
        </ul>
      </nav>

      <fieldset>
        <legend class="sr-only">Type de grille</legend>
        <div class="bg-surface-2 inline-flex flex-wrap gap-1 rounded-2xl p-1">
          <label
            v-for="option in [{ id: '', label: 'Tous types', hint: '' }, ...FORMATS]"
            :key="option.id"
            :title="option.hint || undefined"
            class="has-[:checked]:bg-surface has-[:checked]:text-fg has-[:checked]:shadow-card text-muted has-[:focus-visible]:ring-accent inline-flex min-h-10 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name="format"
              class="sr-only"
              :value="option.id"
              :checked="format === option.id"
              @change="setFilter({ type: option.id })"
            />
            {{ option.label }}
          </label>
        </div>
        <p v-if="format" class="text-muted mt-2 text-sm">
          {{ FORMATS.find((f) => f.id === format)?.hint }}
        </p>
      </fieldset>

      <fieldset>
        <legend class="sr-only">Niveau</legend>
        <div class="bg-surface-2 inline-flex flex-wrap gap-1 rounded-2xl p-1">
          <label
            v-for="option in [{ id: '', label: 'Tous niveaux' }, ...LEVELS]"
            :key="option.id"
            class="has-[:checked]:bg-surface has-[:checked]:text-fg has-[:checked]:shadow-card text-muted has-[:focus-visible]:ring-accent inline-flex min-h-10 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name="level"
              class="sr-only"
              :value="option.id"
              :checked="level === option.id"
              @change="setFilter({ level: option.id })"
            />
            {{ option.label }}
          </label>
        </div>
      </fieldset>
    </div>

    <!-- Bandeau du thème choisi -->
    <section
      v-if="selected"
      class="cv-skin flex items-center gap-4 rounded-3xl p-5 sm:p-8"
      :data-skin="look.skin"
      :style="{ '--skin-a': look.accent, '--skin-b': look.accentAlt }"
      aria-labelledby="theme-banner"
    >
      <span
        aria-hidden="true"
        class="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/90 text-4xl shadow-lg"
        >{{ selected.icon }}</span
      >
      <div class="min-w-0 rounded-2xl bg-black/25 px-4 py-3 backdrop-blur-sm">
        <h2 id="theme-banner" class="text-2xl font-extrabold">{{ selected.name }}</h2>
        <p v-if="selected.description" class="mt-1 text-sm">{{ selected.description }}</p>
      </div>
    </section>

    <!-- Tous les thèmes : cartes -->
    <section
      v-else-if="!level && !format && (catalog.themes.value?.length ?? 0) > 0"
      aria-labelledby="themes-title"
      class="flex flex-col gap-4"
    >
      <h2 id="themes-title" class="text-2xl font-extrabold">Thèmes</h2>
      <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="theme in catalog.themes.value ?? []" :key="theme.slug">
          <ThemeCard :theme="theme" @quick-play="quickPlay.start" />
        </li>
      </ul>
    </section>

    <section aria-labelledby="list-title" class="flex flex-col gap-4">
      <h2 id="list-title" class="text-2xl font-extrabold">
        {{ selected ? 'Grilles du thème' : 'Toutes les grilles' }}
      </h2>

      <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
        {{ error }}
        <button
          type="button"
          class="ml-2 font-semibold underline"
          @click="fetchPage(items.length === 0)"
        >
          Réessayer
        </button>
      </div>
      <div
        v-if="favoriteError"
        role="alert"
        class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
      >
        Favori non enregistré : {{ favoriteError }}
      </div>

      <ul v-if="items.length > 0" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="puzzle in items" :key="puzzle.id">
          <PuzzleCard
            :puzzle="puzzle"
            :look="catalog.lookOf(puzzle.themeSlug)"
            :favorite="favoriteIds.has(puzzle.id)"
            @toggle-favorite="toggleFavorite(puzzle)"
          />
        </li>
      </ul>
      <p v-else-if="!loading && !error" class="text-muted">
        Aucune grille ne correspond à ces filtres.
      </p>

      <SougoudouLoader
        v-if="loading"
        :inline="items.length > 0"
        :label="items.length > 0 ? 'Chargement…' : 'Sougoudou prépare les grilles…'"
      />
      <button
        v-else-if="nextCursor"
        type="button"
        class="border-line bg-surface hover:border-accent mx-auto min-h-11 rounded-full border px-6 font-semibold"
        @click="fetchPage(false)"
      >
        Charger plus
      </button>
    </section>
  </div>
</template>
