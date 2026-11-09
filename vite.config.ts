import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.SAP_SL_ORIGIN || 'https://sufalam.connectcloud365.com:57138'

  /*
   * The browser talks to /b1s on our own origin and Vite forwards it to SAP Service Layer.
   * This avoids CORS and lets the B1SESSION / ROUTEID cookies work as first-party cookies.
   * SL marks them `Secure; SameSite=None`, which browsers reject on plain http://localhost,
   * so those attributes are stripped on the way back.
   */
  const sapProxy: ProxyOptions = {
    target,
    changeOrigin: true,
    secure: false, // SL commonly uses a self-signed / internal certificate
    cookieDomainRewrite: '',
    configure: (proxy) => {
      proxy.on('proxyRes', (res) => {
        const cookies = res.headers['set-cookie']
        if (cookies) {
          res.headers['set-cookie'] = cookies.map((c) => c.replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=None/gi, ''))
        }
      })
    },
  }

  return {
    plugins: [react()],
    server: { port: 5173, open: true, proxy: { '/b1s': sapProxy } },
    preview: { port: 4173, open: true, proxy: { '/b1s': sapProxy } },
    build: { outDir: 'dist', sourcemap: mode !== 'production' },
  }
})
