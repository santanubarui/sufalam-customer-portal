import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnvFiles } from './server/env'

/*
 * The browser only talks to /api on its own origin. In `npm run dev` the portal backend (server/app.ts)
 * runs inside the Vite dev server, so one command starts everything. It is reloaded when server code
 * changes. In production the same backend runs from `npm run serve` (server/index.ts).
 */
function portalApi(): Plugin {
  return {
    name: 'sufalam-portal-api',
    apply: 'serve',
    configureServer(server) {
      let loaded: { mod: unknown; app: { handle: (req: unknown, res: unknown) => Promise<boolean> } } | null = null
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const mod = await server.ssrLoadModule('/server/app.ts')
          if (loaded?.mod !== mod) {
            const { readConfig } = await server.ssrLoadModule('/server/config.ts')
            loaded = { mod, app: mod.createApp(readConfig(loadEnvFiles('development'), false)) }
          }
          if (!(await loaded!.app.handle(req, res))) next()
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), portalApi()],
  server: { port: 5173, open: true },
  build: { outDir: 'dist', sourcemap: mode !== 'production' },
}))
