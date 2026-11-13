/*
 * Loads .env files with the same file order as Vite, so the dev server (vite.config.ts) and the
 * production server (server/index.ts) read identical settings:
 *   .env  <  .env.local  <  .env.<mode>  <  .env.<mode>.local  <  real environment variables
 * Values may be quoted; `\$` is a literal dollar sign (same convention as Vite).
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type Env = Record<string, string>

export function parseEnv(text: string): Env {
  const out: Env = {}
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    const q = v[0]
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) {
      v = v.slice(1, v.lastIndexOf(q))
      if (q === '"') v = v.replace(/\\n/g, '\n')
    } else {
      v = v.replace(/\s+#.*$/, '')
    }
    out[m[1]] = v.replace(/\\\$/g, '$')
  }
  return out
}

export function loadEnvFiles(mode: string, dir = process.cwd()): Env {
  const env: Env = {}
  for (const f of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    const p = resolve(dir, f)
    if (existsSync(p)) Object.assign(env, parseEnv(readFileSync(p, 'utf8')))
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  return env
}
