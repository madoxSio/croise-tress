import argon2 from 'argon2'

/**
 * Argon2id, paramètres minimaux recommandés par OWASP (m = 19 MiB, t = 2, p = 1).
 * À recalibrer sur la machine de production (cible : 100 à 300 ms par hachage).
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

/** Mots de passe trop courants refusés même s'ils respectent la longueur minimale. */
const COMMON = new Set([
  '123456789012',
  '1234567890123',
  'motdepasse123',
  'motdepassemotdepasse',
  'password1234',
  'passwordpassword',
  'azertyuiopqs',
  'azertyuiop123',
  'qwertyuiop12',
  'qwertyuiop123',
  'crossverse123',
  'iloveyou1234',
  'aaaaaaaaaaaa',
  'abcdefghijkl',
  'abc123abc123',
  'soleil123456',
  'bonjour12345',
  'administrator',
  'admin1234567',
  'welcome12345',
])

export function normalizePassword(password: string): string {
  return password.normalize('NFKC')
}

export function isCommonPassword(password: string): boolean {
  const lower = normalizePassword(password).toLowerCase()
  return COMMON.has(lower) || /^(.)\1+$/u.test(lower)
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(normalizePassword(password), OPTIONS)
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, normalizePassword(password))
  } catch {
    return false
  }
}

export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, OPTIONS)
}

/** Hash factice vérifié quand le compte n'existe pas, pour égaliser le temps de réponse. */
let dummyHash: Promise<string> | undefined
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('crossverse-dummy-password-for-timing')
  return dummyHash
}
