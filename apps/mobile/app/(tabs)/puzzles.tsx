import type { Difficulty, PuzzleSummary } from '@crossverse/contracts'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { api, errorMessage } from '../../src/api'
import { Button, ErrorNotice, Loading, Muted } from '../../src/components/ui'
import { DIFFICULTIES, difficultyLabel } from '../../src/game/labels'
import { TOUCH_TARGET, radius, usePalette } from '../../src/theme'

const PAGE_SIZE = 20

export default function Puzzles() {
  const palette = usePalette()
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(undefined)
  const [items, setItems] = useState<PuzzleSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Charge une page ; ne touche à l'état qu'une fois la réponse reçue. */
  const fetchPage = useCallback(async (level: Difficulty | undefined, after: string | null) => {
    try {
      const page = await api.listPuzzles({
        limit: PAGE_SIZE,
        ...(level === undefined ? {} : { difficulty: level }),
        ...(after === null ? {} : { cursor: after }),
      })
      setItems((current) => (after === null ? page.items : [...current, ...page.items]))
      setCursor(page.nextCursor)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Chargement initial : l'état n'est modifié qu'après la réponse (après `await`), ce que la
    // règle ne sait pas distinguer d'une mise à jour synchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(undefined, null)
  }, [fetchPage])

  function load(level: Difficulty | undefined, after: string | null): void {
    setLoading(true)
    setError(null)
    void fetchPage(level, after)
  }

  const chip = (value: Difficulty | undefined, label: string) => {
    const selected = value === difficulty
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => {
          setDifficulty(value)
          load(value, null)
        }}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? palette.fg : palette.surface,
            borderColor: selected ? palette.fg : palette.line,
          },
        ]}
      >
        <Text style={{ color: selected ? palette.bg : palette.fg, fontWeight: '600' }}>
          {label}
        </Text>
      </Pressable>
    )
  }

  return (
    <FlatList
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.chips}>
          {chip(undefined, 'Toutes')}
          {DIFFICULTIES.map((value) => chip(value, difficultyLabel(value)))}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${item.title}, ${difficultyLabel(item.difficulty)}, ${item.theme}, environ ${item.estimatedMinutes} minutes`}
          onPress={() => {
            router.push(`/play/${item.id}`)
          }}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: pressed ? palette.surface2 : palette.surface,
              borderColor: palette.line,
            },
          ]}
        >
          <Text style={[styles.title, { color: palette.fg }]}>{item.title}</Text>
          <Muted>
            {difficultyLabel(item.difficulty)} · {item.theme} · {item.width}×{item.height} ·{' '}
            {item.estimatedMinutes} min
          </Muted>
        </Pressable>
      )}
      ListEmptyComponent={loading ? undefined : <Muted>Aucune grille pour ce niveau.</Muted>}
      ListFooterComponent={
        <View style={styles.footer}>
          {error !== null ? (
            <ErrorNotice
              message={error}
              onRetry={() => {
                load(difficulty, null)
              }}
            />
          ) : null}
          {loading ? <Loading /> : null}
          {!loading && cursor !== null ? (
            <Button
              label="Charger plus"
              variant="secondary"
              onPress={() => {
                load(difficulty, cursor)
              }}
            />
          ) : null}
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  card: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  footer: { gap: 10, paddingTop: 6 },
})
