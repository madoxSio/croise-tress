import { z } from 'zod'

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1))

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    WEB_ORIGINS: csv,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** URL publique du web, utilisée dans les liens des e-mails. */
    WEB_BASE_URL: z.url().default('http://localhost:3000'),
    SMTP_HOST: z.string().default('127.0.0.1'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().default('Crossverse <no-reply@crossverse.local>'),
    /**
     * Proxys de confiance pour lire l'IP cliente dans `X-Forwarded-For` : nombre de sauts depuis
     * la droite (1 derrière Caddy seul). `true` (tous les sauts) n'est sûr que si aucun client ne
     * peut joindre l'API sans passer par le proxy : sinon un en-tête forgé contourne les limites.
     */
    TRUST_PROXY: z
      .string()
      .default('false')
      .transform((value, ctx) => {
        if (value === 'true' || value === 'false') return value === 'true'
        const hops = Number(value)
        if (Number.isInteger(hops) && hops >= 1 && hops <= 5) return hops
        ctx.addIssue({ code: 'custom', message: 'true, false ou un nombre de sauts de 1 à 5' })
        return z.NEVER
      }),
  })
  // En production, cookies `Secure` et liens d'e-mail exigent HTTPS : on refuse de démarrer
  // avec une origine ou une URL publique en clair (oubli de configuration fréquent).
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    const insecure = [...env.WEB_ORIGINS, env.WEB_BASE_URL].filter(
      (url) => !url.startsWith('https://'),
    )
    if (insecure.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGINS'],
        message: `HTTPS obligatoire en production (${insecure.join(', ')})`,
      })
    }
  })

export interface Config {
  readonly env: 'development' | 'test' | 'production'
  readonly host: string
  readonly port: number
  readonly databaseUrl: string
  readonly webOrigins: readonly string[]
  readonly logLevel: string
  readonly trustProxy: boolean | number
  readonly isProduction: boolean
  readonly sessionCookieName: string
  readonly sessionTtlMs: number
  readonly webBaseUrl: string
  readonly smtp: {
    readonly host: string
    readonly port: number
    readonly secure: boolean
    readonly user: string | undefined
    readonly password: string | undefined
  }
  readonly mailFrom: string
}

/** Valide l'environnement au démarrage : toute erreur arrête le processus avec un message explicite. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuration invalide : ${details}`)
  }
  const value = parsed.data
  const isProduction = value.NODE_ENV === 'production'
  return {
    env: value.NODE_ENV,
    host: value.API_HOST,
    port: value.API_PORT,
    databaseUrl: value.DATABASE_URL,
    webOrigins: value.WEB_ORIGINS,
    logLevel: value.LOG_LEVEL,
    trustProxy: value.TRUST_PROXY,
    isProduction,
    // Le préfixe __Host- impose Secure : réservé à la production (HTTPS).
    sessionCookieName: isProduction ? '__Host-cv_session' : 'cv_session',
    sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    webBaseUrl: value.WEB_BASE_URL.replace(/\/$/, ''),
    smtp: {
      host: value.SMTP_HOST,
      port: value.SMTP_PORT,
      secure: value.SMTP_SECURE,
      user: value.SMTP_USER,
      password: value.SMTP_PASSWORD,
    },
    mailFrom: value.MAIL_FROM,
  }
}
