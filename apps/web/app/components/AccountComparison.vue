<script setup lang="ts">
/**
 * Comparatif « sans compte / avec compte ». Reflète les règles du serveur : l'invité joue
 * en solo, le suivi et les duels sont réservés aux comptes (requireAccount côté API).
 */
const guest = [
  'Toutes les grilles solo et le défi du jour',
  'Indices, vérifications et score',
  'Reprise de la partie en cours sur cet appareil',
  'Réglages d’affichage et d’accessibilité',
] as const

const account = [
  'Tout ce qui est possible sans compte',
  'Historique de toutes vos parties',
  'Statistiques, succès et grilles favorites',
  'Duels en ligne, cote Elo et classement',
  'Progression retrouvée sur tous vos appareils',
  'Parties jouées en invité rattachées à l’inscription',
] as const
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <section
      v-reveal
      aria-labelledby="guest-plan"
      class="border-line bg-surface shadow-card flex flex-col gap-5 rounded-3xl border p-6 sm:p-8"
    >
      <div>
        <p class="text-muted text-sm font-semibold">Pour découvrir</p>
        <h3 id="guest-plan" class="mt-1 text-2xl font-extrabold">Sans compte</h3>
        <p class="text-muted mt-2">Ouvrez l’appli et jouez, sans e-mail ni mot de passe.</p>
      </div>
      <ul class="flex flex-col gap-3">
        <li v-for="item in guest" :key="item" class="flex items-start gap-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            class="text-success mt-0.5 size-5 shrink-0"
            fill="currentColor"
          >
            <path d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4-8.1 8.1Z" />
          </svg>
          {{ item }}
        </li>
      </ul>
      <p class="text-muted border-line mt-auto border-t pt-4 text-sm">
        Pas d’historique, de statistiques ni de duels : ils demandent un compte.
      </p>
    </section>

    <section
      v-reveal
      aria-labelledby="account-plan"
      class="border-accent bg-surface shadow-cta relative flex flex-col gap-5 overflow-hidden rounded-3xl border-2 p-6 sm:p-8"
      style="--cv-delay: 100ms"
    >
      <div
        aria-hidden="true"
        class="bg-accent/15 absolute -top-16 -right-16 size-48 rounded-full blur-3xl"
      />
      <div class="relative">
        <p class="text-accent text-sm font-semibold">Recommandé</p>
        <h3 id="account-plan" class="mt-1 text-2xl font-extrabold">Avec un compte</h3>
        <p class="text-muted mt-2">Un e-mail, un pseudo, et tout votre parcours est conservé.</p>
      </div>
      <ul class="relative flex flex-col gap-3">
        <li v-for="item in account" :key="item" class="flex items-start gap-3">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            class="text-accent mt-0.5 size-5 shrink-0"
            fill="currentColor"
          >
            <path d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4-8.1 8.1Z" />
          </svg>
          {{ item }}
        </li>
      </ul>
    </section>
  </div>
</template>
