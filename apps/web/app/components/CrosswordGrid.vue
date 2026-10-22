<script setup lang="ts">
/**
 * Grille jouable. Toute la saisie passe par un champ texte caché, focalisé et placé sur la
 * case active : il reçoit le clavier physique comme le clavier virtuel mobile.
 * Le tracé par glissement utilise les pointer events ; `touch-action: none` n'est posé que
 * sur la grille afin que la page reste défilable partout ailleurs.
 */
import type { Position, PublicClue } from '@crossverse/crossword-core'
import { cellKey } from '~/composables/useCrosswordGame'
import type { ReactiveCrosswordGame } from '~/composables/useCrosswordGame'

const props = defineProps<{
  game: ReactiveCrosswordGame
  label: string
}>()

const emit = defineEmits<{
  /** Échap : l'utilisateur quitte la grille (évite le piège clavier causé par Tab). */
  escape: []
}>()

const gridEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const uid = useId()

const width = computed(() => props.game.puzzle.width)
const height = computed(() => props.game.puzzle.height)

/** Définitions horizontale et verticale de chaque case, calculées une fois. */
const cluesByCell = computed(() => {
  const map = new Map<string, { across?: PublicClue; down?: PublicClue }>()
  for (const clue of props.game.puzzle.clues) {
    for (let i = 0; i < clue.length; i++) {
      const key = cellKey(
        clue.direction === 'across'
          ? { row: clue.row, col: clue.col + i }
          : { row: clue.row + i, col: clue.col },
      )
      const entry = map.get(key) ?? {}
      entry[clue.direction] = clue
      map.set(key, entry)
    }
  }
  return map
})

const cellId = (position: Position): string => `${uid}-c-${position.row}-${position.col}`

function cellLabel(row: number, col: number): string {
  const position = { row, col }
  const cell = props.game.puzzle.cells[row]?.[col]
  const where = `ligne ${row + 1}, colonne ${col + 1}`
  if (!cell || cell.block) return `Case noire, ${where}`
  const parts: string[] = []
  if (cell.number !== undefined) parts.push(`Case ${cell.number}`)
  parts.push(where)
  const clues = cluesByCell.value.get(cellKey(position))
  if (clues?.across) parts.push(`horizontal ${clues.across.number} : ${clues.across.text}`)
  if (clues?.down) parts.push(`vertical ${clues.down.number} : ${clues.down.text}`)
  const letter = props.game.letterAt(position)
  parts.push(letter === null ? 'vide' : `lettre ${letter}`)
  const mark = props.game.marks.get(cellKey(position))
  if (mark === 'incorrect') parts.push('fausse')
  if (mark === 'correct') parts.push('juste')
  if (props.game.revealed.has(cellKey(position))) parts.push('révélée')
  return parts.join(', ')
}

const inputLabel = computed(() => {
  const active = props.game.active
  if (!active) return `${props.label} Sélectionnez une case pour écrire.`
  return `Saisie. ${cellLabel(active.row, active.col)}`
})

const inputStyle = computed(() => {
  const active = props.game.active ?? { row: 0, col: 0 }
  return {
    top: `${(active.row / height.value) * 100}%`,
    left: `${(active.col / width.value) * 100}%`,
    width: `${100 / width.value}%`,
    height: `${100 / height.value}%`,
  }
})

function cellClasses(row: number, col: number): string[] {
  const position = { row, col }
  const key = cellKey(position)
  const cell = props.game.puzzle.cells[row]?.[col]
  if (!cell || cell.block) return ['bg-block']
  const active = props.game.active
  const isActive = active !== null && active.row === row && active.col === col
  const classes = ['text-fg']
  if (isActive) classes.push('bg-cursor text-cursor-fg')
  else if (props.game.dragPreview.has(key)) classes.push('bg-accent-soft')
  else if (props.game.highlighted.has(key)) classes.push('bg-word')
  else classes.push('bg-cell')
  const mark = props.game.marks.get(key)
  if (mark === 'incorrect') classes.push('cv-incorrect')
  if (props.game.revealed.has(key)) classes.push('cv-revealed')
  return classes
}

function focusInput(): void {
  inputEl.value?.focus({ preventScroll: true })
}

// --- Pointeur (souris, doigt, stylet) -----------------------------------

function positionFromPoint(x: number, y: number): Position | null {
  const target = document.elementFromPoint(x, y)
  const cell = target instanceof Element ? target.closest<HTMLElement>('[data-row]') : null
  if (!cell || !gridEl.value?.contains(cell)) return null
  const row = Number(cell.dataset['row'])
  const col = Number(cell.dataset['col'])
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const position = positionFromPoint(event.clientX, event.clientY)
  if (!position) return
  // Capture : le geste continue d'être suivi même si le doigt sort de la case de départ.
  gridEl.value?.setPointerCapture(event.pointerId)
  props.game.pointerStart(position)
}

function onPointerMove(event: PointerEvent): void {
  const position = positionFromPoint(event.clientX, event.clientY)
  if (position) props.game.pointerMove(position)
}

function onPointerUp(event: PointerEvent): void {
  if (gridEl.value?.hasPointerCapture(event.pointerId) === true) {
    gridEl.value.releasePointerCapture(event.pointerId)
  }
  props.game.pointerEnd()
  focusInput()
}

function onPointerCancel(): void {
  props.game.pointerCancel()
}

// --- Clavier et saisie ---------------------------------------------------

const ARROWS: Readonly<Record<string, readonly [-1 | 0 | 1, -1 | 0 | 1]>> = {
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
    props.game.move(arrow[0], arrow[1])
    return
  }
  switch (event.key) {
    case 'Tab':
      event.preventDefault()
      props.game.moveToClue(event.shiftKey ? -1 : 1)
      return
    case 'Backspace':
      event.preventDefault()
      props.game.backspace()
      return
    case 'Delete':
      event.preventDefault()
      props.game.clearActive()
      return
    case ' ':
    case 'Enter':
      event.preventDefault()
      props.game.toggleDirection()
      return
    case 'Escape':
      event.preventDefault()
      emit('escape')
      return
    default:
    // Les lettres arrivent par `beforeinput` (clavier physique comme virtuel).
  }
}

/** Saisie interceptée avant modification du champ : cas nominal sur tous les navigateurs récents. */
function onBeforeInput(event: InputEvent): void {
  switch (event.inputType) {
    case 'insertText':
    case 'insertReplacementText':
    case 'insertFromPaste': {
      const text = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
      event.preventDefault()
      props.game.input(text)
      return
    }
    case 'deleteContentBackward':
      event.preventDefault()
      props.game.backspace()
      return
    default:
    // Composition (claviers Android, saisie prédictive) : non annulable, traitée par `input`.
  }
}

/** Rattrapage : texte arrivé malgré tout dans le champ (composition terminée, vieux claviers). */
function consumeInputValue(inputType?: string): void {
  const element = inputEl.value
  if (!element) return
  const value = element.value
  element.value = ''
  if (value !== '') props.game.input(value)
  else if (inputType === 'deleteContentBackward') props.game.backspace()
}

function onInput(event: Event): void {
  if (event instanceof InputEvent && event.isComposing) return
  consumeInputValue(event instanceof InputEvent ? event.inputType : undefined)
}

function onCompositionEnd(): void {
  consumeInputValue()
}

function onFocus(): void {
  focused.value = true
  if (!props.game.active) props.game.move(0, 0)
}

defineExpose({ focus: focusInput })
</script>

<template>
  <div
    class="relative mx-auto w-full rounded-lg"
    :class="focused ? 'ring-accent ring-offset-bg ring-2 ring-offset-2' : ''"
    :style="{
      maxWidth: `min(100%, ${Math.max(width * 2.75, 22)}rem, 72dvh)`,
      containerType: 'inline-size',
    }"
  >
    <div
      ref="gridEl"
      role="grid"
      :aria-label="label"
      :aria-rowcount="height"
      :aria-colcount="width"
      class="border-block bg-block flex touch-none flex-col overflow-hidden rounded-lg border-2 select-none"
      :style="{ gap: 'var(--cv-grid-border)' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @mousedown.prevent
      @click="focusInput"
    >
      <div
        v-for="(line, row) in game.puzzle.cells"
        :key="row"
        role="row"
        :aria-rowindex="row + 1"
        class="grid"
        :style="{
          gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
          gap: 'var(--cv-grid-border)',
        }"
      >
        <div
          v-for="(cell, col) in line"
          :id="cellId({ row, col })"
          :key="col"
          role="gridcell"
          :aria-colindex="col + 1"
          :aria-label="cellLabel(row, col)"
          :aria-selected="game.active?.row === row && game.active?.col === col"
          :data-row="row"
          :data-col="col"
          class="relative flex aspect-square items-center justify-center font-semibold uppercase transition-colors duration-100"
          :class="cellClasses(row, col)"
          :style="{ fontSize: `calc(100cqi / ${width} * 0.56)` }"
        >
          <span
            v-if="!cell.block && cell.number !== undefined"
            aria-hidden="true"
            class="pointer-events-none absolute top-[4%] left-[6%] leading-none font-medium opacity-80"
            :style="{ fontSize: `calc(100cqi / ${width} * 0.26)` }"
            >{{ cell.number }}</span
          >
          <span v-if="!cell.block" aria-hidden="true" class="pointer-events-none leading-none">{{
            game.letterAt({ row, col }) ?? ''
          }}</span>
        </div>
      </div>
    </div>
    <!-- Sans pointer-events : un toucher sur la case active doit atteindre la grille. -->
    <input
      ref="inputEl"
      class="pointer-events-none absolute m-0 border-0 bg-transparent p-0 text-base opacity-0"
      :style="{ ...inputStyle, caretColor: 'transparent', fontSize: '16px' }"
      type="text"
      inputmode="text"
      enterkeyhint="next"
      autocapitalize="characters"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      :aria-label="inputLabel"
      @keydown="onKeydown"
      @beforeinput="onBeforeInput"
      @input="onInput"
      @compositionend="onCompositionEnd"
      @focus="onFocus"
      @blur="focused = false"
    />
  </div>
</template>

<style scoped>
.cv-incorrect::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    to top right,
    transparent calc(50% - 1.5px),
    var(--cv-danger) calc(50% - 1.5px),
    var(--cv-danger) calc(50% + 1.5px),
    transparent calc(50% + 1.5px)
  );
  opacity: 0.85;
}

.cv-incorrect {
  color: var(--cv-danger);
}

.cv-revealed {
  color: var(--cv-revealed);
}
</style>
