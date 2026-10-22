<script setup lang="ts">
import { emailTokenSchema } from '@crossverse/contracts'
import { api } from '~/services/api'

useHead({ title: 'Confirmer l’adresse e-mail — Crossverse' })

const route = useRoute()
const router = useRouter()
const { apply: applySession } = useSession()
const { pending, error, run } = useFormAction()

/*
 * Le jeton est lu une fois puis retiré de la barre d'adresse (historique, partage d'écran).
 * La confirmation exige un clic : les analyseurs de liens des messageries ne la déclenchent pas.
 */
const rawToken = route.query['token']
const token =
  typeof rawToken === 'string' && emailTokenSchema.safeParse(rawToken).success ? rawToken : null
onMounted(() => {
  if (rawToken !== undefined) void router.replace({ query: {} })
})

const done = ref(false)
const doneHeading = ref<HTMLElement | null>(null)

async function confirm(): Promise<void> {
  if (token === null) return
  const ok = await run(async () => {
    applySession(await api.verifyEmail(token))
  })
  if (!ok) return
  done.value = true
  await nextTick()
  doneHeading.value?.focus()
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Confirmer l'adresse e-mail</h1>

    <section
      v-if="done"
      aria-labelledby="done-title"
      class="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-5 sm:p-6"
    >
      <h2 id="done-title" ref="doneHeading" tabindex="-1" class="text-xl font-bold">
        Adresse confirmée
      </h2>
      <p>Votre adresse e-mail est confirmée et vous êtes connecté.</p>
      <NuxtLink
        to="/account"
        class="bg-fg text-bg inline-flex min-h-11 items-center self-start rounded-full px-5 font-semibold"
        >Voir mon compte</NuxtLink
      >
    </section>

    <div v-else-if="token === null" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4">
      Ce lien est invalide ou incomplet. Ouvrez à nouveau le lien reçu par e-mail, ou
      <NuxtLink to="/register" class="font-semibold underline">recommencez l'inscription</NuxtLink>.
    </div>

    <div v-else class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5 sm:p-6">
      <p>Confirmez votre adresse pour activer votre compte ou valider votre nouvelle adresse.</p>
      <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-xl p-3 text-sm">
        {{ error }}
      </div>
      <button
        type="button"
        class="bg-fg text-bg min-h-11 rounded-full px-5 font-semibold disabled:opacity-60"
        :disabled="pending"
        @click="confirm"
      >
        {{ pending ? 'Confirmation…' : 'Confirmer mon adresse' }}
      </button>
    </div>
  </div>
</template>
