/**
 * Appels de l'espace d'administration. Le serveur vérifie le rôle à chaque requête ;
 * côté client, rien n'est une autorisation : ces fonctions échouent (404) pour un joueur.
 */
import {
  adminMeSchema,
  adminOverviewSchema,
  adminPuzzleListSchema,
  adminPuzzleSchema,
  adminUserDetailSchema,
  adminUserListSchema,
  auditListSchema,
} from '@crossverse/contracts'
import type {
  AdminOverview,
  AdminPuzzle,
  AdminPuzzleBody,
  AdminPuzzleList,
  AdminUserDetail,
  AdminUserList,
  AuditList,
  PuzzleStatus,
} from '@crossverse/contracts'
import { ApiRequestError, query, request, segment } from './api'

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
    cursor?: string
  }): Promise<AdminUserList> {
    return request(
      'GET',
      `/admin/users${query({
        search: params.search,
        guests: params.guests ? 'true' : undefined,
        cursor: params.cursor,
      })}`,
      adminUserListSchema,
    )
  },

  getUser(id: string): Promise<AdminUserDetail> {
    return request('GET', `/admin/users/${segment(id)}`, adminUserDetailSchema)
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
