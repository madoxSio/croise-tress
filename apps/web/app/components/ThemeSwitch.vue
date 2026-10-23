<script setup lang="ts">
/**
 * Interrupteur clair / sombre (soleil / lune) de l'en-tête. Il bascule entre les thèmes
 * « minimal » et « sombre » ; les autres choix (automatique, contraste élevé) restent dans
 * les réglages. En thème automatique, l'état affiché suit l'appareil.
 */
const { preferences, update } = usePreferences()

const systemDark = ref(false)
let media: MediaQueryList | null = null
const onSystemChange = (event: MediaQueryListEvent): void => {
  systemDark.value = event.matches
}

onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  media.addEventListener('change', onSystemChange)
})
onBeforeUnmount(() => media?.removeEventListener('change', onSystemChange))

const isDark = computed(
  () =>
    preferences.value.theme === 'dark' || (preferences.value.theme === 'auto' && systemDark.value),
)

function toggle(): void {
  update({ theme: isDark.value ? 'minimal' : 'dark' })
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="isDark"
    aria-label="Thème sombre"
    class="group grid min-h-11 min-w-11 place-items-center rounded-xl"
    @click="toggle"
  >
    <span
      aria-hidden="true"
      class="bg-surface-2 border-line relative flex h-7 w-12 items-center rounded-full border transition-colors"
      :class="isDark ? 'bg-accent-soft' : ''"
    >
      <span
        class="bg-surface shadow-card absolute top-0.5 left-0.5 grid size-5.5 place-items-center rounded-full transition-transform duration-300"
        :class="isDark ? 'translate-x-5' : ''"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" class="text-accent size-3.5" fill="currentColor">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          class="size-3.5 text-[#f59e0b]"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        </svg>
      </span>
    </span>
  </button>
</template>
