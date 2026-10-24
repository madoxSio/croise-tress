<script setup lang="ts">
/**
 * Démonstration animée de la landing : une mini-grille se remplit mot après mot, avec sa
 * définition affichée au-dessus. Purement illustrative (aria-hidden, aucune donnée de jeu) :
 * le texte de la page explique la même chose. Avec la réduction des animations, la grille
 * est affichée remplie, sans minuterie.
 */
interface DemoWord {
  readonly label: string
  readonly clue: string
  readonly answer: string
  readonly row: number
  readonly col: number
  readonly across: boolean
}

const ROWS = 5
const COLS = 6
const WORDS: readonly DemoWord[] = [
  {
    label: '1 →',
    clue: 'Terrain de jeu du cruciverbiste',
    answer: 'GRILLE',
    row: 0,
    col: 0,
    across: true,
  },
  {
    label: '1 ↓',
    clue: 'Ce que fait le plus rapide en duel',
    answer: 'GAGNE',
    row: 0,
    col: 0,
    across: false,
  },
  {
    label: '2 ↓',
    clue: 'À faire avant de répondre',
    answer: 'LIRE',
    row: 0,
    col: 4,
    across: false,
  },
  {
    label: '3 →',
    clue: 'Mettre sa voiture à sa place',
    answer: 'GARER',
    row: 2,
    col: 0,
    across: true,
  },
]
const NUMBERS: Readonly<Record<string, number>> = { '0:0': 1, '0:4': 2, '2:0': 3 }

const key = (row: number, col: number): string => `${row}:${col}`

function cellsOf(word: DemoWord): string[] {
  return Array.from({ length: word.answer.length }, (_, i) =>
    word.across ? key(word.row, word.col + i) : key(word.row + i, word.col),
  )
}

/** Solution de chaque case blanche ; les autres sont noires. */
const solution = new Map<string, string>()
for (const word of WORDS)
  cellsOf(word).forEach((cell, i) => solution.set(cell, word.answer[i] ?? ''))

const letters = ref(new Map<string, string>())
const wordIndex = ref(0)
const cursor = ref<string | null>(null)
const solved = ref(false)

const activeWord = computed(() => WORDS[wordIndex.value] ?? WORDS[0])
const activeCells = computed(() => new Set(activeWord.value ? cellsOf(activeWord.value) : []))

const grid = computed(() =>
  Array.from({ length: ROWS * COLS }, (_, index) => {
    const row = Math.floor(index / COLS)
    const col = index % COLS
    const id = key(row, col)
    return {
      id,
      block: !solution.has(id),
      letter: letters.value.get(id) ?? '',
      number: NUMBERS[id],
      active: !solved.value && activeCells.value.has(id),
      cursor: !solved.value && cursor.value === id,
    }
  }),
)

let timer: ReturnType<typeof setTimeout> | undefined
const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
// Arrêt de la boucle au démontage.
const stop = new AbortController()
const stopped = (): boolean => stop.signal.aborted

async function play(): Promise<void> {
  while (!stopped()) {
    letters.value = new Map()
    solved.value = false
    for (const [index, word] of WORDS.entries()) {
      wordIndex.value = index
      for (const cell of cellsOf(word)) {
        if (stopped()) return
        cursor.value = cell
        await wait(260)
        letters.value = new Map(letters.value).set(cell, solution.get(cell) ?? '')
      }
      await wait(700)
    }
    cursor.value = null
    solved.value = true
    await wait(2600)
  }
}

function prefersReducedMotion(): boolean {
  return (
    document.documentElement.dataset['motion'] === 'reduced' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

onMounted(() => {
  if (prefersReducedMotion()) {
    letters.value = new Map(solution)
    solved.value = true
    return
  }
  void play()
})

onBeforeUnmount(() => {
  stop.abort()
  clearTimeout(timer)
})
</script>

<template>
  <div aria-hidden="true" class="border-line bg-surface shadow-card rounded-3xl border p-4 sm:p-5">
    <div class="bg-surface-2 mb-4 flex min-h-14 items-center gap-3 rounded-2xl px-4 py-2 text-sm">
      <span
        class="rounded-lg px-2 py-1 font-bold tabular-nums transition-colors"
        :class="solved ? 'bg-highlight text-[#16132a]' : 'bg-accent text-accent-fg'"
        >{{ solved ? '✓' : activeWord?.label }}</span
      >
      <span class="font-medium">{{ solved ? 'Bravo, grille complète !' : activeWord?.clue }}</span>
    </div>
    <div class="grid gap-1" :style="{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }">
      <div
        v-for="cell in grid"
        :key="cell.id"
        class="relative grid aspect-square place-items-center rounded-lg text-lg font-extrabold transition-colors duration-200 sm:text-2xl"
        :class="[
          cell.block
            ? 'bg-block'
            : cell.cursor
              ? 'bg-cursor text-cursor-fg'
              : cell.active
                ? 'bg-word'
                : solved
                  ? 'bg-accent-soft'
                  : 'bg-cell border-line border',
        ]"
      >
        <span
          v-if="cell.number"
          class="text-muted absolute top-0.5 left-1 text-[0.6rem] font-semibold sm:text-xs"
          >{{ cell.number }}</span
        >
        <span v-if="cell.letter" :key="cell.letter" class="cv-pop font-display">{{
          cell.letter
        }}</span>
      </div>
    </div>
  </div>
</template>
