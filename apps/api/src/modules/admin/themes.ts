import type { AdminTheme, AdminThemeList, adminThemeBodySchema } from '@crossverse/contracts'
import type { z } from 'zod'
import type { Db } from '../../db.ts'
import { Prisma } from '../../generated/prisma/client.ts'
import { conflict, notFound } from '../../http/errors.ts'

type ThemeBody = z.output<typeof adminThemeBodySchema>

const MAX_THEMES = 500

const themeSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  parentId: true,
  skin: true,
  icon: true,
  accent: true,
  accentAlt: true,
  sortOrder: true,
  parent: { select: { slug: true } },
  _count: { select: { puzzles: true, children: true } },
} as const satisfies Prisma.ThemeSelect

type ThemeRow = Prisma.ThemeGetPayload<{ select: typeof themeSelect }>

/**
 * Gestion des thèmes par l'administration. Pas de suppression : un thème référencé par des
 * grilles est protégé par la base (`ON DELETE RESTRICT`), et un thème vide n'apparaît pas au
 * catalogue public. Règle d'arbre : deux niveaux au plus.
 */
export class AdminThemeService {
  constructor(private readonly db: Db) {}

  async list(): Promise<AdminThemeList> {
    const rows = await this.db.theme.findMany({
      select: themeSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: MAX_THEMES,
    })
    // Parents d'abord, chacun suivi de ses sous-thèmes : ordre direct pour un sélecteur.
    const roots = rows.filter((row) => row.parentId === null)
    return {
      items: roots.flatMap((root) => [
        toAdminTheme(root),
        ...rows.filter((row) => row.parentId === root.id).map(toAdminTheme),
      ]),
    }
  }

  async create(body: ThemeBody): Promise<AdminTheme> {
    const parentId = await this.parentIdOf(body.parentSlug, null)
    try {
      const row = await this.db.theme.create({
        data: { ...fields(body), slug: body.slug, parentId },
        select: themeSelect,
      })
      return toAdminTheme(row)
    } catch (error) {
      throw uniqueSlug(error)
    }
  }

  async update(id: string, body: ThemeBody): Promise<AdminTheme> {
    const current = await this.db.theme.findUnique({ where: { id }, select: themeSelect })
    if (!current) throw notFound('Thème introuvable.')
    const parentId = await this.parentIdOf(body.parentSlug, id)
    if (parentId !== null && current._count.children > 0) {
      throw conflict('Ce thème a des sous-thèmes : il ne peut pas devenir lui-même un sous-thème.')
    }
    try {
      const row = await this.db.theme.update({
        where: { id },
        data: { ...fields(body), slug: body.slug, parentId },
        select: themeSelect,
      })
      return toAdminTheme(row)
    } catch (error) {
      throw uniqueSlug(error)
    }
  }

  /** Le parent doit exister, être de premier niveau et ne pas être le thème lui-même. */
  private async parentIdOf(slug: string | null, selfId: string | null): Promise<string | null> {
    if (slug === null) return null
    const parent = await this.db.theme.findUnique({
      where: { slug },
      select: { id: true, parentId: true },
    })
    if (!parent) throw notFound('Thème parent introuvable.')
    if (parent.id === selfId) throw conflict('Un thème ne peut pas être son propre parent.')
    if (parent.parentId !== null) {
      throw conflict('Le parent doit être un thème de premier niveau (deux niveaux au plus).')
    }
    return parent.id
  }
}

function fields(body: ThemeBody) {
  return {
    name: body.name,
    description: body.description,
    skin: body.skin,
    icon: body.icon,
    accent: body.accent?.toUpperCase() ?? null,
    accentAlt: body.accentAlt?.toUpperCase() ?? null,
    sortOrder: body.sortOrder,
  }
}

function toAdminTheme(row: ThemeRow): AdminTheme {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentSlug: row.parent?.slug ?? null,
    skin: row.skin,
    icon: row.icon,
    accent: row.accent,
    accentAlt: row.accentAlt,
    sortOrder: row.sortOrder,
    puzzleCount: row._count.puzzles,
  }
}

function uniqueSlug(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return conflict('Ce slug est déjà utilisé par un autre thème.')
  }
  return error
}
