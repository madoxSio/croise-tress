<script setup lang="ts">
import type { PuzzleSummary } from '@crossverse/contracts'
import { difficultyLabel } from '~/utils/labels'

/**
 * Carte de grille. Le lien du titre couvre toute la carte (pseudo-élément) ; le bouton
 * favori, facultatif, reste un contrôle distinct au-dessus (pas de bouton dans un lien).
 */
defineProps<{ puzzle: PuzzleSummary; favorite?: boolean }>()
const emit = defineEmits<{ 'toggle-favorite': [] }>()
</script>

<template>
  <article
    class="bg-surface border-line hover:border-accent group has-[a:focus-visible]:outline-accent relative flex h-full flex-col gap-3 rounded-2xl border p-4 transition-colors has-[a:focus-visible]:outline-3"
  >
    <div class="flex items-center gap-2 text-xs font-semibold">
      <span class="bg-accent-soft rounded-full px-2 py-0.5">{{
        difficultyLabel(puzzle.difficulty)
      }}</span>
      <span class="text-muted">{{ puzzle.theme }}</span>
    </div>
    <h3
      class="text-base leading-tight font-bold group-hover:underline"
      :class="favorite === undefined ? '' : 'pr-10'"
    >
      <NuxtLink
        :to="`/play/${puzzle.id}`"
        class="after:absolute after:inset-0 focus-visible:outline-none"
        >{{ puzzle.title }}</NuxtLink
      >
    </h3>
    <p class="text-muted mt-auto text-sm">
      {{ puzzle.width }} × {{ puzzle.height }} · environ {{ puzzle.estimatedMinutes }} min
    </p>
    <button
      v-if="favorite !== undefined"
      type="button"
      class="text-accent hover:bg-surface-2 absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full"
      :aria-pressed="favorite"
      :aria-label="`Favori : ${puzzle.title}`"
      @click="emit('toggle-favorite')"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        :fill="favorite ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
        class="size-5"
      >
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
      </svg>
    </button>
  </article>
</template>
