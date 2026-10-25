/**
 * Grille jouable : une case = une cible tactile. Toucher une case la sélectionne, la
 * re-toucher change de sens. La saisie passe par le clavier de jeu (`GameKeyboard`), ce qui
 * évite les comportements divergents des claviers système iOS et Android.
 * Mots croisés classiques (`classic`) : pas de numéro dans les cases, repères de lignes
 * (I, II…) à gauche et de colonnes (1, 2…) au-dessus.
 */
import { classicLineLabel, type PublicClue, type PublicPuzzle } from '@crossverse/crossword-core'
import { memo, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { clueSpoken } from '../game/labels'
import { cellKey, highlightedCells, type GameState } from '../game/state'
import { usePalette } from '../theme'

interface Props {
  readonly puzzle: PublicPuzzle
  readonly game: GameState
  readonly onSelect: (row: number, col: number) => void
  readonly classic?: boolean
}

/** Largeur réservée aux repères de lignes (I…XXV) en mots croisés classiques. */
const LABEL_WIDTH = 26

type ClueIndex = ReadonlyMap<string, { across?: PublicClue; down?: PublicClue }>

/** Définitions horizontale et verticale de chaque case (étiquettes d'accessibilité). */
function indexClues(puzzle: PublicPuzzle): ClueIndex {
  const map = new Map<string, { across?: PublicClue; down?: PublicClue }>()
  for (const clue of puzzle.clues) {
    for (let i = 0; i < clue.length; i++) {
      const key = cellKey(
        clue.direction === 'across'
          ? { row: clue.row, col: clue.col + i }
          : { row: clue.row + i, col: clue.col },
      )
      map.set(key, { ...map.get(key), [clue.direction]: clue })
    }
  }
  return map
}

function cellLabel(
  puzzle: PublicPuzzle,
  clues: ClueIndex,
  row: number,
  col: number,
  letter: string | null,
  classic: boolean,
) {
  const cell = puzzle.cells[row]?.[col]
  const where = `ligne ${row + 1}, colonne ${col + 1}`
  if (!cell || cell.block) return `Case noire, ${where}`
  const parts: string[] = []
  if (cell.number !== undefined && !classic) parts.push(`Case ${cell.number}`)
  parts.push(where, letter === null ? 'vide' : `lettre ${letter}`)
  const entry = clues.get(cellKey({ row, col }))
  if (entry?.across) parts.push(`${clueSpoken(entry.across, classic)} : ${entry.across.text}`)
  if (entry?.down) parts.push(`${clueSpoken(entry.down, classic)} : ${entry.down.text}`)
  return parts.join(', ')
}

function CrosswordGridImpl({ puzzle, game, onSelect, classic = false }: Props) {
  const palette = usePalette()
  const [width, setWidth] = useState(0)
  const clues = useMemo(() => indexClues(puzzle), [puzzle])
  const highlighted = highlightedCells(puzzle, game)
  const gutter = classic ? LABEL_WIDTH : 0
  const size = width > 0 ? Math.floor((width - gutter) / puzzle.width) : 0
  const labelStyle = [styles.label, { color: palette.muted }]

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.min(event.nativeEvent.layout.width, 560))
  }

  return (
    <View onLayout={onLayout} style={styles.wrapper}>
      {size > 0 && classic ? (
        // Repères décoratifs : chaque case annonce déjà sa ligne et sa colonne.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.row, { marginLeft: gutter }]}
        >
          {Array.from({ length: puzzle.width }, (_, col) => (
            <Text key={col} style={[labelStyle, { width: size, textAlign: 'center' }]}>
              {classicLineLabel('down', col)}
            </Text>
          ))}
        </View>
      ) : null}
      {size > 0 ? (
        <View style={styles.row}>
          {classic ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: gutter, paddingTop: 2 }}
            >
              {Array.from({ length: puzzle.height }, (_, row) => (
                <Text
                  key={row}
                  style={[labelStyle, styles.rowLabel, { height: size, lineHeight: size }]}
                >
                  {classicLineLabel('across', row)}
                </Text>
              ))}
            </View>
          ) : null}
          <View
            accessibilityLabel={`Grille ${puzzle.title}, ${puzzle.width} colonnes sur ${puzzle.height} lignes`}
            style={[styles.grid, { width: size * puzzle.width, borderColor: palette.block }]}
          >
            {puzzle.cells.map((line, row) => (
              <View key={row} style={styles.row}>
                {line.map((cell, col) => {
                  const key = cellKey({ row, col })
                  const letter = game.grid[row]?.[col] ?? null
                  if (cell.block) {
                    return (
                      <View
                        key={key}
                        accessibilityLabel={cellLabel(puzzle, clues, row, col, null, classic)}
                        style={{ width: size, height: size, backgroundColor: palette.block }}
                      />
                    )
                  }
                  const active = game.active?.row === row && game.active.col === col
                  const mark = game.marks.get(key)
                  const background = active
                    ? palette.cursor
                    : highlighted.has(key)
                      ? palette.word
                      : mark === 'incorrect'
                        ? palette.dangerSoft
                        : palette.cell
                  const letterColor =
                    mark === 'incorrect'
                      ? palette.danger
                      : game.revealed.has(key)
                        ? palette.revealed
                        : mark === 'correct'
                          ? palette.success
                          : active
                            ? palette.cursorFg
                            : palette.fg
                  return (
                    <Pressable
                      key={key}
                      testID={`cell-${row}-${col}`}
                      accessibilityRole="button"
                      accessibilityLabel={cellLabel(puzzle, clues, row, col, letter, classic)}
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        onSelect(row, col)
                      }}
                      style={[
                        styles.cell,
                        {
                          width: size,
                          height: size,
                          backgroundColor: background,
                          borderColor: palette.line,
                        },
                      ]}
                    >
                      {cell.number !== undefined && !classic ? (
                        <Text
                          style={[
                            styles.number,
                            { color: palette.muted, fontSize: Math.max(8, size * 0.24) },
                          ]}
                        >
                          {cell.number}
                        </Text>
                      ) : null}
                      <Text style={[styles.letter, { color: letterColor, fontSize: size * 0.55 }]}>
                        {letter ?? ''}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

export const CrosswordGrid = memo(CrosswordGridImpl)

const styles = StyleSheet.create({
  wrapper: { width: '100%', alignItems: 'center' },
  grid: { borderWidth: 2 },
  row: { flexDirection: 'row' },
  cell: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  number: { position: 'absolute', top: 1, left: 2, fontWeight: '600' },
  letter: { fontWeight: '700', textTransform: 'uppercase' },
  label: { fontSize: 11, fontWeight: '700' },
  rowLabel: { textAlign: 'right', paddingRight: 4 },
})
