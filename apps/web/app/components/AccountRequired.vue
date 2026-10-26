<script setup lang="ts">
/**
 * Encart affiché à la place d'une fonction réservée aux comptes (historique, suivi, duels).
 * Le serveur refuse de toute façon ces routes aux invités : cet encart n'est qu'une explication.
 */
withDefaults(defineProps<{ title?: string; reason: string; alert?: boolean }>(), {
  title: 'Un compte est nécessaire',
  alert: false,
})

const titleId = useId()
const perks = [
  'Historique de toutes vos parties',
  'Statistiques, succès et grilles favorites',
  'Duels en ligne et classement',
  'Votre progression sur tous vos appareils',
] as const
</script>

<template>
  <section
    :role="alert ? 'alert' : undefined"
    :aria-labelledby="titleId"
    class="border-line bg-surface shadow-card relative overflow-hidden rounded-3xl border p-6 sm:p-8"
  >
    <div
      aria-hidden="true"
      class="bg-accent/15 pointer-events-none absolute -top-20 -right-16 size-56 rounded-full blur-3xl"
    />
    <div class="relative flex flex-col gap-6 sm:flex-row sm:items-center">
      <MeyronMascot class="mx-auto w-28 shrink-0 sm:mx-0 sm:w-32" />
      <div class="min-w-0 flex-1">
        <h2 :id="titleId" class="text-2xl font-extrabold">{{ title }}</h2>
        <p class="text-muted mt-2 leading-relaxed">{{ reason }}</p>
        <ul class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <li v-for="perk in perks" :key="perk" class="flex items-start gap-2">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              class="text-accent mt-0.5 size-4 shrink-0"
              fill="currentColor"
            >
              <path d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4-8.1 8.1Z" />
            </svg>
            {{ perk }}
          </li>
        </ul>
        <div class="mt-6 flex flex-wrap gap-2 text-sm font-semibold">
          <NuxtLink
            to="/register"
            class="bg-accent text-accent-fg shadow-cta inline-flex min-h-11 items-center rounded-full px-5"
            >Créer un compte</NuxtLink
          >
          <NuxtLink
            to="/login"
            class="border-line hover:bg-surface-2 inline-flex min-h-11 items-center rounded-full border px-5"
            >Se connecter</NuxtLink
          >
          <NuxtLink
            to="/comment-jouer#compte"
            class="text-accent inline-flex min-h-11 items-center px-2 underline underline-offset-4"
            >Sans compte ou avec : ce qui change</NuxtLink
          >
        </div>
      </div>
    </div>
  </section>
</template>
