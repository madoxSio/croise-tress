import { ERROR_CODES } from '@crossverse/contracts'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { AppError } from '../src/http/errors.ts'
import { SmtpMailer } from '../src/modules/mail/mailer.ts'
import { testDatabaseUrl } from './helpers.ts'

describe('SmtpMailer', () => {
  it('transforme un serveur SMTP injoignable en 503 générique', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      WEB_ORIGINS: 'http://localhost:3000',
      LOG_LEVEL: 'silent',
      SMTP_HOST: '127.0.0.1',
      // Port réservé, aucun service n'y écoute : connexion refusée immédiatement.
      SMTP_PORT: '1',
    })
    const sending = new SmtpMailer(config).send({ to: 'a@example.com', subject: 's', text: 't' })
    await expect(sending).rejects.toBeInstanceOf(AppError)
    await expect(sending).rejects.toMatchObject({
      statusCode: 503,
      code: ERROR_CODES.mailUnavailable,
    })
  })
})
