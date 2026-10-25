<script setup lang="ts">
import type { Direction, PublicClue } from '@crossverse/crossword-core'
import { classicLines, slotCells } from '@crossverse/crossword-core'
import type { ReactiveCrosswordGame } from '~/composables/useCrosswordGame'
import { clueSpoken, directionLabel } from '~/utils/labels'

/**
 * Liste des définitions d'une direction. Mots croisés classiques (`classic`) : une entrée
 * par ligne (I, II…) ou par colonne (1, 2…), qui regroupe les définitions de ses mots
 * dans l'ordre de lecture.
 */
const props = withDefaults(
  defineProps<{
    game: ReactiveCrosswordGame
    direction: Direction
    classic?: boolean
  }>(),
  { classic: false },
)

const emit = defineEmits<{ select: [clue: PublicClue] }>()

const listEl = ref<HTMLElement | null>(null)

const clues = computed(() => props.game.clues.filter((clue) => clue.direction === props.direction))
const lines = computed(() => classicLines(props.game.clues, props.direction))
const classicHeading = computed(() =>
  props.direction === 'across' ? 'Horizontalement' : 'Verticalement',
)

const isActive = (clue: PublicClue): boolean =>
  props.game.activeClue?.direction === clue.direction &&
  props.game.activeClue.number === clue.number

const isCrossing = (clue: PublicClue): boolean =>
  props.game.crossingClue?.direction === clue.direction &&
  props.game.crossingClue.number === clue.number

const isFilled = (clue: PublicClue): boolean =>
  slotCells(clue).every((cell) => props.game.letterAt(cell) !== null)

// Garde la définition active visible quand la liste défile d'elle-même (grand écran),
// sans faire défiler la page entière sur mobile.
watch(
  () => props.game.activeClue,
  async () => {
    await nextTick()
    const list = listEl.value
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !item || list.scrollHeight <= list.clientHeight) return
    const top = item.offsetTop - list.offsetTop
    if (top < list.scrollTop || top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - list.clientHeight / 3
    }
  },
)
</script>

<template>
  <section :aria-labelledby="`clues-${direction}`" class="min-w-0">
    <h2
      :id="`clues-${direction}`"
      class="text-muted mb-2 text-xs font-semibold tracking-wider uppercase"
    >
      {{ classic ? classicHeading : directionLabel(direction) }}
    </h2>
    <ol
      v-if="classic"
      ref="listEl"
      class="relative space-y-1 lg:max-h-[60dvh] lg:overflow-y-auto lg:pr-1"
    >
      <li v-for="line in lines" :key="line.index" class="flex items-start gap-2">
        <span
          aria-hidden="true"
          class="text-muted w-8 shrink-0 pt-2 text-right text-sm font-extrabold tabular-nums"
          >{{ line.label }}</span
        >
        <!-- Plusieurs mots sur la ligne : définitions séparées par un tiret, comme dans un journal. -->
        <span class="flex min-w-0 flex-1 flex-wrap items-center">
          <template v-for="(clue, index) in line.clues" :key="clue.number">
            <button
              type="button"
              class="rounded-lg px-2 py-2 text-left text-sm leading-snug transition-colors"
              :class="[
                isActive(clue)
                  ? 'bg-accent text-accent-fg'
                  : isCrossing(clue)
                    ? 'bg-word text-fg'
                    : 'hover:bg-surface-2 text-fg',
                isFilled(clue) && !isActive(clue) ? 'opacity-60' : '',
              ]"
              :aria-current="isActive(clue) ? 'true' : undefined"
              @click="emit('select', clue)"
            >
              <span v-if="index > 0" aria-hidden="true" class="mr-1 opacity-60">—</span
              ><span class="sr-only">{{ clueSpoken(clue, true) }} : </span>{{ clue.text }}
              <span class="sr-only">, {{ clue.length }} lettres</span>
            </button>
          </template>
        </span>
      </li>
    </ol>
    <ol v-else ref="listEl" class="relative space-y-1 lg:max-h-[60dvh] lg:overflow-y-auto lg:pr-1">
      <li v-for="clue in clues" :key="clue.number">
        <button
          type="button"
          class="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm leading-snug transition-colors"
          :class="[
            isActive(clue)
              ? 'bg-accent text-accent-fg'
              : isCrossing(clue)
                ? 'bg-word text-fg'
                : 'hover:bg-surface-2 text-fg',
            isFilled(clue) && !isActive(clue) ? 'opacity-60' : '',
          ]"
          :aria-current="isActive(clue) ? 'true' : undefined"
          @click="emit('select', clue)"
        >
          <span class="w-6 shrink-0 text-right font-bold tabular-nums">{{ clue.number }}</span>
          <span class="min-w-0 flex-1">
            {{ clue.text }}
            <span class="sr-only">, {{ clue.length }} lettres</span>
            <span aria-hidden="true" class="ml-1 text-xs opacity-70">({{ clue.length }})</span>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>
