/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ARTEFACT THAT PASSED CI IS THE ARTEFACT THAT REACHES PRODUCTION.
 *
 * A `VITE_` variable is read when the bundle is BUILT and frozen into the output. So a bundle built
 * for testnet cannot be promoted to mainnet — it has to be rebuilt, and the thing that reaches
 * production is then a different artefact from the one every gate in this repository examined. The
 * estate's release path pins ONE image per deployable by digest, which quietly assumes the image is
 * environment-free; a `VITE_API_URL` breaks that assumption without breaking any test.
 *
 * Everything this bundle needs to know about where it is comes from `window.location.hostname` at
 * runtime, through `src/lib/hosts.ts`. The two things that are not hosts — the release identifier
 * and the analytics measurement id — are `<meta>` tags in index.html, which the Dockerfile stamps
 * into a copy of the file rather than into the JavaScript.
 *
 * ── THE SECOND HALF: THIS BUNDLE CARRIES NO CREDENTIAL AND SENDS NONE ─────────────────────────
 *
 * micro-pool's read API takes no bearer token on any route (`pool/src/server.ts`), and its one
 * credentialled route — the browser-mining ticket — is micro-hub-web's to call, not this bundle's.
 * So there is nothing to send and nothing to store. Asserted as an ABSENCE, because the reflex when
 * a request 401s is to add a header, and the tempting place to add it — an `Authorization` in
 * nginx.conf's proxy — puts a CloudsForge service credential inside an image that is built once and
 * promoted to every environment, which is a published credential.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { ROOT, read, stripComments } from './sources.ts'

/** Every source file under src/, with its comments removed. */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx|css)$/.test(entry)) continue
      out.push({
        path: relative(ROOT, full),
        text: stripComments(read(relative(ROOT, full)), entry.endsWith('.css') ? 'css' : 'ts'),
      })
    }
  }
  walk(join(ROOT, 'src'))
  return out
}

const SRC = sources()
const INDEX_HTML = stripComments(read('index.html'), 'html')
const VITE_CONFIG = stripComments(read('vite.config.ts'), 'ts')
const NGINX = stripComments(read('nginx.conf'), 'nginx')
const DOCKERFILE = stripComments(read('Dockerfile'), 'nginx')

test('NO BUILD-TIME ENVIRONMENT REACHES THIS BUNDLE', () => {
  for (const { path, text } of [...SRC, { path: 'index.html', text: INDEX_HTML }]) {
    for (const forbidden of [/import\.meta\.env/, /\bVITE_[A-Z]/, /\bprocess\.env\b/]) {
      const hit = text.match(forbidden)
      assert.equal(
        hit,
        null,
        `${path} reads ${JSON.stringify(hit?.[0])}. That value is frozen into the artefact at ` +
          `build time, so the image cannot be promoted between environments — the thing that ` +
          `reaches production stops being the thing that passed CI. Derive it from ` +
          `window.location at runtime, in src/lib/hosts.ts.`,
      )
    }
  }
})

test('vite is not configured to inject one either', () => {
  // `define` and `envPrefix` are the two ways to smuggle a build-time constant past the grep above:
  // `define` replaces an arbitrary identifier at transform time, and `envPrefix` widens which
  // variables `import.meta.env` exposes. Neither leaves a `VITE_` in src.
  assert.doesNotMatch(VITE_CONFIG, /\bdefine\s*:/)
  assert.doesNotMatch(VITE_CONFIG, /\benvPrefix\b/)
  assert.doesNotMatch(VITE_CONFIG, /\bloadEnv\b/)
})

test('NO CLOUDSFORGE HOSTNAME IS WRITTEN DOWN IN THIS BUNDLE', () => {
  // A literal hostname is a second, unversioned copy of the surface registry, and the copy is the
  // one that will be wrong. It is also a build-time environment wearing a different hat: an image
  // naming `pool.cloudsforge.online` is an image that only works on one estate.
  for (const { path, text } of SRC) {
    const hit = text.match(/[a-z0-9-]+\.cloudsforge\.(online|dev|test)/i)
    assert.equal(
      hit,
      null,
      `${path} names ${JSON.stringify(hit?.[0])}. Hosts are derived from window.location.hostname ` +
        `through src/lib/hosts.ts, so one image serves localhost, a preview and both estates.`,
    )
  }
})

test('THE STRATUM ENDPOINT IS REPORTED BY THE SERVICE, NOT COMPOSED IN HERE', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The most tempting derivation on this surface and the most expensive one to get wrong: a wrong
  // address in a miner's firmware costs its owner a silent outage they will blame on their own
  // hardware.
  //
  // This bundle used to answer it from `window.location.hostname`. That was WRONG, not merely
  // unverified — the console arrives through a Cloudflare Tunnel and then Traefik, neither of which
  // forwards a raw TCP stream, and micro-pool binds the listener to loopback by default. Both halves
  // now come off `GET /v1/pool` as `stratumEndpoint`, together or not at all (micro-org#285).
  //
  // So: no literal endpoint anywhere, and no source file composing one out of anything except the
  // two fields the API sent. A template with a `location` or a `hosts` call inside it is the exact
  // shape of the defect coming back.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  for (const { path, text } of SRC) {
    assert.equal(
      /stratum\+tcp:\/\/[a-z0-9-]+\./.test(text),
      false,
      `${path} contains a literal stratum endpoint; render the one the API published, or the ` +
        `named hole when it published none`,
    )
    for (const composed of text.match(/`stratum\+tcp:\/\/[^`]*`/g) ?? []) {
      assert.ok(
        !/location|hostname|hosts\(|apiBase|window/.test(composed),
        `${path} builds a stratum endpoint out of the address of the page: ${composed}. That is ` +
          `micro-org#285. Both halves come from stratumEndpoint on GET /v1/pool.`,
      )
    }
  }
})

test('the ports a miner dials come from the API, never from a list in here', () => {
  // `POOL_CHAINS` is per-deployment and only `ltc` is deployable today, so a hard-coded pair of
  // ports would render a two-chain layout with a hole in it on every deployment there is. There is
  // no exemption for `src/lib/hosts.ts` any more: it knows nothing about stratum at all. The one
  // port constant permitted anywhere is micro-pool's HTTP dev port, and even that is read off the
  // surface registry rather than written down.
  for (const { path, text } of SRC) {
    assert.ok(!/\b333[34]\b/.test(text), `${path} names a stratum port; read it from status.chains`)
    // Including the BIND port the API still reports. `stratumPort` is the inside of the deploy's
    // port mapping and the published port may differ from it, so a page that fell back to it would
    // print a plausible number that dials nothing — which is worse than printing none. The response
    // TYPE is the one place it may be named: `src/lib/pool.ts` transcribes what the service sends,
    // and deleting a field from a transcription does not stop the service sending it.
    if (path.endsWith('lib/pool.ts')) continue
    assert.ok(
      !/stratumPort/.test(text),
      `${path} reads stratumPort. That field is the port the listener BINDS inside the container, ` +
        `not the port a miner dials; the published one is stratumEndpoint.port or nothing.`,
    )
  }
})

test('THIS BUNDLE HOLDS NO CREDENTIAL AND SENDS NONE', () => {
  for (const { path, text } of SRC) {
    for (const forbidden of [/\bAuthorization\b/, /\bBearer\b/, /localStorage/, /document\.cookie/]) {
      const hit = text.match(forbidden)
      assert.equal(
        hit,
        null,
        `${path} uses ${JSON.stringify(hit?.[0])}. Every route micro-pool serves is anonymous, so ` +
          `a credential here would be a secret shipped in a public bundle to authenticate nothing.`,
      )
    }
  }
  // sessionStorage IS used, once, for the pseudonymous per-tab observability id. It dies with the
  // tab, it says nothing about who the reader is, and Lantern has no user column to put it in.
  const withSession = SRC.filter((s) => /sessionStorage/.test(s.text)).map((s) => s.path)
  assert.deepEqual(withSession, ['src/lib/obs.ts'])
})

test('the image proxies nothing, so no credential can be added to it later', () => {
  // The tempting fix for an authority gap is an nginx proxy with a header on it. An image is built
  // once and promoted; a credential inside one is compromised on the first deploy.
  assert.doesNotMatch(NGINX, /proxy_pass/i)
  assert.doesNotMatch(NGINX, /Authorization|Bearer/i)
  assert.doesNotMatch(DOCKERFILE, /TOKEN|SECRET|PASSWORD/i)
})

test('NGINX DOES NOT TRY TO CARRY STRATUM, WHICH IS NOT HTTP', () => {
  // Stratum v1 is line-delimited JSON-RPC over raw TCP. nginx's `http` context cannot carry it, a
  // `proxy_pass` would corrupt it, and a reverse proxy answering a `mining.subscribe` with an HTTP
  // 400 presents to the miner's owner as faulty hardware. Exposing those ports is a deploy concern.
  assert.doesNotMatch(NGINX, /^\s*stream\s*\{/m)
  assert.doesNotMatch(NGINX, /listen\s+333[34]/)
})

test('the release and the analytics id are identities, not configuration', () => {
  // Both are meta tags rather than build-time constants: they NAME the artefact and the property it
  // reports to, they do not tell it where it is running. The Dockerfile stamps the release into a
  // copy of index.html, which is why an image can be promoted and still be traceable.
  assert.match(INDEX_HTML, /<meta name="cf-release" content="dev" \/>/)
  assert.match(DOCKERFILE, /ARG RELEASE/)
  assert.match(DOCKERFILE, /cf-release/)
  // And no third-party analytics script tag: `@cloudsforge/ui/consent` injects the tag from exactly
  // one place, the Accept button. A cookie set before consent is not cured by a banner under it —
  // and on this surface the path being reported would name a mining address.
  assert.doesNotMatch(INDEX_HTML, /<script[^>]+src="https?:\/\//)
})

test('every request this bundle makes is same-origin by default', () => {
  // `apiBase()` is `''` in production because nginx serves this bundle at `pool.<apex>` and the
  // gateway routes `/v1` on the same hostname to micro-pool. An absolute base would be a hostname
  // written down, which is the rule above; it would also need CORS the service does not grant.
  const hosts = stripComments(read('src/lib/hosts.ts'), 'ts')
  assert.match(hosts, /isLocal\(hostname\) \? `http:\/\/localhost:\$\{POOL_API_DEV_PORT\}` : ''/)
})
