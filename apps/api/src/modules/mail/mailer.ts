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

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(private readonly config: Config) {
    const { host, port, secure, user, password } = config.smtp
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    })
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
