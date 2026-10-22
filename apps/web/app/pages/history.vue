<script setup lang="ts">
import type { HistoryResponse } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { formatDateTime, formatDuration } from '~/utils/labels'

useHead({ title: 'Mes parties — Crossverse' })

const history = ref<HistoryResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    await api.ensureSession()
    history.value = await api.getHistory()
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Mes parties terminées</h1>

    <p v-if="loading" role="status" class="text-muted">Chargement…</p>
    <div v-else-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!history || history.items.length === 0" class="text-muted">
      Aucune partie terminée pour l'instant.
      <NuxtLink to="/puzzles" class="text-accent font-semibold underline"
        >Choisir une grille</NuxtLink
      >
    </p>
    <ul v-else class="divide-line bg-surface border-line divide-y rounded-2xl border">
      <li v-for="item in history.items" :key="item.sessionId" class="flex items-center gap-4 p-4">
        <div class="min-w-0 flex-1">
          <NuxtLink :to="`/play/${item.puzzleId}`" class="font-bold hover:underline">{{
            item.puzzleTitle
          }}</NuxtLink>
          <p class="text-muted text-sm">
            {{ formatDateTime(item.completedAt) }} · {{ formatDuration(item.durationMs) }}
          </p>
        </div>
        <p class="text-right">
          <span class="block text-lg font-extrabold tabular-nums">{{ item.score }}</span>
          <span class="text-muted text-xs">points</span>
        </p>
      </li>
    </ul>
  </div>
</template>
