import {
  ERROR_CODES,
  type PointReason,
  type PointTransactionPage,
  type WalletDto,
} from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import type { Prisma } from '../../generated/prisma/client.ts'
import { AppError } from '../../http/errors.ts'
import { isConfirmedAccount } from '../session/accounts.ts'
import { POINT_RULES, POINTS } from './rules.ts'

export type Tx = Prisma.TransactionClient

export interface PointEntry {
  readonly userId: string
  /** Positif pour un gain, négatif pour une dépense. */
  readonly amount: number
  readonly reason: PointReason
  /** Unique par joueur : une même récompense ou un même achat n'est jamais compté deux fois. */
  readonly key: string
  /** Horodatage de l'écriture (horloge du service appelant) ; maintenant par défaut. */
  readonly at?: Date
}

/**
 * Portefeuille de Coumba points. Le solde ne change que dans la transaction qui écrit la ligne
 * correspondante du journal ; la ligne du portefeuille est verrouillée (`FOR UPDATE`) pour
 * sérialiser les opérations d'un même joueur, et une contrainte CHECK interdit un solde négatif.
 */
export class PointsService {
  constructor(private readonly db: Db) {}

  /** Seuls les comptes confirmés gagnent et dépensent des points (pas les invités). */
  isEligible(userId: string): Promise<boolean> {
    return isConfirmedAccount(this.db, userId)
  }

  /**
   * Applique une écriture dans la transaction `tx`. Renvoie false si la clé a déjà été utilisée
   * (rien n'est modifié) ; lève `insufficient_points` si le solde deviendrait négatif.
   */
  async apply(tx: Tx, entry: PointEntry): Promise<boolean> {
    await tx.$executeRaw`INSERT INTO wallets (user_id, updated_at) VALUES (${entry.userId}::uuid, now()) ON CONFLICT DO NOTHING`
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      SELECT balance FROM wallets WHERE user_id = ${entry.userId}::uuid FOR UPDATE`
    const balanceAfter = (rows[0]?.balance ?? 0) + entry.amount
    if (balanceAfter < 0) {
      throw new AppError(409, ERROR_CODES.insufficientPoints, 'Coumba points insuffisants.')
    }
    const inserted = await tx.pointTransaction.createMany({
      data: [
        {
          userId: entry.userId,
          amount: entry.amount,
          balanceAfter,
          reason: entry.reason,
          idempotencyKey: entry.key,
          ...(entry.at ? { createdAt: entry.at } : {}),
        },
      ],
      skipDuplicates: true,
    })
    if (inserted.count === 0) return false
    await tx.wallet.update({
      where: { userId: entry.userId },
      data: {
        balance: balanceAfter,
        ...(entry.amount > 0
          ? { earned: { increment: entry.amount } }
          : { spent: { increment: -entry.amount } }),
      },
    })
    return true
  }

  /** Solde courant (0 sans portefeuille). */
  async balance(tx: Tx, userId: string): Promise<number> {
    const wallet = await tx.wallet.findUnique({ where: { userId }, select: { balance: true } })
    return wallet?.balance ?? 0
  }

  /** Gain isolé, dans sa propre transaction. */
  credit(entry: PointEntry): Promise<boolean> {
    return this.db.$transaction((tx) => this.apply(tx, entry))
  }

  /** Bonus de bienvenue, versé une seule fois au premier contact d'un compte confirmé. */
  grantWelcome(userId: string): Promise<boolean> {
    return this.credit({ userId, amount: POINTS.welcome, reason: 'welcome', key: 'welcome' })
  }

  async wallet(userId: string): Promise<WalletDto> {
    const eligible = await this.isEligible(userId)
    if (!eligible) return { eligible, balance: 0, earned: 0, spent: 0, rules: POINT_RULES }
    await this.grantWelcome(userId)
    const wallet = await this.db.wallet.findUnique({
      where: { userId },
      select: { balance: true, earned: true, spent: true },
    })
    return {
      eligible,
      balance: wallet?.balance ?? 0,
      earned: wallet?.earned ?? 0,
      spent: wallet?.spent ?? 0,
      rules: POINT_RULES,
    }
  }

  async transactions(
    userId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<PointTransactionPage> {
    const rows = await this.db.pointTransaction.findMany({
      where: { userId },
      // Identifiants UUIDv7 : l'ordre des identifiants est l'ordre chronologique.
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, amount: true, balanceAfter: true, reason: true, createdAt: true },
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return {
      items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    }
  }
}
