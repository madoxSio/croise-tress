import { emailSchema, passwordSchema, usernameSchema } from '@crossverse/contracts'
import { randomBytes } from 'node:crypto'
import type { Db } from '../../db.ts'
import { Prisma } from '../../generated/prisma/client.ts'
import { hashPassword, isCommonPassword } from '../auth/passwords.ts'

/**
 * Gestion des comptes en ligne de commande (`scripts/account.ts`), réservée à qui a accès au
 * serveur. C'est le seul moyen de créer un compte sans e-mail de confirmation ou de nommer un
 * administrateur : aucune route HTTP ne le permet (THREAT-MODEL T17).
 */

export class AccountError extends Error {}

/** Mot de passe aléatoire de 128 bits (base64url, 22 caractères). */
export function generatePassword(): string {
  return randomBytes(16).toString('base64url')
}

export interface CreatedAccount {
  readonly id: string
  readonly email: string
  readonly username: string
  readonly role: 'player' | 'admin'
}

/** Crée un compte complet, e-mail considéré comme confirmé (compte de test ou d'équipe). */
export async function createAccount(
  db: Db,
  input: { email: string; username: string; password: string; admin: boolean },
): Promise<CreatedAccount> {
  const email = emailSchema.safeParse(input.email)
  const username = usernameSchema.safeParse(input.username)
  const password = passwordSchema.safeParse(input.password)
  if (!email.success) throw new AccountError('Adresse e-mail invalide.')
  if (!username.success)
    throw new AccountError('Pseudo invalide (3 à 24 caractères : lettres, chiffres, _ ou -).')
  if (!password.success || isCommonPassword(input.password)) {
    throw new AccountError(
      'Mot de passe refusé : 12 caractères minimum et pas un mot de passe courant.',
    )
  }
  const role = input.admin ? 'admin' : 'player'
  try {
    const user = await db.user.create({
      data: {
        email: email.data,
        username: username.data,
        passwordHash: await hashPassword(password.data),
        emailVerifiedAt: new Date(),
        role,
      },
      select: { id: true },
    })
    await db.auditLog.create({
      data: { actorUserId: null, action: 'cli.account.create', target: user.id },
    })
    return { id: user.id, email: email.data, username: username.data, role }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AccountError('Cette adresse ou ce pseudo est déjà utilisé.')
    }
    throw error
  }
}

/**
 * Donne ou retire le rôle administrateur à un compte complet et confirmé. Retirer le rôle ferme
 * aussi ses sessions : un ancien administrateur ne garde aucun accès ouvert.
 */
export async function setRole(db: Db, email: string, admin: boolean): Promise<string> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) throw new AccountError('Adresse e-mail invalide.')
  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, passwordHash: true, emailVerifiedAt: true },
  })
  if (!user?.passwordHash || !user.emailVerifiedAt) {
    throw new AccountError('Aucun compte confirmé avec cette adresse.')
  }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { role: admin ? 'admin' : 'player' } }),
    ...(admin
      ? []
      : [
          db.session.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]),
    db.auditLog.create({
      data: {
        actorUserId: null,
        action: admin ? 'cli.role.grant' : 'cli.role.revoke',
        target: user.id,
      },
    }),
  ])
  return user.id
}
