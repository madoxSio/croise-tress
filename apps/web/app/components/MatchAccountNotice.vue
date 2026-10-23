<script setup lang="ts">
/** Le duel exige un compte confirmé : invités et comptes non confirmés sont refusés par le serveur. */
</script>

<template>
  <AccountRequired
    alert
    reason="Les duels en ligne sont réservés aux comptes confirmés. Connectez-vous, créez un compte, ou confirmez votre adresse e-mail grâce au lien reçu, puis revenez ici."
  />
</template>
