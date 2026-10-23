<script setup lang="ts">
import type { HistoryResponse } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { formatDateTime, formatDuration } from '~/utils/labels'

useHead({ title: 'Mes parties — Crossverse' })

// L'historique est réservé aux comptes : l'invité voit une explication, sans appel refusé.
const isGuest = ref(false)
const history = ref<HistoryResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const session = await api.ensureSession()
    isGuest.value = session.user?.isGuest !== false
    if (isGuest.value) return
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
    <LockedPreview v-else-if="isGuest">
      <template #preview>
        <ul class="divide-line bg-surface border-line divide-y rounded-2xl border">
          <li v-for="n in 5" :key="n" class="flex items-center gap-4 p-4">
            <div class="flex-1">
              <p class="font-bold">Grille n° {{ n }}</p>
              <p class="text-muted text-sm">Hier · {{ 2 + n }} min</p>
            </div>
            <p class="text-lg font-extrabold">{{ 1500 - n * 90 }}</p>
          </li>
        </ul>
      </template>
      <AccountRequired
        title="Gardez la trace de vos parties"
        reason="Sans compte, vous pouvez jouer toutes les grilles en solo. L'historique et le suivi de vos parties demandent un compte : celles jouées en invité sur cet appareil y seront rattachées."
      />
    </LockedPreview>
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
