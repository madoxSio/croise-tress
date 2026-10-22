<script setup lang="ts">
import type { Direction, PublicClue } from '@crossverse/crossword-core'
import { slotCells } from '@crossverse/crossword-core'
import type { ReactiveCrosswordGame } from '~/composables/useCrosswordGame'
import { directionLabel } from '~/utils/labels'

const props = defineProps<{
  game: ReactiveCrosswordGame
  direction: Direction
}>()

const emit = defineEmits<{ select: [clue: PublicClue] }>()

const listEl = ref<HTMLElement | null>(null)

const clues = computed(() => props.game.clues.filter((clue) => clue.direction === props.direction))

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
      {{ directionLabel(direction) }}
    </h2>
    <ol ref="listEl" class="relative space-y-1 lg:max-h-[60dvh] lg:overflow-y-auto lg:pr-1">
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
