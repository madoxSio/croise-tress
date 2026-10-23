<script setup lang="ts">
import type { Difficulty, PuzzleSummary } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { DIFFICULTIES, difficultyLabel } from '~/utils/labels'

useHead({ title: 'Grilles — Crossverse' })

const PAGE_SIZE = 20
const difficultyOptions: readonly (Difficulty | '')[] = ['', ...DIFFICULTIES]

const difficulty = ref<Difficulty | ''>('')
const theme = ref('')
const items = ref<PuzzleSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
/** Thèmes rencontrés : suggestions de saisie (l'API ne fournit pas encore de liste des thèmes). */
const knownThemes = ref<string[]>([])
let requestId = 0

async function fetchPage(reset: boolean): Promise<void> {
  const id = ++requestId
  loading.value = true
  error.value = null
  try {
    const page = await api.listPuzzles({
      limit: PAGE_SIZE,
      ...(difficulty.value === '' ? {} : { difficulty: difficulty.value }),
      ...(theme.value.trim() === '' ? {} : { theme: theme.value.trim() }),
      ...(reset || nextCursor.value === null ? {} : { cursor: nextCursor.value }),
    })
    if (id !== requestId) return
    items.value = reset ? page.items : [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
    knownThemes.value = [...new Set([...knownThemes.value, ...page.items.map((p) => p.theme)])]
  } catch (cause) {
    if (id === requestId) error.value = errorMessage(cause)
  } finally {
    if (id === requestId) loading.value = false
  }
}

/** Favoris du compte ; `null` pour un invité ou tant qu'ils ne sont pas chargés : pas de bouton. */
const favoriteIds = ref<Set<string> | null>(null)
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
  const ids = favoriteIds.value
  if (!ids) return
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

let themeTimer: ReturnType<typeof setTimeout> | undefined
watch(difficulty, () => void fetchPage(true))
watch(theme, () => {
  clearTimeout(themeTimer)
  themeTimer = setTimeout(() => void fetchPage(true), 350)
})
onBeforeUnmount(() => {
  clearTimeout(themeTimer)
})
onMounted(() => {
  void fetchPage(true)
  void loadFavorites()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Grilles</h1>

    <form class="flex flex-col gap-4" role="search" @submit.prevent="fetchPage(true)">
      <fieldset>
        <legend class="text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          Difficulté
        </legend>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="option in difficultyOptions"
            :key="option"
            class="has-[:checked]:bg-fg has-[:checked]:text-bg border-line has-[:focus-visible]:ring-accent inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium has-[:focus-visible]:ring-2"
          >
            <input
              v-model="difficulty"
              type="radio"
              name="difficulty"
              :value="option"
              class="sr-only"
            />
            {{ option === '' ? 'Toutes' : difficultyLabel(option) }}
          </label>
        </div>
      </fieldset>
      <div class="flex max-w-sm flex-col gap-1">
        <label for="theme-filter" class="text-muted text-xs font-semibold tracking-wider uppercase"
          >Thème</label
        >
        <input
          id="theme-filter"
          v-model="theme"
          type="search"
          list="theme-options"
          maxlength="40"
          placeholder="Ex. : cuisine, voyage…"
          class="bg-surface border-line min-h-11 rounded-xl border px-4"
        />
        <datalist id="theme-options">
          <option v-for="known in knownThemes" :key="known" :value="known" />
        </datalist>
      </div>
    </form>

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
          v-if="favoriteIds"
          :puzzle="puzzle"
          :favorite="favoriteIds.has(puzzle.id)"
          @toggle-favorite="toggleFavorite(puzzle)"
        />
        <PuzzleCard v-else :puzzle="puzzle" />
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-muted">
      Aucune grille ne correspond à ces filtres.
    </p>

    <p v-if="loading" role="status" class="text-muted">Chargement…</p>
    <button
      v-else-if="nextCursor"
      type="button"
      class="border-line bg-surface hover:border-accent mx-auto min-h-11 rounded-full border px-6 font-semibold"
      @click="fetchPage(false)"
    >
      Charger plus
    </button>
  </div>
</template>
