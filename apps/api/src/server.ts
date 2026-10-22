import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { createDb } from './db.ts'

const config = loadConfig()
const db = createDb(config.databaseUrl)
const app = await buildApp({ config, db })

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'arrêt en cours')
  await app.close()
  await db.$disconnect()
  process.exit(0)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ host: config.host, port: config.port })
