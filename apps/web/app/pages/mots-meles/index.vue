<script setup lang="ts">
import type { WordListSummary } from '@crossverse/contracts'
import { errorMessage } from '~/services/api'
import { LEVELS, type LevelId } from '~/services/catalog'
import { listWordLists } from '~/services/wordlists'

useHead({ title: 'Mots mêlés — Crossverse' })

const route = useRoute()
const router = useRouter()
const catalog = useCatalog()

/** Niveau porté par l'URL : partageable et conservé au retour arrière. */
const level = computed<LevelId | ''>(() => {
  const value = route.query['level']
  return LEVELS.some((l) => l.id === value) ? (value as LevelId) : ''
})

function setLevel(value: string): void {
  void router.replace({ query: value ? { level: value } : {} })
}

const items = ref<WordListSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Le catalogue de mots mêlés reste court : une page de 50 suffit, filtrée ici par niveau.
async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    items.value = (await listWordLists({ limit: 50 })).items
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

const visible = computed(() => {
  const found = LEVELS.find((l) => l.id === level.value)
  const difficulties: readonly string[] | undefined = found?.difficulties
  const order = new Map(LEVELS.flatMap((l, i) => l.difficulties.map((d) => [d, i] as const)))
  return items.value
    .filter((item) => !difficulties || difficulties.includes(item.difficulty))
    .sort((a, b) => (order.get(a.difficulty) ?? 0) - (order.get(b.difficulty) ?? 0))
})

onMounted(() => {
  void catalog.load()
  void load()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-wrap items-end gap-4">
      <div class="min-w-64 flex-1">
        <p class="text-accent text-sm font-bold tracking-wider uppercase">Catalogue</p>
        <h1 class="mt-1 text-3xl font-extrabold sm:text-5xl">Mots mêlés</h1>
        <p class="text-muted mt-2 max-w-xl">
          Retrouve les mots de la liste cachés dans la grille et raye-les. Les lettres qui restent
          forment le mot mystère !
        </p>
      </div>
      <NuxtLink
        to="/puzzles"
        class="border-line bg-surface hover:border-accent inline-flex min-h-12 items-center rounded-2xl border px-5 font-semibold"
        >Voir les mots croisés</NuxtLink
      >
    </header>

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
            @change="setLevel(option.id)"
          />
          {{ option.label }}
        </label>
      </div>
      <p class="text-muted mt-2 text-sm">
        Simple : de gauche à droite et de haut en bas. Intermédiaire : diagonales en plus. Compliqué
        : dans tous les sens, même à l’envers.
      </p>
    </fieldset>

    <section aria-labelledby="list-title" class="flex flex-col gap-4">
      <h2 id="list-title" class="sr-only">Grilles de mots mêlés</h2>
      <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
        {{ error }}
        <button type="button" class="ml-2 font-semibold underline" @click="load()">
          Réessayer
        </button>
      </div>
      <MeyronLoader v-if="loading" label="Meyron mélange les lettres…" />
      <ul v-else-if="visible.length > 0" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="wordList in visible" :key="wordList.id">
          <WordListCard :word-list="wordList" :look="catalog.lookOf(wordList.themeSlug)" />
        </li>
      </ul>
      <p v-else-if="!error" class="text-muted">Aucune grille à ce niveau pour le moment.</p>
    </section>
  </div>
</template>
