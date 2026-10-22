<script setup lang="ts">
/** Code d'invitation à transmettre à un ami, avec copie dans le presse-papiers. */
const props = defineProps<{ code: string }>()

const copied = ref<'idle' | 'done' | 'failed'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = 'done'
  } catch {
    // Presse-papiers refusé (contexte non sécurisé, permission) : le code reste lisible.
    copied.value = 'failed'
  }
  clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copied.value = 'idle'
  }, 3000)
}

onBeforeUnmount(() => {
  clearTimeout(resetTimer)
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <p
      class="bg-surface-2 rounded-xl px-4 py-2 font-mono text-3xl font-extrabold tracking-[0.3em] select-all"
      :aria-label="`Code d'invitation : ${code.split('').join(' ')}`"
    >
      {{ code }}
    </p>
    <button
      type="button"
      class="border-line hover:bg-surface-2 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
      @click="copy"
    >
      Copier le code
    </button>
    <span role="status" class="text-sm">
      <span v-if="copied === 'done'" class="text-success">Code copié.</span>
      <span v-else-if="copied === 'failed'" class="text-danger"
        >Copie impossible : recopiez le code.</span
      >
    </span>
  </div>
</template>
