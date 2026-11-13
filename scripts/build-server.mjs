// Bundles the portal backend (server/index.ts + the shared src/api code) into dist-server/index.mjs.
import { build } from 'esbuild'

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-server/index.mjs',
  packages: 'external', // node_modules (nodemailer) are loaded at runtime
  sourcemap: true,
  logLevel: 'warning',
})
console.log('Built dist-server/index.mjs')
