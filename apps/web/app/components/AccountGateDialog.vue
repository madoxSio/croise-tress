<script setup lang="ts">
/**
 * Fenêtre modale (dialog natif : focus piégé, Échap pour fermer) sur fond flouté, qui
 * invite l'invité à créer un compte en quelques secondes. Ouverte par `useAccountGate()`.
 */
const { request, close } = useAccountGate()
const route = useRoute()

const dialog = ref<HTMLDialogElement | null>(null)
const firstAction = ref<{ $el: HTMLElement } | null>(null)
const titleId = useId()
const bodyId = useId()

const perks = [
  'Duels contre tes amis et classement',
  'Historique et statistiques de tes parties',
  'Favoris et succès',
  'Un parcours qui s’adapte à ton niveau',
] as const

watch(request, async (current) => {
  const element = dialog.value
  if (!element) return
  if (current && !element.open) {
    element.showModal()
    await nextTick()
    firstAction.value?.$el.focus()
  } else if (!current && element.open) {
    element.close()
  }
})

// Une navigation (vers l'inscription, par exemple) referme la fenêtre.
watch(() => route.fullPath, close)

function onCancel(event: Event): void {
  event.preventDefault()
  close()
}
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="bodyId"
    class="cv-gate bg-surface text-fg m-auto w-[min(28rem,calc(100vw-2rem))] overflow-visible rounded-3xl p-0 shadow-2xl"
    @cancel="onCancel"
    @click.self="close"
  >
    <div class="relative px-6 pt-16 pb-6 text-center sm:px-8">
      <MeyronMascot class="absolute -top-14 left-1/2 w-28 -translate-x-1/2" />
      <h2 :id="titleId" class="text-2xl font-extrabold">{{ request?.title }}</h2>
      <p :id="bodyId" class="text-muted mt-2 leading-relaxed">
        {{ request?.reason }} Crée ton compte en quelques secondes : un pseudo, un e-mail, un mot de
        passe.
      </p>
      <ul class="mt-5 flex flex-col gap-2 text-left text-sm">
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
      <div class="mt-6 flex flex-col gap-2">
        <NuxtLink
          ref="firstAction"
          to="/register"
          class="bg-accent text-accent-fg shadow-cta inline-flex min-h-12 items-center justify-center rounded-2xl px-6 font-bold"
          >Créer mon compte</NuxtLink
        >
        <NuxtLink
          to="/login"
          class="border-line hover:bg-surface-2 inline-flex min-h-12 items-center justify-center rounded-2xl border px-6 font-semibold"
          >J’ai déjà un compte</NuxtLink
        >
        <button
          type="button"
          class="text-muted hover:text-fg min-h-11 text-sm font-semibold"
          @click="close"
        >
          Plus tard, je continue à jouer
        </button>
      </div>
    </div>
  </dialog>
</template>
