/** Entrée d'un menu d'actions (`ActionMenu`). */
export interface MenuItem {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly danger?: boolean
  readonly disabled?: boolean
}
