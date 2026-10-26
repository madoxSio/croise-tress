<script setup lang="ts">
import type { Achievement, PuzzleSummary, Stats } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { difficultyLabel, formatDateTime, formatDuration } from '~/utils/labels'

/** Statistiques, succès et favoris du joueur (calculés par le serveur). */
const stats = ref<Stats | null>(null)
const achievements = ref<Achievement[]>([])
const favorites = ref<PuzzleSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const favoriteError = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const [nextStats, nextAchievements, nextFavorites] = await Promise.all([
      api.getStats(),
      api.getAchievements(),
      api.getFavorites(),
    ])
    stats.value = nextStats
    achievements.value = nextAchievements.items
    favorites.value = nextFavorites.items
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function removeFavorite(puzzle: PuzzleSummary): Promise<void> {
  favoriteError.value = null
  try {
    await api.removeFavorite(puzzle.id)
    favorites.value = favorites.value.filter((item) => item.id !== puzzle.id)
  } catch (cause) {
    favoriteError.value = errorMessage(cause)
  }
}

const unlockedCount = computed(() => achievements.value.filter((a) => a.unlockedAt).length)
const tiles = computed(() => {
  const value = stats.value
  if (!value) return []
  return [
    { label: 'Grilles terminées', value: String(value.completed) },
    { label: 'Sans aide', value: String(value.withoutHelp) },
    { label: 'Défis du jour', value: String(value.dailyCompleted) },
    { label: 'Meilleur score', value: value.bestScore === null ? '—' : String(value.bestScore) },
    {
      label: 'Durée moyenne',
      value: value.averageDurationMs === null ? '—' : formatDuration(value.averageDurationMs),
    },
  ]
})
const byDifficulty = computed(() => Object.entries(stats.value?.byDifficulty ?? {}))

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-8">
    <MeyronLoader v-if="loading" inline label="Chargement de votre progression…" />
    <div v-else-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>

    <template v-else>
      <AccountPoints />

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" class="mb-3 text-xl font-bold">Statistiques</h2>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div
            v-for="tile in tiles"
            :key="tile.label"
            class="bg-surface border-line rounded-2xl border p-4"
          >
            <dt class="text-muted text-sm">{{ tile.label }}</dt>
            <dd class="mt-1 text-xl font-extrabold tabular-nums">{{ tile.value }}</dd>
          </div>
        </dl>
        <p v-if="byDifficulty.length > 0" class="text-muted mt-3 text-sm">
          Par difficulté :
          <span v-for="([level, count], index) in byDifficulty" :key="level"
            >{{ index > 0 ? ' · ' : '' }}{{ difficultyLabel(level) }} {{ count }}</span
          >
        </p>
      </section>

      <section aria-labelledby="achievements-title">
        <h2 id="achievements-title" class="mb-1 text-xl font-bold">Succès</h2>
        <p class="text-muted mb-3 text-sm">
          {{ unlockedCount }} sur {{ achievements.length }} débloqués
        </p>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li
            v-for="achievement in achievements"
            :key="achievement.code"
            class="border-line rounded-2xl border p-4"
            :class="achievement.unlockedAt ? 'bg-surface' : 'bg-surface-2'"
          >
            <p class="font-semibold">
              {{ achievement.title }}
              <span
                v-if="achievement.unlockedAt"
                class="bg-accent-soft ml-1 rounded-full px-2 py-0.5 text-xs"
                >Débloqué</span
              >
              <span v-else class="text-muted ml-1 text-xs">(verrouillé)</span>
            </p>
            <p class="text-muted text-sm">{{ achievement.description }}</p>
            <p v-if="achievement.unlockedAt" class="text-muted mt-1 text-xs">
              Le {{ formatDateTime(achievement.unlockedAt) }}
            </p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="favorites-title">
        <h2 id="favorites-title" class="mb-3 text-xl font-bold">Grilles favorites</h2>
        <div
          v-if="favoriteError"
          role="alert"
          class="bg-danger-soft text-danger mb-3 rounded-xl p-3 text-sm"
        >
          {{ favoriteError }}
        </div>
        <p v-if="favorites.length === 0" class="text-muted">
          Aucune grille favorite.
          <NuxtLink to="/puzzles" class="text-accent font-semibold underline"
            >Parcourir les grilles</NuxtLink
          >
        </p>
        <ul v-else class="divide-line bg-surface border-line divide-y rounded-2xl border">
          <li v-for="puzzle in favorites" :key="puzzle.id" class="flex items-center gap-3 p-4">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/play/${puzzle.id}`" class="font-bold hover:underline">{{
                puzzle.title
              }}</NuxtLink>
              <p class="text-muted text-sm">
                {{ difficultyLabel(puzzle.difficulty) }} · {{ puzzle.theme }}
              </p>
            </div>
            <button
              type="button"
              class="border-line hover:bg-surface-2 min-h-11 rounded-full border px-4 text-sm font-semibold"
              @click="removeFavorite(puzzle)"
            >
              Retirer<span class="sr-only"> « {{ puzzle.title }} » des favoris</span>
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
