<script setup lang="ts">
import { PASSWORD_MAX, PASSWORD_MIN, emailTokenSchema } from '@crossverse/contracts'
import { api } from '~/services/api'
import { PASSWORD_HINT, newPasswordError } from '~/utils/validation'

useHead({ title: 'Nouveau mot de passe — Crossverse' })

const route = useRoute()
const router = useRouter()
const { apply: applySession } = useSession()
const { pending, error, run } = useFormAction()

// Jeton lu une fois puis retiré de la barre d'adresse (cf. verify-email.vue).
const rawToken = route.query['token']
const token =
  typeof rawToken === 'string' && emailTokenSchema.safeParse(rawToken).success ? rawToken : null
onMounted(() => {
  if (rawToken !== undefined) void router.replace({ query: {} })
})

const password = ref('')
const fieldError = ref<string | null>(null)
const passwordField = ref<{ focus: () => void } | null>(null)
const done = ref(false)
const doneHeading = ref<HTMLElement | null>(null)

async function submit(): Promise<void> {
  if (token === null) return
  fieldError.value = newPasswordError(password.value)
  if (fieldError.value) return passwordField.value?.focus()
  const ok = await run(async () => {
    // Le serveur ferme toutes les sessions du compte : on repart d'une session invitée.
    applySession(await api.resetPassword({ token, password: password.value }))
  })
  if (!ok) return
  password.value = ''
  done.value = true
  await nextTick()
  doneHeading.value?.focus()
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Nouveau mot de passe</h1>

    <section
      v-if="done"
      aria-labelledby="done-title"
      class="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-5 sm:p-6"
    >
      <h2 id="done-title" ref="doneHeading" tabindex="-1" class="text-xl font-bold">
        Mot de passe modifié
      </h2>
      <p>
        Toutes les sessions de votre compte ont été fermées. Connectez-vous avec le nouveau mot de
        passe.
      </p>
      <NuxtLink
        to="/login"
        class="bg-accent text-accent-fg shadow-cta inline-flex min-h-11 items-center self-start rounded-full px-5 font-semibold"
        >Se connecter</NuxtLink
      >
    </section>

    <div v-else-if="token === null" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4">
      Ce lien est invalide ou incomplet.
      <NuxtLink to="/forgot-password" class="font-semibold underline"
        >Demander un nouveau lien</NuxtLink
      >.
    </div>

    <form
      v-else
      novalidate
      class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5 sm:p-6"
      @submit.prevent="submit"
    >
      <TextField
        ref="passwordField"
        v-model="password"
        label="Nouveau mot de passe"
        type="password"
        autocomplete="new-password"
        required
        :minlength="PASSWORD_MIN"
        :maxlength="PASSWORD_MAX"
        :hint="PASSWORD_HINT"
        :error="fieldError"
      />
      <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-xl p-3 text-sm">
        {{ error }}
        <NuxtLink to="/forgot-password" class="ml-1 font-semibold underline"
          >Demander un nouveau lien</NuxtLink
        >
      </div>
      <button
        type="submit"
        class="bg-accent text-accent-fg shadow-cta min-h-11 rounded-full px-5 font-semibold disabled:opacity-60"
        :disabled="pending"
      >
        {{ pending ? 'Enregistrement…' : 'Enregistrer le mot de passe' }}
      </button>
    </form>
  </div>
</template>
