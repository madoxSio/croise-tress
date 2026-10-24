<template>
  <!-- Barre de progression des changements de page (code de la route en cours de chargement). -->
  <NuxtLoadingIndicator color="var(--cv-accent)" :height="3" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
