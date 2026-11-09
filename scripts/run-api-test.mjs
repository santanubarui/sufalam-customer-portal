// Bundles scripts/api-test.ts (which imports the real src/api code) and runs it under Node.
import { build } from 'esbuild'
import { loadEnv } from 'vite'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const env = loadEnv('development', process.cwd(), '')
if (!env.VITE_DEV_SAP_USER || !env.VITE_DEV_SAP_PASSWORD) {
  console.error('Missing VITE_DEV_SAP_USER / VITE_DEV_SAP_PASSWORD — copy .env.example to .env.development.local and fill it in.')
  process.exit(1)
}

mkdirSync('node_modules/.cache', { recursive: true })
const outfile = 'node_modules/.cache/api-test.mjs'
await build({
  entryPoints: ['scripts/api-test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'warning',
  define: { 'import.meta.env.VITE_SAP_BASE_URL': JSON.stringify(env.VITE_SAP_BASE_URL || '/b1s/v2') },
})

const res = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ...env } })
process.exit(res.status ?? 1)
