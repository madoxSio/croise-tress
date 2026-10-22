import type { PuzzleSource } from '../src/index.js'

/** Grille 5×5 symétrique : les mots horizontaux et verticaux sont identiques. */
export const TABLE_PUZZLE: PuzzleSource = {
  id: 'demo-table',
  title: 'Table',
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
    { direction: 'down', number: 3, text: 'Haut placé' },
  ],
}
