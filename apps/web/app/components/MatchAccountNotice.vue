<script setup lang="ts">
/** Le duel exige un compte confirmé : invités et comptes non confirmés sont refusés par le serveur. */
</script>

<template>
  <section
    role="alert"
    aria-labelledby="account-required-title"
    class="bg-surface border-line rounded-2xl border p-5"
  >
    <h2 id="account-required-title" class="text-lg font-bold">Un compte est nécessaire</h2>
    <p class="text-muted mt-1 text-sm leading-relaxed">
      Les duels en ligne sont réservés aux comptes confirmés. Connectez-vous, créez un compte, ou
      confirmez votre adresse e-mail grâce au lien reçu, puis revenez ici.
    </p>
    <div class="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
      <NuxtLink
        to="/login"
        class="border-line hover:bg-surface-2 inline-flex min-h-11 items-center rounded-full border px-5"
        >Se connecter</NuxtLink
      >
      <NuxtLink
        to="/register"
        class="bg-fg text-bg inline-flex min-h-11 items-center rounded-full px-5"
        >Créer un compte</NuxtLink
      >
    </div>
  </section>
</template>
