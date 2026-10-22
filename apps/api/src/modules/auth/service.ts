import { ERROR_CODES } from '@crossverse/contracts'
import type { Config } from '../../config.ts'
import type { Db } from '../../db.ts'
import { AppError, conflict } from '../../http/errors.ts'
import type { Mailer } from '../mail/mailer.ts'
import type { AuthContext, SessionService } from '../session/service.ts'
import { generateToken, hashToken } from '../session/tokens.ts'
import {
  getDummyHash,
  hashPassword,
  isCommonPassword,
  needsRehash,
  verifyPassword,
} from './passwords.ts'

const HOUR = 60 * 60 * 1000
const TTL = { register: 24 * HOUR, change_email: 24 * HOUR, reset_password: HOUR / 2 } as const

const invalidCredentials = (): AppError =>
  new AppError(401, ERROR_CODES.unauthenticated, 'E-mail ou mot de passe incorrect.')
const invalidToken = (): AppError =>
  new AppError(400, ERROR_CODES.validation, 'Lien invalide ou expiré.')

/**
 * Comptes : inscription confirmée par e-mail, connexion, mots de passe, changement d'e-mail,
 * suppression. Les réponses des opérations sensibles à l'énumération sont identiques
 * que le compte existe ou non ; les jetons ne sont ni renvoyés par l'API ni journalisés.
 */
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly sessions: SessionService,
    private readonly mailer: Mailer,
  ) {}

  /** Prépare l'inscription du compte invité courant ; le compte n'est complété qu'à la confirmation. */
  async register(
    auth: AuthContext,
    input: { email: string; username: string; password: string },
  ): Promise<void> {
    if (!auth.user.isGuest) throw conflict('Vous êtes déjà connecté à un compte.')
    this.assertStrongPassword(input.password)
    // Le pseudo est public : signaler qu'il est pris ne révèle rien de confidentiel.
    if (
      await this.db.user.findUnique({ where: { username: input.username }, select: { id: true } })
    ) {
      throw conflict('Ce pseudo est déjà utilisé.')
    }

    const existing = await this.db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    })
    if (existing) {
      await this.mailer.send({
        to: input.email,
        subject: 'Crossverse : vous avez déjà un compte',
        text: `Une inscription a été demandée avec cette adresse, qui possède déjà un compte.\n\nSi c'était vous, connectez-vous : ${this.config.webBaseUrl}/login\nMot de passe oublié ? ${this.config.webBaseUrl}/forgot-password\n\nSinon, ignorez ce message.`,
      })
      return
    }

    const token = await this.issueToken(auth.user.id, 'register', {
      pendingEmail: input.email,
      pendingUsername: input.username,
      pendingPasswordHash: await hashPassword(input.password),
    })
    await this.mailer.send({
      to: input.email,
      subject: 'Crossverse : confirmez votre adresse e-mail',
      text: `Bienvenue sur Crossverse !\n\nConfirmez votre adresse pour activer votre compte (lien valable 24 heures) :\n${this.config.webBaseUrl}/verify-email?token=${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    })
  }

  /** Confirme une inscription ou un changement d'e-mail. Renvoie l'utilisateur concerné. */
  async verifyEmail(token: string): Promise<string> {
    const row = await this.consumeToken(token, ['register', 'change_email'])
    const email = row.pendingEmail
    if (!email) throw invalidToken()
    try {
      if (row.purpose === 'register') {
        if (!row.pendingUsername || !row.pendingPasswordHash) throw invalidToken()
        await this.db.user.update({
          where: { id: row.userId, passwordHash: null },
          data: {
            email,
            username: row.pendingUsername,
            passwordHash: row.pendingPasswordHash,
            emailVerifiedAt: new Date(),
          },
        })
      } else {
        const previous = await this.db.user.findUniqueOrThrow({
          where: { id: row.userId },
          select: { email: true },
        })
        await this.db.user.update({
          where: { id: row.userId },
          data: { email, emailVerifiedAt: new Date() },
        })
        if (previous.email) {
          await this.mailer.send({
            to: previous.email,
            subject: 'Crossverse : adresse e-mail modifiée',
            text: `L'adresse e-mail de votre compte a été remplacée.\n\nSi vous n'êtes pas à l'origine de ce changement, réinitialisez votre mot de passe : ${this.config.webBaseUrl}/forgot-password`,
          })
        }
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      // E-mail ou pseudo pris entre-temps (contrainte unique), ou compte déjà complété.
      throw conflict('Cette adresse ou ce pseudo n’est plus disponible.')
    }
    return row.userId
  }

  async login(email: string, password: string): Promise<string> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    })
    if (!user?.passwordHash) {
      await verifyPassword(await getDummyHash(), password)
      throw invalidCredentials()
    }
    if (!(await verifyPassword(user.passwordHash, password))) throw invalidCredentials()
    if (needsRehash(user.passwordHash)) {
      await this.db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      })
    }
    return user.id
  }

  /**
   * Transfère la progression d'un invité vers le compte où il vient de se connecter, puis
   * supprime l'invité. En cas de partie en cours sur le même puzzle des deux côtés, celle du
   * compte est conservée (index unique partiel) ; favoris et succès sont fusionnés sans doublon,
   * les préférences du compte priment. Ne fait rien si `guestId` n'est pas (ou plus) un invité.
   */
  async mergeGuest(guestId: string, userId: string): Promise<void> {
    if (guestId === userId) return
    await this.db.$transaction(async (tx) => {
      const guest = await tx.user.findUnique({
        where: { id: guestId },
        select: { passwordHash: true },
      })
      if (guest?.passwordHash !== null) return
      const accountInProgress = await tx.playSession.findMany({
        where: { userId, status: 'in_progress' },
        select: { puzzleId: true },
      })
      await tx.playSession.deleteMany({
        where: {
          userId: guestId,
          status: 'in_progress',
          puzzleId: { in: accountInProgress.map((s) => s.puzzleId) },
        },
      })
      await tx.playSession.updateMany({ where: { userId: guestId }, data: { userId } })
      const favorites = await tx.favorite.findMany({ where: { userId: guestId } })
      await tx.favorite.createMany({
        data: favorites.map((f) => ({ ...f, userId })),
        skipDuplicates: true,
      })
      const achievements = await tx.userAchievement.findMany({ where: { userId: guestId } })
      await tx.userAchievement.createMany({
        data: achievements.map((a) => ({ ...a, userId })),
        skipDuplicates: true,
      })
      // Supprime l'invité et, par cascade, ses sessions et données restantes (doublons).
      await tx.user.delete({ where: { id: guestId } })
    })
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    })
    if (!user?.passwordHash) return
    const token = await this.issueToken(user.id, 'reset_password', {})
    await this.mailer.send({
      to: email,
      subject: 'Crossverse : réinitialisation du mot de passe',
      text: `Pour choisir un nouveau mot de passe (lien valable 30 minutes) :\n${this.config.webBaseUrl}/reset-password?token=${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    })
  }

  async resetPassword(token: string, password: string): Promise<void> {
    this.assertStrongPassword(password)
    const row = await this.consumeToken(token, ['reset_password'])
    const user = await this.db.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password) },
      select: { email: true },
    })
    await this.sessions.revokeAll(row.userId)
    await this.invalidateTokens(row.userId, 'reset_password')
    if (user.email) {
      await this.mailer.send({
        to: user.email,
        subject: 'Crossverse : mot de passe modifié',
        text: 'Le mot de passe de votre compte vient d’être modifié et toutes vos sessions ont été fermées.',
      })
    }
  }

  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.verifyCurrentPassword(auth, currentPassword)
    this.assertStrongPassword(newPassword)
    await this.db.user.update({
      where: { id: auth.user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    })
    await this.sessions.revokeAll(auth.user.id, auth.sessionId)
  }

  async requestEmailChange(auth: AuthContext, password: string, newEmail: string): Promise<void> {
    await this.verifyCurrentPassword(auth, password)
    const taken = await this.db.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    })
    // Réponse identique si l'adresse est prise : on ne l'annonce pas, aucun e-mail de confirmation.
    if (taken) return
    const token = await this.issueToken(auth.user.id, 'change_email', { pendingEmail: newEmail })
    await this.mailer.send({
      to: newEmail,
      subject: 'Crossverse : confirmez votre nouvelle adresse',
      text: `Confirmez cette adresse pour l'associer à votre compte (lien valable 24 heures) :\n${this.config.webBaseUrl}/verify-email?token=${token}`,
    })
  }

  async deleteAccount(auth: AuthContext, password: string): Promise<void> {
    await this.verifyCurrentPassword(auth, password)
    // Cascade : sessions, jetons et parties sont supprimés avec le compte.
    await this.db.user.delete({ where: { id: auth.user.id } })
  }

  private async verifyCurrentPassword(auth: AuthContext, password: string): Promise<void> {
    if (auth.user.isGuest)
      throw new AppError(403, ERROR_CODES.forbidden, 'Action réservée aux comptes.')
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { passwordHash: true },
    })
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      throw new AppError(403, ERROR_CODES.forbidden, 'Mot de passe incorrect.')
    }
  }

  private assertStrongPassword(password: string): void {
    if (isCommonPassword(password)) {
      throw new AppError(
        400,
        ERROR_CODES.validation,
        'Ce mot de passe est trop courant, choisissez-en un autre.',
      )
    }
  }

  /** Émet un jeton à usage unique ; les jetons précédents du même type sont invalidés. */
  private async issueToken(
    userId: string,
    purpose: keyof typeof TTL,
    pending: { pendingEmail?: string; pendingUsername?: string; pendingPasswordHash?: string },
  ): Promise<string> {
    const token = generateToken()
    await this.db.$transaction([
      this.db.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.db.authToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TTL[purpose]),
          ...pending,
        },
      }),
    ])
    return token
  }

  /** Consomme un jeton de façon atomique : une seule requête concurrente peut l'utiliser. */
  private async consumeToken(token: string, purposes: (keyof typeof TTL)[]) {
    const tokenHash = hashToken(token)
    const now = new Date()
    const claimed = await this.db.authToken.updateMany({
      where: { tokenHash, purpose: { in: purposes }, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (claimed.count !== 1) throw invalidToken()
    return this.db.authToken.findUniqueOrThrow({ where: { tokenHash } })
  }

  private async invalidateTokens(userId: string, purpose: keyof typeof TTL): Promise<void> {
    await this.db.authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    })
  }
}
