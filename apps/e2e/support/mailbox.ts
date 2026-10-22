/**
 * Lecture des e-mails envoyés par l'API, via l'API HTTP de Mailpit (ou de son imitation
 * `mail-sink.ts`). Les liens des e-mails visent WEB_BASE_URL : on n'en garde que le jeton
 * pour rester indépendant de l'hôte configuré côté API.
 */
import { expect } from '@playwright/test'
import { MAILPIT_URL } from './env.ts'

interface MailpitSummary {
  readonly ID: string
}
interface MailpitSearch {
  readonly messages: readonly MailpitSummary[]
}
interface MailpitMessage {
  readonly Text: string
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`)
  if (!response.ok) throw new Error(`Mailpit ${path} : HTTP ${response.status}`)
  return (await response.json()) as T
}

async function findToken(to: string, linkPath: string, exclude: ReadonlySet<string>) {
  const query = encodeURIComponent(`to:"${to}"`)
  const { messages } = await getJson<MailpitSearch>(`/api/v1/search?query=${query}`)
  const pattern = new RegExp(`${linkPath.replace(/[/-]/g, '\\$&')}\\?token=([\\w-]{43})`)
  for (const summary of messages) {
    const message = await getJson<MailpitMessage>(`/api/v1/message/${summary.ID}`)
    const token = pattern.exec(message.Text)?.[1]
    if (token !== undefined && !exclude.has(token)) return token
  }
  return undefined
}

/**
 * Attend le dernier e-mail adressé à `to` contenant un lien vers `linkPath` et renvoie son
 * jeton. `exclude` écarte les jetons déjà consommés (ex. second e-mail de réinitialisation).
 */
export async function waitForEmailToken(
  to: string,
  linkPath: '/verify-email' | '/reset-password',
  exclude: ReadonlySet<string> = new Set(),
): Promise<string> {
  let token: string | undefined
  await expect
    .poll(
      async () => {
        token = await findToken(to.toLowerCase(), linkPath, exclude)
        return token
      },
      { message: `e-mail ${linkPath} pour ${to}`, timeout: 15_000 },
    )
    .toBeDefined()
  if (token === undefined) throw new Error('jeton introuvable')
  return token
}

/** Vrai si l'API Mailpit (réelle ou imitée) répond. */
export async function mailpitReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}
