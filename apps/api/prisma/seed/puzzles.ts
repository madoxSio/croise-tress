import type { Difficulty, PuzzleFormat } from '@crossverse/contracts'
import type { PuzzleSource } from '@crossverse/crossword-core'

export interface SeedPuzzle extends Omit<PuzzleSource, 'id'> {
  readonly slug: string
  /** Slug d'un thème de `SEED_THEMES` (en pratique un sous-thème). */
  readonly theme: string
  readonly difficulty: Difficulty
  /** Absent = grille « en croix ». */
  readonly format?: PuzzleFormat
  readonly estimatedMinutes: number
}

/**
 * Grilles de découverte (utilisées aussi par les tests d'intégration) : grilles 5×5 symétriques (mot horizontal n = mot vertical n).
 * Contenu vérifié par le moteur (test `seed.test.ts`), non validé éditorialement.
 */
export const SEED_PUZZLES: readonly SeedPuzzle[] = [
  {
    slug: 'la-table',
    title: 'La table',
    theme: 'maison',
    difficulty: 'discovery',
    estimatedMinutes: 3,
    grid: ['TABLE', 'A#A#L', 'BALLE', 'L#L#V', 'ELEVE'],
    clues: [
      { direction: 'across', number: 1, text: 'Meuble à quatre pieds' },
      { direction: 'across', number: 4, text: 'Projectile de tennis' },
      { direction: 'across', number: 5, text: 'Il apprend en classe' },
      { direction: 'down', number: 1, text: 'On s’y met pour dîner' },
      {
        direction: 'down',
        number: 2,
        text: 'Enveloppe du grain',
        explanation: 'La balle du blé est retirée au battage.',
      },
      {
        direction: 'down',
        number: 3,
        text: 'Haut placé',
        explanation: 'Participe passé d’« élever ».',
      },
    ],
  },
  {
    slug: 'le-salon',
    title: 'Le salon',
    theme: 'maison',
    difficulty: 'discovery',
    estimatedMinutes: 3,
    grid: ['SALON', 'A#A#A', 'LAPIN', 'O#I#T', 'NANTI'],
    clues: [
      { direction: 'across', number: 1, text: 'Pièce où l’on reçoit' },
      { direction: 'across', number: 4, text: 'Il a de grandes oreilles' },
      { direction: 'across', number: 5, text: 'Qui ne manque de rien' },
      { direction: 'down', number: 1, text: 'Exposition d’art ou de livres' },
      {
        direction: 'down',
        number: 2,
        text: 'Rongeur… qui n’en est pas un',
        explanation: 'Le lapin est un lagomorphe, pas un rongeur.',
      },
      { direction: 'down', number: 3, text: 'Pourvu, à l’abri du besoin' },
    ],
  },
  {
    slug: 'motif-floral',
    title: 'Motif floral',
    theme: 'nature',
    difficulty: 'easy',
    estimatedMinutes: 4,
    grid: ['MOTIF', 'O#A#L', 'TARTE', 'I#T#U', 'FLEUR'],
    clues: [
      { direction: 'across', number: 1, text: 'Dessin répété sur un tissu' },
      { direction: 'across', number: 4, text: 'Dessert aux pommes' },
      { direction: 'across', number: 5, text: 'Rose ou tulipe' },
      { direction: 'down', number: 1, text: 'Raison d’agir' },
      { direction: 'down', number: 2, text: 'Elle peut être tatin' },
      { direction: 'down', number: 3, text: 'Elle éclot au printemps' },
    ],
  },
  {
    slug: 'a-la-plage',
    title: 'À la plage',
    theme: 'voyages',
    difficulty: 'easy',
    estimatedMinutes: 4,
    grid: ['PLAGE', 'L#R#P', 'ARBRE', 'G#R#E', 'EPEES'],
    clues: [
      { direction: 'across', number: 1, text: 'Étendue de sable au bord de l’eau' },
      { direction: 'across', number: 4, text: 'Chêne ou bouleau' },
      { direction: 'across', number: 5, text: 'Armes des mousquetaires' },
      { direction: 'down', number: 1, text: 'On y bronze' },
      { direction: 'down', number: 2, text: 'Il a des racines et des branches' },
      { direction: 'down', number: 3, text: 'Elles se croisent en escrime' },
    ],
  },
  {
    slug: 'chien-fidele',
    title: 'Chien fidèle',
    theme: 'nature',
    difficulty: 'easy',
    estimatedMinutes: 4,
    grid: ['CHIEN', 'H#D#I', 'IDOLE', 'E#L#C', 'NIECE'],
    clues: [
      { direction: 'across', number: 1, text: 'Meilleur ami de l’homme' },
      { direction: 'across', number: 4, text: 'Star adulée' },
      { direction: 'across', number: 5, text: 'Fille du frère' },
      { direction: 'down', number: 1, text: 'Il aboie' },
      {
        direction: 'down',
        number: 2,
        text: 'Statue vénérée',
        explanation: 'Au sens premier, image d’une divinité que l’on adore.',
      },
      { direction: 'down', number: 3, text: 'Parente proche' },
    ],
  },
  {
    slug: 'en-route',
    title: 'En route',
    theme: 'voyages',
    difficulty: 'intermediate',
    estimatedMinutes: 5,
    grid: ['ROUTE', 'O#S#V', 'USINE', 'T#N#I', 'EVEIL'],
    clues: [
      { direction: 'across', number: 1, text: 'Voie goudronnée' },
      { direction: 'across', number: 4, text: 'Lieu de production industrielle' },
      { direction: 'across', number: 5, text: 'Sortie du sommeil' },
      { direction: 'down', number: 1, text: 'Itinéraire' },
      { direction: 'down', number: 2, text: 'Fabrique' },
      { direction: 'down', number: 3, text: 'Réveil des sens' },
    ],
  },
]
