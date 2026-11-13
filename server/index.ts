/*
 * Production server: serves the built portal (dist/) and the /api backend from one Node process.
 *   npm run build && npm run serve
 * Put it behind HTTPS (nginx / IIS / a load balancer) in production; see docs/HANDOVER.md.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { createApp } from './app'
import { readConfig, type ServerConfig } from './config'
import { loadEnvFiles } from './env'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
}

let cfg: ServerConfig
try {
  cfg = readConfig(loadEnvFiles('production'), true)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
const app = createApp(cfg)

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let file = normalize(join(cfg.distDir, path))
  if (!file.startsWith(cfg.distDir + sep) && file !== cfg.distDir) {
    res.writeHead(403).end()
    return
  }
  let info = await stat(file).catch(() => null)
  if (!info?.isFile()) {
    // single-page app: unknown paths get index.html (assets that don't exist get a 404)
    if (extname(path)) {
      res.writeHead(404, SECURITY_HEADERS).end('Not found')
      return
    }
    file = join(cfg.distDir, 'index.html')
    info = await stat(file).catch(() => null)
    if (!info) {
      res.writeHead(503, { 'content-type': 'text/plain' }).end('Portal is not built. Run `npm run build`.')
      return
    }
  }
  const hashed = file.includes(`${sep}assets${sep}`)
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') res.end()
  else createReadStream(file).pipe(res)
}

const server = createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
  app
    .handle(req, res)
    .then((handled) => (handled ? undefined : serveStatic(req, res)))
    .catch((e) => {
      console.error(e)
      if (!res.headersSent) res.writeHead(500).end()
    })
})

server.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? `Port ${cfg.port} is already in use or not allowed — set PORT to a free port.` : e)
  process.exit(1)
})
app.startJobs()
server.listen(cfg.port, () => {
  console.log(`Sufalam portal on http://localhost:${cfg.port} (SAP ${cfg.companyDB}, data in ${cfg.dataDir})`)
})

const shutdown = () => {
  server.close()
  void app.close().finally(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
