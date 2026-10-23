/**
 * Invitation à créer un compte, ouverte depuis n'importe quel écran quand un invité touche
 * une fonction réservée (duel, historique, favoris…). Une seule fenêtre, montée dans le
 * layout. Le serveur refuse de toute façon ces actions aux invités : c'est une explication.
 */
export interface AccountGateRequest {
  readonly title: string
  readonly reason: string
}

export function useAccountGate() {
  const request = useState<AccountGateRequest | null>('account-gate', () => null)

  function open(next: AccountGateRequest): void {
    request.value = next
  }

  function close(): void {
    request.value = null
  }

  return { request: readonly(request), open, close }
}
