import { ERROR_CODES, type AdminCreateUserBody, type AdminUserSummary } from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import { AppError, conflict, notFound } from '../../http/errors.ts'
import type { SessionService } from '../session/service.ts'
import { AccountError, createAccount, generatePassword } from './accounts.ts'
import { toUserSummary, userSummarySelect } from './service.ts'

const forbidden = (message: string): AppError => new AppError(403, ERROR_CODES.forbidden, message)

/**
 * Actions d'un administrateur sur les comptes : suspension, réactivation, fermeture des
 * sessions, création. Un administrateur ne peut agir ni sur lui-même ni sur un autre
 * administrateur (pas de verrouillage mutuel) ; le rôle admin ne se donne qu'en ligne de
 * commande (THREAT-MODEL T17).
 */
export class AdminUserService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly now: () => Date,
    /** Coupe les connexions temps réel encore ouvertes (passerelle Socket.IO). */
    private readonly disconnectLive: (userId: string) => void,
  ) {}

  /** Suspend un compte complet : sessions fermées, connexion refusée jusqu'à la réactivation. */
  async suspend(actorId: string, userId: string, reason: string | undefined): Promise<void> {
    await this.assertManageable(actorId, userId)
    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: { suspendedAt: this.now(), suspendedReason: reason ?? null },
      }),
      this.db.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: this.now() },
      }),
      // Un joueur suspendu ne doit plus être apparié en duel.
      this.db.matchQueueEntry.deleteMany({ where: { userId } }),
    ])
    this.disconnectLive(userId)
  }

  async reactivate(actorId: string, userId: string): Promise<void> {
    await this.assertManageable(actorId, userId)
    await this.db.user.update({
      where: { id: userId },
      data: { suspendedAt: null, suspendedReason: null },
    })
  }

  /** Ferme toutes les sessions d'un joueur (appareil perdu, compte compromis). */
  async revokeSessions(actorId: string, userId: string): Promise<void> {
    await this.assertManageable(actorId, userId)
    await this.sessions.revokeAll(userId)
    this.disconnectLive(userId)
  }

  /**
   * Crée un compte joueur confirmé. Sans mot de passe fourni, un mot de passe aléatoire
   * inutilisable est posé et `needsPasswordEmail` demande l'envoi du lien de choix.
   */
  async create(
    body: AdminCreateUserBody,
  ): Promise<{ user: AdminUserSummary; needsPasswordEmail: boolean }> {
    try {
      const account = await createAccount(this.db, {
        email: body.email,
        username: body.username,
        password: body.password ?? generatePassword(),
        admin: false,
      })
      const row = await this.db.user.findUniqueOrThrow({
        where: { id: account.id },
        select: userSummarySelect,
      })
      return {
        user: toUserSummary(row, undefined),
        needsPasswordEmail: body.password === undefined,
      }
    } catch (error) {
      if (error instanceof AccountError) {
        throw error.message.includes('déjà')
          ? conflict(error.message)
          : new AppError(400, ERROR_CODES.validation, error.message)
      }
      throw error
    }
  }

  private async assertManageable(actorId: string, userId: string): Promise<void> {
    if (actorId === userId) throw forbidden('Action impossible sur votre propre compte.')
    const target = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true, passwordHash: true },
    })
    if (!target) throw notFound('Utilisateur introuvable.')
    if (target.role === 'admin') {
      throw forbidden('Un administrateur se gère en ligne de commande (rôle à retirer d’abord).')
    }
    if (target.passwordHash === null) throw forbidden('Un invité n’a pas de compte à gérer.')
  }
}
