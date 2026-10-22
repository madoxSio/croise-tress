<script setup lang="ts">
/**
 * Champ de formulaire étiqueté : aide et erreur reliées par `aria-describedby`, erreur
 * signalée par `aria-invalid`. Un mot de passe peut être affiché en clair (saisie sur
 * mobile) ; le collage et les gestionnaires de mots de passe restent permis (WCAG 3.3.8).
 */
const props = defineProps<{
  label: string
  type?: 'text' | 'email' | 'password'
  autocomplete: string
  hint?: string
  error?: string | null
  required?: boolean
  minlength?: number
  maxlength?: number
}>()

const model = defineModel<string>({ required: true })

const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`
const revealed = ref(false)

const isPassword = computed(() => props.type === 'password')
const inputType = computed(() => (isPassword.value && revealed.value ? 'text' : props.type))
const describedBy = computed(
  () =>
    [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(' ') ||
    undefined,
)

const input = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" class="text-sm font-semibold">{{ label }}</label>
    <div class="relative">
      <input
        :id="id"
        ref="input"
        v-model="model"
        :type="inputType ?? 'text'"
        :autocomplete="autocomplete"
        :required="required"
        :minlength="minlength"
        :maxlength="maxlength"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        autocapitalize="off"
        spellcheck="false"
        class="bg-surface border-line aria-[invalid=true]:border-danger min-h-11 w-full rounded-xl border px-4"
        :class="isPassword ? 'pr-24' : ''"
      />
      <button
        v-if="isPassword"
        type="button"
        class="text-accent absolute inset-y-0 right-0 min-w-11 rounded-r-xl px-3 text-sm font-semibold"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        {{ revealed ? 'Masquer' : 'Afficher' }}
        <span class="sr-only">le mot de passe</span>
      </button>
    </div>
    <p v-if="hint" :id="hintId" class="text-muted text-sm">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="text-danger text-sm font-medium">{{ error }}</p>
  </div>
</template>
