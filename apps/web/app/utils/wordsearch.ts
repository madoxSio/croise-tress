/**
 * Couleurs de surligneur des mots trouvés, dans l'ordre de découverte. Translucides : la lettre
 * reste lisible par-dessus, en clair comme en sombre. Un mot révélé reste gris (pas « gagné »).
 */
const HIGHLIGHTERS = [
  'rgb(255 216 77 / 0.55)',
  'rgb(120 200 255 / 0.5)',
  'rgb(255 143 163 / 0.5)',
  'rgb(160 235 80 / 0.5)',
  'rgb(176 150 255 / 0.5)',
  'rgb(255 170 90 / 0.5)',
  'rgb(90 220 180 / 0.5)',
  'rgb(245 150 235 / 0.5)',
] as const

const REVEALED = 'rgb(140 135 165 / 0.38)'

export function hitColor(word: { order: number; revealed: boolean }): string {
  if (word.revealed) return REVEALED
  return HIGHLIGHTERS[word.order % HIGHLIGHTERS.length] ?? HIGHLIGHTERS[0]
}
