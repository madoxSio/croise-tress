/**
 * Appels de l'espace d'administration. Le serveur vérifie le rôle à chaque requête ;
 * côté client, rien n'est une autorisation : ces fonctions échouent (404) pour un joueur.
 */
import {
  adminCreatedUserSchema,
  adminMeSchema,
  adminOverviewSchema,
  adminPuzzleListSchema,
  adminPuzzleSchema,
  adminUserDetailSchema,
  adminUserListSchema,
  auditListSchema,
} from '@crossverse/contracts'
import type {
  AdminCreateUserBody,
  AdminCreatedUser,
  AdminOverview,
  AdminPuzzle,
  AdminPuzzleBody,
  AdminPuzzleList,
  AdminUserDetail,
  AdminUserList,
  AuditList,
  PuzzleStatus,
} from '@crossverse/contracts'
import { z } from 'zod'
import { ApiRequestError, query, request, segment } from './api'

const noContentSchema = z.undefined()

export const adminApi = {
  /** Vrai si la session courante est administrateur ; faux (404) pour tout autre compte. */
  async isAdmin(): Promise<boolean> {
    try {
      await request('GET', '/admin/me', adminMeSchema)
      return true
    } catch (error) {
      if (error instanceof ApiRequestError && error.isNotFound) return false
      throw error
    }
  },

  overview(): Promise<AdminOverview> {
    return request('GET', '/admin/overview', adminOverviewSchema)
  },

  listUsers(params: {
    search?: string
    guests?: boolean
    suspended?: boolean
    cursor?: string
  }): Promise<AdminUserList> {
    return request(
      'GET',
      `/admin/users${query({
        search: params.search,
        guests: params.guests ? 'true' : undefined,
        suspended: params.suspended ? 'true' : undefined,
        cursor: params.cursor,
      })}`,
      adminUserListSchema,
    )
  },

  getUser(id: string): Promise<AdminUserDetail> {
    return request('GET', `/admin/users/${segment(id)}`, adminUserDetailSchema)
  },

  /** Sans mot de passe, le titulaire reçoit un lien pour choisir le sien. */
  createUser(body: AdminCreateUserBody): Promise<AdminCreatedUser> {
    return request('POST', '/admin/users', adminCreatedUserSchema, { body })
  },

  async suspendUser(id: string, reason?: string): Promise<void> {
    await request('POST', `/admin/users/${segment(id)}/suspend`, noContentSchema, {
      body: reason ? { reason } : {},
    })
  },

  async reactivateUser(id: string): Promise<void> {
    await request('POST', `/admin/users/${segment(id)}/reactivate`, noContentSchema)
  },

  async revokeUserSessions(id: string): Promise<void> {
    await request('POST', `/admin/users/${segment(id)}/revoke-sessions`, noContentSchema)
  },

  listPuzzles(params: { status?: PuzzleStatus; cursor?: string }): Promise<AdminPuzzleList> {
    return request(
      'GET',
      `/admin/puzzles${query({ status: params.status, cursor: params.cursor })}`,
      adminPuzzleListSchema,
    )
  },

  getPuzzle(id: string): Promise<AdminPuzzle> {
    return request('GET', `/admin/puzzles/${segment(id)}`, adminPuzzleSchema)
  },

  createPuzzle(body: AdminPuzzleBody): Promise<AdminPuzzle> {
    return request('POST', '/admin/puzzles', adminPuzzleSchema, { body })
  },

  updatePuzzle(id: string, body: AdminPuzzleBody): Promise<AdminPuzzle> {
    return request('PUT', `/admin/puzzles/${segment(id)}`, adminPuzzleSchema, { body })
  },

  setPuzzleStatus(id: string, status: PuzzleStatus): Promise<AdminPuzzle> {
    return request('PUT', `/admin/puzzles/${segment(id)}/status`, adminPuzzleSchema, {
      body: { status },
    })
  },

  auditLog(cursor?: string): Promise<AuditList> {
    return request('GET', `/admin/audit${query({ cursor })}`, auditListSchema)
  },
}
