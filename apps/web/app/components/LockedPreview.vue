<script setup lang="ts">
/**
 * Aperçu flouté d'une fonction réservée aux comptes, surmonté de l'invitation (slot par
 * défaut). L'aperçu est décoratif : masqué aux technologies d'assistance et inerte.
 */
</script>

<template>
  <div class="grid">
    <div
      aria-hidden="true"
      inert
      class="pointer-events-none [grid-area:1/1] opacity-70 blur-[6px] select-none"
    >
      <slot name="preview" />
    </div>
    <div class="z-10 grid place-items-center p-1 [grid-area:1/1] sm:p-6">
      <div class="w-full max-w-2xl">
        <slot />
      </div>
    </div>
  </div>
</template>
