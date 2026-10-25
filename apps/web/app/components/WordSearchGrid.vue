<script setup lang="ts">
/**
 * Grille pré-remplie : on surligne un mot en glissant de sa première à sa dernière lettre,
 * ou par deux taps (première lettre, puis dernière). Au clavier : flèches pour se déplacer,
 * Entrée ou Espace sur la première puis sur la dernière lettre, Échap pour annuler.
 * Les surlignages sont des traits SVG arrondis posés sous les lettres, comme au stylo.
 */
import type { Position } from '@crossverse/crossword-core'
import type { Selection, WordSearchGame } from '~/composables/useWordSearchGame'
import { hitColor } from '~/utils/wordsearch'

// `marked` : cases mises en valeur (lettres du mot mystère des mots mêlés, en fin de partie).
const props = defineProps<{
  game: WordSearchGame
  label: string
  disabled?: boolean
  marked?: readonly Position[]
}>()
const emit = defineEmits<{ select: [selection: Selection]; escape: [] }>()

const gridEl = ref<HTMLElement | null>(null)
const focused = ref(false)
const uid = useId()
const size = computed(() => props.game.size)

const cellId = (position: Position): string => `${uid}-c-${position.row}-${position.col}`
const key = (position: Position): string => `${position.row}:${position.col}`

const previewKeys = computed(() => new Set(props.game.preview.map(key)))
const markedKeys = computed(() => new Set((props.marked ?? []).map(key)))
/** Cases couvertes par un mot trouvé, pour les annoncer aux lecteurs d'écran. */
const foundByCell = computed(() => {
  const map = new Map<string, string[]>()
  for (const word of props.game.found.values()) {
    const dr = Math.sign(word.end.row - word.start.row)
    const dc = Math.sign(word.end.col - word.start.col)
    for (let i = 0; i < word.answer.length; i++) {
      const k = key({ row: word.start.row + dr * i, col: word.start.col + dc * i })
      map.set(k, [...(map.get(k) ?? []), word.answer])
    }
  }
  return map
})

const lines = computed(() =>
  [...props.game.found.values()].map((word) => ({
    id: `${word.direction}-${word.number}`,
    x1: word.start.col + 0.5,
    y1: word.start.row + 0.5,
    x2: word.end.col + 0.5,
    y2: word.end.row + 0.5,
    color: hitColor(word),
  })),
)

const previewLine = computed(() => {
  const cells = props.game.preview
  const first = cells[0]
  const last = cells.at(-1)
  if (!first || !last) return null
  return { x1: first.col + 0.5, y1: first.row + 0.5, x2: last.col + 0.5, y2: last.row + 0.5 }
})

function cellLabel(row: number, col: number): string {
  const position = { row, col }
  const parts = [props.game.letterAt(position), `ligne ${row + 1}, colonne ${col + 1}`]
  const anchor = props.game.anchor
  if (anchor?.row === row && anchor.col === col) parts.push('première lettre choisie')
  else if (previewKeys.value.has(key(position))) parts.push('dans la sélection')
  const words = foundByCell.value.get(key(position))
  if (words) parts.push(`dans ${words.join(' et ')}`)
  if (markedKeys.value.has(key(position))) parts.push('lettre du mot mystère')
  return parts.join(', ')
}

const instructions = computed(() =>
  props.game.anchor
    ? 'Déplacez-vous jusqu’à la dernière lettre puis appuyez sur Entrée. Échap pour annuler.'
    : 'Flèches pour vous déplacer, Entrée sur la première lettre d’un mot.',
)

// --- Pointeur (souris, doigt, stylet) -----------------------------------

let dragging = false
let tappedAnchor = false
let moved = false
let downAt: Position | null = null

function positionFromPoint(x: number, y: number): Position | null {
  const target = document.elementFromPoint(x, y)
  const cell = target instanceof Element ? target.closest<HTMLElement>('[data-row]') : null
  if (cell && gridEl.value?.contains(cell)) {
    return { row: Number(cell.dataset['row']), col: Number(cell.dataset['col']) }
  }
  // Doigt sorti de la grille : on vise la case la plus proche du bord.
  const rect = gridEl.value?.getBoundingClientRect()
  if (!rect || !dragging) return null
  const n = size.value
  const col = Math.min(n - 1, Math.max(0, Math.floor(((x - rect.left) / rect.width) * n)))
  const row = Math.min(n - 1, Math.max(0, Math.floor(((y - rect.top) / rect.height) * n)))
  return { row, col }
}

function emitSelection(selection: Selection | null): void {
  if (selection) emit('select', selection)
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
  const position = positionFromPoint(event.clientX, event.clientY)
  if (!position) return
  gridEl.value?.setPointerCapture(event.pointerId)
  dragging = true
  moved = false
  downAt = position
  const anchor = props.game.anchor
  tappedAnchor = anchor !== null && anchor.row === position.row && anchor.col === position.col
  // Un premier tap pose l'ancre ; avec une ancre déjà posée, ce tap vise la dernière lettre.
  if (!anchor) props.game.begin(position)
  else props.game.aim(position)
  props.game.setCursor(position)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging) return
  const position = positionFromPoint(event.clientX, event.clientY)
  if (!position) return
  if (downAt && (position.row !== downAt.row || position.col !== downAt.col)) moved = true
  props.game.aim(position)
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging) return
  dragging = false
  if (gridEl.value?.hasPointerCapture(event.pointerId) === true) {
    gridEl.value.releasePointerCapture(event.pointerId)
  }
  const selection = props.game.finish()
  if (selection) emitSelection(selection)
  else if (tappedAnchor && !moved) props.game.cancel()
  gridEl.value?.focus({ preventScroll: true })
}

function onPointerCancel(): void {
  dragging = false
  props.game.cancel()
}

// --- Clavier -------------------------------------------------------------

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

function onKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const arrow = ARROWS[event.key]
  if (arrow) {
    event.preventDefault()
    props.game.moveCursor(arrow[0], arrow[1])
    return
  }
  switch (event.key) {
    case 'Home':
    case 'End':
    case 'PageUp':
    case 'PageDown': {
      // Diagonales au clavier : Début ↖, Fin ↙, Page préc. ↗, Page suiv. ↘.
      event.preventDefault()
      const steps: Record<string, [number, number]> = {
        Home: [-1, -1],
        End: [1, -1],
        PageUp: [-1, 1],
        PageDown: [1, 1],
      }
      const [dr, dc] = steps[event.key] ?? [0, 0]
      props.game.moveCursor(dr, dc)
      return
    }
    case ' ':
    case 'Enter':
      event.preventDefault()
      if (!props.disabled) emitSelection(props.game.press(props.game.cursor))
      return
    case 'Escape':
      event.preventDefault()
      if (props.game.anchor) props.game.cancel()
      else emit('escape')
      return
    default:
  }
}

defineExpose({ focus: () => gridEl.value?.focus({ preventScroll: true }) })
</script>

<template>
  <div
    class="relative mx-auto w-full"
    :style="{
      maxWidth: `min(100%, ${Math.max(size * 2.6, 22)}rem, 72dvh)`,
      containerType: 'inline-size',
    }"
  >
    <p :id="`${uid}-help`" class="sr-only">{{ instructions }}</p>
    <div
      ref="gridEl"
      role="grid"
      tabindex="0"
      :aria-label="label"
      :aria-describedby="`${uid}-help`"
      :aria-rowcount="size"
      :aria-colcount="size"
      :aria-activedescendant="cellId(game.cursor)"
      class="bg-cell border-line relative touch-none overflow-hidden rounded-2xl border-2 select-none focus:outline-none"
      :class="focused ? 'ring-accent ring-offset-bg ring-2 ring-offset-2' : ''"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @mousedown.prevent
      @keydown="onKeydown"
      @focus="focused = true"
      @blur="focused = false"
    >
      <!-- Surlignages : sous les lettres, en unités de cases (1 case = 1 unité). -->
      <svg
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 size-full"
        :viewBox="`0 0 ${size} ${size}`"
        preserveAspectRatio="none"
      >
        <line
          v-for="line in lines"
          :key="line.id"
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          :stroke="line.color"
          stroke-width="0.78"
          stroke-linecap="round"
          class="cv-hit"
        />
        <line
          v-if="previewLine"
          :x1="previewLine.x1"
          :y1="previewLine.y1"
          :x2="previewLine.x2"
          :y2="previewLine.y2"
          stroke="var(--cv-accent)"
          stroke-opacity="0.35"
          stroke-width="0.82"
          stroke-linecap="round"
        />
      </svg>
      <div
        v-for="(line, row) in game.data.rows"
        :key="row"
        role="row"
        :aria-rowindex="row + 1"
        class="relative grid"
        :style="{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }"
      >
        <div
          v-for="(letter, col) in line"
          :id="cellId({ row, col })"
          :key="col"
          role="gridcell"
          :aria-colindex="col + 1"
          :aria-label="cellLabel(row, col)"
          :aria-selected="previewKeys.has(`${row}:${col}`)"
          :data-row="row"
          :data-col="col"
          class="text-fg relative flex aspect-square items-center justify-center font-bold"
          :class="[
            focused && game.cursor.row === row && game.cursor.col === col
              ? 'outline-accent rounded-md outline-2 -outline-offset-2'
              : '',
            markedKeys.has(`${row}:${col}`) ? 'cv-marked text-accent' : '',
          ]"
          :style="{ fontSize: `calc(100cqi / ${size} * 0.52)` }"
        >
          <span aria-hidden="true" class="pointer-events-none leading-none">{{ letter }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Le trait se dessine comme un coup de surligneur (sans effet si les animations sont réduites). */
.cv-hit {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: cv-draw 0.45s ease-out forwards;
}

@keyframes cv-draw {
  to {
    stroke-dashoffset: 0;
  }
}

/* Lettre du mot mystère : pastille qui « s'allume » une fois tous les mots rayés. */
.cv-marked::before {
  content: '';
  position: absolute;
  inset: 12%;
  border-radius: 9999px;
  border: 2px solid var(--cv-accent);
  animation: cv-glow 0.6s ease-out both;
}

@keyframes cv-glow {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}
</style>
