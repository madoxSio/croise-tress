<script setup lang="ts">
/**
 * Choix du mode de jeu proposé par les cartes de grilles et la partie rapide. Retenu dans les
 * préférences de l'appareil ; l'explication complète est sur la page « Comment jouer ».
 */
import { PLAY_MODES } from '~/utils/playModes'

const { preferences, update } = usePreferences()
const uid = useId()
const current = computed(() => PLAY_MODES.find((mode) => mode.id === preferences.value.playMode))
</script>

<template>
  <fieldset class="flex flex-col gap-2">
    <legend class="mb-2 text-sm font-bold">Mode de jeu</legend>
    <div class="bg-surface-2 inline-flex w-fit flex-wrap gap-1 rounded-2xl p-1">
      <label
        v-for="mode in PLAY_MODES"
        :key="mode.id"
        class="has-[:checked]:bg-accent has-[:checked]:text-accent-fg text-muted has-[:focus-visible]:ring-accent inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold has-[:focus-visible]:ring-2"
      >
        <input
          type="radio"
          :name="`${uid}-mode`"
          class="sr-only"
          :value="mode.id"
          :checked="preferences.playMode === mode.id"
          :aria-describedby="`${uid}-desc`"
          @change="update({ playMode: mode.id })"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          <path
            v-if="mode.id === 'prefilled'"
            d="M4.5 6h15"
            stroke-width="4"
            stroke-linecap="round"
            stroke-opacity="0.6"
          />
        </svg>
        {{ mode.label }}
      </label>
    </div>
    <p :id="`${uid}-desc`" class="text-muted text-sm">
      {{ current?.description }}
      <NuxtLink to="/comment-jouer#modes" class="text-accent font-semibold underline"
        >Les deux modes</NuxtLink
      >
    </p>
  </fieldset>
</template>
