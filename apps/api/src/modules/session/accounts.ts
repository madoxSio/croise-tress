import type { Db } from '../../db.ts'

/** Compte confirmé (ni invité, ni inscription en attente de confirmation d'e-mail). */
export async function isConfirmedAccount(db: Db, userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, emailVerifiedAt: true },
  })
  if (!user) return false
  return user.passwordHash !== null && user.emailVerifiedAt !== null
}
