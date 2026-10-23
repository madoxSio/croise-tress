<script setup lang="ts">
import type { AdminPuzzleSummary, PuzzleStatus } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'
import { difficultyLabel } from '~/utils/labels'

useHead({ title: 'Grilles — Administration Crossverse' })

const { check } = useAdmin()
const status = ref<PuzzleStatus | ''>('')
const items = ref<AdminPuzzleSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const pendingId = ref<string | null>(null)

async function fetchPage(reset: boolean): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (!(await check())) return
    const page = await adminApi.listPuzzles({
      ...(status.value === '' ? {} : { status: status.value }),
      ...(reset || nextCursor.value === null ? {} : { cursor: nextCursor.value }),
    })
    items.value = reset ? page.items : [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}
onMounted(() => fetchPage(true))
watch(status, () => fetchPage(true))

async function toggle(puzzle: AdminPuzzleSummary): Promise<void> {
  pendingId.value = puzzle.id
  error.value = null
  try {
    const next = puzzle.status === 'published' ? 'draft' : 'published'
    const updated = await adminApi.setPuzzleStatus(puzzle.id, next)
    items.value = items.value.map((item) =>
      item.id === updated.id ? { ...item, status: updated.status } : item,
    )
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    pendingId.value = null
  }
}
</script>

<template>
  <AdminShell title="Grilles">
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <label for="status-filter" class="text-sm font-semibold">Statut</label>
        <select
          id="status-filter"
          v-model="status"
          class="bg-surface border-line min-h-11 rounded-xl border px-4"
        >
          <option value="">Toutes</option>
          <option value="published">Publiées</option>
          <option value="draft">Brouillons</option>
        </select>
      </div>
      <NuxtLink
        to="/admin/puzzles/new"
        class="bg-fg text-bg ml-auto inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
        >Nouvelle grille</NuxtLink
      >
    </div>

    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
    </div>

    <ul
      v-if="items.length > 0"
      class="divide-line bg-surface border-line divide-y rounded-2xl border"
    >
      <li v-for="puzzle in items" :key="puzzle.id" class="flex flex-wrap items-center gap-3 p-4">
        <div class="min-w-0 flex-1">
          <NuxtLink :to="`/admin/puzzles/${puzzle.id}`" class="font-bold hover:underline">{{
            puzzle.title
          }}</NuxtLink>
          <p class="text-muted text-sm">
            {{ puzzle.width }}×{{ puzzle.height }} · {{ difficultyLabel(puzzle.difficulty) }} ·
            {{ puzzle.theme }} · {{ puzzle.playsCompleted }}/{{ puzzle.playsStarted }} parties
            terminées
          </p>
        </div>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="puzzle.status === 'published' ? 'bg-accent-soft' : 'bg-surface-2 text-muted'"
          >{{ puzzle.status === 'published' ? 'Publiée' : 'Brouillon' }}</span
        >
        <button
          type="button"
          class="border-line hover:bg-surface-2 min-h-11 rounded-full border px-4 text-sm font-semibold disabled:opacity-60"
          :disabled="pendingId === puzzle.id"
          @click="toggle(puzzle)"
        >
          {{ puzzle.status === 'published' ? 'Dépublier' : 'Publier' }}
          <span class="sr-only">« {{ puzzle.title }} »</span>
        </button>
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-muted">Aucune grille.</p>
    <p v-if="loading" role="status" class="text-muted">Chargement…</p>
    <button
      v-if="nextCursor && !loading"
      type="button"
      class="border-line bg-surface hover:border-accent mx-auto min-h-11 rounded-full border px-6 font-semibold"
      @click="fetchPage(false)"
    >
      Afficher plus
    </button>
  </AdminShell>
</template>
