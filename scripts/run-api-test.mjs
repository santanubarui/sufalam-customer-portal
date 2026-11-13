// Bundles scripts/api-test.ts (the real portal backend + src/api code) and runs it under Node.
// No dev server needed — the test starts the backend itself.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('node_modules/.cache', { recursive: true })
const outfile = 'node_modules/.cache/api-test.mjs'
await build({
  entryPoints: ['scripts/api-test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  packages: 'external',
  logLevel: 'warning',
})

const res = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(res.status ?? 1)
