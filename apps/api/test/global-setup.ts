import { execFileSync } from 'node:child_process'
import { testDatabaseUrl } from './helpers.ts'

/** Applique les migrations sur la base de test avant la suite (base jetable, jamais celle de dev). */
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  })
}
