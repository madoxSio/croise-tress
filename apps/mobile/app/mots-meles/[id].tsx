import type { WordListDto } from '@crossverse/contracts'
import type { Position } from '@crossverse/crossword-core'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api, errorMessage } from '../../src/api'
import { TextField } from '../../src/components/TextField'
import { Button, Card, ErrorNotice, Loading, Muted, StatusNotice } from '../../src/components/ui'
import { formatClock, formatDuration } from '../../src/game/labels'
import { TOUCH_TARGET, usePalette } from '../../src/theme'
import { useNow } from '../../src/useNow'
import { checkSelection, isMystery, locate, mysteryOf } from '../../src/wordlist/game'
import { WordSearchGesture } from '../../src/wordsearch/gesture'
import {
  EMPTY_STATE,
  addHit,
  cellColors,
  cellKey,
  hitColor,
  press,
  previewCells,
  type Selection,
  type WordSearchState,
} from '../../src/wordsearch/state'

/**
 * Mots mêlés « standard » : on raye les mots de la liste en glissant de leur première à leur
 * dernière lettre (ou en les touchant l'une après l'autre). Les lettres restantes forment le
 * mot mystère. Tout se joue sur l'appareil : mode d'entraînement, sans points.
 */
export default function WordListScreen() {
  const palette = usePalette()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [list, setList] = useState<WordListDto | null>(null)
  const [state, setState] = useState<WordSearchState>(EMPTY_STATE)
  const [drag, setDrag] = useState<{ from: Position; to: Position } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [guess, setGuess] = useState('')
  const [mysterySolved, setMysterySolved] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [finishedAt, setFinishedAt] = useState<number | null>(null)

  const load = useCallback(async () => {
    setList(null)
    setLoadError(null)
    try {
      setList(await api.getWordList(id))
      setStartedAt(Date.now())
    } catch (cause) {
      setLoadError(errorMessage(cause))
    }
  }, [id])

  useEffect(() => {
    // Chargement initial ; l'état passe par `load`, comme pour les autres écrans de jeu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  function restart(): void {
    setState(EMPTY_STATE)
    setNotice(null)
    setGuess('')
    setMysterySolved(false)
    setFinishedAt(null)
    setStartedAt(Date.now())
  }

  const complete = list !== null && state.found.length === list.words.length
  const mysteryShown = complete || mysterySolved
  const now = useNow(list !== null && !complete)
  const elapsed = (finishedAt ?? now) - startedAt

  useEffect(() => {
    // Fin de partie : on fige le chronomètre d'affichage une seule fois.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (complete && finishedAt === null) setFinishedAt(Date.now())
  }, [complete, finishedAt])

  function submit(selection: Selection): void {
    if (!list || complete) return
    const result = checkSelection(list, state.found, selection)
    if (result.kind === 'hit') {
      setNotice(`Trouvé : ${result.hit.answer} !`)
      setState((previous) => addHit(previous, result.hit))
    } else {
      setNotice(
        result.kind === 'already'
          ? 'Ce mot est déjà rayé.'
          : 'Pas de mot de la liste ici. Essaie un autre tracé !',
      )
    }
  }

  function reveal(word: string): void {
    if (!list) return
    const hit = locate(list, word)
    if (!hit) return
    setState((previous) => addHit(previous, hit, true))
    setNotice(`Voici ${word}.`)
  }

  function proposeMystery(): void {
    if (!list) return
    const ok = isMystery(list, guess)
    if (ok) {
      setMysterySolved(true)
      setGuess('')
    }
    setNotice(ok ? 'Bravo, c’est le mot mystère !' : 'Ce n’est pas le mot mystère.')
  }

  function tap(position: Position): void {
    if (complete) return
    const result = press(state, position)
    setState(result.state)
    if (result.selection) submit(result.selection)
  }

  // Le geste vit dans un objet stable ; il reçoit à chaque rendu la taille et les gestionnaires.
  const [gesture] = useState(() => new WordSearchGesture())
  // Sans dépendances à dessein : les gestionnaires changent à chaque rendu et ne font que
  // s'enregistrer (aucun appel d'état ici, contrairement à ce que suppose la règle).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    gesture.sync(list?.size ?? 0, {
      onDrag: setDrag,
      onTap: tap,
      onSelect: (selection) => {
        setState((previous) => ({ ...previous, anchor: null }))
        submit(selection)
      },
    })
  })

  if (loadError !== null) {
    return (
      <View style={styles.centered}>
        <ErrorNotice message={loadError} onRetry={() => void load()} />
        <Button
          label="Retour aux mots mêlés"
          variant="secondary"
          onPress={() => {
            router.replace('/mots-meles')
          }}
        />
      </View>
    )
  }
  if (!list) return <Loading label="Meyron mélange les lettres…" />

  const colors = cellColors(state.found)
  const mystery = mysteryOf(list)
  const marked = new Set(mysteryShown ? mystery.cells.map(cellKey) : [])
  const selected = new Set(
    (drag ? previewCells(drag.from, drag.to, list.size) : state.anchor ? [state.anchor] : []).map(
      cellKey,
    ),
  )
  const revealedCount = state.found.filter((word) => word.revealed).length
  const directionsHint = list.directions.reversed
    ? 'Les mots vont dans tous les sens, même à l’envers.'
    : list.directions.diagonals
      ? 'Les mots se lisent vers la droite, vers le bas ou en diagonale.'
      : 'Les mots se lisent vers la droite ou vers le bas.'

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: palette.bg }]}>
      <Stack.Screen options={{ title: list.title }} />
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={drag === null}>
        <View style={styles.meta}>
          <Text style={[styles.clock, { color: palette.fg }]}>
            {state.found.length} / {list.words.length} mots
          </Text>
          <Text
            accessibilityLabel={`Temps écoulé ${formatDuration(elapsed)}`}
            style={[styles.clock, { color: palette.fg }]}
          >
            {formatClock(elapsed)}
          </Text>
        </View>
        <Muted>
          Glisse de la première à la dernière lettre d’un mot de la liste, ou touche-les l’une après
          l’autre. {directionsHint}
        </Muted>

        <View
          onLayout={gesture.onLayout}
          {...gesture.responder.panHandlers}
          accessibilityLabel={`Mots mêlés de ${String(list.size)} lettres de côté`}
          style={[styles.grid, { borderColor: palette.line, backgroundColor: palette.cell }]}
        >
          {list.rows.map((line, row) => (
            <View key={row} style={styles.row}>
              {Array.from(line).map((letter, col) => {
                const key = cellKey({ row, col })
                const isSelected = selected.has(key)
                const isMysteryCell = marked.has(key)
                return (
                  <View
                    key={col}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${letter}, ligne ${String(row + 1)}, colonne ${String(col + 1)}${isMysteryCell ? ', lettre du mot mystère' : ''}`}
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
                        borderColor: isMysteryCell ? palette.accent : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.letter,
                        {
                          color: isMysteryCell ? palette.accent : palette.fg,
                          fontSize: Math.max(11, 220 / list.size),
                        },
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

        <Card>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.fg }]}>
            Mot mystère
          </Text>
          <Muted>
            {list.mysteryClue} · {list.mysteryLength} lettres
          </Muted>
          <View
            accessible
            accessibilityLabel={
              mysteryShown
                ? `Mot mystère : ${mystery.letters}`
                : `${String(list.mysteryLength)} lettres à découvrir`
            }
            style={styles.mystery}
          >
            {Array.from({ length: list.mysteryLength }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.mysteryBox,
                  mysteryShown
                    ? { backgroundColor: palette.accent, borderColor: palette.accent }
                    : { backgroundColor: palette.surface2, borderColor: palette.line },
                ]}
              >
                <Text style={[styles.mysteryLetter, { color: palette.accentFg }]}>
                  {mysteryShown ? mystery.letters[index] : ''}
                </Text>
              </View>
            ))}
          </View>
          {mysteryShown ? null : (
            <>
              <TextField
                label="Proposer le mot mystère"
                value={guess}
                onChangeText={setGuess}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={proposeMystery}
                hint="Raye tous les mots : les lettres restantes, dans l’ordre, forment le mot mystère."
              />
              <Button label="Proposer" disabled={guess.trim() === ''} onPress={proposeMystery} />
            </>
          )}
        </Card>

        {complete ? (
          <Card>
            <Text accessibilityRole="header" style={[styles.done, { color: palette.success }]}>
              🐻 Grille terminée ! Le mot mystère était {mystery.letters}.
            </Text>
            <Muted>
              {list.words.length - revealedCount} mot(s) trouvé(s) par toi
              {revealedCount > 0 ? `, ${String(revealedCount)} montré(s) par Meyron` : ''}, en{' '}
              {formatDuration(elapsed)}. Mode entraînement : pas de points ici.
            </Muted>
            <Button
              label="Autre grille"
              onPress={() => {
                router.replace('/mots-meles')
              }}
            />
            <Button label="Rejouer" variant="secondary" onPress={restart} />
          </Card>
        ) : null}

        <Text accessibilityRole="header" style={[styles.heading, { color: palette.fg }]}>
          Mots à trouver
        </Text>
        <View style={styles.words}>
          {list.words.map((word) => {
            const index = state.found.findIndex((found) => found.answer === word)
            const found = index >= 0 ? state.found[index] : undefined
            return (
              <View
                key={word}
                style={[
                  styles.word,
                  { backgroundColor: palette.surface, borderColor: palette.line },
                ]}
              >
                {found ? (
                  <View
                    style={[styles.swatch, { backgroundColor: hitColor(index, found.revealed) }]}
                  />
                ) : null}
                <Text
                  accessibilityLabel={
                    found ? `${word}, ${found.revealed ? 'montré' : 'trouvé'}` : word
                  }
                  style={[
                    styles.wordText,
                    found
                      ? { color: palette.muted, textDecorationLine: 'line-through' }
                      : { color: palette.fg },
                  ]}
                >
                  {word}
                </Text>
                {!found && !complete ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Où est ${word} ?`}
                    onPress={() => {
                      reveal(word)
                    }}
                    style={styles.where}
                  >
                    <Text style={{ color: palette.muted, fontWeight: '800' }}>?</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })}
        </View>
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
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
  },
  letter: { fontWeight: '700' },
  done: { fontSize: 22, fontWeight: '800' },
  heading: { fontSize: 20, fontWeight: '800' },
  mystery: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mysteryBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mysteryLetter: { fontSize: 18, fontWeight: '800' },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    width: '48%',
    flexGrow: 1,
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingLeft: 10,
  },
  wordText: { flex: 1, fontWeight: '800', letterSpacing: 1 },
  swatch: { width: 16, height: 10, borderRadius: 5 },
  where: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
