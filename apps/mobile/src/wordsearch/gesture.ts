import type { Position } from '@crossverse/crossword-core'
import { PanResponder, type LayoutChangeEvent, type PanResponderInstance } from 'react-native'
import { previewCells, type Selection } from './state'

export interface Drag {
  readonly from: Position
  readonly to: Position
}

export interface GestureHandlers {
  readonly onDrag: (drag: Drag | null) => void
  readonly onTap: (position: Position) => void
  readonly onSelect: (selection: Selection) => void
}

/**
 * Glisser sur la grille pré-remplie : retrouve les cases visées à partir de la taille mesurée
 * de la grille. Objet stable (créé une fois par écran) : l'écran lui transmet à chaque rendu la
 * taille de la grille et ses gestionnaires du moment.
 */
export class WordSearchGesture {
  private size = 0
  private width = 0
  private drag: Drag | null = null
  private handlers: GestureHandlers | null = null

  readonly responder: PanResponderInstance = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      const start = this.positionAt(event.nativeEvent.locationX, event.nativeEvent.locationY)
      this.setDrag(start ? { from: start, to: start } : null)
    },
    onPanResponderMove: (_event, gesture) => {
      const current = this.drag
      if (!current || this.size === 0) return
      const cell = this.width / this.size
      // Déplacement relatif au point de départ : `locationX` change de repère pendant le geste.
      const to = this.positionAt(
        (current.from.col + 0.5) * cell + gesture.dx,
        (current.from.row + 0.5) * cell + gesture.dy,
      )
      if (to && (to.row !== current.to.row || to.col !== current.to.col)) {
        this.setDrag({ ...current, to })
      }
    },
    onPanResponderRelease: () => {
      const current = this.drag
      this.setDrag(null)
      if (!current) return
      const cells = previewCells(current.from, current.to, this.size)
      const end = cells.at(-1) ?? current.from
      if (cells.length < 2) this.handlers?.onTap(current.from)
      else this.handlers?.onSelect({ from: current.from, to: end })
    },
    onPanResponderTerminate: () => {
      this.setDrag(null)
    },
  })

  sync(size: number, handlers: GestureHandlers): void {
    this.size = size
    this.handlers = handlers
  }

  readonly onLayout = (event: LayoutChangeEvent): void => {
    this.width = event.nativeEvent.layout.width
  }

  private setDrag(drag: Drag | null): void {
    this.drag = drag
    this.handlers?.onDrag(drag)
  }

  private positionAt(x: number, y: number): Position | null {
    if (this.size === 0 || this.width === 0) return null
    const cell = this.width / this.size
    const clamp = (value: number): number => Math.min(this.size - 1, Math.max(0, Math.floor(value)))
    return { row: clamp(y / cell), col: clamp(x / cell) }
  }
}
