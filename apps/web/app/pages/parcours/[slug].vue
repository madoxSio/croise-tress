<script setup lang="ts">
import type { PathDetail, PathStep } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { difficultyLabel } from '~/utils/labels'

const route = useRoute()
const rawSlug = route.params['slug']
const slug = (Array.isArray(rawSlug) ? rawSlug[0] : rawSlug) ?? ''

const { user, ensure } = useSession()
const path = ref<PathDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

useHead({
  title: () => (path.value ? `${path.value.title} — Crossverse` : 'Parcours — Crossverse'),
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    await ensure()
    path.value = await api.getPath(slug)
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

const isAccount = computed(
  () => user.value !== null && !user.value.isGuest && user.value.emailVerified,
)

const STATE_LABELS: Record<PathStep['state'], string> = {
  completed: 'Réussie',
  available: 'À jouer',
  locked: 'Verrouillée',
}

onMounted(load)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <NuxtLink
      to="/parcours"
      class="text-muted hover:text-fg -ml-2 inline-flex min-h-11 items-center self-start rounded-full px-2 text-sm"
    >
      <span aria-hidden="true">←&nbsp;</span>Parcours
    </NuxtLink>

    <SougoudouLoader v-if="loading" label="Chargement du parcours…" />
    <div v-else-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>

    <template v-else-if="path">
      <header class="flex flex-col gap-2">
        <h1 class="text-3xl font-extrabold tracking-tight">{{ path.title }}</h1>
        <p class="text-muted">{{ path.description }}</p>
        <PathProgressBar :done="path.completedCount" :total="path.stepCount" />
        <CoumbaBalance />
      </header>

      <div
        v-if="!isAccount"
        class="bg-surface border-line flex flex-col gap-2 rounded-2xl border p-4 text-sm"
      >
        <p>
          La première étape est ouverte à tous. Pour débloquer la suite et gagner des Coumba points,
          créez un compte : votre progression est conservée.
        </p>
        <NuxtLink
          to="/register"
          class="bg-accent text-accent-fg inline-flex min-h-11 items-center self-start rounded-full px-5 font-bold"
          >Créer un compte</NuxtLink
        >
      </div>

      <ol class="flex flex-col gap-3">
        <li
          v-for="step in path.steps"
          :key="step.position"
          class="bg-surface border-line flex items-center gap-4 rounded-2xl border p-4"
          :class="step.state === 'locked' ? 'opacity-60' : ''"
        >
          <span
            class="grid size-11 shrink-0 place-items-center rounded-full text-lg font-extrabold"
            :class="
              step.state === 'completed'
                ? 'bg-accent text-accent-fg'
                : step.state === 'available'
                  ? 'border-accent text-accent border-2'
                  : 'bg-surface-2 text-muted'
            "
            aria-hidden="true"
          >
            {{ step.state === 'completed' ? '✓' : step.state === 'locked' ? '🔒' : step.position }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-bold">
              <span class="sr-only">Étape {{ step.position }} : </span>{{ step.title }}
            </p>
            <p class="text-muted text-sm">
              {{ step.puzzle.title }} · {{ difficultyLabel(step.puzzle.difficulty) }} · ~{{
                step.puzzle.estimatedMinutes
              }}
              min · <span>{{ STATE_LABELS[step.state] }}</span>
            </p>
          </div>
          <NuxtLink
            v-if="step.state !== 'locked'"
            :to="`/play/${step.puzzle.id}`"
            class="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold"
            :class="step.state === 'available' ? 'bg-accent text-accent-fg' : 'border-line border'"
            >{{ step.state === 'available' ? 'Jouer' : 'Rejouer' }}</NuxtLink
          >
        </li>
      </ol>
    </template>
  </div>
</template>
