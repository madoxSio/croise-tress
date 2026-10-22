const LIGATURES: Readonly<Record<string, string>> = { Œ: 'OE', Æ: 'AE', ß: 'SS', ẞ: 'SS' }

/** Caractères ignorés dans une réponse : espaces, apostrophes et traits d'union. */
const IGNORED = /[\s'’ʼ‘\-‐‑–—]/gu
const COMBINING_MARKS = /\p{M}/gu
const ONLY_LETTERS = /^[A-Z]*$/

/**
 * Normalise une réponse saisie ou éditoriale selon les règles du jeu :
 * majuscules, accents et cédilles retirés, ligatures développées (Œ → OE),
 * espaces, apostrophes et traits d'union ignorés.
 * Renvoie `null` si un caractère hors A–Z subsiste (chiffre, ponctuation…).
 */
export function normalizeAnswer(input: string): string | null {
  const upper = input.replace(IGNORED, '').toUpperCase()
  const expanded = Array.from(upper, (ch) => LIGATURES[ch] ?? ch).join('')
  const stripped = expanded.normalize('NFD').replace(COMBINING_MARKS, '')
  return ONLY_LETTERS.test(stripped) ? stripped : null
}

/** Normalise la saisie d'une seule case : une lettre A–Z, sinon `null`. */
export function normalizeLetter(input: string): string | null {
  const normalized = normalizeAnswer(input)
  return normalized?.length === 1 ? normalized : null
}
