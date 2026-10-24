import nodemailer, { type Transporter } from 'nodemailer'
import { ERROR_CODES } from '@crossverse/contracts'
import type { Config } from '../../config.ts'
import { AppError } from '../../http/errors.ts'

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
}

/** Abstraction du fournisseur d'e-mails : SMTP en dev (Mailpit) et en prod, mémoire en test. */
export interface Mailer {
  send(message: MailMessage): Promise<void>
}

const SMTP_TIMEOUT_MS = 10_000

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(private readonly config: Config) {
    const { host, port, secure, user, password } = config.smtp
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure,
      // Sans délais courts, un port SMTP filtré (Render gratuit bloque 25, 465 et 587) fait
      // attendre l'inscription deux minutes : le relais Vercel coupe avant, sans message clair.
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    })
  }

  /**
   * Teste connexion et authentification SMTP sans rien envoyer. Appelé au démarrage pour que
   * les journaux indiquent tout de suite un SMTP mal configuré, avant la première inscription.
   */
  async verify(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await this.transport.verify()
      return { ok: true }
    } catch (cause) {
      return { ok: false, reason: describeSmtpError(cause) }
    }
  }

  /**
   * Un échec d'envoi devient une 503 explicite : le message est le même quelle que soit la
   * branche (compte existant ou non), il ne permet donc pas d'énumérer les comptes.
   */
  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.config.mailFrom, ...message })
    } catch (cause) {
      throw new AppError(
        503,
        ERROR_CODES.mailUnavailable,
        'L’envoi d’e-mail est momentanément impossible. Réessayez plus tard.',
        { cause },
      )
    }
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = []

  send(message: MailMessage): Promise<void> {
    this.sent.push(message)
    return Promise.resolve()
  }
}

/** Code et message du serveur SMTP, sans les identifiants (nodemailer ne les inclut pas). */
function describeSmtpError(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause)
  const code = 'code' in cause && typeof cause.code === 'string' ? `${cause.code} ` : ''
  return `${code}${cause.message}`
}
