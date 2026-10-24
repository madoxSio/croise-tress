<script setup lang="ts">
/** Avancement d'un parcours : étapes réussies sur le total. */
const props = defineProps<{ done: number; total: number }>()
const percent = computed(() =>
  props.total === 0 ? 0 : Math.round((props.done / props.total) * 100),
)
</script>

<template>
  <div class="flex items-center gap-3 text-sm">
    <div
      class="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full"
      role="progressbar"
      :aria-valuenow="done"
      aria-valuemin="0"
      :aria-valuemax="total"
      :aria-label="`${done} étape(s) réussie(s) sur ${total}`"
    >
      <div class="bg-accent h-full rounded-full" :style="{ width: `${percent}%` }" />
    </div>
    <span class="text-muted tabular-nums">{{ done }}/{{ total }}</span>
  </div>
</template>
