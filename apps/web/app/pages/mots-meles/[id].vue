<script setup lang="ts">
import type { Selection } from '~/composables/useWordSearchGame'
import { difficultyLabel, formatClock, formatDuration } from '~/utils/labels'
import { hitColor } from '~/utils/wordsearch'

const route = useRoute()
const rawId = route.params['id']
const id = (Array.isArray(rawId) ? rawId[0] : rawId) ?? ''

const ml = useWordList(id)
const { list, game, loading, loadError, notFound, notice, noticeKind, complete } = ml
const { startedAt, finishedAt, mystery, mysteryShown, mysterySolved } = ml

const catalog = useCatalog()
onMounted(() => void catalog.load())
const look = computed(() => catalog.lookOf(list.value?.themeSlug ?? ''))

useHead({
  title: () =>
    list.value ? `${list.value.title} (mots mêlés) — Crossverse` : 'Mots mêlés — Crossverse',
})

const gridRef = ref<{ focus: () => void } | null>(null)
const completionRef = ref<HTMLElement | null>(null)
const wordsRef = ref<HTMLElement | null>(null)
const guess = ref('')

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

const total = computed(() => list.value?.words.length ?? 0)
const foundCount = computed(() => game.value?.found.size ?? 0)

/** Mot de la liste → mot trouvé (ou montré), pour rayer la liste et colorer la pastille. */
const foundByWord = computed(
  () => new Map([...(game.value?.found.values() ?? [])].map((w) => [w.answer, w])),
)
const revealedCount = computed(
  () => [...foundByWord.value.values()].filter((word) => word.revealed).length,
)

const summary = computed(() => {
  const mine = `${String(total.value - revealedCount.value)} mot(s) trouvé(s) par toi`
  const shown =
    revealedCount.value > 0 ? `, ${String(revealedCount.value)} montré(s) par Sougoudou` : ''
  return `${mine}${shown}, en ${formatDuration(elapsed.value)}.`
})

const directionsHint = computed(() => {
  const directions = list.value?.directions
  if (!directions) return ''
  if (directions.reversed) return 'Les mots se cachent dans tous les sens, même à l’envers.'
  if (directions.diagonals)
    return 'Les mots se lisent de gauche à droite, de haut en bas ou en diagonale.'
  return 'Les mots se lisent de gauche à droite ou de haut en bas.'
})

/** Cases du mot mystère, allumées une fois tous les mots rayés (ou le mot trouvé). */
const marked = computed(() => (mysteryShown.value ? mystery.value.cells : []))

function onSelect(selection: Selection): void {
  ml.submit(selection.from, selection.to)
}

function leaveGrid(): void {
  wordsRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
}

function proposeMystery(): void {
  if (ml.guessMystery(guess.value)) guess.value = ''
}

watch(complete, async (done) => {
  if (!done) return
  await nextTick()
  completionRef.value?.focus()
})

const gridLabel = computed(() =>
  list.value
    ? `Mots mêlés ${list.value.title}, ${String(list.value.size)} lettres de côté.`
    : 'Mots mêlés',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <SougoudouLoader v-if="loading" label="Sougoudou mélange les lettres…" />

    <div v-else-if="loadError" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4">
      <p>{{ loadError }}</p>
      <div class="mt-3 flex gap-4 text-sm font-semibold">
        <button v-if="!notFound" type="button" class="underline" @click="ml.load()">
          Réessayer
        </button>
        <NuxtLink to="/mots-meles" class="underline">Retour aux mots mêlés</NuxtLink>
      </div>
    </div>

    <template v-else-if="game && list">
      <header
        class="cv-skin cv-skin-text flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-3 py-2 sm:px-4"
        :data-skin="look.skin"
        :style="{ '--skin-a': look.accent, '--skin-b': look.accentAlt }"
      >
        <NuxtLink
          to="/mots-meles"
          class="inline-flex min-h-11 items-center rounded-full px-2 text-sm text-white/90 hover:text-white"
        >
          <span aria-hidden="true">←&nbsp;</span>Mots mêlés
        </NuxtLink>
        <h1
          class="order-last min-w-0 basis-full truncate text-lg font-extrabold sm:order-none sm:basis-0 sm:flex-1 sm:text-xl"
        >
          <span aria-hidden="true" class="mr-1">{{ look.icon }}</span
          >{{ list.title }}
          <span class="ml-1 text-sm font-medium text-white/85"
            >Mots mêlés · {{ difficultyLabel(list.difficulty) }}</span
          >
        </h1>
        <p class="ml-auto flex items-center gap-3 text-sm text-white/90 tabular-nums">
          <span>{{ foundCount }} / {{ total }} mots</span>
          <span :aria-label="`Temps écoulé ${formatDuration(elapsed)}`">{{
            formatClock(elapsed)
          }}</span>
        </p>
      </header>

      <!-- Colonne unique bornée sur mobile : le formulaire du mot mystère ne doit pas élargir la page. -->
      <div
        class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start"
      >
        <div class="flex min-w-0 flex-col gap-3">
          <p class="bg-surface border-line rounded-2xl border px-4 py-2 text-sm">
            Glisse le doigt de la première à la dernière lettre d’un mot de la liste (ou touche-les
            l’une après l’autre). {{ directionsHint }}
          </p>

          <WordSearchGrid
            ref="gridRef"
            :game="game"
            :label="gridLabel"
            :disabled="complete"
            :marked="marked"
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
              Grille terminée ! Le mot mystère était {{ mystery.letters }}.
            </h2>
            <p class="mt-2">{{ summary }}</p>
            <p class="mt-1 text-sm opacity-90">Mode entraînement : pas de points ici.</p>
            <div class="mt-5 flex flex-wrap justify-center gap-3">
              <NuxtLink
                to="/mots-meles"
                class="bg-accent-fg text-accent inline-flex min-h-11 items-center rounded-full px-5 font-bold"
                >Autre grille</NuxtLink
              >
              <button
                type="button"
                class="border-accent-fg inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
                @click="ml.restart()"
              >
                Rejouer
              </button>
            </div>
          </section>
        </div>

        <div class="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby="mystery-title"
            class="border-line bg-surface shadow-card rounded-2xl border p-4"
          >
            <h2 id="mystery-title" class="text-lg font-extrabold">Mot mystère</h2>
            <p class="text-muted mt-1 text-sm">
              {{ list.mysteryClue }} · {{ list.mysteryLength }} lettres
            </p>
            <p
              class="mt-3 flex flex-wrap gap-1"
              :aria-label="
                mysteryShown
                  ? `Mot mystère : ${mystery.letters}`
                  : `${String(list.mysteryLength)} lettres à découvrir`
              "
            >
              <span
                v-for="index in list.mysteryLength"
                :key="index"
                aria-hidden="true"
                class="font-display grid size-9 place-items-center rounded-lg border-2 text-lg font-extrabold"
                :class="
                  mysteryShown
                    ? 'border-accent bg-accent text-accent-fg cv-pop'
                    : 'border-line bg-surface-2 text-muted'
                "
                >{{ mysteryShown ? mystery.letters[index - 1] : '' }}</span
              >
            </p>
            <p v-if="mysterySolved && !complete" class="text-success mt-2 text-sm font-semibold">
              Trouvé avant la fin, bravo ! Continue à rayer les mots.
            </p>
            <form v-if="!mysteryShown" class="mt-3 flex gap-2" @submit.prevent="proposeMystery">
              <label class="sr-only" for="mystery-guess">Proposer le mot mystère</label>
              <input
                id="mystery-guess"
                v-model="guess"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                :maxlength="list.mysteryLength + 10"
                placeholder="Ta proposition"
                class="border-line bg-bg focus:border-accent min-h-11 min-w-0 flex-1 rounded-xl border px-3 uppercase"
              />
              <button
                type="submit"
                class="bg-accent text-accent-fg min-h-11 rounded-xl px-4 font-bold disabled:opacity-60"
                :disabled="guess.trim() === ''"
              >
                Proposer
              </button>
            </form>
            <p v-if="!mysteryShown" class="text-muted mt-2 text-xs">
              Raye tous les mots : les lettres qui restent, lues dans l’ordre, forment le mot
              mystère.
            </p>
          </section>

          <section ref="wordsRef" aria-labelledby="words-title" class="flex flex-col gap-2">
            <div class="flex items-baseline justify-between gap-2">
              <h2 id="words-title" class="text-lg font-extrabold">Mots à trouver</h2>
              <NuxtLink
                to="/comment-jouer#mots-meles"
                class="text-accent text-sm font-semibold underline"
                >Comment jouer ?</NuxtLink
              >
            </div>
            <ul class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
              <li
                v-for="word in list.words"
                :key="word"
                class="bg-surface border-line flex min-h-11 items-center gap-1 rounded-xl border py-1 pr-1 pl-2"
              >
                <span
                  v-if="foundByWord.get(word)"
                  aria-hidden="true"
                  class="inline-block h-2.5 w-4 shrink-0 rounded-full"
                  :style="{
                    background: hitColor(foundByWord.get(word) ?? { order: 0, revealed: true }),
                  }"
                />
                <span
                  class="min-w-0 flex-1 truncate text-sm font-bold tracking-wide"
                  :class="foundByWord.get(word) ? 'text-muted line-through decoration-2' : ''"
                  >{{ word
                  }}<span v-if="foundByWord.get(word)" class="sr-only">
                    ({{ foundByWord.get(word)?.revealed ? 'montré' : 'trouvé' }})</span
                  ></span
                >
                <button
                  v-if="!foundByWord.get(word) && !complete"
                  type="button"
                  class="text-muted hover:text-fg hover:bg-surface-2 grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold"
                  :aria-label="`Où est ${word} ?`"
                  title="Où est-il ?"
                  @click="ml.reveal(word)"
                >
                  ?
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
