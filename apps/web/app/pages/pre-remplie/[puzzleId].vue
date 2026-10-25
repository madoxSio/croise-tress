<script setup lang="ts">
import type { WordSearchClue } from '@crossverse/contracts'
import type { Selection } from '~/composables/useWordSearchGame'
import { clueKey } from '~/composables/useWordSearchGame'
import { clueSpoken, clueTag, difficultyLabel, formatClock, formatDuration } from '~/utils/labels'
import { puzzlePath } from '~/utils/playModes'
import { hitColor } from '~/utils/wordsearch'

const route = useRoute()
const rawId = route.params['puzzleId']
const puzzleId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? ''

const ws = useWordSearch(puzzleId)
const { details, game, loading, loadError, notFound, busy, notice, noticeKind } = ws
const { startedAt, finishedAt } = ws

const catalog = useCatalog()
onMounted(() => void catalog.load())
const look = computed(() => catalog.lookOf(details.value?.themeSlug ?? ''))

useHead({
  title: () =>
    details.value
      ? `${details.value.title} (pré-remplie) — Crossverse`
      : 'Grille pré-remplie — Crossverse',
})

const gridRef = ref<{ focus: () => void } | null>(null)
const completionRef = ref<HTMLElement | null>(null)
const cluesRef = ref<HTMLElement | null>(null)

// Chronomètre d'affichage seulement : ce mode n'a pas de temps officiel.
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
const elapsed = computed(() => (finishedAt.value ?? now.value) - startedAt.value)

const complete = computed(() => game.value?.complete === true)
/** Mots croisés classiques : définitions repérées par ligne et colonne (« Ligne IV »). */
const classic = computed(() => game.value?.data.format === 'classic')
const total = computed(() => game.value?.data.clues.length ?? 0)
const progressLabel = computed(() => {
  const current = game.value
  if (!current) return ''
  return `${String(current.found.size)} / ${String(total.value)} mots`
})

/** Définitions dans l'ordre classique : horizontales puis verticales. */
const clueGroups = computed(() => {
  const clues = game.value?.data.clues ?? []
  return [
    {
      id: 'across',
      title: 'Horizontalement',
      items: clues.filter((c) => c.direction === 'across'),
    },
    { id: 'down', title: 'Verticalement', items: clues.filter((c) => c.direction === 'down') },
  ].filter((group) => group.items.length > 0)
})

const directionsHint = computed(() => {
  const directions = game.value?.data.directions
  if (!directions) return ''
  if (directions.reversed) return 'Les mots peuvent aller dans tous les sens, même à l’envers.'
  if (directions.diagonals)
    return 'Les mots se lisent de gauche à droite, de haut en bas ou en diagonale.'
  return 'Les mots se lisent de gauche à droite ou de haut en bas.'
})

async function onSelect(selection: Selection): Promise<void> {
  await ws.submit(selection.from, selection.to)
}

function foundWord(clue: WordSearchClue) {
  return game.value?.found.get(clueKey(clue)) ?? null
}

function pickClue(clue: WordSearchClue): void {
  const current = game.value
  if (!current) return
  current.selectClue(
    current.activeClue && clueKey(current.activeClue) === clueKey(clue) ? null : clue,
  )
  gridRef.value?.focus()
}

async function revealClue(clue: WordSearchClue): Promise<void> {
  await ws.reveal(clue)
}

function leaveGrid(): void {
  cluesRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

const learned = computed(() => {
  const current = game.value
  if (!current) return []
  return current.data.clues.map((clue) => ({
    clue,
    word: current.found.get(clueKey(clue)) ?? null,
  }))
})
const revealedCount = computed(
  () => [...(game.value?.found.values() ?? [])].filter((word) => word.revealed).length,
)

watch(complete, async (done) => {
  if (!done) return
  await nextTick()
  completionRef.value?.focus()
})

const gridLabel = computed(() =>
  details.value && game.value
    ? `Grille pré-remplie ${details.value.title}, ${String(game.value.size)} lettres de côté.`
    : 'Grille pré-remplie',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <SougoudouLoader v-if="loading" label="Sougoudou cache les mots dans la grille…" />

    <div v-else-if="loadError" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4">
      <p>{{ loadError }}</p>
      <div class="mt-3 flex gap-4 text-sm font-semibold">
        <button v-if="!notFound" type="button" class="underline" @click="ws.load()">
          Réessayer
        </button>
        <NuxtLink to="/puzzles" class="underline">Retour aux grilles</NuxtLink>
      </div>
    </div>

    <template v-else-if="game && details">
      <header
        class="cv-skin cv-skin-text flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-3 py-2 sm:px-4"
        :data-skin="look.skin"
        :style="{ '--skin-a': look.accent, '--skin-b': look.accentAlt }"
      >
        <NuxtLink
          to="/puzzles"
          class="inline-flex min-h-11 items-center rounded-full px-2 text-sm text-white/90 hover:text-white"
        >
          <span aria-hidden="true">←&nbsp;</span>Grilles
        </NuxtLink>
        <h1
          class="order-last min-w-0 basis-full truncate text-lg font-extrabold sm:order-none sm:basis-0 sm:flex-1 sm:text-xl"
        >
          <span aria-hidden="true" class="mr-1">{{ look.icon }}</span
          >{{ details.title }}
          <span class="ml-1 text-sm font-medium text-white/85"
            >Pré-remplie · {{ difficultyLabel(details.difficulty) }}</span
          >
        </h1>
        <p class="ml-auto flex items-center gap-3 text-sm text-white/90 tabular-nums">
          <span>{{ progressLabel }}</span>
          <span :aria-label="`Temps écoulé ${formatDuration(elapsed)}`">{{
            formatClock(elapsed)
          }}</span>
        </p>
      </header>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start">
        <div class="flex min-w-0 flex-col gap-3">
          <p class="bg-surface border-line rounded-2xl border px-4 py-2 text-sm">
            <template v-if="game.activeClue">
              <span class="text-accent font-extrabold">{{
                clueTag(game.activeClue, classic)
              }}</span>
              {{ game.activeClue.text }}
              <span class="text-muted">({{ game.activeClue.length }} lettres)</span>
            </template>
            <template v-else>
              Glisse le doigt de la première à la dernière lettre d’un mot (ou touche-les l’une
              après l’autre). {{ directionsHint }}
            </template>
          </p>

          <WordSearchGrid
            ref="gridRef"
            :game="game"
            :label="gridLabel"
            :disabled="busy || complete"
            @select="onSelect"
            @escape="leaveGrid"
          />

          <p role="status" aria-live="polite" class="min-h-5 text-center text-sm font-semibold">
            <span
              v-if="notice"
              :class="
                noticeKind === 'miss' ? 'text-danger' : noticeKind === 'hit' ? 'text-success' : ''
              "
              >{{ notice }}</span
            >
          </p>

          <section
            v-if="complete"
            ref="completionRef"
            tabindex="-1"
            aria-labelledby="completion-title"
            class="bg-accent text-accent-fg cv-pop rounded-3xl p-6 text-center focus:outline-none"
          >
            <SougoudouMascot mood="cheer" class="mx-auto size-24" />
            <h2 id="completion-title" class="mt-2 text-2xl font-extrabold">
              Tous les mots trouvés !
            </h2>
            <p class="mt-2">
              {{ total - revealedCount }} trouvé(s) par toi<template v-if="revealedCount > 0">
                , {{ revealedCount }} montré(s) par Sougoudou</template
              >, en {{ formatDuration(elapsed) }}.
            </p>
            <p class="mt-1 text-sm opacity-90">
              Mode entraînement : pas de points ici. Prêt pour la version à trous ?
            </p>
            <div class="mt-5 flex flex-wrap justify-center gap-3">
              <NuxtLink
                :to="puzzlePath(puzzleId, 'classic')"
                class="bg-accent-fg text-accent inline-flex min-h-11 items-center rounded-full px-5 font-bold"
                >Jouer à trous</NuxtLink
              >
              <button
                type="button"
                class="border-accent-fg inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
                @click="ws.reshuffle()"
              >
                Nouvelle disposition
              </button>
              <NuxtLink
                to="/puzzles"
                class="border-accent-fg inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
                >Autre grille</NuxtLink
              >
            </div>
          </section>

          <div v-else class="flex flex-wrap items-center justify-center gap-2 text-sm">
            <button
              type="button"
              class="border-line bg-surface hover:border-accent min-h-11 rounded-full border px-4 font-semibold disabled:opacity-60"
              :disabled="busy"
              @click="ws.reshuffle()"
            >
              Mélanger à nouveau
            </button>
            <NuxtLink
              :to="puzzlePath(puzzleId, 'classic')"
              class="border-line bg-surface hover:border-accent inline-flex min-h-11 items-center rounded-full border px-4 font-semibold"
              >Passer en grille à trous</NuxtLink
            >
          </div>
        </div>

        <section ref="cluesRef" aria-labelledby="clues-title" class="flex flex-col gap-4">
          <div class="flex items-baseline justify-between gap-2">
            <h2 id="clues-title" class="text-lg font-extrabold">Définitions</h2>
            <NuxtLink to="/comment-jouer#modes" class="text-accent text-sm font-semibold underline"
              >Comment jouer ?</NuxtLink
            >
          </div>
          <div v-for="group in clueGroups" :key="group.id" class="flex flex-col gap-2">
            <h3 class="text-muted text-xs font-bold tracking-wider uppercase">{{ group.title }}</h3>
            <ul class="flex flex-col gap-1.5">
              <li
                v-for="clue in group.items"
                :key="clueKey(clue)"
                class="bg-surface border-line flex items-start gap-1 rounded-xl border p-1"
                :class="
                  game.activeClue && clueKey(game.activeClue) === clueKey(clue)
                    ? 'border-accent ring-accent ring-1'
                    : ''
                "
              >
                <button
                  type="button"
                  class="hover:bg-surface-2 min-h-11 min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm"
                  :aria-pressed="
                    game.activeClue ? clueKey(game.activeClue) === clueKey(clue) : false
                  "
                  @click="pickClue(clue)"
                >
                  <span class="text-accent mr-1 font-extrabold">{{ clueTag(clue, classic) }}</span>
                  <span :class="foundWord(clue) ? 'text-muted' : ''">{{ clue.text }}</span>
                  <span class="text-muted"> ({{ clue.length }})</span>
                  <span
                    v-if="foundWord(clue)"
                    class="mt-1 flex items-center gap-2 font-extrabold tracking-wide"
                  >
                    <span
                      aria-hidden="true"
                      class="inline-block h-2.5 w-6 rounded-full"
                      :style="{
                        background: hitColor(foundWord(clue) ?? { order: 0, revealed: true }),
                      }"
                    />
                    {{ foundWord(clue)?.answer }}
                    <span v-if="foundWord(clue)?.revealed" class="text-muted text-xs font-medium"
                      >(montré)</span
                    >
                    <span v-else class="sr-only">(trouvé)</span>
                  </span>
                </button>
                <button
                  v-if="!foundWord(clue) && !complete"
                  type="button"
                  class="text-muted hover:text-fg hover:bg-surface-2 min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold"
                  :aria-label="`Où est le mot ${clueSpoken(clue, classic)} ?`"
                  :disabled="busy"
                  @click="revealClue(clue)"
                >
                  Où est-il ?
                </button>
              </li>
            </ul>
          </div>

          <details v-if="complete" class="bg-surface border-line rounded-2xl border p-4" open>
            <summary class="cursor-pointer font-bold">Mots appris dans cette grille</summary>
            <dl class="mt-3 flex flex-col gap-2 text-sm">
              <div v-for="item in learned" :key="clueKey(item.clue)">
                <dt class="font-extrabold tracking-wide">{{ item.word?.answer }}</dt>
                <dd class="text-muted">{{ item.clue.text }}</dd>
              </div>
            </dl>
          </details>
        </section>
      </div>
    </template>
  </div>
</template>
