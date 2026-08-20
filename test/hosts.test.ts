/**
 * Where this bundle thinks it is, and what it talks to.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE USED TO BE AN ALARM, AND IT WENT OFF.
 *
 * `ui/packages/ui/src/surfaces.ts` had no `pool` row, so `cloudsforgeHosts()` could not strip
 * `pool.` when deriving the apex and resolved every sibling address one level too deep.
 * `src/lib/hosts.ts` carried a local correction, and the first test in this file asserted THE GAP —
 * so that the day somebody added the row, the test went red and told them what to delete.
 *
 * micro-ui#3 merged on 2026-08-09 and that is what happened. `placementOf`, `correctedHosts`,
 * `POOL_SUBDOMAIN` and the tests pinning them are gone; what is left checks that this surface reads
 * the registry rather than restating it, which is the arrangement the correction existed to reach.
 *
 * The mechanism is worth keeping in mind rather than the story: an absence with no test on it is a
 * decision that has already been forgotten, and an absence with a test that only checks the absence
 * is a decision that outlives its reason.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { KNOWN_SUBS, SURFACES, surface } from '@cloudsforge/ui/surfaces'
import {
  ACCENT_SURFACE,
  APP_NAME,
  hosts,
  isLocal,
  placementIsKnown,
  POOL_API_DEV_PORT,
  PRODUCT,
  resolveApiBase,
  unlabelledPoolUrl,
  unlabelledSurfaceUrl,
} from '../src/lib/hosts.ts'
import { read, readSibling, stripComments } from './sources.ts'

/**
 * Run `fn` as though the bundle were being served from `url`.
 *
 * A window rather than a hand-built map of estate URLs, deliberately. The functions under test read
 * `window.location` and hand it to `cloudsforgeHosts()`, and the defect this file used to guard —
 * every sibling address one level too deep — lived entirely in that composition. A test that passed
 * in its OWN idea of what the registry composes would have agreed with the bug it was written to
 * catch, which is the failure mode of every fixture that restates the thing it is checking.
 */
function atPage<T>(url: string, fn: () => T): T {
  const win = new Window({ url })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true })
  try {
    return fn()
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete (globalThis as { window?: unknown }).window
  }
}

test('THE REGISTRY KNOWS THIS SURFACE, WHICH IS WHAT RETIRED THE LOCAL CORRECTION', () => {
  // The row `src/lib/hosts.ts` waited for. With it, `cloudsforgeHosts()` strips `pool.` correctly
  // and every sibling address on this page resolves one level up instead of one level too deep.
  const pool = surface(PRODUCT)
  // ── THE ROW IS STILL HERE; WHAT IT SAYS CHANGED IN WAVE 3d ─────────────────────────────────
  //
  // The correction this test retired was a LOCAL copy of the registry, added when `pool.` was not a
  // known first label. The row is what made it deletable, and the row now places this surface on
  // the apex instead of on a hostname — so the assertion is about the row EXISTING and being
  // authoritative, which is what it was always for, rather than about one value it happens to hold.
  assert.equal(pool.subdomain, '')
  assert.equal(pool.basePath, '/pool')
  // `pool` is no longer a subdomain this estate serves, and KNOWN_SUBS must not claim it is:
  // `cloudsforgeHosts()` strips known first labels to find the apex, so a stale entry would make
  // `pool.example.dev` resolve its apex one level too shallow.
  assert.equal(KNOWN_SUBS.has('pool'), false)
  // `servesUi` is what puts this surface in the shared footer's columns at all, and `inSwitcher:
  // false` is what keeps a mining pool out of the product switcher a signed-in customer opens.
  assert.equal(pool.servesUi, true)
  assert.equal(pool.inSwitcher, false)
  // No mark of its own, which is why public/ borrows Forge Network's chrome. See brand-chrome.test.
  assert.equal(pool.markId, null)
})

test('THE DEV PORT IS THE PORT MICRO-POOL BINDS, CHECKED AGAINST MICRO-POOL', (t) => {
  // Read off the registry rather than restated in this repository — but the registry can be wrong,
  // and it has been three times over (foresight carried beacon's 4011, emberkin carried 3014 while
  // binding 4100, admin carried 3002 while admin-api binds 4014). The only check that catches that
  // is the service's own declaration, so this reads it when micro-pool is checked out beside us.
  assert.equal(POOL_API_DEV_PORT, surface(PRODUCT).devPort)
  const example = readSibling('pool/.env.example')
  if (!example) return t.skip('micro-pool is not checked out beside this repository')
  const declared = /^PORT=(\d+)$/m.exec(example)?.[1]
  assert.equal(
    Number(declared),
    POOL_API_DEV_PORT,
    'the surface registry and pool/.env.example disagree about the port micro-pool binds, so ' +
      '`pnpm dev` on this bundle asks a port nothing is listening on',
  )
})

test('the app name and the accent are still this surface’s own', () => {
  assert.equal(APP_NAME, 'pool-web')
  // Naming a `pool` product accent would fall through to the company ember in complete silence:
  // tokens.css has no block for it even now that the registry has a row. `network` exists, is what
  // explorer-web names for the same reason — chain infrastructure belongs to Forge Network — and
  // `test/brand-chrome.test.ts` checks the CSS selector for it is real.
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

test('the API base is same-origin everywhere except a local checkout', () => {
  // Same origin because the gateway already arranges it: the bundle router matches the host at
  // priority 500 and the API router matches host plus PathPrefix('/v1') at 600, which is the same
  // pairing explorer.<apex> already has with micro-indexer. So every request stays relative.
  assert.equal(resolveApiBase('pool.cloudsforge.online'), '')
  assert.equal(resolveApiBase('testnet.cloudsforge.online'), '')
  // An unknown placement stays relative too, and that is a departure from explorer-web's version of
  // this function on purpose: there is no apex to build an absolute URL from, and an invented one
  // reaches a hostname that does not exist and reports itself as a network failure.
  assert.equal(resolveApiBase('some-preview.example.net'), '')
  assert.equal(resolveApiBase('localhost'), `http://localhost:${POOL_API_DEV_PORT}`)
})

test('THE REGISTRY PLACES THIS SURFACE AT ITS OWN HOSTNAME, IN BOTH ENVIRONMENT SHAPES', () => {
  // The assertion the deleted correction existed to make true. Before the row landed, `pool.` was
  // not a known first label, the whole hostname became the apex, and this came out
  // `https://pool.pool.cloudsforge.online` — a name that does not resolve, on a page that renders
  // perfectly.
  assert.equal(
    atPage('https://cloudsforge.online/pool/', () => hosts()[PRODUCT]),
    'https://cloudsforge.online/pool',
  )
  assert.equal(atPage('https://cloudsforge.online/pool/', placementIsKnown), true)

  // The environment is a SUFFIX on the first label, never a second one. Cloudflare's Universal SSL
  // wildcard matches exactly one label, so `pool.testnet.cloudsforge.online` fails the handshake at
  // the edge before it reaches the estate — which is why the registry composes `pool-testnet`.
  assert.equal(
    atPage('https://testnet.cloudsforge.online/pool/', () => hosts()[PRODUCT]),
    'https://testnet.cloudsforge.online/pool',
  )
  assert.equal(atPage('https://testnet.cloudsforge.online/pool/', placementIsKnown), true)
  // And a testnet page composes TESTNET siblings. The failure this rules out is the quiet one: a
  // suffixed hostname resolving to the mainnet apex, where every link works and points at real
  // money. The registry's own header calls that out as worse than the defect it replaced.
  assert.match(atPage('https://testnet.cloudsforge.online/pool/', () => hosts().site), /testnet/)

  // A local checkout is always placed — the registry resolves every surface to a localhost port.
  assert.equal(atPage('http://localhost:5173/', placementIsKnown), true)
})

test('THE ONE ADDRESS THIS CONSOLE MAY POINT AWAY FROM ITSELF IS COMPOSED, NEVER WRITTEN DOWN', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // micro-org#406. A reader on a network with no pool needs to be told where the pool IS, and
  // `cloudsforgeHosts()` cannot say it: every address it answers is on the environment the page is
  // being served from, which is precisely the environment that has no pool.
  //
  // So the address is composed — the apex off the page, the first label off the registry's own
  // `envLabel(subdomain, '')`. This asserts the composition rather than restating its output as a
  // constant, because a constant here is the literal build-time hostname
  // `test/no-build-time-config.test.ts` forbids, and it would agree with a wrong derivation.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(
    unlabelledSurfaceUrl('testnet.cloudsforge.online'),
    'https://cloudsforge.online/pool',
  )
  // Any environment, not just the one that prompted this. `staging` and `preview` are registry
  // labels too, and a rule written around the string "testnet" would be a fourth copy of the list.
  assert.equal(
    unlabelledSurfaceUrl('staging.cloudsforge.online'),
    'https://cloudsforge.online/pool',
  )
  // The apex comes off the PAGE. An estate served from another domain gets its own pool, not this
  // one — the whole point of composing rather than hard-coding.
  assert.equal(unlabelledSurfaceUrl('dev.example.test'), 'https://example.test/pool')
  // Arriving on ANOTHER surface's labelled hostname still composes the POOL, because the subdomain
  // comes from `surface(PRODUCT)` and not from the address. That is what makes this correct on the
  // day some other console imports it.
  assert.equal(
    unlabelledSurfaceUrl('hub-testnet.cloudsforge.online'),
    'https://cloudsforge.online/pool',
  )

  // ── AND EVERY CASE WHERE THE ANSWER IS NO LINK AT ALL ────────────────────────────────────────
  //
  // A "the pool is over here" link that 404s teaches the reader the pool is gone, which is worse
  // than the sentence standing on its own. `src/pages/no-pool.tsx` renders no anchor for these.
  for (const local of ['', 'localhost', '127.0.0.1', 'estate.local']) {
    assert.equal(unlabelledSurfaceUrl(local), null, `${local || '(empty)'} composed an address`)
  }
  // Already on the unlabelled environment: the composed address would be this very page.
  assert.equal(unlabelledSurfaceUrl('pool.cloudsforge.online'), null)
  // A two-label hostname IS an apex — there is no first label to spend on an environment.
  assert.equal(unlabelledSurfaceUrl('cloudsforge.online'), null)
  // A first label the registry cannot split: a preview deployment, somebody's tunnel. The apex
  // would be invented, and inventing one is how a dead link gets published.
  assert.equal(unlabelledSurfaceUrl('some-preview.example.net'), null)

  // The window-reading wrapper agrees with the pure function it wraps, which is the only part of
  // this that `src/pages/no-pool.tsx` actually calls.
  assert.equal(
    atPage('https://testnet.cloudsforge.online/pool/', unlabelledPoolUrl),
    'https://cloudsforge.online/pool',
  )
  assert.equal(atPage('https://cloudsforge.online/pool/', unlabelledPoolUrl), null)
  assert.equal(atPage('http://localhost:4146/', unlabelledPoolUrl), null)
})

test('AN ADDRESS THE REGISTRY CANNOT PLACE SAYS SO INSTEAD OF GUESSING', () => {
  // Served from a name the registry cannot strip, the whole name becomes the apex and every estate
  // URL on the page resolves one level too deep. Nothing here is a security boundary — every route
  // on this surface is public — but the shell says it once rather than rendering dead links in
  // silence, and the shared footer's three legal links are among the ones that would be wrong.
  assert.equal(atPage('https://some-preview.example.net/', placementIsKnown), false)
  // Another surface's hostname is not this one either: `hub` IS known, so the apex comes out right
  // and every link on the page works — but this bundle is not what belongs there, and saying so is
  // cheaper than leaving somebody to wonder why the pool is being served from the hub.
  // `hub.<apex>` — and this one changed shape with wave 3d rather than changing answer. The console
  // used to belong on `pool.<apex>`; it belongs on `<apex>/pool` now, so being served from ANY
  // subdomain is being served from the wrong place, and `hub` is simply the clearest example.
  assert.equal(atPage('https://hub.cloudsforge.online/pool/', placementIsKnown), false)
})

test('THE STRATUM HOSTNAME IS NOT DERIVED HERE, AND MUST NOT COME BACK', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // This module used to answer `resolveStratumHost()` from `window.location.hostname`, on the theory
  // that the deploy exposes the TCP ports on the same name. It does not and cannot: this bundle is
  // served through a Cloudflare Tunnel and then Traefik, neither of which forwards a raw TCP stream,
  // and micro-pool binds the listener to loopback by default. So the guess was WRONG rather than
  // merely unverified, and it published a copy-pasteable endpoint no miner could connect to.
  //
  // The endpoint is now optional configuration in micro-pool and arrives on `GET /v1/pool` as
  // `stratumEndpoint`, or null. This asserts that nothing in this module has grown the guess back —
  // it is the one derivation on this surface that a plausible-looking reimplementation would make
  // silently, and the page it produces looks completely fine. micro-org#285.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // Comments stripped, because the header ARGUES against the derivation at length and a grep over
  // the raw bytes would match the argument and fail a correct file — see `test/sources.ts`.
  const code = stripComments(read('src/lib/hosts.ts'), 'ts')
  // Named forms rather than a bare /stratum/i, because `SURFACE_DESCRIPTION` legitimately contains
  // the words "Stratum v1" — it is the sentence that tells a stranger what this pool is. A rule that
  // cannot be satisfied without deleting the product's own description is a rule somebody deletes.
  for (const derivation of [/stratumHost/, /resolveStratum/, /stratum\+tcp/, /stratumEndpoint/, /stratumPort/]) {
    assert.doesNotMatch(code, derivation, 'src/lib/hosts.ts derives something about stratum again')
  }

  // And the rule that makes every branch above meaningful: nothing here holds a literal estate
  // address, so an image built once is correct on localhost, on testnet and on mainnet.
  assert.ok(!/cloudsforge\.online/.test(code), 'src/lib/hosts.ts must not contain an estate hostname')
  assert.ok(!/import\.meta\.env/.test(code), 'src/lib/hosts.ts must not read build-time configuration')
})
