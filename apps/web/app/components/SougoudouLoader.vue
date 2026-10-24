<script setup lang="ts">
/**
 * Indicateur de chargement aux couleurs de Crossverse : Sougoudou attend pendant que des cases
 * de grille se remplissent une à une. Le texte (annoncé par `role="status"`) porte
 * l'information ; le dessin est décoratif. Animations réduites : les cases restent pleines.
 *
 * `inline` : version compacte (une ligne) pour un bouton « Charger plus » ou une liste.
 */
withDefaults(defineProps<{ label?: string; inline?: boolean }>(), {
  label: 'Chargement…',
  inline: false,
})

const TILES = ['M', 'O', 'T', 'S'] as const
</script>

<template>
  <div
    role="status"
    class="text-muted flex items-center justify-center"
    :class="inline ? 'gap-3 py-2' : 'flex-col gap-3 py-10'"
  >
    <SougoudouMascot v-if="!inline" mood="idle" class="size-24" />
    <div aria-hidden="true" class="flex gap-1.5">
      <span
        v-for="(letter, index) in TILES"
        :key="letter"
        class="cv-loader-tile bg-surface border-line text-accent grid place-items-center rounded-md border-2 font-extrabold"
        :class="inline ? 'size-6 text-xs' : 'size-8 text-sm'"
        :style="{ animationDelay: `${index * 0.18}s` }"
        >{{ letter }}</span
      >
    </div>
    <p class="text-sm font-semibold">{{ label }}</p>
  </div>
</template>

<style scoped>
.cv-loader-tile {
  animation: cv-tile 1.6s ease-in-out infinite both;
}

/* L'état final est l'état plein : avec les animations réduites, les lettres restent visibles. */
@keyframes cv-tile {
  0% {
    color: transparent;
    transform: translateY(0);
  }
  20% {
    color: var(--cv-accent);
    transform: translateY(-4px);
    border-color: var(--cv-accent);
  }
  35%,
  100% {
    color: var(--cv-accent);
    transform: translateY(0);
  }
}
</style>
