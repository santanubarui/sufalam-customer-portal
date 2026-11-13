// Bundles and runs scripts/portal-user.ts (portal account admin). Usage: npm run portal:user -- <command>
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('node_modules/.cache', { recursive: true })
const outfile = 'node_modules/.cache/portal-user.mjs'
await build({ entryPoints: ['scripts/portal-user.ts'], bundle: true, platform: 'node', format: 'esm', outfile, packages: 'external', logLevel: 'warning' })
const res = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(res.status ?? 1)
