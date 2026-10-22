<script setup lang="ts">
/**
 * Bouton ouvrant une courte liste d'actions (Vérifier, Indice). Fermeture par Échap,
 * clic extérieur ou après un choix ; le focus revient sur le bouton déclencheur.
 */
import type { MenuItem } from '~/utils/menu'

const props = defineProps<{
  label: string
  items: readonly MenuItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{ choose: [id: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menuId = useId()

async function toggle(): Promise<void> {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    root.value?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus()
  }
}

function close(restoreFocus: boolean): void {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function choose(item: MenuItem): void {
  if (item.disabled === true) return
  close(true)
  emit('choose', item.id)
}

function onKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const buttons = Array.from(
    root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [],
  )
  const index = buttons.findIndex((button) => button === document.activeElement)
  const delta = event.key === 'ArrowDown' ? 1 : -1
  buttons[(index + delta + buttons.length) % buttons.length]?.focus()
}

function onDocumentPointer(event: PointerEvent): void {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) {
    close(false)
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
})

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false
  },
)
</script>

<template>
  <div ref="root" class="relative" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="bg-surface border-line text-fg hover:bg-surface-2 inline-flex min-h-11 items-center gap-1 rounded-full border px-4 text-sm font-semibold disabled:opacity-50"
      :aria-expanded="open"
      :aria-controls="menuId"
      aria-haspopup="menu"
      :disabled="disabled"
      @click="toggle"
    >
      {{ label }}
      <svg aria-hidden="true" viewBox="0 0 20 20" class="size-4" fill="currentColor">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" stroke-width="1.6" fill="none" />
      </svg>
    </button>
    <div
      v-show="open"
      :id="menuId"
      role="menu"
      :aria-label="label"
      class="bg-surface border-line absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border p-1 shadow-xl"
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        role="menuitem"
        class="hover:bg-surface-2 focus-visible:bg-surface-2 flex w-full flex-col rounded-lg px-3 py-2 text-left disabled:opacity-50"
        :class="item.danger === true ? 'text-danger' : 'text-fg'"
        :disabled="item.disabled === true"
        @click="choose(item)"
      >
        <span class="text-sm font-semibold">{{ item.label }}</span>
        <span v-if="item.hint" class="text-muted text-xs">{{ item.hint }}</span>
      </button>
    </div>
  </div>
</template>
