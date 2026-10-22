import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Forme d'un jeton émis par `generateToken` : tout autre format est refusé sans requête en base. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** Jeton opaque de 256 bits, encodé en base64url. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 convient ici : le jeton a 256 bits d'entropie (ce n'est pas un mot de passe). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
