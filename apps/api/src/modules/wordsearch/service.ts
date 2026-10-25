import { randomInt } from 'node:crypto'
import {
  buildWordSearch,
  findPlacement,
  type Position,
  type WordSearch,
  type WordSearchPlacement,
} from '@crossverse/crossword-core'
import type {
  Difficulty,
  WordSearchClueRef,
  WordSearchDto,
  WordSearchHit,
} from '@crossverse/contracts'
import { notFound } from '../../http/errors.ts'
import type { PuzzleRepository } from '../puzzles/repository.ts'

/** Sens autorisés par difficulté : les niveaux simples restent en lecture naturelle. */
export function directionsFor(difficulty: Difficulty): { diagonals: boolean; reversed: boolean } {
  switch (difficulty) {
    case 'discovery':
    case 'easy':
      return { diagonals: false, reversed: false }
    case 'intermediate':
      return { diagonals: true, reversed: false }
    case 'hard':
    case 'expert':
      return { diagonals: true, reversed: true }
  }
}

const SEED_MAX = 2_147_483_647

function toHit(placement: WordSearchPlacement): WordSearchHit {
  const { direction, number, answer, start, end } = placement
  return { direction, number, answer, start, end }
}

/**
 * Grille pré-remplie (façon mots mêlés) d'un puzzle publié. Sans état : la disposition se
 * recalcule depuis la graine à chaque requête (quelques millisecondes), rien n'est stocké.
 * Mode d'entraînement : aucune récompense, aucun score officiel, aucune progression.
 */
export class WordSearchService {
  constructor(
    private readonly puzzles: PuzzleRepository,
    /** Refuse une grille de parcours encore verrouillée pour ce joueur (même règle que le solo). */
    private readonly assertCanStart: (userId: string, puzzleId: string) => Promise<void>,
  ) {}

  private async load(
    userId: string,
    puzzleId: string,
    seed: number,
  ): Promise<{ search: WordSearch; dto: WordSearchDto }> {
    const loaded = await this.puzzles.findPublished(puzzleId)
    if (!loaded) throw notFound('Puzzle introuvable.')
    await this.assertCanStart(userId, puzzleId)
    const directions = directionsFor(loaded.summary.difficulty)
    const search = buildWordSearch(loaded.puzzle, { seed, ...directions })
    const dto: WordSearchDto = {
      puzzleId,
      seed,
      format: loaded.summary.format,
      size: search.size,
      rows: [...search.rows],
      directions,
      clues: loaded.puzzle.clues.map((clue) => ({
        direction: clue.direction,
        number: clue.number,
        text: clue.text,
        length: clue.slot.length,
        row: clue.slot.start.row,
        col: clue.slot.start.col,
      })),
    }
    return { search, dto }
  }

  /** Sans graine, en tire une nouvelle : chaque partie a sa propre disposition. */
  async get(userId: string, puzzleId: string, seed = randomInt(SEED_MAX)): Promise<WordSearchDto> {
    return (await this.load(userId, puzzleId, seed)).dto
  }

  async check(
    userId: string,
    puzzleId: string,
    input: {
      seed: number
      from: Position
      to: Position
      found: readonly WordSearchClueRef[]
    },
  ): Promise<WordSearchHit | null> {
    const { search } = await this.load(userId, puzzleId, input.seed)
    const isFound = (p: WordSearchPlacement): boolean =>
      input.found.some((ref) => ref.direction === p.direction && ref.number === p.number)
    const placement = findPlacement(search, input.from, input.to, isFound)
    return placement ? toHit(placement) : null
  }

  /** « Je donne ma langue au chat » : montre où se cache le mot d'une définition. */
  async reveal(
    userId: string,
    puzzleId: string,
    input: WordSearchClueRef & { seed: number },
  ): Promise<WordSearchHit> {
    const { search } = await this.load(userId, puzzleId, input.seed)
    const placement = search.placements.find(
      (p) => p.direction === input.direction && p.number === input.number,
    )
    if (!placement) throw notFound('Définition introuvable.')
    return toHit(placement)
  }
}
