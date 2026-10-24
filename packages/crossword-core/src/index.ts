export * from './types.js'
export { normalizeAnswer, normalizeLetter } from './normalize.js'
export {
  parsePuzzle,
  gridSlots,
  MIN_SIZE,
  MAX_SIZE,
  type PuzzleError,
  type PuzzleErrorCode,
} from './parse.js'
export { toPublicPuzzle } from './public.js'
export {
  createEmptyGrid,
  sanitizeGrid,
  setLetter,
  isOpenCell,
  findSlot,
  checkCell,
  checkSlot,
  checkGrid,
  isSolved,
  revealSlot,
  solutionAt,
  openCells,
  type CellCheck,
  type CheckedCell,
} from './grid.js'
export { slotCells, clueAt, resolveDirection, stepInClue, clueFromDrag } from './navigation.js'
export { computeScore, SCORE_RULES, type ScoreInput } from './score.js'
export {
  buildWordSearch,
  findPlacement,
  lineCells,
  snapToLine,
  wordSearchSteps,
  WORD_SEARCH_MAX_SIZE,
  type WordSearch,
  type WordSearchOptions,
  type WordSearchPlacement,
  type WordSearchStep,
} from './wordsearch.js'
