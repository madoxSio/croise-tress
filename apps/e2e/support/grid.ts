/** Saisie dans une grille (solo ou duel) par la liste des définitions, comme au clavier. */
import type { Page } from '@playwright/test'
import type { Slot } from './puzzles.ts'

const directionLabel = { across: 'Horizontal', down: 'Vertical' } as const
const classicLabel = { across: 'Horizontalement', down: 'Verticalement' } as const

type ClueRef = Pick<Slot, 'direction' | 'number' | 'text' | 'classic'>

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Bouton de la définition `slot` : par son numéro dans une grille en croix, par son texte en
 * mots croisés classiques (plusieurs mots partagent la même ligne, sans numéro affiché).
 */
export function clueButton(page: Page, slot: ClueRef) {
  if (slot.classic) {
    return page
      .getByRole('region', { name: classicLabel[slot.direction], exact: true })
      .getByRole('button', { name: new RegExp(`: ${escape(slot.text)}\\s*, \\d+ lettres$`) })
  }
  return page
    .getByRole('region', { name: directionLabel[slot.direction], exact: true })
    .getByRole('button', { name: new RegExp(`^${slot.number}\\s`) })
}

/**
 * Sélectionne le mot (le curseur va sur sa première case vide, ou la première case s'il est
 * plein) puis tape `letters` : chaque lettre avance d'une case dans le mot.
 */
export async function typeInSlot(page: Page, slot: ClueRef, letters: string): Promise<void> {
  await clueButton(page, slot).click()
  await page.keyboard.type(letters)
}

/**
 * Remplit toute la grille avec la solution. `filled` contient les cases déjà justes
 * (« row:col ») ; on suit la même règle que le client : sélectionner un mot place le curseur
 * sur sa première case vide.
 */
export async function fillAll(page: Page, slots: readonly Slot[], filled: Set<string>) {
  for (const slot of slots) {
    const firstEmpty = slot.cells.findIndex((cell) => !filled.has(`${cell.row}:${cell.col}`))
    if (firstEmpty < 0) continue
    await typeInSlot(page, slot, slot.answer.slice(firstEmpty))
    slot.cells.slice(firstEmpty).forEach((cell) => filled.add(`${cell.row}:${cell.col}`))
  }
}
