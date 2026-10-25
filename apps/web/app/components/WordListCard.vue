<script setup lang="ts">
import type { WordListSummary } from '@crossverse/contracts'
import type { ThemeLook } from '~/composables/useCatalog'
import { levelOf } from '~/services/catalog'

/** Carte de mots mêlés : même habillage que les cartes de grilles, le lien couvre la carte. */
withDefaults(defineProps<{ wordList: WordListSummary; look?: ThemeLook | undefined }>(), {
  look: undefined,
})
</script>

<template>
  <article
    class="bg-surface border-line hover:border-accent group has-[a:focus-visible]:outline-accent shadow-card relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-all hover:-translate-y-0.5 has-[a:focus-visible]:outline-3"
  >
    <div
      v-if="look"
      aria-hidden="true"
      class="cv-skin -mx-4 -mt-4 mb-1 flex h-16 items-center px-4"
      :data-skin="look.skin"
      :style="{ '--skin-a': look.accent, '--skin-b': look.accentAlt }"
    >
      <span class="grid size-10 place-items-center rounded-xl bg-white/90 text-xl shadow">{{
        look.icon
      }}</span>
    </div>
    <div class="flex items-center gap-2 text-xs font-semibold">
      <span class="bg-accent-soft rounded-full px-2 py-0.5">{{
        levelOf(wordList.difficulty).label
      }}</span>
      <span class="border-line rounded-full border px-2 py-0.5">Mots mêlés</span>
      <span class="text-muted">{{ wordList.theme }}</span>
    </div>
    <h3 class="text-base leading-tight font-bold group-hover:underline">
      <NuxtLink
        :to="`/mots-meles/${wordList.id}`"
        class="after:absolute after:inset-0 focus-visible:outline-none"
        >{{ wordList.title }}</NuxtLink
      >
    </h3>
    <p class="text-muted mt-auto text-sm">
      {{ wordList.size }} × {{ wordList.size }} · {{ wordList.wordCount }} mots · environ
      {{ wordList.estimatedMinutes }} min
    </p>
  </article>
</template>
