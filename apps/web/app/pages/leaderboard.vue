<script setup lang="ts">
/**
 * Classement Elo des duels rapides. L'API n'expose qu'une limite (≤ 100, sans curseur) :
 * « Afficher plus » relit le classement avec une limite plus grande.
 */
import { MAX_PAGE_SIZE, matchApi, type Leaderboard, type Rating } from '~/services/match'
import { errorMessage } from '~/services/api'

useHead({ title: 'Classement — Crossverse' })

const STEP = 25

const limit = ref(STEP)
const board = ref<Leaderboard | null>(null)
const mine = ref<Rating | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

/** Une page pleine laisse supposer d'autres joueurs, dans la limite acceptée par l'API. */
const hasMore = computed(
  () =>
    board.value !== null && board.value.items.length === limit.value && limit.value < MAX_PAGE_SIZE,
)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    board.value = await matchApi.leaderboard(limit.value)
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function showMore(): Promise<void> {
  limit.value = Math.min(MAX_PAGE_SIZE, limit.value + STEP)
  await load()
}

async function loadMine(): Promise<void> {
  try {
    const rating = await matchApi.myRating()
    // Un invité ou un joueur sans duel classé a la valeur initiale : rien d'utile à montrer.
    mine.value = rating.gamesPlayed > 0 ? rating : null
  } catch {
    mine.value = null
  }
}

onMounted(() => {
  void load()
  void loadMine()
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="flex-1 text-3xl font-extrabold tracking-tight">Classement</h1>
      <NuxtLink to="/duel" class="text-accent min-h-11 py-2 text-sm font-semibold underline"
        >Jouer un duel</NuxtLink
      >
    </div>

    <section
      v-if="mine"
      aria-labelledby="mine-title"
      class="bg-accent text-accent-fg flex flex-wrap items-center gap-6 rounded-3xl p-5"
    >
      <h2 id="mine-title" class="w-full text-xs font-semibold tracking-wider uppercase opacity-90">
        Mon classement
      </h2>
      <p class="text-3xl font-extrabold tabular-nums">{{ mine.rating }}</p>
      <p class="text-sm opacity-90">
        {{ mine.gamesPlayed }} duel(s) · {{ mine.wins }} victoire(s) · {{ mine.losses }} défaite(s)
        · {{ mine.draws }} égalité(s)
      </p>
    </section>

    <SougoudouLoader v-if="loading && !board" label="Chargement du classement…" />
    <div v-else-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!board || board.items.length === 0" class="text-muted">
      Personne n’est encore classé : seuls les duels rapides comptent.
    </p>
    <template v-else>
      <table class="bg-surface border-line w-full overflow-hidden rounded-2xl border text-sm">
        <caption class="sr-only">
          Classement des joueurs par score Elo
        </caption>
        <thead class="text-muted text-left text-xs tracking-wider uppercase">
          <tr>
            <th scope="col" class="px-4 py-3 text-right">Rang</th>
            <th scope="col" class="px-2 py-3">Joueur</th>
            <th scope="col" class="px-2 py-3 text-right">Elo</th>
            <th scope="col" class="hidden px-4 py-3 text-right sm:table-cell">Victoires</th>
            <th scope="col" class="px-4 py-3 text-right">Duels</th>
          </tr>
        </thead>
        <tbody class="divide-line divide-y">
          <tr v-for="row in board.items" :key="row.rank" class="border-line border-t">
            <td class="px-4 py-3 text-right font-bold tabular-nums">{{ row.rank }}</td>
            <th scope="row" class="max-w-[40vw] truncate px-2 py-3 text-left font-semibold">
              {{ row.username }}
            </th>
            <td class="px-2 py-3 text-right font-extrabold tabular-nums">{{ row.rating }}</td>
            <td class="hidden px-4 py-3 text-right tabular-nums sm:table-cell">{{ row.wins }}</td>
            <td class="px-4 py-3 text-right tabular-nums">{{ row.gamesPlayed }}</td>
          </tr>
        </tbody>
      </table>
      <button
        v-if="hasMore"
        type="button"
        class="border-line hover:bg-surface-2 mx-auto inline-flex min-h-11 items-center rounded-full border px-6 text-sm font-semibold disabled:opacity-60"
        :disabled="loading"
        @click="showMore"
      >
        {{ loading ? 'Chargement…' : 'Afficher plus' }}
      </button>
    </template>
  </div>
</template>
