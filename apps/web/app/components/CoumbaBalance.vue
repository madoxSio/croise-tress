<script setup lang="ts">
import type { WalletDto } from '@crossverse/contracts'
import { api } from '~/services/api'

/** Solde de Coumba points du joueur ; rien n'est affiché pour un invité. */
const wallet = ref<WalletDto | null>(null)

onMounted(async () => {
  try {
    await api.ensureSession()
    wallet.value = await api.getWallet()
  } catch {
    // Affichage de confort : une erreur ne doit pas gêner la page qui l'héberge.
  }
})
</script>

<template>
  <p
    v-if="wallet?.eligible"
    class="bg-surface border-line inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-sm font-semibold"
  >
    <span aria-hidden="true">🪙</span>
    <span>
      <span class="tabular-nums">{{ wallet.balance }}</span> Coumba points
    </span>
  </p>
</template>
