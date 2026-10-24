<script setup lang="ts">
import type { DailyChallenge, ResumeResponse } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { difficultyLabel } from '~/utils/labels'
import { MASCOT_GREETING, MASCOT_NAME } from '~/utils/mascot'

useHead({ title: 'Crossverse — Mots croisés en solo et en duel' })

const { isGuest } = useSession()
const catalog = useCatalog()
const quickPlay = useQuickPlay()
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

/**
 * Sougoudou « parle » : sa présentation s'écrit lettre à lettre après son arrivée. Le texte
 * complet est toujours exposé aux lecteurs d'écran ; sans animation, il s'affiche d'un coup.
 */
const typed = ref('')
let typing: ReturnType<typeof setInterval> | undefined

function typeGreeting(): void {
  const reduced =
    document.documentElement.dataset['motion'] === 'reduced' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    typed.value = MASCOT_GREETING
    return
  }
  let index = 0
  setTimeout(() => {
    typing = setInterval(() => {
      index += 1
      typed.value = MASCOT_GREETING.slice(0, index)
      if (index >= MASCOT_GREETING.length) clearInterval(typing)
    }, 28)
  }, 900)
}

onMounted(() => {
  typeGreeting()
  void load()
  void catalog.load()
})
onBeforeUnmount(() => {
  clearInterval(typing)
})

/** Lettres flottantes du héros (décor). */
const floatingTiles = [
  {
    letter: 'M',
    class: 'left-[4%] top-[14%] max-sm:hidden',
    rotate: '-12deg',
    delay: '0ms',
    duration: '6s',
  },
  { letter: 'O', class: 'right-[6%] top-[6%]', rotate: '10deg', delay: '400ms', duration: '5s' },
  { letter: 'T', class: 'left-[8%] bottom-[16%]', rotate: '8deg', delay: '900ms', duration: '7s' },
  {
    letter: 'S',
    class: 'right-[2%] bottom-[28%] max-sm:hidden',
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

const featuredThemes = computed(() => (catalog.themes.value ?? []).slice(0, 6))
</script>

<template>
  <div class="flex flex-col gap-20 sm:gap-28">
    <!-- Héros : « scène » sombre, quel que soit le thème, façon page d'accueil produit -->
    <section
      class="relative isolate -mx-4 overflow-hidden px-5 pt-10 pb-12 text-white sm:mx-0 sm:rounded-[2.5rem] sm:px-10 sm:pt-14 lg:px-14 lg:pb-16"
      style="background: #0d0b17"
      aria-labelledby="hero-title"
    >
      <div aria-hidden="true" class="cv-hero-bg absolute inset-0 -z-10" />
      <div class="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
        <div class="flex flex-col items-start gap-6">
          <p
            class="cv-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 backdrop-blur"
          >
            <span
              aria-hidden="true"
              class="size-2 rounded-full bg-[#c8f53c] shadow-[0_0_12px_#c8f53c]"
            />
            Mots croisés en solo et en duel
          </p>
          <h1
            id="hero-title"
            class="cv-rise text-[2.6rem] leading-[1.02] font-extrabold sm:text-6xl lg:text-7xl"
            style="--cv-delay: 80ms"
          >
            Les mots croisés,
            <span class="cv-hero-gradient block">version arène.</span>
          </h1>
          <p
            class="cv-rise max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl"
            style="--cv-delay: 160ms"
          >
            Des grilles par thèmes, de la culture au foot en passant par les mangas, un défi chaque
            jour et des duels en temps réel. Testez tout de suite, sans inscription.
          </p>
          <div
            class="cv-rise flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
            style="--cv-delay: 240ms"
          >
            <button
              type="button"
              class="cv-cta-neon inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-8 text-lg font-extrabold transition-transform hover:-translate-y-0.5 disabled:opacity-70"
              :disabled="quickPlay.busy.value"
              @click="quickPlay.start()"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="currentColor">
                <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
              </svg>
              {{ quickPlay.busy.value ? 'Préparation…' : 'Partie rapide' }}
            </button>
            <NuxtLink
              to="/puzzles"
              class="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 text-lg font-semibold backdrop-blur transition-colors hover:bg-white/10"
            >
              Explorer les thèmes
            </NuxtLink>
          </div>
          <p
            v-if="quickPlay.error.value"
            role="alert"
            class="rounded-xl bg-[#4a1f1c] px-4 py-2 text-sm text-[#ffb4aa]"
          >
            {{ quickPlay.error.value }}
          </p>
          <ul
            class="cv-rise flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70"
            style="--cv-delay: 320ms"
          >
            <li v-for="item in highlights" :key="item" class="flex items-center gap-1.5">
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                class="size-4 text-[#c8f53c]"
                fill="currentColor"
              >
                <path d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4-8.1 8.1Z" />
              </svg>
              {{ item }}
            </li>
          </ul>
        </div>

        <!-- Sougoudou arrive et se présente -->
        <figure class="relative order-first mx-auto w-full max-w-md lg:order-none">
          <div
            aria-hidden="true"
            class="absolute inset-[10%] rounded-full bg-[#5634f0]/50 blur-3xl"
          />
          <span
            v-for="tile in floatingTiles"
            :key="tile.letter"
            aria-hidden="true"
            class="cv-float font-display absolute grid size-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-lg font-extrabold backdrop-blur sm:size-14 sm:text-2xl"
            :class="tile.class"
            :style="{
              '--cv-rotate': tile.rotate,
              '--cv-delay': tile.delay,
              '--cv-duration': tile.duration,
            }"
            >{{ tile.letter }}</span
          >
          <blockquote
            class="cv-rise relative z-10 mx-auto min-h-[5.5rem] w-full max-w-[20rem] rounded-3xl bg-white px-5 py-4 text-center text-[#16132a] shadow-2xl"
            style="--cv-delay: 700ms"
          >
            <p class="font-display text-base leading-snug font-bold sm:text-lg">
              <span class="sr-only">{{ MASCOT_GREETING }}</span>
              <span aria-hidden="true"
                >{{ typed
                }}<span v-if="typed.length < MASCOT_GREETING.length" class="cv-caret">|</span></span
              >
            </p>
            <span
              aria-hidden="true"
              class="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-white"
            />
          </blockquote>
          <SougoudouMascot
            entrance
            mood="wave"
            class="relative mx-auto mt-4 w-44 sm:w-56 lg:w-64"
          />
          <figcaption class="relative mt-2 text-center text-sm text-white/70">
            <span class="font-semibold text-white">{{ MASCOT_NAME }}</span
            >, votre guide
          </figcaption>
        </figure>
      </div>
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
            class="bg-fg text-bg inline-flex min-h-11 items-center rounded-full px-5 font-semibold"
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

    <!-- Thèmes -->
    <section
      v-if="featuredThemes.length > 0"
      aria-labelledby="themes-title"
      class="flex flex-col gap-8"
    >
      <div v-reveal class="flex flex-wrap items-end gap-4">
        <div class="max-w-2xl flex-1">
          <p class="text-accent text-sm font-bold tracking-wider uppercase">Thèmes</p>
          <h2 id="themes-title" class="mt-2 text-3xl font-extrabold sm:text-5xl">
            Apprendre en s’amusant.
          </h2>
          <p class="text-muted mt-3 text-lg">
            Culture, histoire, foot, mangas, musique… Chaque thème a ses sous-thèmes, ses niveaux et
            son habillage.
          </p>
        </div>
        <NuxtLink
          to="/puzzles"
          class="text-accent inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Tous les thèmes
        </NuxtLink>
      </div>
      <!-- Sur mobile : carrousel horizontal à aimantation ; grille au-delà. -->
      <ul
        class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
      >
        <li
          v-for="(theme, index) in featuredThemes"
          :key="theme.slug"
          v-reveal
          class="w-[78%] shrink-0 snap-start sm:w-auto"
          :style="{ '--cv-delay': `${index * 70}ms` }"
        >
          <ThemeCard :theme="theme" @quick-play="quickPlay.start" />
        </li>
      </ul>
    </section>

    <!-- Parcours -->
    <section
      v-reveal
      aria-labelledby="paths-title"
      class="border-line bg-surface shadow-card grid items-center gap-6 rounded-[2rem] border p-6 sm:p-10 md:grid-cols-[1fr_auto]"
    >
      <div>
        <p class="text-accent text-sm font-bold tracking-wider uppercase">Parcours</p>
        <h2 id="paths-title" class="mt-2 text-3xl font-extrabold sm:text-4xl">
          Une aventure, grille après grille.
        </h2>
        <p class="text-muted mt-3 text-lg">
          Enchaînez les grilles d’un thème : chaque étape réussie ouvre la suivante et rapporte des
          Coumba points.
        </p>
        <NuxtLink
          to="/parcours"
          class="bg-fg text-bg mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold transition-transform hover:-translate-y-0.5"
        >
          Voir les parcours
        </NuxtLink>
      </div>
      <!-- Chemin d'étapes décoratif : le texte dit déjà tout. -->
      <ol aria-hidden="true" class="flex items-center gap-2 md:flex-col">
        <li
          v-for="step in 4"
          :key="step"
          class="font-display grid size-12 place-items-center rounded-2xl text-lg font-extrabold"
          :class="
            step < 3
              ? 'bg-accent text-accent-fg'
              : step === 3
                ? 'bg-highlight text-[#16132a]'
                : 'bg-surface-2 text-muted border-line border border-dashed'
          "
        >
          {{ step < 3 ? '✓' : step }}
        </li>
      </ol>
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
      <SougoudouMascot mood="cheer" class="relative mx-auto w-24" />
      <h2 id="cta-title" class="relative mt-4 text-3xl font-extrabold sm:text-4xl">
        Prêt à remplir votre première grille ?
      </h2>
      <p class="text-muted relative mx-auto mt-3 max-w-lg">
        Aucune inscription pour commencer. Sougoudou vous attend.
      </p>
      <button
        type="button"
        class="bg-accent text-accent-fg shadow-cta relative mt-6 inline-flex min-h-13 items-center rounded-2xl px-8 text-lg font-bold transition-transform hover:-translate-y-0.5"
        :disabled="quickPlay.busy.value"
        @click="quickPlay.start()"
      >
        C’est parti
      </button>
    </section>
  </div>
</template>
