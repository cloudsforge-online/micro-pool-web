/**
 * Where this bundle thinks it is, what it talks to, and what it tells a miner to dial.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HALF OF THIS FILE EXISTS TO MAKE A MISSING REGISTRY ROW LOUD.
 *
 * `ui/packages/ui/src/surfaces.ts` has no `pool` surface on 2026-08-09, so `cloudsforgeHosts()`
 * cannot strip `pool.` when deriving the apex and resolves every sibling address one level too deep.
 * `src/lib/hosts.ts` carries a local correction for that, exactly as micro-emberkin-web did until
 * its own row landed.
 *
 * A local workaround that nothing watches outlives the gap it was written for. So the gap itself is
 * asserted here: the day somebody adds the `pool` row, `the registry still has no pool surface`
 * fails, and whoever reads that failure is told in the message what to delete. That is the whole
 * mechanism — the correction cannot quietly become permanent.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENV_LABELS, KNOWN_SUBS, SURFACES } from '@cloudsforge/ui/surfaces'
import {
  ACCENT_SURFACE,
  APP_NAME,
  correctedHosts,
  isLocal,
  placementOf,
  POOL_API_DEV_PORT,
  POOL_SUBDOMAIN,
  resolveApiBase,
  resolveStratumHost,
} from '../src/lib/hosts.ts'

test('the registry still has no pool surface, and this file is the alarm for that', () => {
  const pool = SURFACES.find((s) => s.subdomain === POOL_SUBDOMAIN)
  assert.equal(
    pool,
    undefined,
    'A `pool` row has landed in @cloudsforge/ui/surfaces. That is good news and it retires code: ' +
      '`placementOf` now takes its `registry` branch, `correctedHosts` becomes a no-op, and ' +
      'src/lib/hosts.ts can be cut down to the shape of explorer-web/src/lib/hosts.ts. Check the ' +
      'row carries devPort 4146 — the port micro-pool actually binds — then delete the correction ' +
      'and this assertion together.',
  )
  assert.equal(KNOWN_SUBS.has(POOL_SUBDOMAIN), false)
})

test('the dev port is the port the service binds, not an allocation', () => {
  // 4146 is `PORT` in pool/src/env.ts and pool/.env.example. The registry's own comments record
  // three surfaces whose rows carried a free-looking number instead of the one the service binds
  // (foresight carried beacon's 4011, emberkin carried 3014 while binding 4100, admin carried 3002
  // while admin-api binds 4014). When the pool row lands it must carry this.
  assert.equal(POOL_API_DEV_PORT, 4146)
  assert.equal(APP_NAME, 'pool-web')
})

test('the accent this page names is a surface that really exists', () => {
  // Naming a `pool` product accent would fall through to the company ember in complete silence.
  // `network` exists, is what explorer-web names for the same reason — chain infrastructure belongs
  // to Forge Network — and `test/brand-chrome.test.ts` checks the CSS selector for it is real.
  assert.ok(SURFACES.some((s) => s.key === ACCENT_SURFACE))
})

test('the four development hostnames are the same four the design system treats as local', () => {
  for (const local of ['', 'localhost', '127.0.0.1', 'dev.local', 'pool.local']) {
    assert.equal(isLocal(local), true, local)
  }
  for (const remote of ['pool.cloudsforge.online', 'localhost.cloudsforge.online', 'notlocal']) {
    assert.equal(isLocal(remote), false, remote)
  }
})

test('a local hostname is local, and nothing is derived from it', () => {
  assert.deepEqual(placementOf('localhost'), { kind: 'local', env: '', apex: '' })
  assert.deepEqual(placementOf(''), { kind: 'local', env: '', apex: '' })
})

test('this surface at its own hostname, on mainnet and on an environment', () => {
  assert.deepEqual(placementOf('pool.cloudsforge.online'), {
    kind: 'pool',
    env: '',
    apex: 'cloudsforge.online',
  })
  // The environment is a SUFFIX on the first label, never a second label. The registry explains
  // why at length: Cloudflare's Universal SSL wildcard matches exactly one label, so
  // `pool.testnet.cloudsforge.online` fails the handshake at the edge before it reaches the estate.
  assert.deepEqual(placementOf('pool-testnet.cloudsforge.online'), {
    kind: 'pool',
    env: 'testnet',
    apex: 'cloudsforge.online',
  })
  assert.deepEqual(placementOf('pool.cloudsforge.localtest.me'), {
    kind: 'pool',
    env: '',
    apex: 'cloudsforge.localtest.me',
  })
})

test('a suffix that is not a real environment is not an environment', () => {
  // `pool-2024.cloudsforge.online` is not testnet's anything. Guessing would resolve every sibling
  // link on that page into an environment nobody deployed.
  assert.equal(placementOf('pool-2024.cloudsforge.online').kind, 'unknown')
  assert.equal(ENV_LABELS.has('2024'), false)
})

test('a hostname the registry can already strip is left entirely alone', () => {
  // THE BRANCH THAT RETIRES THE CORRECTION. When a `pool` row lands, `KNOWN_SUBS` gains `pool` and
  // `pool.cloudsforge.online` starts arriving here instead — at which point `correctedHosts` is
  // handed the registry's own answer and returns it untouched.
  const known = [...KNOWN_SUBS][0]
  assert.ok(known, 'the registry must have at least one subdomain')
  assert.deepEqual(placementOf(`${known}.cloudsforge.online`), {
    kind: 'registry',
    env: '',
    apex: 'cloudsforge.online',
  })
  assert.deepEqual(placementOf('testnet.cloudsforge.online'), {
    kind: 'registry',
    env: 'testnet',
    apex: 'cloudsforge.online',
  })
})

test('an address nothing can be derived from says so instead of guessing', () => {
  assert.deepEqual(placementOf('some-preview-deploy.example.net'), { kind: 'unknown', env: '', apex: '' })
  assert.equal(placementOf('cloudsforge.online').kind, 'unknown')
})

test('the correction rebuilds every estate URL against the apex the registry could not find', () => {
  // The failure being corrected: with no `pool` row, `cloudsforgeHosts()` takes the whole hostname
  // as the apex and composes `hub.pool.cloudsforge.online`, `lantern.pool.cloudsforge.online` and
  // so on — hostnames that do not exist. The page renders; every link on it is dead.
  const broken = Object.fromEntries(
    SURFACES.map((s) => [s.key, `https://${s.subdomain}.pool.cloudsforge.online`]),
  ) as never

  const fixed = correctedHosts(placementOf('pool.cloudsforge.online'), broken) as Record<string, string>
  for (const surface of SURFACES) {
    const expectedOrigin = surface.subdomain
      ? `https://${surface.subdomain}.cloudsforge.online`
      : 'https://cloudsforge.online'
    assert.equal(fixed[surface.key], `${expectedOrigin}${surface.basePath ?? ''}`, surface.key)
    assert.ok(!fixed[surface.key]?.includes('.pool.'), `${surface.key} is still one level too deep`)
  }
})

test('the correction carries the environment suffix, and collapses the apex surface', () => {
  const broken = {} as never
  const fixed = correctedHosts(placementOf('pool-testnet.cloudsforge.online'), broken) as Record<string, string>
  const hub = SURFACES.find((s) => s.subdomain === 'hub')
  assert.ok(hub)
  assert.ok(fixed[hub.key]?.startsWith('https://hub-testnet.cloudsforge.online'))

  // `-testnet` on an empty subdomain is not a legal DNS label, so the apex surface collapses to the
  // bare environment label. This mirrors `envLabel` rather than reimplementing it.
  const apexSurface = SURFACES.find((s) => s.subdomain === '')
  if (apexSurface) {
    assert.ok(fixed[apexSurface.key]?.startsWith('https://testnet.cloudsforge.online'))
  }
})

test('the correction is a no-op everywhere except this surface', () => {
  const registry = { hub: 'https://hub.cloudsforge.online' } as never
  for (const hostname of ['localhost', 'hub.cloudsforge.online', 'weird.example.net']) {
    assert.equal(
      correctedHosts(placementOf(hostname), registry),
      registry,
      `${hostname} must be handed back the registry's own object, identity and all`,
    )
  }
})

test('the API base is same-origin in production and a port in development', () => {
  // Same origin because the gateway already arranges it: the bundle router matches the host at
  // priority 500 and the API router matches host plus PathPrefix('/v1') at 600, which is the same
  // pairing explorer.<apex> already has with micro-indexer. So every request stays relative.
  assert.equal(resolveApiBase(placementOf('pool.cloudsforge.online')), '')
  assert.equal(resolveApiBase(placementOf('pool-testnet.cloudsforge.online')), '')
  assert.equal(resolveApiBase(placementOf('hub.cloudsforge.online')), '')
  // An unknown placement stays relative too. There is no apex to build an absolute URL from, and an
  // invented one reaches a hostname that does not exist and reports itself as a network failure.
  assert.equal(resolveApiBase(placementOf('weird.example.net')), '')
  assert.equal(resolveApiBase(placementOf('localhost')), 'http://localhost:4146')
})

test('the stratum hostname is answered only where it is known, and never guessed', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // A WRONG HOSTNAME HERE COSTS A STRANGER A SILENT OUTAGE THEY WILL BLAME ON THEIR HARDWARE.
  //
  // Stratum v1 is line-delimited JSON-RPC over RAW TCP on its own port. It is not HTTP, it is not
  // behind the HTTPS front door this page arrived through, and micro-pool serves no TLS on it. So
  // "the page loaded from X" does not imply "the stratum port is on X" — it is a separate piece of
  // deploy plumbing that only happens to share a name. Not answering is better than answering
  // plausibly, and the page renders the absence.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(resolveStratumHost(placementOf('pool.cloudsforge.online')), 'pool.cloudsforge.online')
  assert.equal(
    resolveStratumHost(placementOf('pool-testnet.cloudsforge.online')),
    'pool-testnet.cloudsforge.online',
  )
  assert.equal(resolveStratumHost(placementOf('localhost')), 'localhost')
  assert.equal(resolveStratumHost(placementOf('hub.cloudsforge.online')), null)
  assert.equal(resolveStratumHost(placementOf('weird.example.net')), null)
})

test('no hostname is written down anywhere in this module', async () => {
  // The one rule that makes every branch above meaningful: nothing here holds a literal estate
  // address, so an image built once is correct on localhost, on testnet and on mainnet. The apex
  // always comes from `window.location.hostname`.
  const fs = await import('node:fs/promises')
  const source = await fs.readFile(new URL('../src/lib/hosts.ts', import.meta.url), 'utf8')
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n')
  assert.ok(!/cloudsforge\.online/.test(code), 'src/lib/hosts.ts must not contain an estate hostname')
  assert.ok(!/import\.meta\.env/.test(code), 'src/lib/hosts.ts must not read build-time configuration')
})
