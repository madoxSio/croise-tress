<script setup lang="ts">
import type { PublicClue } from '@crossverse/crossword-core'
import type { MenuItem } from '~/utils/menu'
import type { CheckScope, HintKind } from '~/composables/usePlaySession'
import { difficultyLabel, formatClock, formatDuration } from '~/utils/labels'

const route = useRoute()
const rawId = route.params['puzzleId']
const puzzleId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? ''

const play = usePlaySession(puzzleId)
const { details, session, game, loading, loadError, notFound, saveState, notice, actionError } =
  play
const { explanation, busy, completed } = play

useHead({
  title: () => (details.value ? `${details.value.title} — Crossverse` : 'Partie — Crossverse'),
})

const gridRef = ref<{ focus: () => void } | null>(null)
const clueBarRef = ref<HTMLElement | null>(null)
const completionRef = ref<HTMLElement | null>(null)
const confirmSolution = ref(false)

// --- Chronomètre d'affichage (le temps officiel est calculé par le serveur) ---
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  clearInterval(clock)
})

const elapsed = computed(() => {
  const current = session.value
  if (!current) return 0
  if (current.durationMs !== null) return current.durationMs
  return now.value - new Date(current.startedAt).getTime()
})

const saveLabel = computed(() => {
  switch (saveState.value) {
    case 'pending':
    case 'saving':
      return 'Enregistrement…'
    case 'saved':
      return 'Enregistré'
    case 'error':
      return 'Non enregistré'
    default:
      return ''
  }
})

const activeClue = computed(() => game.value?.activeClue)

const checkItems = computed<MenuItem[]>(() => [
  { id: 'cell', label: 'Vérifier la case', disabled: !game.value?.active },
  { id: 'word', label: 'Vérifier le mot', disabled: !activeClue.value },
  { id: 'grid', label: 'Vérifier la grille' },
])

const hintItems = computed<MenuItem[]>(() => [
  {
    id: 'letter',
    label: 'Révéler une lettre',
    hint: 'La case active',
    disabled: !game.value?.active,
  },
  { id: 'word', label: 'Révéler le mot', hint: 'Le mot sélectionné', disabled: !activeClue.value },
  {
    id: 'explain',
    label: 'Explication',
    hint: 'Une aide sur la définition',
    disabled: !activeClue.value,
  },
  { id: 'solution', label: 'Solution complète', hint: 'Révèle toute la grille', danger: true },
])

const isCheckScope = (id: string): id is CheckScope => ['cell', 'word', 'grid'].includes(id)
const isHintKind = (id: string): id is HintKind =>
  ['letter', 'word', 'explain', 'solution'].includes(id)

async function onCheck(id: string): Promise<void> {
  if (!isCheckScope(id)) return
  await play.check(id)
  gridRef.value?.focus()
}

async function onHint(id: string): Promise<void> {
  if (!isHintKind(id)) return
  if (id === 'solution') {
    confirmSolution.value = true
    return
  }
  await play.hint(id)
  gridRef.value?.focus()
}

async function revealSolution(): Promise<void> {
  confirmSolution.value = false
  await play.hint('solution')
}

function onSelectClue(clue: PublicClue): void {
  game.value?.selectClue(clue)
  gridRef.value?.focus()
}

function stepClue(delta: 1 | -1): void {
  game.value?.moveToClue(delta)
  gridRef.value?.focus()
}

function toggleDirection(): void {
  game.value?.toggleDirection()
  gridRef.value?.focus()
}

function leaveGrid(): void {
  clueBarRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

watch(completed, async (done) => {
  if (!done) return
  await nextTick()
  completionRef.value?.focus()
})

const gridLabel = computed(() =>
  details.value
    ? `Grille ${details.value.title}, ${details.value.width} colonnes sur ${details.value.height} lignes. Flèches pour se déplacer, Tab pour changer de mot, Espace pour changer de sens, Échap pour quitter la grille.`
    : 'Grille',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="loading" role="status" class="text-muted">Chargement de la grille…</p>

    <div v-else-if="loadError" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4">
      <p>{{ loadError }}</p>
      <div class="mt-3 flex gap-4 text-sm font-semibold">
        <button v-if="!notFound" type="button" class="underline" @click="play.load">
          Réessayer
        </button>
        <NuxtLink to="/puzzles" class="underline">Retour aux grilles</NuxtLink>
      </div>
    </div>

    <template v-else-if="game && details && session">
      <header class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <NuxtLink
          to="/puzzles"
          class="text-muted hover:text-fg -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm"
        >
          <span aria-hidden="true">←&nbsp;</span>Grilles
        </NuxtLink>
        <h1 class="min-w-0 flex-1 truncate text-lg font-extrabold sm:text-xl">
          {{ details.title }}
          <span class="text-muted ml-1 text-sm font-medium">{{
            difficultyLabel(details.difficulty)
          }}</span>
        </h1>
        <p class="text-muted flex items-center gap-3 text-sm tabular-nums">
          <span :aria-label="`Temps écoulé ${formatDuration(elapsed)}`">{{
            formatClock(elapsed)
          }}</span>
          <span
            aria-live="polite"
            :class="saveState === 'error' ? 'text-danger font-semibold' : ''"
            >{{ saveLabel }}</span
          >
        </p>
      </header>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start">
        <div class="flex min-w-0 flex-col gap-3">
          <!-- Définition active : toujours visible au-dessus de la grille. -->
          <div
            ref="clueBarRef"
            class="bg-surface border-line sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex items-center gap-1 rounded-2xl border p-1 shadow-sm"
          >
            <button
              type="button"
              class="hover:bg-surface-2 grid size-11 shrink-0 place-items-center rounded-xl"
              aria-label="Mot précédent"
              @click="stepClue(-1)"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              class="hover:bg-surface-2 min-h-11 min-w-0 flex-1 rounded-xl px-2 py-1 text-left"
              :aria-label="
                activeClue
                  ? `Changer de sens. Définition active : ${activeClue.number} ${activeClue.direction === 'across' ? 'horizontal' : 'vertical'}, ${activeClue.text}`
                  : 'Aucune définition sélectionnée'
              "
              @click="toggleDirection"
            >
              <span v-if="activeClue" class="flex items-baseline gap-2">
                <span class="text-accent shrink-0 text-sm font-extrabold">
                  {{ activeClue.number }}{{ activeClue.direction === 'across' ? 'H' : 'V' }}
                </span>
                <span class="text-sm leading-snug sm:text-base">{{ activeClue.text }}</span>
              </span>
              <span v-else class="text-muted text-sm">Touchez une case pour commencer.</span>
            </button>
            <button
              type="button"
              class="hover:bg-surface-2 grid size-11 shrink-0 place-items-center rounded-xl"
              aria-label="Mot suivant"
              @click="stepClue(1)"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <CrosswordGrid ref="gridRef" :game="game" :label="gridLabel" @escape="leaveGrid" />

          <p role="status" aria-live="polite" class="min-h-5 text-center text-sm">
            <span v-if="actionError" class="text-danger">{{ actionError }}</span>
            <span v-else-if="notice">{{ notice }}</span>
            <span v-else-if="game.isFull && !completed" class="text-muted">
              Grille remplie : vérifiez-la pour trouver les erreurs.
            </span>
          </p>

          <section
            v-if="completed"
            ref="completionRef"
            tabindex="-1"
            aria-labelledby="completion-title"
            class="bg-accent text-accent-fg cv-pop rounded-3xl p-6 text-center focus:outline-none"
          >
            <h2 id="completion-title" class="text-2xl font-extrabold">Grille terminée !</h2>
            <dl class="mt-4 flex justify-center gap-8">
              <div>
                <dt class="text-xs tracking-wider uppercase opacity-80">Temps</dt>
                <dd class="text-xl font-bold tabular-nums">
                  {{ session.durationMs === null ? '—' : formatDuration(session.durationMs) }}
                </dd>
              </div>
              <div>
                <dt class="text-xs tracking-wider uppercase opacity-80">Score</dt>
                <dd class="text-xl font-bold tabular-nums">{{ session.score ?? '—' }}</dd>
              </div>
            </dl>
            <p v-if="session.hints.solutionRevealed" class="mt-3 text-sm opacity-90">
              Solution révélée : la partie ne rapporte pas de points.
            </p>
            <p
              v-else-if="session.hints.lettersRevealed + session.hints.wordsRevealed > 0"
              class="mt-3 text-sm opacity-90"
            >
              Aides utilisées : {{ session.hints.lettersRevealed }} lettre(s),
              {{ session.hints.wordsRevealed }} mot(s).
            </p>
            <div class="mt-5 flex flex-wrap justify-center gap-3">
              <NuxtLink
                to="/puzzles"
                class="bg-accent-fg text-accent inline-flex min-h-11 items-center rounded-full px-5 font-bold"
                >Autre grille</NuxtLink
              >
              <NuxtLink
                to="/"
                class="border-accent-fg inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
                >Accueil</NuxtLink
              >
            </div>
          </section>

          <div v-else class="flex flex-wrap items-center justify-center gap-2">
            <ActionMenu label="Vérifier" :items="checkItems" :disabled="busy" @choose="onCheck" />
            <ActionMenu label="Indice" :items="hintItems" :disabled="busy" @choose="onHint" />
          </div>

          <aside
            v-if="explanation"
            aria-labelledby="explanation-title"
            class="bg-surface border-line rounded-2xl border p-4 text-sm"
          >
            <div class="flex items-start gap-2">
              <h2 id="explanation-title" class="flex-1 font-bold">
                Explication · {{ explanation.label }}
              </h2>
              <button
                type="button"
                class="text-muted hover:text-fg -m-2 grid size-11 place-items-center rounded-full"
                aria-label="Fermer l'explication"
                @click="explanation = null"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p class="mt-1 leading-relaxed">{{ explanation.text }}</p>
          </aside>
        </div>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ClueList :game="game" direction="across" @select="onSelectClue" />
          <ClueList :game="game" direction="down" @select="onSelectClue" />
        </div>
      </div>

      <ConfirmDialog
        :open="confirmSolution"
        title="Afficher la solution complète ?"
        confirm-label="Afficher la solution"
        @confirm="revealSolution"
        @cancel="confirmSolution = false"
      >
        Toutes les lettres de la grille seront révélées et la partie ne rapportera aucun point.
        Cette action est définitive.
      </ConfirmDialog>
    </template>
  </div>
</template>
