<script setup lang="ts">
import { MASCOT_NAME, MASCOT_PHRASE } from '~/utils/mascot'

useHead({ title: 'Comment jouer — Crossverse' })

const { isGuest } = useSession()

const basics = [
  {
    title: 'La grille',
    text: 'Chaque mot part d’une case numérotée, vers la droite (horizontal) ou vers le bas (vertical). Les cases noires séparent les mots.',
  },
  {
    title: 'Les définitions',
    text: 'La définition du mot sélectionné s’affiche au-dessus de la grille ; la liste complète est juste à côté (ou en dessous sur mobile).',
  },
  {
    title: 'Les croisements',
    text: 'Chaque lettre appartient à deux mots : en trouver un, c’est déjà commencer l’autre.',
  },
] as const

const keys = [
  { keys: ['A–Z'], text: 'écrire une lettre (les accents sont ignorés)' },
  { keys: ['←', '↑', '→', '↓'], text: 'se déplacer de case en case' },
  { keys: ['Espace', 'Entrée'], text: 'passer d’horizontal à vertical' },
  { keys: ['Tab', 'Maj + Tab'], text: 'mot suivant ou précédent' },
  { keys: ['Retour'], text: 'effacer et reculer' },
  { keys: ['Échap'], text: 'quitter la grille' },
] as const

const faq = [
  {
    question: 'Que deviennent mes parties si je crée un compte plus tard ?',
    answer:
      'Les parties jouées en invité sur cet appareil sont rattachées à votre compte lors de l’inscription ou de la connexion : rien n’est perdu.',
  },
  {
    question: 'Pourquoi faut-il un compte pour les duels ?',
    answer:
      'Un duel engage un autre joueur et compte pour le classement : il faut une identité stable et une adresse e-mail confirmée, ce qui limite aussi la triche et les abus.',
  },
  {
    question: 'Mes réglages d’affichage nécessitent-ils un compte ?',
    answer:
      'Non : thème, taille du texte et réduction des animations sont enregistrés sur votre appareil, avec ou sans compte.',
  },
  {
    question: 'Puis-je supprimer mon compte ?',
    answer:
      'Oui, à tout moment depuis la page « Mon compte ». Le compte et ses parties sont alors supprimés.',
  },
] as const
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-16 sm:gap-20">
    <header class="grid items-center gap-8 md:grid-cols-[1fr_auto]">
      <div class="flex flex-col gap-4">
        <p class="cv-rise text-accent text-sm font-bold tracking-wider uppercase">Guide</p>
        <h1 class="cv-rise text-4xl font-extrabold sm:text-6xl" style="--cv-delay: 80ms">
          Comment jouer
        </h1>
        <p class="cv-rise text-muted max-w-2xl text-lg leading-relaxed" style="--cv-delay: 160ms">
          Tout ce qu’il faut savoir pour remplir vos premières grilles, défier d’autres joueurs, et
          choisir entre jouer sans compte ou avec.
        </p>
        <nav aria-label="Sommaire" class="cv-rise mt-2" style="--cv-delay: 240ms">
          <ul class="flex flex-wrap gap-2 text-sm font-semibold">
            <li
              v-for="item in [
                { href: '#principe', label: 'Le principe' },
                { href: '#commandes', label: 'Les commandes' },
                { href: '#aides', label: 'Aides et score' },
                { href: '#duel', label: 'Le duel' },
                { href: '#compte', label: 'Sans compte ou avec' },
              ]"
              :key="item.href"
            >
              <a
                :href="item.href"
                class="border-line bg-surface hover:border-accent inline-flex min-h-11 items-center rounded-full border px-4"
                >{{ item.label }}</a
              >
            </li>
          </ul>
        </nav>
      </div>
      <figure
        class="cv-rise mx-auto flex flex-col items-center gap-3 md:mx-0"
        style="--cv-delay: 200ms"
      >
        <SougoudouMascot class="w-36 sm:w-44" />
        <figcaption class="text-muted max-w-[14rem] text-center text-sm">
          <span class="text-fg font-semibold">{{ MASCOT_NAME }}</span> : « {{ MASCOT_PHRASE }} »
        </figcaption>
      </figure>
    </header>

    <section
      id="principe"
      aria-labelledby="principe-title"
      class="scroll-mt-24 flex flex-col gap-8"
    >
      <h2 id="principe-title" v-reveal class="text-3xl font-extrabold sm:text-4xl">Le principe</h2>
      <div class="grid items-start gap-8 lg:grid-cols-2">
        <ol class="flex flex-col gap-3">
          <li
            v-for="(item, index) in basics"
            :key="item.title"
            v-reveal
            class="border-line bg-surface shadow-card flex gap-4 rounded-2xl border p-5"
            :style="{ '--cv-delay': `${index * 80}ms` }"
          >
            <span
              aria-hidden="true"
              class="bg-accent text-accent-fg font-display grid size-9 shrink-0 place-items-center rounded-xl font-extrabold"
              >{{ index + 1 }}</span
            >
            <span>
              <span class="block font-bold">{{ item.title }}</span>
              <span class="text-muted mt-1 block leading-relaxed">{{ item.text }}</span>
            </span>
          </li>
        </ol>
        <HowToDemo v-reveal />
      </div>
    </section>

    <section
      id="commandes"
      aria-labelledby="commandes-title"
      class="scroll-mt-24 flex flex-col gap-6"
    >
      <h2 id="commandes-title" v-reveal class="text-3xl font-extrabold sm:text-4xl">
        Les commandes
      </h2>
      <div class="grid gap-4 md:grid-cols-2">
        <div v-reveal class="border-line bg-surface shadow-card rounded-3xl border p-6">
          <h3 class="text-xl font-bold">Au toucher</h3>
          <ul class="text-muted mt-4 flex flex-col gap-3 leading-relaxed">
            <li>
              <span class="text-fg font-semibold">Touchez une case</span> pour la sélectionner ;
              touchez-la encore pour changer de sens.
            </li>
            <li>
              <span class="text-fg font-semibold">Touchez une définition</span> pour aller
              directement au mot.
            </li>
            <li>Le clavier de votre appareil s’ouvre pour écrire. Aucun tracé n’est nécessaire.</li>
          </ul>
        </div>
        <div
          v-reveal
          class="border-line bg-surface shadow-card rounded-3xl border p-6"
          style="--cv-delay: 100ms"
        >
          <h3 class="text-xl font-bold">Au clavier</h3>
          <dl class="mt-4 flex flex-col gap-3">
            <div
              v-for="row in keys"
              :key="row.text"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <dt class="flex gap-1">
                <kbd
                  v-for="k in row.keys"
                  :key="k"
                  class="border-line bg-surface-2 rounded-md border border-b-2 px-2 py-0.5 font-mono text-sm"
                  >{{ k }}</kbd
                >
              </dt>
              <dd class="text-muted">{{ row.text }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section id="aides" aria-labelledby="aides-title" class="scroll-mt-24 flex flex-col gap-6">
      <h2 id="aides-title" v-reveal class="text-3xl font-extrabold sm:text-4xl">Aides et score</h2>
      <div class="grid gap-4 sm:grid-cols-3">
        <div v-reveal class="border-line bg-surface shadow-card rounded-3xl border p-6">
          <h3 class="font-bold">Vérifier</h3>
          <p class="text-muted mt-2 leading-relaxed">
            Une case, un mot ou toute la grille : les erreurs sont signalées, sans donner la
            réponse.
          </p>
        </div>
        <div
          v-reveal
          class="border-line bg-surface shadow-card rounded-3xl border p-6"
          style="--cv-delay: 80ms"
        >
          <h3 class="font-bold">Révéler</h3>
          <p class="text-muted mt-2 leading-relaxed">
            Une lettre ou un mot entier quand vous bloquez. Révéler toute la solution met le score à
            zéro.
          </p>
        </div>
        <div
          v-reveal
          class="border-line bg-surface shadow-card rounded-3xl border p-6"
          style="--cv-delay: 160ms"
        >
          <h3 class="font-bold">Le score</h3>
          <p class="text-muted mt-2 leading-relaxed">
            Calculé par le serveur à la fin : rapidité et sobriété en aides rapportent des points.
          </p>
        </div>
      </div>
    </section>

    <section id="duel" aria-labelledby="duel-title" class="scroll-mt-24">
      <div
        v-reveal
        class="text-accent-fg relative overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,var(--cv-accent),color-mix(in_srgb,var(--cv-accent)_70%,var(--cv-accent-2)))] p-6 sm:p-10"
      >
        <h2 id="duel-title" class="text-3xl font-extrabold sm:text-4xl">Le duel</h2>
        <ul class="mt-5 grid gap-4 sm:grid-cols-3">
          <li>
            <span class="block font-bold">Même grille, même chrono</span
            ><span class="opacity-90">Quinze minutes pour vous deux.</span>
          </li>
          <li>
            <span class="block font-bold">Chaque mot compte</span
            ><span class="opacity-90">Validé par le serveur dès qu’il est rempli.</span>
          </li>
          <li>
            <span class="block font-bold">Classement Elo</span
            ><span class="opacity-90"
              >Les parties rapides comptent ; les invitations privées par code, non.</span
            >
          </li>
        </ul>
        <NuxtLink
          to="/duel"
          class="bg-accent-fg text-accent mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 font-bold"
          >Aller aux duels</NuxtLink
        >
      </div>
    </section>

    <section id="compte" aria-labelledby="compte-title" class="scroll-mt-24 flex flex-col gap-8">
      <div v-reveal class="max-w-2xl">
        <h2 id="compte-title" class="text-3xl font-extrabold sm:text-4xl">Sans compte ou avec ?</h2>
        <p class="text-muted mt-3 text-lg leading-relaxed">
          Jouer ne demande rien : ouvrez une grille et c’est parti. Un compte devient utile dès que
          vous voulez garder une trace de vos parties ou affronter quelqu’un.
        </p>
      </div>
      <AccountComparison />
      <div v-if="isGuest" v-reveal class="flex flex-wrap gap-3">
        <NuxtLink
          to="/register"
          class="bg-accent text-accent-fg shadow-cta inline-flex min-h-12 items-center rounded-2xl px-6 font-bold"
          >Créer mon compte</NuxtLink
        >
        <NuxtLink
          to="/puzzles"
          class="border-line bg-surface inline-flex min-h-12 items-center rounded-2xl border px-6 font-semibold"
          >Jouer sans compte</NuxtLink
        >
      </div>

      <div class="flex flex-col gap-3">
        <h3 v-reveal class="text-xl font-bold">Questions fréquentes</h3>
        <details
          v-for="item in faq"
          :key="item.question"
          v-reveal
          class="group border-line bg-surface rounded-2xl border px-5 open:pb-4"
        >
          <summary
            class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold"
          >
            {{ item.question }}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              class="text-muted size-5 shrink-0 transition-transform group-open:rotate-45"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </summary>
          <p class="text-muted leading-relaxed">{{ item.answer }}</p>
        </details>
      </div>
    </section>
  </div>
</template>
