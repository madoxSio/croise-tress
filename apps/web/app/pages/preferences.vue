<script setup lang="ts">
import { TEXT_SCALES, THEMES } from '~/utils/preferences'

useHead({ title: 'Réglages — Crossverse' })

const { preferences, update } = usePreferences()
const { user } = useSession()
const isGuest = computed(() => user.value === null || user.value.isGuest)

function onMotionChange(event: Event): void {
  if (event.target instanceof HTMLInputElement) update({ reducedMotion: event.target.checked })
}

const systemReducedMotion = ref(false)
onMounted(() => {
  systemReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-8">
    <h1 class="text-3xl font-extrabold tracking-tight">Réglages</h1>

    <section
      v-if="isGuest"
      aria-labelledby="account-title"
      class="bg-surface border-line rounded-2xl border p-4"
    >
      <h2 id="account-title" class="text-lg font-bold">Compte</h2>
      <p class="text-muted mt-1 text-sm">
        Vous jouez en invité. Créez un compte pour retrouver vos parties sur tous vos appareils.
      </p>
      <div class="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <NuxtLink
          to="/register"
          class="bg-fg text-bg inline-flex min-h-11 items-center rounded-full px-4"
          >Créer un compte</NuxtLink
        >
        <NuxtLink
          to="/login"
          class="border-line inline-flex min-h-11 items-center rounded-full border px-4"
          >Se connecter</NuxtLink
        >
      </div>
    </section>

    <fieldset>
      <legend class="mb-3 text-lg font-bold">Thème</legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <label
          v-for="theme in THEMES"
          :key="theme.id"
          class="bg-surface border-line has-[:checked]:border-accent has-[:checked]:ring-accent has-[:focus-visible]:outline-accent flex cursor-pointer gap-3 rounded-2xl border p-4 has-[:checked]:ring-2 has-[:focus-visible]:outline-3"
        >
          <input
            type="radio"
            name="theme"
            class="accent-accent mt-1 size-4"
            :value="theme.id"
            :checked="preferences.theme === theme.id"
            @change="update({ theme: theme.id })"
          />
          <span>
            <span class="block font-semibold">{{ theme.label }}</span>
            <span class="text-muted block text-sm">{{ theme.description }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-3 text-lg font-bold">Taille du texte</legend>
      <div class="flex flex-wrap gap-2">
        <label
          v-for="scale in TEXT_SCALES"
          :key="scale.id"
          class="border-line has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:ring-accent inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-medium has-[:focus-visible]:ring-2"
        >
          <input
            type="radio"
            name="text-scale"
            class="sr-only"
            :value="scale.id"
            :checked="preferences.textScale === scale.id"
            @change="update({ textScale: scale.id })"
          />
          {{ scale.label }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-3 text-lg font-bold">Animations</legend>
      <label
        class="bg-surface border-line flex cursor-pointer items-start gap-3 rounded-2xl border p-4"
      >
        <input
          type="checkbox"
          class="accent-accent mt-1 size-4"
          :checked="preferences.reducedMotion"
          @change="onMotionChange"
        />
        <span>
          <span class="block font-semibold">Réduire les animations</span>
          <span class="text-muted block text-sm">
            Supprime les transitions et effets de mouvement.
            <template v-if="systemReducedMotion">
              Votre appareil le demande déjà : les animations sont réduites dans tous les cas.
            </template>
          </span>
        </span>
      </label>
    </fieldset>

    <p class="text-muted text-sm">Ces réglages sont enregistrés sur cet appareil uniquement.</p>
  </div>
</template>
