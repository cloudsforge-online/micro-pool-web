import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname`; see `src/lib/hosts.ts`.
 * `test/no-build-time-config.test.ts` fails the build if `import.meta.env.VITE_` ever reappears.
 *
 * That rule bites harder here than on most surfaces, because the one number a reader of this site
 * most needs — the stratum host they will type into their miner — is a hostname. It is derived
 * from the page's own address rather than configured, so a bundle opened on
 * `pool-testnet.<apex>` tells a miner to connect to `pool-testnet.<apex>` and not to whatever
 * hostname happened to be current when the image was built.
 */
export default defineConfig({
  // WHERE ON ANY ORIGIN this bundle lives — the same string on localhost, on a preview deployment
  // and on both estates, so it is not an environment and the rule above is not broken by it. It has
  // to be a build-time constant because it goes in front of every hashed asset name in the emitted
  // `index.html`, which is written once at build. The trailing slash is required by vite:
  // `base: '/pool'` emits `/poolassets/index-a1b2.js`.
  base: '/pool/',
  plugins: [react()],
  resolve: {
    // @cloudsforge/ui is a `link:` dependency, so its own node_modules holds a second copy of
    // React. Two copies means two dispatchers, and the shared bar throws on its first useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package is edited in the same working tree until it is published; pre-bundling
    // it would freeze a stale copy.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    // The assets are immutable-cached by nginx, which is only safe when every rebuild produces a
    // new filename. Sourcemaps so a Lantern stack trace names a line somebody can find.
    sourcemap: true,
  },
  // 5191. The estate's frontends sit in 5170–5199 and 5191 was free on 2026-08-09 — checked
  // against every sibling `vite.config.ts` rather than picked, because two frontends on one port
  // is a `pnpm dev` that silently serves the wrong app.
  server: { port: 5191 },
  preview: { port: 5191 },
})
