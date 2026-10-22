/** Paramètres des parcours E2E, tous surchargeables par variables d'environnement. */
export const BASE_URL = (process.env['E2E_BASE_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')

/** API HTTP de Mailpit (docker-compose) ou du faux Mailpit démarré par `global-setup.ts`. */
export const MAILPIT_URL = (process.env['MAILPIT_URL'] ?? 'http://localhost:8025').replace(
  /\/+$/,
  '',
)

/** `1` : démarre un puits SMTP + faux Mailpit local (quand Mailpit n'est pas lancé). */
export const SMTP_SINK = process.env['E2E_SMTP_SINK'] === '1'
export const SMTP_SINK_PORT = Number(process.env['E2E_SMTP_SINK_PORT'] ?? '1025')
