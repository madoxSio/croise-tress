<script setup lang="ts">
import type { CatalogTheme } from '~/services/catalog'
import { LEVELS, levelCount } from '~/services/catalog'

/** Carte d'un thème du catalogue : habillage, sous-thèmes, grilles par niveau. */
const props = defineProps<{ theme: CatalogTheme }>()
const emit = defineEmits<{ 'quick-play': [slug: string] }>()

const levels = computed(() =>
  LEVELS.map((level) => ({ ...level, count: levelCount(props.theme.counts, level.id) })),
)
const titleId = useId()
</script>

<template>
  <article
    :aria-labelledby="titleId"
    class="group border-line bg-surface shadow-card hover:border-accent flex h-full flex-col overflow-hidden rounded-3xl border transition-all hover:-translate-y-1"
  >
    <div
      class="cv-skin flex h-28 items-end justify-between p-4 sm:h-32"
      :data-skin="theme.skin"
      :style="{ '--skin-a': theme.accent, '--skin-b': theme.accentAlt }"
    >
      <span
        aria-hidden="true"
        class="grid size-14 place-items-center rounded-2xl bg-white/90 text-3xl shadow-lg transition-transform group-hover:scale-110 group-hover:-rotate-6"
        >{{ theme.icon }}</span
      >
      <span class="rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold backdrop-blur"
        >{{ theme.puzzleCount }} grille{{ theme.puzzleCount > 1 ? 's' : '' }}</span
      >
    </div>
    <div class="flex flex-1 flex-col gap-3 p-5">
      <h3 :id="titleId" class="text-xl font-bold">
        <NuxtLink
          :to="{ path: '/puzzles', query: { theme: theme.slug } }"
          class="hover:underline"
          >{{ theme.name }}</NuxtLink
        >
      </h3>
      <p v-if="theme.description" class="text-muted text-sm leading-relaxed">
        {{ theme.description }}
      </p>
      <ul v-if="theme.children.length > 0" class="flex flex-wrap gap-1.5" aria-label="Sous-thèmes">
        <li v-for="child in theme.children.slice(0, 4)" :key="child.slug">
          <NuxtLink
            :to="{ path: '/puzzles', query: { theme: child.slug } }"
            class="bg-surface-2 hover:bg-accent-soft inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold"
            ><span aria-hidden="true">{{ child.icon }}</span
            >{{ child.name }}</NuxtLink
          >
        </li>
        <li v-if="theme.children.length > 4" class="text-muted self-center px-1 text-xs">
          +{{ theme.children.length - 4 }}
        </li>
      </ul>
      <dl class="text-muted mt-auto flex gap-3 text-xs">
        <div v-for="level in levels" :key="level.id" class="flex gap-1">
          <dt>{{ level.label }}</dt>
          <dd class="text-fg font-bold tabular-nums">{{ level.count }}</dd>
        </div>
      </dl>
      <button
        type="button"
        class="bg-fg text-bg inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold"
        @click="emit('quick-play', theme.slug)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        Jouer<span class="sr-only"> une grille {{ theme.name }}</span>
      </button>
    </div>
  </article>
</template>
