/**
 * Vérifie que l'API Mailpit est joignable ; avec E2E_SMTP_SINK=1, démarre d'abord un faux
 * Mailpit local (SMTP + API HTTP) et renvoie sa fonction d'arrêt (teardown Playwright).
 */
import { BASE_URL, MAILPIT_URL, SMTP_SINK, SMTP_SINK_PORT } from './env.ts'
import { startMailSink } from './mail-sink.ts'
import { mailpitReachable } from './mailbox.ts'

export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  let teardown: (() => Promise<void>) | undefined
  if (SMTP_SINK) {
    const httpPort = Number(new URL(MAILPIT_URL).port || '80')
    const sink = await startMailSink({ smtpPort: SMTP_SINK_PORT, httpPort })
    teardown = sink.close
  }
  if (!(await mailpitReachable())) {
    throw new Error(
      `API Mailpit injoignable sur ${MAILPIT_URL} : lancez la stack (make start) ou E2E_SMTP_SINK=1.`,
    )
  }
  const web = await fetch(BASE_URL).catch(() => null)
  if (!web?.ok) throw new Error(`Web injoignable sur ${BASE_URL} : démarrez l'API et le web.`)
  return teardown
}
