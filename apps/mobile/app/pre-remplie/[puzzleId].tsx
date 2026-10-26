import type { WordSearchClue, WordSearchDto } from '@crossverse/contracts'
import type { Position } from '@crossverse/crossword-core'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, errorMessage } from '../../src/api'
import { Button, Card, ErrorNotice, Loading, Muted, StatusNotice } from '../../src/components/ui'
import { clueSpoken, clueTag, formatClock, formatDuration } from '../../src/game/labels'
import { TOUCH_TARGET, usePalette } from '../../src/theme'
import { useNow } from '../../src/useNow'
import {
  EMPTY_STATE,
  addHit,
  cellColors,
  cellKey,
  clueKey,
  hitColor,
  press,
  previewCells,
  type Selection,
  type WordSearchState,
} from '../../src/wordsearch/state'
import { WordSearchGesture } from '../../src/wordsearch/gesture'

/**
 * Grille pré-remplie (façon mots mêlés) : on glisse de la première à la dernière lettre d'un
 * mot, ou on les touche l'une après l'autre. Mode d'entraînement, sans points.
 */
export default function PrefilledPuzzle() {
  const palette = usePalette()
  const { puzzleId } = useLocalSearchParams<{ puzzleId: string }>()
  const [data, setData] = useState<WordSearchDto | null>(null)
  const [title, setTitle] = useState('Grille pré-remplie')
  const [state, setState] = useState<WordSearchState>(EMPTY_STATE)
  const [drag, setDrag] = useState<{ from: Position; to: Position } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [finishedAt, setFinishedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    setData(null)
    setLoadError(null)
    setNotice(null)
    setState(EMPTY_STATE)
    setFinishedAt(null)
    try {
      const [puzzle, search] = await Promise.all([
        api.getPuzzle(puzzleId),
        api.getWordSearch(puzzleId),
      ])
      setTitle(puzzle.title)
      setData(search)
      setStartedAt(Date.now())
    } catch (cause) {
      setLoadError(errorMessage(cause))
    }
  }, [puzzleId])

  useEffect(() => {
    // Chargement initial ; l'état passe par `load`, comme pour les autres écrans de jeu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const complete = data !== null && state.found.length === data.clues.length
  /** Mots croisés classiques : définitions repérées par ligne et colonne (« Ligne IV »). */
  const classic = data?.format === 'classic'
  const now = useNow(data !== null && !complete)
  const elapsed = (finishedAt ?? now) - startedAt

  async function submit(selection: Selection): Promise<void> {
    if (!data || busy || complete) return
    setBusy(true)
    try {
      const hit = await api.checkWordSearch(puzzleId, {
        seed: data.seed,
        ...selection,
        found: state.found.map(({ direction, number }) => ({ direction, number })),
      })
      if (!hit) setNotice('Pas de mot ici. Essaie un autre tracé !')
      else if (state.found.some((w) => clueKey(w) === clueKey(hit)))
        setNotice(`${hit.answer} est déjà trouvé.`)
      else {
        setNotice(`Trouvé : ${hit.answer} !`)
        setState((previous) => addHit(previous, hit))
      }
    } catch (cause) {
      setNotice(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function reveal(clue: WordSearchClue): Promise<void> {
    if (!data || busy) return
    setBusy(true)
    try {
      const hit = await api.revealWordSearch(puzzleId, {
        seed: data.seed,
        direction: clue.direction,
        number: clue.number,
      })
      setState((previous) => addHit(previous, hit, true))
      setNotice(`Le mot était ${hit.answer}.`)
    } catch (cause) {
      setNotice(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    // Fin de partie : on fige le chronomètre d'affichage une seule fois.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (complete && finishedAt === null) setFinishedAt(Date.now())
  }, [complete, finishedAt])

  function tap(position: Position): void {
    if (busy || complete) return
    const result = press(state, position)
    setState(result.state)
    if (result.selection) void submit(result.selection)
  }

  // Le geste vit dans un objet stable ; il reçoit à chaque rendu la taille et les gestionnaires.
  const [gesture] = useState(() => new WordSearchGesture())
  // Sans dépendances à dessein : les gestionnaires changent à chaque rendu et ne font que
  // s'enregistrer (aucun appel d'état ici, contrairement à ce que suppose la règle).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    gesture.sync(data?.size ?? 0, {
      onDrag: setDrag,
      onTap: tap,
      onSelect: (selection) => {
        setState((previous) => ({ ...previous, anchor: null }))
        void submit(selection)
      },
    })
  })

  if (loadError !== null) {
    return (
      <View style={styles.centered}>
        <ErrorNotice message={loadError} onRetry={() => void load()} />
        <Button
          label="Retour aux grilles"
          variant="secondary"
          onPress={() => {
            router.replace('/puzzles')
          }}
        />
      </View>
    )
  }
  if (!data) return <Loading label="Meyron cache les mots dans la grille…" />

  const colors = cellColors(state.found)
  const selected = new Set(
    (drag ? previewCells(drag.from, drag.to, data.size) : state.anchor ? [state.anchor] : []).map(
      cellKey,
    ),
  )
  const revealedCount = state.found.filter((word) => word.revealed).length
  const directionsHint = data.directions.reversed
    ? 'Les mots vont dans tous les sens, même à l’envers.'
    : data.directions.diagonals
      ? 'Les mots se lisent vers la droite, vers le bas ou en diagonale.'
      : 'Les mots se lisent vers la droite ou vers le bas.'

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: palette.bg }]}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={drag === null}>
        <View style={styles.meta}>
          <Text style={[styles.clock, { color: palette.fg }]}>
            {state.found.length} / {data.clues.length} mots
          </Text>
          <Text
            accessibilityLabel={`Temps écoulé ${formatDuration(elapsed)}`}
            style={[styles.clock, { color: palette.fg }]}
          >
            {formatClock(elapsed)}
          </Text>
        </View>
        <Muted>
          Glisse de la première à la dernière lettre d’un mot, ou touche-les l’une après l’autre.{' '}
          {directionsHint}
        </Muted>

        <View
          onLayout={gesture.onLayout}
          {...gesture.responder.panHandlers}
          accessibilityLabel={`Grille pré-remplie de ${String(data.size)} lettres de côté`}
          style={[styles.grid, { borderColor: palette.line, backgroundColor: palette.cell }]}
        >
          {data.rows.map((line, row) => (
            <View key={row} style={styles.row}>
              {Array.from(line).map((letter, col) => {
                const key = cellKey({ row, col })
                const isSelected = selected.has(key)
                return (
                  <View
                    key={col}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${letter}, ligne ${String(row + 1)}, colonne ${String(col + 1)}`}
                    accessibilityState={{ selected: isSelected }}
                    onAccessibilityTap={() => {
                      tap({ row, col })
                    }}
                    style={[
                      styles.cell,
                      {
                        backgroundColor: isSelected
                          ? palette.accentSoft
                          : (colors.get(key) ?? 'transparent'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.letter,
                        { color: palette.fg, fontSize: Math.max(11, 220 / data.size) },
                      ]}
                    >
                      {letter}
                    </Text>
                  </View>
                )
              })}
            </View>
          ))}
        </View>

        {notice ? <StatusNotice message={notice} /> : null}

        {complete ? (
          <Card>
            <Text accessibilityRole="header" style={[styles.done, { color: palette.success }]}>
              🐻 Tous les mots trouvés !
            </Text>
            <Muted>
              {data.clues.length - revealedCount} trouvé(s) par toi
              {revealedCount > 0 ? `, ${String(revealedCount)} montré(s) par Meyron` : ''}, en{' '}
              {formatDuration(elapsed)}. Mode entraînement : pas de points ici.
            </Muted>
            <Button
              label="Jouer en grille à trous"
              onPress={() => {
                router.replace(`/play/${puzzleId}`)
              }}
            />
            <Button label="Nouvelle disposition" variant="secondary" onPress={() => void load()} />
          </Card>
        ) : (
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                label="Mélanger"
                variant="secondary"
                disabled={busy}
                onPress={() => void load()}
              />
            </View>
            <View style={styles.action}>
              <Button
                label="Version à trous"
                variant="secondary"
                onPress={() => {
                  router.replace(`/play/${puzzleId}`)
                }}
              />
            </View>
          </View>
        )}

        <Text accessibilityRole="header" style={[styles.heading, { color: palette.fg }]}>
          Définitions
        </Text>
        {data.clues.map((clue) => {
          const index = state.found.findIndex((word) => clueKey(word) === clueKey(clue))
          const word = index >= 0 ? state.found[index] : undefined
          return (
            <View
              key={clueKey(clue)}
              style={[styles.clue, { backgroundColor: palette.surface, borderColor: palette.line }]}
            >
              <View style={styles.clueText}>
                <Text style={{ color: palette.fg }}>
                  <Text style={{ color: palette.accent, fontWeight: '800' }}>
                    {classic
                      ? clueTag(clue, true)
                      : `${String(clue.number)}${clue.direction === 'across' ? 'H' : 'V'}`}{' '}
                  </Text>
                  {clue.text} ({clue.length})
                </Text>
                {word ? (
                  <View style={styles.answerRow}>
                    <View
                      style={[styles.swatch, { backgroundColor: hitColor(index, word.revealed) }]}
                    />
                    <Text style={[styles.answer, { color: palette.fg }]}>
                      {word.answer}
                      {word.revealed ? ' (montré)' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
              {!word && !complete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Où est le mot ${clueSpoken(clue, classic)} ?`}
                  disabled={busy}
                  onPress={() => void reveal(clue)}
                  style={styles.where}
                >
                  <Text style={{ color: palette.muted, fontWeight: '600', fontSize: 13 }}>
                    Où est-il ?
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  centered: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clock: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  grid: { width: '100%', aspectRatio: 1, borderWidth: 2, borderRadius: 14, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  letter: { fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  done: { fontSize: 22, fontWeight: '800' },
  heading: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  clue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
  },
  clueText: { flex: 1, gap: 6 },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 24, height: 10, borderRadius: 5 },
  answer: { fontWeight: '800', letterSpacing: 1 },
  where: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 6 },
})
