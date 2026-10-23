<script setup lang="ts">
import type { DailyChallenge, ResumeResponse } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { difficultyLabel } from '~/utils/labels'
import { MASCOT_NAME, MASCOT_PHRASE } from '~/utils/mascot'

useHead({ title: 'Crossverse — Mots croisés en solo et en duel' })

const { isGuest } = useSession()
const daily = ref<DailyChallenge | null>(null)
const resume = ref<ResumeResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

const dailyDate = computed(() =>
  daily.value ? dateFormatter.format(new Date(`${daily.value.date}T00:00:00Z`)) : '',
)

/** Bouton principal : le défi du jour s'il existe, sinon le catalogue. */
const playNow = computed(() => (daily.value ? `/play/${daily.value.puzzle.id}` : '/puzzles'))

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    await api.ensureSession()
    const [dailyResult, resumeResult] = await Promise.all([api.getDaily(), api.getResume()])
    daily.value = dailyResult
    resume.value = resumeResult
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** Lettres flottantes autour de la mascotte (décor). */
const floatingTiles = [
  {
    letter: 'M',
    class: 'max-sm:hidden left-[6%] top-[12%]',
    rotate: '-12deg',
    delay: '0ms',
    duration: '6s',
  },
  {
    letter: 'O',
    class: 'max-sm:hidden right-[4%] top-[4%]',
    rotate: '10deg',
    delay: '400ms',
    duration: '5s',
  },
  { letter: 'T', class: 'left-[2%] bottom-[24%]', rotate: '8deg', delay: '900ms', duration: '7s' },
  {
    letter: 'S',
    class: 'right-[8%] bottom-[14%]',
    rotate: '-8deg',
    delay: '200ms',
    duration: '5.5s',
  },
] as const

const highlights = [
  'Sans compte pour commencer',
  'Mobile, tablette et ordinateur',
  'Duels en temps réel',
] as const

const steps = [
  {
    title: 'Choisissez une case',
    text: 'Touchez une case ou un mot : sa définition s’affiche. Touchez encore pour changer de sens.',
  },
  {
    title: 'Tapez vos réponses',
    text: 'Les mots se croisent : chaque lettre trouvée aide à deviner les mots voisins.',
  },
  {
    title: 'Coincé ? Demandez un coup de pouce',
    text: 'Vérifiez une case, révélez une lettre ou un mot. Le score en tient compte.',
  },
  {
    title: 'Terminez la grille',
    text: 'Le serveur valide la grille, calcule votre temps et votre score. Puis on recommence !',
  },
] as const

const modes = computed(() => [
  {
    to: '/puzzles',
    title: 'Solo',
    text: 'Des grilles classées par thème et difficulté, de « découverte » à « expert ».',
    badge: 'Sans compte',
    icon: 'M4 4h16v16H4zM4 9.33h16M4 14.66h16M9.33 4v16M14.66 4v16',
  },
  {
    to: playNow.value,
    title: 'Défi du jour',
    text: 'Une grille commune à tous, renouvelée chaque jour à minuit (UTC).',
    badge: 'Sans compte',
    icon: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  },
  {
    to: '/duel',
    title: 'Duel en ligne',
    text: 'Même grille, même chrono, un adversaire : le premier qui finit gagne des points Elo.',
    badge: 'Compte requis',
    icon: 'M13 2 4 14h7l-1 8 9-12h-7z',
  },
])
</script>

<template>
  <div class="flex flex-col gap-20 sm:gap-28">
    <!-- Héros -->
    <section
      class="grid items-center gap-4 pt-2 sm:gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6 lg:pt-8"
    >
      <div class="flex flex-col items-start gap-6">
        <p
          class="cv-rise border-line bg-surface/70 text-muted inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium backdrop-blur"
        >
          <span
            aria-hidden="true"
            class="bg-highlight size-2 rounded-full shadow-[0_0_0_4px] shadow-(color:--cv-glow-3)"
          />
          Mots croisés en solo et en duel
        </p>
        <h1
          class="cv-rise text-[2.6rem] leading-[1.02] font-extrabold sm:text-6xl lg:text-7xl"
          style="--cv-delay: 80ms"
        >
          Les mots croisés,
          <span class="cv-gradient-text block">version arène.</span>
        </h1>
        <p
          class="cv-rise text-muted max-w-xl text-lg leading-relaxed sm:text-xl"
          style="--cv-delay: 160ms"
        >
          Remplissez des grilles à votre rythme, relevez le défi du jour ou affrontez d’autres
          joueurs en temps réel. Sur téléphone, tablette ou ordinateur.
        </p>
        <div
          class="cv-rise flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
          style="--cv-delay: 240ms"
        >
          <NuxtLink
            :to="playNow"
            class="bg-accent text-accent-fg shadow-cta inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl px-7 text-lg font-bold transition-transform hover:-translate-y-0.5"
          >
            Jouer maintenant
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              class="size-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </NuxtLink>
          <NuxtLink
            to="/duel"
            class="border-line bg-surface/80 hover:bg-surface inline-flex min-h-13 items-center justify-center rounded-2xl border px-7 text-lg font-semibold backdrop-blur transition-transform hover:-translate-y-0.5"
          >
            Lancer un duel
          </NuxtLink>
        </div>
        <ul
          class="cv-rise text-muted flex flex-wrap gap-x-5 gap-y-2 text-sm"
          style="--cv-delay: 320ms"
        >
          <li v-for="item in highlights" :key="item" class="flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              class="text-success size-4"
              fill="currentColor"
            >
              <path d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4-8.1 8.1Z" />
            </svg>
            {{ item }}
          </li>
        </ul>
      </div>

      <!-- Sougoudou et sa phrase -->
      <figure
        class="cv-rise relative order-first mx-auto w-full max-w-md lg:order-none"
        style="--cv-delay: 200ms"
      >
        <div
          aria-hidden="true"
          class="from-accent/30 to-accent-2/20 absolute inset-[12%] rounded-full bg-gradient-to-br blur-3xl"
        />
        <span
          v-for="tile in floatingTiles"
          :key="tile.letter"
          aria-hidden="true"
          class="cv-float border-line bg-surface font-display shadow-card absolute grid size-10 place-items-center rounded-xl border text-lg font-extrabold sm:size-14 sm:text-2xl"
          :class="tile.class"
          :style="{
            '--cv-rotate': tile.rotate,
            '--cv-delay': tile.delay,
            '--cv-duration': tile.duration,
          }"
          >{{ tile.letter }}</span
        >
        <blockquote
          class="border-line bg-surface shadow-card relative z-10 mx-auto w-fit max-w-[18rem] rounded-3xl border px-5 py-4 text-center"
        >
          <p class="font-display text-lg leading-snug font-bold sm:text-xl">
            « {{ MASCOT_PHRASE }} »
          </p>
          <span
            aria-hidden="true"
            class="border-line bg-surface absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 border-r border-b"
          />
        </blockquote>
        <SougoudouMascot class="relative mx-auto mt-4 w-40 sm:w-56 lg:w-64" />
        <figcaption class="text-muted relative mt-2 text-center text-sm">
          <span class="text-fg font-semibold">{{ MASCOT_NAME }}</span
          >, la mascotte de Crossverse
        </figcaption>
      </figure>
    </section>

    <!-- Partie en cours et défi du jour -->
    <section aria-labelledby="today-title" class="flex flex-col gap-4">
      <h2 id="today-title" class="sr-only">Aujourd’hui</h2>

      <p v-if="loading" class="text-muted" role="status">Chargement…</p>

      <div
        v-else-if="error"
        role="alert"
        class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
      >
        <p>{{ error }}</p>
        <button type="button" class="mt-2 font-semibold underline" @click="load">Réessayer</button>
      </div>

      <template v-else>
        <section
          v-if="resume?.session && resume.puzzle"
          aria-labelledby="resume-title"
          class="border-line bg-surface shadow-card flex flex-wrap items-center gap-4 rounded-3xl border p-5"
        >
          <span
            aria-hidden="true"
            class="bg-accent-soft text-accent grid size-12 place-items-center rounded-2xl"
          >
            <svg viewBox="0 0 24 24" class="size-6" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <h3 id="resume-title" class="text-muted text-xs font-semibold tracking-wider uppercase">
              Partie en cours
            </h3>
            <p class="mt-1 truncate text-lg font-bold">{{ resume.puzzle.title }}</p>
            <p class="text-muted text-sm">
              {{ difficultyLabel(resume.puzzle.difficulty) }} · {{ resume.puzzle.theme }}
            </p>
          </div>
          <NuxtLink
            :to="`/play/${resume.puzzle.id}`"
            class="bg-accent text-accent-fg shadow-cta inline-flex min-h-11 items-center rounded-full px-5 font-semibold"
          >
            Reprendre
          </NuxtLink>
        </section>

        <section
          v-reveal
          aria-labelledby="daily-title"
          class="text-accent-fg relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,var(--cv-accent),color-mix(in_srgb,var(--cv-accent)_70%,var(--cv-accent-2)))] p-6 sm:p-10"
        >
          <div
            aria-hidden="true"
            class="absolute -top-10 -right-10 -z-10 grid rotate-12 grid-cols-4 gap-2 opacity-20"
          >
            <span
              v-for="n in 16"
              :key="n"
              class="size-12 rounded-lg border-2 border-current sm:size-16"
              :class="n % 5 === 0 ? 'bg-current' : ''"
            />
          </div>
          <h3 id="daily-title" class="text-xs font-semibold tracking-wider uppercase opacity-90">
            Défi du jour
          </h3>
          <template v-if="daily">
            <p class="mt-1 text-sm opacity-90 first-letter:uppercase">{{ dailyDate }}</p>
            <p class="font-display mt-3 text-3xl font-extrabold sm:text-4xl">
              {{ daily.puzzle.title }}
            </p>
            <p class="mt-2 text-sm opacity-90">
              {{ difficultyLabel(daily.puzzle.difficulty) }} · {{ daily.puzzle.theme }} · environ
              {{ daily.puzzle.estimatedMinutes }} min
            </p>
            <NuxtLink
              :to="`/play/${daily.puzzle.id}`"
              class="bg-accent-fg text-accent mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold transition-transform hover:-translate-y-0.5"
            >
              Jouer le défi
            </NuxtLink>
          </template>
          <p v-else class="mt-3">Pas de défi aujourd'hui. Revenez demain !</p>
        </section>
      </template>
    </section>

    <!-- Modes de jeu -->
    <section aria-labelledby="modes-title" class="flex flex-col gap-8">
      <div v-reveal class="max-w-2xl">
        <p class="text-accent text-sm font-bold tracking-wider uppercase">Trois façons de jouer</p>
        <h2 id="modes-title" class="mt-2 text-3xl font-extrabold sm:text-5xl">
          Seul, chaque jour, ou face à face.
        </h2>
      </div>
      <ul class="grid gap-4 md:grid-cols-3">
        <li
          v-for="(mode, index) in modes"
          :key="mode.title"
          v-reveal
          :style="{ '--cv-delay': `${index * 90}ms` }"
        >
          <NuxtLink
            :to="mode.to"
            class="group border-line bg-surface shadow-card hover:border-accent flex h-full flex-col gap-4 rounded-3xl border p-6 transition-all hover:-translate-y-1"
          >
            <span class="flex items-center justify-between">
              <span
                aria-hidden="true"
                class="bg-accent-soft text-accent grid size-12 place-items-center rounded-2xl"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-6"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path :d="mode.icon" />
                </svg>
              </span>
              <span
                class="rounded-full px-2.5 py-1 text-xs font-semibold"
                :class="
                  mode.badge === 'Sans compte'
                    ? 'bg-surface-2 text-muted'
                    : 'bg-accent-soft text-fg'
                "
                >{{ mode.badge }}</span
              >
            </span>
            <span class="font-display text-xl font-bold">{{ mode.title }}</span>
            <span class="text-muted leading-relaxed">{{ mode.text }}</span>
            <span class="text-accent mt-auto inline-flex items-center gap-1 text-sm font-semibold">
              Y aller
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class="size-4 transition-transform group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <!-- Comment jouer -->
    <section aria-labelledby="howto-title" class="grid items-center gap-10 lg:grid-cols-2">
      <div class="flex flex-col gap-6">
        <div v-reveal>
          <p class="text-accent text-sm font-bold tracking-wider uppercase">Comment jouer</p>
          <h2 id="howto-title" class="mt-2 text-3xl font-extrabold sm:text-5xl">
            Simple à prendre en main.
          </h2>
        </div>
        <ol class="flex flex-col gap-3">
          <li
            v-for="(step, index) in steps"
            :key="step.title"
            v-reveal
            class="border-line bg-surface/70 flex gap-4 rounded-2xl border p-4 backdrop-blur"
            :style="{ '--cv-delay': `${index * 80}ms` }"
          >
            <span
              aria-hidden="true"
              class="bg-fg text-bg font-display grid size-9 shrink-0 place-items-center rounded-xl font-extrabold"
              >{{ index + 1 }}</span
            >
            <span>
              <span class="block font-bold">{{ step.title }}</span>
              <span class="text-muted mt-0.5 block text-sm leading-relaxed">{{ step.text }}</span>
            </span>
          </li>
        </ol>
        <NuxtLink
          v-reveal
          to="/comment-jouer"
          class="text-accent inline-flex min-h-11 items-center gap-1 self-start font-semibold underline underline-offset-4"
        >
          Le guide complet
        </NuxtLink>
      </div>
      <div v-reveal class="relative" style="--cv-delay: 120ms">
        <div aria-hidden="true" class="bg-accent/20 absolute inset-8 rounded-full blur-3xl" />
        <HowToDemo class="relative" />
      </div>
    </section>

    <!-- Sans compte / avec compte -->
    <section aria-labelledby="account-title" class="flex flex-col gap-8">
      <div v-reveal class="max-w-2xl">
        <p class="text-accent text-sm font-bold tracking-wider uppercase">Sans compte ou avec</p>
        <h2 id="account-title" class="mt-2 text-3xl font-extrabold sm:text-5xl">
          Jouez tout de suite, gardez tout ensuite.
        </h2>
      </div>
      <AccountComparison />
      <div v-if="isGuest" v-reveal class="flex flex-wrap gap-3">
        <NuxtLink
          to="/register"
          class="bg-accent text-accent-fg shadow-cta inline-flex min-h-12 items-center rounded-2xl px-6 font-bold"
        >
          Créer mon compte gratuit
        </NuxtLink>
        <NuxtLink
          to="/comment-jouer#compte"
          class="border-line bg-surface inline-flex min-h-12 items-center rounded-2xl border px-6 font-semibold"
        >
          En savoir plus
        </NuxtLink>
      </div>
    </section>

    <!-- Appel final -->
    <section
      v-reveal
      aria-labelledby="cta-title"
      class="border-line bg-surface shadow-card relative overflow-hidden rounded-[2rem] border p-8 text-center sm:p-12"
    >
      <div
        aria-hidden="true"
        class="from-accent/15 to-accent-2/15 absolute inset-0 bg-gradient-to-br"
      />
      <SougoudouMascot class="relative mx-auto w-24" />
      <h2 id="cta-title" class="relative mt-4 text-3xl font-extrabold sm:text-4xl">
        Prêt à remplir votre première grille ?
      </h2>
      <p class="text-muted relative mx-auto mt-3 max-w-lg">
        Aucune inscription pour commencer. Sougoudou vous attend.
      </p>
      <NuxtLink
        :to="playNow"
        class="bg-accent text-accent-fg shadow-cta relative mt-6 inline-flex min-h-13 items-center rounded-2xl px-8 text-lg font-bold transition-transform hover:-translate-y-0.5"
      >
        C’est parti
      </NuxtLink>
    </section>
  </div>
</template>
