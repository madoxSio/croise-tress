<script setup lang="ts">
/**
 * Dialogue de confirmation modal fondé sur `<dialog>` natif : focus piégé, Échap pour
 * annuler, fond inerte. Le bouton d'annulation reçoit le focus (action destructive).
 */
const props = defineProps<{
  open: boolean
  title: string
  confirmLabel: string
  cancelLabel?: string
}>()

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const titleId = useId()
const bodyId = useId()

watch(
  () => props.open,
  async (open) => {
    const element = dialog.value
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      await nextTick()
      cancelButton.value?.focus()
    } else if (!open && element.open) {
      element.close()
    }
  },
)

function onCancel(event: Event): void {
  event.preventDefault()
  emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="bodyId"
    class="bg-surface text-fg m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl"
    @cancel="onCancel"
  >
    <div class="p-6">
      <h2 :id="titleId" class="text-lg font-bold">{{ title }}</h2>
      <div :id="bodyId" class="text-muted mt-2 text-sm leading-relaxed">
        <slot />
      </div>
      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          ref="cancelButton"
          type="button"
          class="border-line hover:bg-surface-2 min-h-11 rounded-full border px-5 text-sm font-semibold"
          @click="emit('cancel')"
        >
          {{ cancelLabel ?? 'Annuler' }}
        </button>
        <button
          type="button"
          class="bg-danger text-danger-fg min-h-11 rounded-full px-5 text-sm font-semibold"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>
