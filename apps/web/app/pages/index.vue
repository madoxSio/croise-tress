<script setup lang="ts">
import type { DailyChallenge, ResumeResponse } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { difficultyLabel } from '~/utils/labels'

useHead({ title: 'Crossverse — Mots croisés' })

const daily = ref<DailyChallenge | null>(null)
const resume = ref<ResumeResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

const dailyDate = computed(() =>
  daily.value ? dateFormatter.format(new Date(`${daily.value.date}T00:00:00Z`)) : '',
)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    await api.ensureSession()
    const [dailyResult, resumeResult] = await Promise.all([api.getDaily(), api.getResume()])
    daily.value = dailyResult
    resume.value = resumeResult
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
    <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">Bonjour, prêt à jouer ?</h1>

    <p v-if="loading" class="text-muted" role="status">Chargement…</p>

    <div v-else-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      <p>{{ error }}</p>
      <button type="button" class="mt-2 font-semibold underline" @click="load">Réessayer</button>
    </div>

    <template v-else>
      <section
        v-if="resume?.session && resume.puzzle"
        aria-labelledby="resume-title"
        class="bg-surface border-line flex flex-wrap items-center gap-4 rounded-2xl border p-5"
      >
        <div class="min-w-0 flex-1">
          <h2 id="resume-title" class="text-muted text-xs font-semibold tracking-wider uppercase">
            Partie en cours
          </h2>
          <p class="mt-1 truncate text-lg font-bold">{{ resume.puzzle.title }}</p>
          <p class="text-muted text-sm">
            {{ difficultyLabel(resume.puzzle.difficulty) }} · {{ resume.puzzle.theme }}
          </p>
        </div>
        <NuxtLink
          :to="`/play/${resume.puzzle.id}`"
          class="bg-fg text-bg inline-flex min-h-11 items-center rounded-full px-5 font-semibold"
        >
          Reprendre
        </NuxtLink>
      </section>

      <section
        aria-labelledby="daily-title"
        class="bg-accent text-accent-fg relative overflow-hidden rounded-3xl p-6 sm:p-8"
      >
        <h2 id="daily-title" class="text-xs font-semibold tracking-wider uppercase opacity-90">
          Défi du jour
        </h2>
        <template v-if="daily">
          <p class="mt-1 text-sm opacity-90 first-letter:uppercase">{{ dailyDate }}</p>
          <p class="mt-3 text-2xl font-extrabold">{{ daily.puzzle.title }}</p>
          <p class="mt-1 text-sm opacity-90">
            {{ difficultyLabel(daily.puzzle.difficulty) }} · {{ daily.puzzle.theme }} · environ
            {{ daily.puzzle.estimatedMinutes }} min
          </p>
          <NuxtLink
            :to="`/play/${daily.puzzle.id}`"
            class="bg-accent-fg text-accent mt-5 inline-flex min-h-11 items-center rounded-full px-6 font-bold"
          >
            Jouer le défi
          </NuxtLink>
        </template>
        <p v-else class="mt-3">Pas de défi aujourd'hui. Revenez demain !</p>
      </section>

      <section aria-labelledby="play-title" class="flex flex-wrap items-center gap-4">
        <h2 id="play-title" class="sr-only">Jouer</h2>
        <NuxtLink
          to="/puzzles"
          class="bg-surface border-line hover:border-accent inline-flex min-h-12 flex-1 items-center justify-center rounded-full border px-6 font-semibold"
        >
          Jouer — parcourir les grilles
        </NuxtLink>
      </section>
    </template>
  </div>
</template>
