<script setup lang="ts">
import type {
  AdminClue,
  AdminPuzzle,
  AdminPuzzleBody,
  AdminTheme,
  Difficulty,
} from '@crossverse/contracts'
import { gridSlots, type Direction } from '@crossverse/crossword-core'
import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'
import { DIFFICULTIES, difficultyLabel, directionLabel } from '~/utils/labels'

useHead({ title: 'Éditer une grille — Administration Crossverse' })

const route = useRoute()
const { check } = useAdmin()
const isNew = computed(() => route.params['id'] === 'new')

const puzzle = ref<AdminPuzzle | null>(null)
const title = ref('')
const slug = ref('')
const slugTouched = ref(false)
const themeSlug = ref('')
const themes = ref<AdminTheme[]>([])
/** Thèmes de premier niveau et leurs sous-thèmes, pour un sélecteur groupé. */
const themeGroups = computed(() =>
  themes.value
    .filter((item) => item.parentSlug === null)
    .map((root) => ({
      root,
      children: themes.value.filter((item) => item.parentSlug === root.slug),
    })),
)
const difficulty = ref<Difficulty>('easy')
const estimatedMinutes = ref(5)
const gridText = ref('')
/** Définitions saisies, par mot (`across:1`) : conservées quand la grille est retouchée. */
const clueTexts = ref<Record<string, { text: string; explanation: string }>>({})

const loading = ref(true)
const loadError = ref<string | null>(null)
const action = useFormAction()
const saved = ref<string | null>(null)

function fill(source: AdminPuzzle): void {
  puzzle.value = source
  title.value = source.title
  slug.value = source.slug
  slugTouched.value = true
  themeSlug.value = source.themeSlug
  difficulty.value = source.difficulty
  estimatedMinutes.value = source.estimatedMinutes
  gridText.value = source.grid.join('\n')
  clueTexts.value = Object.fromEntries(
    source.clues.map((clue) => [
      clueKey(clue.direction, clue.number),
      { text: clue.text, explanation: clue.explanation ?? '' },
    ]),
  )
}

onMounted(async () => {
  try {
    if (!(await check())) return
    themes.value = (await adminApi.listThemes()).items
    if (!isNew.value) fill(await adminApi.getPuzzle(String(route.params['id'])))
  } catch (cause) {
    loadError.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
})

const clueKey = (direction: Direction, number: number): string => `${direction}:${number}`

/** Slug proposé à partir du titre tant qu'il n'a pas été saisi à la main. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
watch(title, (value) => {
  if (!slugTouched.value) slug.value = slugify(value)
})

const gridLines = computed(() =>
  gridText.value
    .split('\n')
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line !== ''),
)
const slots = computed(() => gridSlots(gridLines.value))
const width = computed(() => Math.max(0, ...gridLines.value.map((line) => line.length)))

// Un champ par mot : les entrées manquantes sont créées avant le rendu, jamais pendant.
watch(
  slots,
  (list) => {
    for (const slot of list) {
      clueTexts.value[clueKey(slot.direction, slot.number)] ??= { text: '', explanation: '' }
    }
  },
  { immediate: true },
)

const EMPTY_CLUE = { text: '', explanation: '' }
function clueFor(direction: Direction, number: number): { text: string; explanation: string } {
  return clueTexts.value[clueKey(direction, number)] ?? EMPTY_CLUE
}

function body(): AdminPuzzleBody {
  const clues: AdminClue[] = slots.value.map((slot) => {
    const entry = clueFor(slot.direction, slot.number)
    const explanation = entry.explanation.trim()
    return {
      direction: slot.direction,
      number: slot.number,
      text: entry.text.trim(),
      ...(explanation === '' ? {} : { explanation }),
    }
  })
  return {
    slug: slug.value.trim(),
    title: title.value.trim(),
    themeSlug: themeSlug.value,
    difficulty: difficulty.value,
    estimatedMinutes: estimatedMinutes.value,
    grid: gridLines.value,
    clues,
  }
}

async function save(): Promise<void> {
  saved.value = null
  await action.run(async () => {
    const result = isNew.value
      ? await adminApi.createPuzzle(body())
      : await adminApi.updatePuzzle(String(route.params['id']), body())
    fill(result)
    saved.value = isNew.value ? 'Grille créée en brouillon.' : 'Modifications enregistrées.'
    if (isNew.value) await navigateTo(`/admin/puzzles/${result.id}`, { replace: true })
  })
}

async function toggleStatus(): Promise<void> {
  const current = puzzle.value
  if (!current) return
  saved.value = null
  await action.run(async () => {
    fill(
      await adminApi.setPuzzleStatus(
        current.id,
        current.status === 'published' ? 'draft' : 'published',
      ),
    )
    saved.value = current.status === 'published' ? 'Grille dépubliée.' : 'Grille publiée.'
  })
}

const inputClass = 'bg-surface border-line min-h-11 w-full rounded-xl border px-4'
</script>

<template>
  <AdminShell :title="isNew ? 'Nouvelle grille' : (puzzle?.title ?? 'Grille')">
    <p v-if="loading" role="status" class="text-muted">Chargement…</p>
    <div
      v-else-if="loadError"
      role="alert"
      class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
    >
      {{ loadError }}
    </div>
    <form v-else novalidate class="flex flex-col gap-6" @submit.prevent="save">
      <div v-if="puzzle" class="flex flex-wrap items-center gap-3 text-sm">
        <span
          class="rounded-full px-3 py-1 font-semibold"
          :class="puzzle.status === 'published' ? 'bg-accent-soft' : 'bg-surface-2 text-muted'"
          >{{ puzzle.status === 'published' ? 'Publiée' : 'Brouillon' }}</span
        >
        <span class="text-muted"
          >{{ puzzle.playsCompleted }}/{{ puzzle.playsStarted }} parties terminées</span
        >
        <button
          type="button"
          class="border-line hover:bg-surface-2 ml-auto min-h-11 rounded-full border px-4 font-semibold disabled:opacity-60"
          :disabled="action.pending.value"
          @click="toggleStatus"
        >
          {{ puzzle.status === 'published' ? 'Dépublier' : 'Publier' }}
        </button>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="p-title" class="text-sm font-semibold">Titre</label>
          <input id="p-title" v-model="title" maxlength="80" required :class="inputClass" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="p-slug" class="text-sm font-semibold">Slug (adresse)</label>
          <input
            id="p-slug"
            v-model="slug"
            maxlength="60"
            required
            autocapitalize="off"
            spellcheck="false"
            :class="inputClass"
            @input="slugTouched = true"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="p-theme" class="text-sm font-semibold">Thème</label>
          <select id="p-theme" v-model="themeSlug" required :class="inputClass">
            <option value="" disabled>Choisir un thème</option>
            <optgroup v-for="group in themeGroups" :key="group.root.slug" :label="group.root.name">
              <option :value="group.root.slug">{{ group.root.name }} (général)</option>
              <option v-for="child in group.children" :key="child.slug" :value="child.slug">
                {{ child.name }}
              </option>
            </optgroup>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label for="p-difficulty" class="text-sm font-semibold">Niveau</label>
            <select id="p-difficulty" v-model="difficulty" :class="inputClass">
              <option v-for="level in DIFFICULTIES" :key="level" :value="level">
                {{ difficultyLabel(level) }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="p-minutes" class="text-sm font-semibold">Durée estimée (min)</label>
            <input
              id="p-minutes"
              v-model.number="estimatedMinutes"
              type="number"
              min="1"
              max="180"
              :class="inputClass"
            />
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="p-grid" class="text-sm font-semibold">Grille</label>
          <textarea
            id="p-grid"
            v-model="gridText"
            rows="8"
            spellcheck="false"
            autocapitalize="characters"
            aria-describedby="p-grid-hint"
            :readonly="puzzle?.locked"
            class="bg-surface border-line w-full rounded-xl border p-3 font-mono tracking-[0.3em] uppercase read-only:opacity-70"
          />
          <p id="p-grid-hint" class="text-muted text-sm">
            Une ligne par rangée, lettres A–Z sans accent, <kbd>#</kbd> pour une case noire (3 à 25
            cases de côté).
            <template v-if="puzzle?.locked">
              Grille déjà jouée : ses lettres sont figées, seules les définitions changent.
            </template>
          </p>
        </div>
        <div aria-hidden="true" class="flex items-start">
          <div
            v-if="width > 0"
            class="border-line inline-grid gap-px border"
            :style="{ gridTemplateColumns: `repeat(${width}, 1.75rem)` }"
          >
            <template v-for="(line, row) in gridLines" :key="row">
              <span
                v-for="col in width"
                :key="col"
                class="grid size-7 place-items-center text-xs font-bold"
                :class="(line[col - 1] ?? '#') === '#' ? 'bg-block' : 'bg-cell'"
                >{{ (line[col - 1] ?? '#') === '#' ? '' : line[col - 1] }}</span
              >
            </template>
          </div>
        </div>
      </div>

      <fieldset class="flex flex-col gap-3">
        <legend class="mb-2 text-lg font-bold">Définitions ({{ slots.length }} mots)</legend>
        <p v-if="slots.length === 0" class="text-muted text-sm">
          Saisissez la grille : un champ apparaît pour chaque mot.
        </p>
        <div
          v-for="slot in slots"
          :key="clueKey(slot.direction, slot.number)"
          class="bg-surface border-line grid gap-2 rounded-2xl border p-3 sm:grid-cols-[10rem_1fr_1fr]"
        >
          <p class="text-sm">
            <span class="font-bold">{{ slot.number }} {{ directionLabel(slot.direction) }}</span>
            <span class="text-muted block font-mono tracking-widest">{{ slot.answer }}</span>
          </p>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-semibold">Définition</span>
            <input
              v-model="clueFor(slot.direction, slot.number).text"
              maxlength="200"
              :class="inputClass"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-semibold">Explication (facultative)</span>
            <input
              v-model="clueFor(slot.direction, slot.number).explanation"
              maxlength="500"
              :class="inputClass"
            />
          </label>
        </div>
      </fieldset>

      <p
        v-if="action.error.value"
        role="alert"
        class="bg-danger-soft text-danger rounded-xl p-3 text-sm"
      >
        {{ action.error.value }}
      </p>
      <p v-if="saved" role="status" class="text-success text-sm font-semibold">{{ saved }}</p>
      <button
        type="submit"
        class="bg-fg text-bg min-h-11 self-start rounded-full px-6 font-semibold disabled:opacity-60"
        :disabled="action.pending.value"
      >
        {{
          action.pending.value ? 'Enregistrement…' : isNew ? 'Créer en brouillon' : 'Enregistrer'
        }}
      </button>
    </form>
  </AdminShell>
</template>
