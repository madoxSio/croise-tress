<script setup lang="ts">
import type { PathSummary } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'

useHead({ title: 'Parcours — Crossverse' })

const paths = ref<PathSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    await api.ensureSession()
    paths.value = (await api.listPaths()).items
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
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl font-extrabold tracking-tight">Parcours</h1>
      <p class="text-muted">
        Des grilles à enchaîner par thème : chaque étape réussie ouvre la suivante et rapporte des
        Coumba points.
      </p>
      <CoumbaBalance />
    </header>

    <SougoudouLoader v-if="loading" label="Chargement des parcours…" />
    <div v-else-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>
    <p v-else-if="paths.length === 0" class="text-muted">
      Aucun parcours n'est encore ouvert.
      <NuxtLink to="/puzzles" class="text-accent font-semibold underline"
        >Voir les grilles</NuxtLink
      >
    </p>
    <ul v-else class="grid gap-4 sm:grid-cols-2">
      <li v-for="path in paths" :key="path.slug">
        <NuxtLink
          :to="`/parcours/${path.slug}`"
          class="bg-surface border-line hover:border-accent flex h-full flex-col gap-3 rounded-2xl border p-4"
        >
          <span class="text-lg font-bold">{{ path.title }}</span>
          <span class="text-muted text-sm">{{ path.description }}</span>
          <PathProgressBar :done="path.completedCount" :total="path.stepCount" />
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
