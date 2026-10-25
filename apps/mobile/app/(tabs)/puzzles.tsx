import type { CatalogTheme, PuzzleFormat, PuzzleSummary } from '@crossverse/contracts'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { api, errorMessage } from '../../src/api'
import { Button, ErrorNotice, Loading, Muted } from '../../src/components/ui'
import {
  FORMATS,
  LEVELS,
  type LevelId,
  formatLabel,
  levelOf,
  lookOf,
  parentTheme,
} from '../../src/game/catalog'
import { TOUCH_TARGET, radius, usePalette } from '../../src/theme'

const PAGE_SIZE = 20
/** Avec un niveau choisi, une requête par difficulté : 50 grilles chacune suffisent ici. */
const LEVEL_LIMIT = 50

interface Filter {
  readonly theme: string | null
  readonly level: LevelId | null
  readonly format: PuzzleFormat | null
}

export default function Puzzles() {
  const palette = usePalette()
  const [themes, setThemes] = useState<CatalogTheme[]>([])
  const [filter, setFilter] = useState<Filter>({
    theme: null,
    level: null,
    format: null,
  })
  const [items, setItems] = useState<PuzzleSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickBusy, setQuickBusy] = useState(false)

  /** Charge une page (ou toutes les grilles d'un niveau) ; l'état change après la réponse. */
  const fetchPage = useCallback(async (current: Filter, after: string | null) => {
    try {
      const theme = {
        ...(current.theme === null ? {} : { theme: current.theme }),
        ...(current.format === null ? {} : { format: current.format }),
      }
      const level = LEVELS.find((l) => l.id === current.level)
      if (level) {
        const pages = await Promise.all(
          level.difficulties.map((difficulty) =>
            api.listPuzzles({ ...theme, difficulty, limit: LEVEL_LIMIT }),
          ),
        )
        setItems(pages.flatMap((page) => page.items))
        setCursor(null)
      } else {
        const page = await api.listPuzzles({
          ...theme,
          limit: PAGE_SIZE,
          ...(after === null ? {} : { cursor: after }),
        })
        setItems((list) => (after === null ? page.items : [...list, ...page.items]))
        setCursor(page.nextCursor)
      }
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
    void fetchPage({ theme: null, level: null, format: null }, null)
    // Confort : sans catalogue, la liste reste utilisable (habillage par défaut).
    api.getCatalog().then(setThemes, () => undefined)
  }, [fetchPage])

  function apply(next: Filter, after: string | null = null): void {
    setFilter(next)
    setLoading(true)
    setError(null)
    void fetchPage(next, after)
  }

  async function quickPlay(): Promise<void> {
    setQuickBusy(true)
    setError(null)
    try {
      const pick = await api.quickPlay(filter.theme ?? undefined, filter.format ?? undefined)
      if (pick) router.push(`/play/${pick.id}`)
      else setError('Aucune grille disponible pour le moment.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setQuickBusy(false)
    }
  }

  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? palette.fg : palette.surface,
          borderColor: selected ? palette.fg : palette.line,
        },
      ]}
    >
      <Text style={{ color: selected ? palette.bg : palette.fg, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )

  const parent = filter.theme === null ? null : parentTheme(themes, filter.theme)

  const header = (
    <View style={styles.header}>
      <Button
        label={quickBusy ? 'Préparation…' : 'Partie rapide'}
        variant="neon"
        disabled={quickBusy}
        accessibilityHint={
          parent ? `Lance une grille simple du thème ${parent.name}` : 'Lance une grille simple'
        }
        onPress={() => void quickPlay()}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {chip('all', 'Tous les thèmes', filter.theme === null, () => {
          apply({ ...filter, theme: null })
        })}
        {themes.map((theme) =>
          chip(theme.slug, `${theme.icon} ${theme.name}`, parent?.slug === theme.slug, () => {
            apply({ ...filter, theme: theme.slug })
          }),
        )}
      </ScrollView>
      {parent ? (
        <View
          accessibilityRole="header"
          style={[styles.banner, { backgroundColor: parent.accent, borderColor: parent.accentAlt }]}
        >
          <View style={styles.bannerVeil} />
          <Text
            style={styles.bannerIcon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {parent.icon}
          </Text>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>{parent.name}</Text>
            {parent.description ? (
              <Text style={styles.bannerBody}>{parent.description}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {parent && parent.children.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {chip('parent', `Tout « ${parent.name} »`, filter.theme === parent.slug, () => {
            apply({ ...filter, theme: parent.slug })
          })}
          {parent.children.map((child) =>
            chip(child.slug, `${child.icon} ${child.name}`, filter.theme === child.slug, () => {
              apply({ ...filter, theme: child.slug })
            }),
          )}
        </ScrollView>
      ) : null}
      <View style={styles.levels}>
        {chip('any-format', 'Tous types', filter.format === null, () => {
          apply({ ...filter, format: null })
        })}
        {FORMATS.map((format) =>
          chip(format.id, format.label, filter.format === format.id, () => {
            apply({ ...filter, format: format.id })
          }),
        )}
      </View>
      {filter.format !== null ? (
        <Muted>{FORMATS.find((format) => format.id === filter.format)?.hint}</Muted>
      ) : null}
      <View style={styles.levels}>
        {chip('any', 'Tous niveaux', filter.level === null, () => {
          apply({ ...filter, level: null })
        })}
        {LEVELS.map((level) =>
          chip(level.id, level.label, filter.level === level.id, () => {
            apply({ ...filter, level: level.id })
          }),
        )}
      </View>
    </View>
  )

  return (
    <FlatList
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => {
        const look = lookOf(themes, item.themeSlug)
        const level = levelOf(item.difficulty).label
        const kind = item.format === 'classic' ? `${formatLabel(item.format)} · ` : ''
        return (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.title}, ${kind}${level}, ${item.theme}, environ ${item.estimatedMinutes} minutes`}
            onPress={() => {
              router.push(`/play/${item.id}`)
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
              {kind}
              {level} · {item.theme} · {item.width}×{item.height} · {item.estimatedMinutes} min
            </Muted>
          </Pressable>
        )
      }}
      ListEmptyComponent={loading ? undefined : <Muted>Aucune grille pour ce choix.</Muted>}
      ListFooterComponent={
        <View style={styles.footer}>
          {error !== null ? (
            <ErrorNotice
              message={error}
              onRetry={() => {
                apply(filter)
              }}
            />
          ) : null}
          {loading ? <Loading /> : null}
          {!loading && cursor !== null ? (
            <Button
              label="Charger plus"
              variant="secondary"
              onPress={() => {
                apply(filter, cursor)
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
  header: { gap: 12, marginBottom: 6 },
  row: { gap: 8 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.card,
    borderBottomWidth: 4,
    overflow: 'hidden',
  },
  // Voile sombre : le texte blanc reste lisible (≥ 4,5:1) même sur les accents clairs.
  bannerVeil: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(13, 11, 23, 0.35)',
  },
  bannerIcon: { fontSize: 36 },
  bannerText: { flex: 1, gap: 4 },
  bannerTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  bannerBody: { color: '#ffffff', opacity: 0.92 },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 5,
    padding: 16,
    gap: 4,
  },
  title: { fontSize: 18, fontWeight: '700' },
  footer: { gap: 10, paddingTop: 6 },
})
