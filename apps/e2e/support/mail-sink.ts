/**
 * Faux Mailpit minimal, réservé aux tests (E2E_SMTP_SINK=1) : un serveur SMTP qui accepte tout
 * et une API HTTP qui reprend le sous-ensemble de l'API Mailpit lu par `mailbox.ts`
 * (`GET /api/v1/search?query=to:<adresse>` et `GET /api/v1/message/<ID>`).
 * Il sert là où Mailpit (docker-compose) n'est pas disponible ; il n'écoute que sur 127.0.0.1.
 */
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'

interface StoredMessage {
  readonly ID: string
  readonly Created: string
  readonly To: readonly { readonly Address: string }[]
  readonly Subject: string
  readonly Text: string
}

/** Décodage quoted-printable suffisant pour lire les liens (coupures douces et =XX). */
function decodeQuotedPrintable(raw: string): string {
  return raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function subjectOf(raw: string): string {
  return /^Subject: (.*)$/m.exec(raw)?.[1]?.trim() ?? ''
}

export interface MailSink {
  readonly close: () => Promise<void>
}

export async function startMailSink(options: {
  readonly smtpPort: number
  readonly httpPort: number
}): Promise<MailSink> {
  const messages: StoredMessage[] = []

  const smtp = net.createServer((socket) => {
    let buffer = ''
    let inData = false
    let recipients: string[] = []
    socket.write('220 e2e-sink\r\n')
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end < 0) return
          const raw = buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          inData = false
          messages.unshift({
            ID: randomUUID(),
            Created: new Date().toISOString(),
            To: recipients.map((Address) => ({ Address })),
            Subject: subjectOf(raw),
            Text: decodeQuotedPrintable(raw),
          })
          recipients = []
          socket.write('250 ok\r\n')
          continue
        }
        const newline = buffer.indexOf('\r\n')
        if (newline < 0) return
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 2)
        const command = line.slice(0, 4).toUpperCase()
        if (command === 'EHLO' || command === 'HELO') socket.write('250 e2e-sink\r\n')
        else if (command === 'RCPT') {
          const address = /<([^>]+)>/.exec(line)?.[1]
          if (address) recipients.push(address.toLowerCase())
          socket.write('250 ok\r\n')
        } else if (command === 'DATA') {
          inData = true
          socket.write('354 go\r\n')
        } else if (command === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
    socket.on('error', () => {
      // Client SMTP coupé brutalement : sans conséquence pour le puits.
    })
  })

  const api = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const send = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (url.pathname === '/api/v1/messages') {
      send(200, { total: messages.length, messages })
      return
    }
    if (url.pathname === '/api/v1/search') {
      const query = url.searchParams.get('query') ?? ''
      const to = /^to:"?([^"\s]+)"?$/.exec(query)?.[1]?.toLowerCase()
      const found = messages.filter((m) => to === undefined || m.To.some((r) => r.Address === to))
      send(200, { total: found.length, messages: found })
      return
    }
    const id = /^\/api\/v1\/message\/([\w-]+)$/.exec(url.pathname)?.[1]
    const message = messages.find((m) => m.ID === id)
    if (message) send(200, message)
    else send(404, { error: 'not found' })
  })

  const listen = (server: net.Server, port: number): Promise<void> =>
    new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        resolve()
      })
    })
  await listen(smtp, options.smtpPort)
  await listen(api, options.httpPort)

  const close = (server: net.Server): Promise<void> =>
    new Promise((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  return {
    close: async () => {
      await Promise.all([close(smtp), close(api)])
    },
  }
}
