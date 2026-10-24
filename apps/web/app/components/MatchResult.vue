<script setup lang="ts">
/** Écran de fin de duel : résultat officiel (serveur) et, pour un match rapide, l'évolution du classement. */
import type { MatchState } from '@crossverse/contracts'
import { matchEndLabel, matchSides, type MatchOutcome } from '~/composables/useMatch'
import type { Rating } from '~/services/match'

const props = defineProps<{
  state: MatchState
  outcome: MatchOutcome | null
  rating: Rating | null
  /** Écart de classement mesuré pendant cette visite (`null` s'il n'a pas pu être mesuré). */
  ratingDelta: number | null
}>()

const titles: Record<MatchOutcome, string> = {
  win: 'Victoire !',
  loss: 'Défaite',
  draw: 'Égalité',
}

const title = computed(() => (props.outcome ? titles[props.outcome] : 'Match annulé'))
const sides = computed(() => matchSides(props.state))
const deltaText = computed(() => {
  const delta = props.ratingDelta
  if (delta === null) return ''
  return delta > 0 ? `+${delta}` : String(delta)
})

const root = ref<HTMLElement | null>(null)
defineExpose({ focus: () => root.value?.focus() })
</script>

<template>
  <section
    ref="root"
    tabindex="-1"
    aria-labelledby="result-title"
    class="cv-pop rounded-3xl p-6 text-center focus:outline-none"
    :class="outcome === 'win' ? 'bg-accent text-accent-fg' : 'bg-surface border-line border'"
  >
    <h2 id="result-title" class="text-2xl font-extrabold">{{ title }}</h2>
    <p class="mt-1 text-sm opacity-90">{{ matchEndLabel(state) }}</p>
    <dl v-if="state.status === 'finished'" class="mt-4 flex flex-wrap justify-center gap-8">
      <div>
        <dt class="text-xs tracking-wider uppercase opacity-80">Vous</dt>
        <dd class="text-xl font-bold tabular-nums">
          {{ sides.me?.solvedCount ?? 0 }} / {{ state.totalWords }}
        </dd>
      </div>
      <div>
        <dt class="text-xs tracking-wider uppercase opacity-80">
          {{ sides.opponent?.username ?? 'Adversaire' }}
        </dt>
        <dd class="text-xl font-bold tabular-nums">
          {{ sides.opponent?.solvedCount ?? 0 }} / {{ state.totalWords }}
        </dd>
      </div>
      <div v-if="state.mode === 'quick' && rating">
        <dt class="text-xs tracking-wider uppercase opacity-80">Classement</dt>
        <dd class="text-xl font-bold tabular-nums">
          {{ rating.rating }}
          <span v-if="deltaText" class="text-sm">({{ deltaText }})</span>
        </dd>
      </div>
    </dl>
    <p
      v-if="state.mode === 'private' && state.status === 'finished'"
      class="mt-3 text-sm opacity-90"
    >
      Match entre amis : le classement n’est pas modifié.
    </p>
    <div class="mt-5 flex flex-wrap justify-center gap-3">
      <NuxtLink
        to="/duel"
        class="inline-flex min-h-11 items-center rounded-full px-5 font-bold"
        :class="
          outcome === 'win' ? 'bg-accent-fg text-accent' : 'bg-accent text-accent-fg shadow-cta'
        "
        >Nouveau duel</NuxtLink
      >
      <NuxtLink
        to="/leaderboard"
        class="inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
        :class="outcome === 'win' ? 'border-accent-fg' : 'border-line'"
        >Classement</NuxtLink
      >
    </div>
  </section>
</template>
