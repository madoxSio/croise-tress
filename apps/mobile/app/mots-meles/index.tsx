import type { CatalogTheme, WordListSummary } from '@crossverse/contracts'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { api, errorMessage } from '../../src/api'
import { ErrorNotice, Loading, Muted } from '../../src/components/ui'
import { LEVELS, type LevelId, levelOf, lookOf } from '../../src/game/catalog'
import { TOUCH_TARGET, radius, usePalette } from '../../src/theme'

/** Catalogue des mots mêlés : court, chargé en une page et filtré ici par niveau. */
export default function WordLists() {
  const palette = usePalette()
  const [themes, setThemes] = useState<CatalogTheme[]>([])
  const [items, setItems] = useState<WordListSummary[]>([])
  const [level, setLevel] = useState<LevelId | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [page, catalog] = await Promise.all([
        api.listWordLists(),
        api.getCatalog().catch(() => [] as CatalogTheme[]),
      ])
      setItems(page.items)
      setThemes(catalog)
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Chargement initial ; l'état change après la réponse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const difficulties: readonly string[] | undefined = LEVELS.find(
    (l) => l.id === level,
  )?.difficulties
  const visible = items.filter((item) => !difficulties || difficulties.includes(item.difficulty))

  const header = (
    <View style={styles.header}>
      <Muted>
        Retrouve les mots de la liste cachés dans la grille et raye-les. Les lettres qui restent
        forment le mot mystère !
      </Muted>
      <View accessibilityRole="radiogroup" accessibilityLabel="Niveau" style={styles.levels}>
        {[{ id: null, label: 'Tous' }, ...LEVELS].map((option) => {
          const checked = level === option.id
          return (
            <Pressable
              key={option.id ?? 'all'}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => {
                setLevel(option.id)
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: checked ? palette.accent : palette.surface,
                  borderColor: checked ? palette.accent : palette.line,
                },
              ]}
            >
              <Text style={{ color: checked ? palette.accentFg : palette.fg, fontWeight: '700' }}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  return (
    <FlatList
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.list}
      data={visible}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => {
        const look = lookOf(themes, item.themeSlug)
        const label = levelOf(item.difficulty).label
        return (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.title}, mots mêlés, ${label}, ${item.theme}, ${String(item.wordCount)} mots`}
            onPress={() => {
              router.push(`/mots-meles/${item.id}`)
            }}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: pressed ? palette.surface2 : palette.surface,
                borderColor: palette.line,
                borderLeftColor: look.accent,
              },
            ]}
          >
            <Text style={[styles.title, { color: palette.fg }]}>
              {look.icon} {item.title}
            </Text>
            <Muted>
              {label} · {item.theme} · {item.size}×{item.size} · {item.wordCount} mots
            </Muted>
          </Pressable>
        )
      }}
      ListEmptyComponent={loading ? <Loading /> : <Muted>Aucune grille à ce niveau.</Muted>}
      ListFooterComponent={
        error !== null ? <ErrorNotice message={error} onRetry={() => void load()} /> : undefined
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { gap: 12, marginBottom: 6 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  card: {
    padding: 14,
    gap: 4,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 5,
  },
  title: { fontSize: 18, fontWeight: '700' },
})
