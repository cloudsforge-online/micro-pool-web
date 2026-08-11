/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEPLOYMENT THAT HAS NO POOL BEHIND IT — micro-org#406.
 *
 * MEASURED, 2026-08-11. `https://pool-testnet.cloudsforge.online/` served this bundle with a 200
 * and every `/v1/…` request under it answered 502, so `/`, `/workers` and `/blocks` each rendered
 * "The pool did not answer" with a **Try again** button that could never succeed. Three pages of an
 * incident that was not happening: micro-pool sits behind `profiles: ["pool"]` in
 * `deploy/compose/docker-compose.estate.yml`, `compose/testnet.env` does not name that profile, so
 * the API container is never created and Traefik has no backend to forward `/v1` to. Deliberate,
 * permanent, and — per `deploy/gateway/dynamic/estate-web.yml` — the reason this console is NOT
 * behind the same profile: it is meant to be "the page that explains the hole".
 *
 * It could not explain anything, because it had never been told. `GET /deployment.json` is how it
 * is told (`src/lib/deployment.tsx`), and this file is the proof that being told changes what a
 * reader sees. Three groups, in the order the answer travels:
 *
 *   1. READING THE DOCUMENT. `absent` is said explicitly or not at all — every ambiguity resolves
 *      to `present`, because the cost of a false `absent` is a page telling a miner with hardware
 *      pointed at a working pool that the pool does not exist.
 *   2. FETCHING IT. Never throws, never reports, and never outlives its own budget.
 *   3. WHAT THE READER GETS. An explanation with a way onward, and — the assertion that makes this
 *      a fix rather than a redecoration — NO `/v1` REQUEST AT ALL.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { HUB_MINE_PATH } from '@cloudsforge/ui'
import { App } from '../src/app.tsx'
import { REQUEST_TIMEOUT_MS } from '../src/lib/api.ts'
import {
  DEPLOYMENT_PATH,
  DEPLOYMENT_TIMEOUT_MS,
  fetchPresence,
  readPresence,
} from '../src/lib/deployment.tsx'
import { installFetch, installWindow, json, removeWindow } from './browser-stubs.ts'
import { withScreen, type Routes } from './dom.ts'
import { poolBlocks, poolShares, poolStatus, poolWorkers } from './fixtures.ts'
import { read, stripComments } from './sources.ts'

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * 1. READING THE DOCUMENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

test('ONLY THE EXACT STRING "absent" MEANS ABSENT, AND EVERYTHING ELSE MEANS PRESENT', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The asymmetry runs the opposite way to `payoutsImplemented` in `src/lib/status.tsx`, and for the
  // same underlying reason: each defaults to the answer whose failure mode is survivable. There,
  // silence must not become a promise of payment. Here, silence must not become a page telling a
  // miner that a pool they are already connected to does not exist.
  //
  // The empty string is the case that will actually occur. `POOL_API_PRESENCE` unset renders as
  // `{"poolApi":""}` through nginx's envsubst — which is what EVERY host that has never heard of
  // this flag serves, including mainnet on the day this ships.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  assert.equal(readPresence({ poolApi: 'absent' }), 'absent')

  for (const body of [
    { poolApi: '' }, // an unset environment variable, i.e. every existing deployment
    { poolApi: 'present' },
    { poolApi: 'Absent' }, // not the exact string; a typo must not blank the console
    { poolApi: ' absent' },
    { poolApi: 'absent ' },
    { poolApi: false },
    { poolApi: null },
    {}, // a document from an image that predates the field
    { pool: 'absent' }, // the wrong field entirely
    null,
    'absent', // a bare string, not the document shape
    42,
    [],
  ] as const) {
    assert.equal(
      readPresence(body),
      'present',
      `${JSON.stringify(body)} was read as "there is no pool here", which is the expensive error`,
    )
  }
})

test('THE ANSWER IS SERVED BY THIS CONTAINER FROM ITS ENVIRONMENT, NOT BAKED INTO THE IMAGE', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The estate builds an image once, tags it once and promotes it by digest, so the flag cannot be
  // a build argument — `test/no-build-time-config.test.ts` forbids the whole family. It arrives at
  // RUNTIME instead, through the stock nginx entrypoint: `/docker-entrypoint.d/20-envsubst-on-
  // templates.sh` expands `/etc/nginx/templates/*.template` into `/etc/nginx/conf.d/` before nginx
  // starts, as uid 101 on `nginxinc/nginx-unprivileged` (verified by running the base image).
  //
  // Three things have to line up for that to work, and each has a way of failing silently:
  //
  //   1. THE TEMPLATE IS COPIED INTO THE IMAGE. Without it the location `include`s a file that does
  //      not exist and nginx refuses to start — loud, at least.
  //   2. THE OUTPUT IS `.inc`, NOT `.conf`. Everything matching `/etc/nginx/conf.d/*.conf` is
  //      included at the HTTP level by the stock `nginx.conf`, so a `.conf` output would be parsed
  //      as a second server block full of bare directives.
  //   3. THE VARIABLE IS NAMED IN THE TEMPLATE. envsubst substitutes what it is given; a template
  //      that never mentions `POOL_API_PRESENCE` would serve a fixed document on every estate,
  //      which is a config mechanism that quietly configures nothing.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const template = read('deployment.inc.template')
  const dockerfile = read('Dockerfile')
  const nginx = stripComments(read('nginx.conf'), 'nginx')

  assert.match(template, /\$\{POOL_API_PRESENCE\}/, 'the template does not read the flag')
  assert.match(template, /"poolApi"/, 'the template does not emit the field the bundle reads')
  assert.match(
    dockerfile,
    /COPY\s+deployment\.inc\.template\s+\/etc\/nginx\/templates\/deployment\.inc\.template/,
    'the template is not in the image, so nginx will not start',
  )
  //   4. THE VARIABLE HAS A DEFAULT IN THE IMAGE, and this one is not a nicety. MEASURED
  //      2026-08-11: with `POOL_API_PRESENCE` unset the container EXITED 1 —
  //      `nginx: [emerg] unknown "pool_api_presence" variable`. The entrypoint substitutes only
  //      variables that are SET (`envsubst "$defined_envs"` built from `printenv`), so an unset one
  //      is left verbatim and reaches nginx as an nginx variable reference. envsubst has no
  //      `${VAR:-default}`, so `ENV` is the only place the default can live — and without it this
  //      change would have taken every deployment that had not been told about the flag DOWN,
  //      mainnet first.
  assert.match(
    dockerfile,
    /^ENV\s+POOL_API_PRESENCE=\S+/m,
    'the image has no default for POOL_API_PRESENCE; an unset variable makes nginx refuse to start',
  )
  assert.match(nginx, /location\s*=\s*\/deployment\.json/, 'nginx serves no such address')
  assert.match(nginx, /include\s+\/etc\/nginx\/conf\.d\/deployment\.inc;/, 'the expansion is not included')
  assert.ok(
    !/templates\/deployment\.inc\.template\s+\/etc\/nginx\/conf\.d\//.test(dockerfile),
    'the template is copied straight to conf.d, where it would never be expanded',
  )
  // The path the bundle asks for and the path nginx answers are the same string, asserted against
  // the constant rather than restated — the two live in different languages in different files.
  assert.match(nginx, new RegExp(`location\\s*=\\s*${DEPLOYMENT_PATH}\\b`))

  // And the flag itself is nowhere near the bundle: no `import.meta.env`, no `process.env`, no
  // literal estate hostname. `test/no-build-time-config.test.ts` sweeps all of `src/`; this is the
  // narrower statement that THIS mechanism did not become the exception.
  const lib = stripComments(read('src/lib/deployment.tsx'), 'ts')
  assert.ok(!/import\.meta\.env/.test(lib))
  assert.ok(!/process\.env/.test(lib))
  assert.ok(!/POOL_API_PRESENCE/.test(lib), 'the bundle names an environment variable it cannot read')
})

test('THE DEPLOYMENT PROVIDER IS MOUNTED ABOVE EVERYTHING THAT READS IT', () => {
  // A context read above its own provider returns the default silently, and the default here is
  // `unknown` — which renders a loading state rather than an error. So getting this wrong produces
  // a console that spins forever on every page of every estate, with nothing in the log. The order
  // is asserted because the failure cannot announce itself.
  const app = stripComments(read('src/app.tsx'), 'ts')
  const deployment = app.indexOf('<DeploymentProvider>')
  const status = app.indexOf('<PoolStatusProvider>')
  assert.ok(deployment > 0 && status > 0, 'one of the two providers is not mounted at all')
  assert.ok(
    deployment < status,
    'PoolStatusProvider is mounted outside DeploymentProvider, so every read below it would ' +
      'stay in `unknown` and every page would load forever',
  )
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * 2. FETCHING IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

before(() => {
  installWindow('https://pool-testnet.cloudsforge.online/')
})
after(() => {
  removeWindow()
})

test('the document is read from THIS container, same-origin, and never from under /v1', async () => {
  // `/v1` is routed to micro-pool by the gateway — the service this document exists to report the
  // absence of. A `/v1/deployment` address would be answered by the very 502 it is meant to
  // explain, which is a mechanism that works everywhere except where it is needed.
  const stub = installFetch(() => json(200, { poolApi: 'absent' }))
  try {
    assert.equal(await fetchPresence(), 'absent')
    const url = new URL(stub.calls[0]?.url ?? '')
    assert.equal(url.origin, 'https://pool-testnet.cloudsforge.online')
    assert.equal(url.pathname, DEPLOYMENT_PATH)
    assert.ok(!url.pathname.startsWith('/v1'), 'the answer was asked of the service that is missing')
    assert.equal(stub.calls[0]?.method, 'GET')
  } finally {
    stub.restore()
  }
})

test('EVERY WAY OF NOT GETTING AN ANSWER RESOLVES TO PRESENT, AND NONE OF THEM THROWS', async () => {
  // The console this bundle has always shipped is the fallback, so an operator who deletes an
  // environment variable, or an older image with no such `location`, gets a console that works.
  // `fetchPresence` swallows all of it deliberately and reports none of it: there is no failure
  // here a reader or an operator can act on, and an image built before this document existed would
  // otherwise report an error on every page load on every estate until somebody noticed.
  const handlers: Array<[string, () => Response | Promise<Response>]> = [
    ['a 404 from an image that has no such location', () => new Response('', { status: 404 })],
    ['a 500 from a container mid-restart', () => new Response('', { status: 500 })],
    ['nginx answering the SPA fallback HTML', () => new Response('<!doctype html>', { status: 200 })],
    ['an empty 200', () => new Response('', { status: 200 })],
    [
      'a request that never landed',
      () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ]

  for (const [what, handler] of handlers) {
    const stub = installFetch(handler)
    try {
      assert.equal(await fetchPresence(), 'present', `${what} was read as "there is no pool here"`)
    } finally {
      stub.restore()
    }
  }
})

test('an aborted read resolves rather than rejecting, so unmounting cannot log an error', async () => {
  // `DeploymentProvider` aborts on unmount, and React unmounts a tree on every navigation in
  // development's strict double-render. A rejection here would surface as an unhandled rejection in
  // the console of anyone who navigated within one round trip of loading.
  const stub = installFetch(
    (call) =>
      new Promise<Response>((_resolve, reject) => {
        call.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }),
  )
  try {
    const controller = new AbortController()
    const pending = fetchPresence(controller.signal)
    controller.abort()
    assert.equal(await pending, 'present')
  } finally {
    stub.restore()
  }
})

test('the budget for this read is shorter than the budget for a read across the estate', () => {
  // Asserted as a RELATION rather than as the number, because the number is not the argument. This
  // is nginx answering a `return 200` from the origin that just served the document, not a service
  // call across an estate; waiting `REQUEST_TIMEOUT_MS` for it would spend eight seconds of blank
  // page on the pathological case, and the pathological case resolves to `present` anyway.
  assert.ok(
    DEPLOYMENT_TIMEOUT_MS < REQUEST_TIMEOUT_MS,
    `a same-origin static read is waited on for ${DEPLOYMENT_TIMEOUT_MS}ms, which is no shorter ` +
      `than the ${REQUEST_TIMEOUT_MS}ms this bundle allows a request that crosses the estate`,
  )
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * 3. WHAT THE READER GETS
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const app = () => createElement(App)

/**
 * The measured deployment: this bundle, with `/v1` stubbed so it CANNOT be the source of anything.
 *
 * The `/v1` routes are present and answer perfectly. That is the point: every assertion below about
 * what the reader sees has to survive an API that would have worked, so a regression that starts
 * calling it again fails on `matching('GET /v1')` rather than passing on a plausible screen.
 */
function noPool(over: Routes = {}): Routes {
  return {
    'GET /deployment.json': { body: { poolApi: 'absent' } },
    'GET /v1/pool': { body: poolStatus() },
    'GET /v1/pool/blocks': { body: poolBlocks() },
    'GET /v1/pool/workers': { body: poolWorkers() },
    'GET /v1/pool/shares': { body: poolShares() },
    ...over,
  }
}

const MEASURED = 'https://pool-testnet.cloudsforge.online'

test('ON A NETWORK WITH NO POOL, EVERY CONSOLE PAGE EXPLAINS ITSELF INSTEAD OF FAILING', async () => {
  // The three addresses that were measured rendering `Failed` on 2026-08-11, plus the DEEP LINK
  // into a miner's record. The deep link is here because it is the one that caught the first
  // version of this fix red: it takes its chain and account from the URL rather than from the
  // status provider, so gating the provider alone left it firing `GET /v1/pool/workers` and
  // `GET /v1/pool/shares` into a 502 apiece. It is also the address people bookmark and paste into
  // support conversations, which makes it the likeliest one a stranger arrives on cold.
  for (const path of ['/', '/workers', '/workers/ltc/ltc1qexampleaddress', '/blocks']) {
    await withScreen(app(), { url: `${MEASURED}${path}`, routes: noPool() }, async (screen) => {
      const text = screen.text()

      // THE FACT, FIRST AND IN THE HEADING. A reader with an ASIC to point somewhere needs it
      // before they need anything else.
      assert.ok(
        screen.queryByRole('heading', /This network does not run a mining pool/),
        `${path} did not say there is no pool here; it said: ${text.slice(0, 200)}`,
      )

      // AND NOT ONE WORD OF THE INCIDENT THAT IS NOT HAPPENING. This is the whole defect: the
      // previous page let a reader believe the pool existed and was merely down, which is the
      // belief that makes somebody wait and try again in an hour.
      assert.ok(!text.includes('The pool did not answer'), `${path} still reports an outage`)
      assert.ok(!text.includes('Could not reach the pool'), `${path} still reports an outage`)
      assert.equal(screen.queryByRole('button', /Try again/), null, `${path} offers a retry`)
      assert.equal(screen.queryByRole('alert', /pool/i), null, `${path} raises an alert`)
      assert.ok(!/request id/i.test(text), `${path} shows a request id for a request never made`)

      // NO REQUEST WAS MADE. The 502 this page exists to explain would otherwise still be in the
      // reader's console, and on `/workers` and `/blocks` there would be a second and a third.
      assert.deepEqual(
        screen.api.matching('GET /v1'),
        [],
        `${path} called an API it had been told is not there`,
      )
      assert.deepEqual(screen.api.failed, [], `${path} produced a failed request`)
      screen.clean(`${path} on a deployment with no pool`)
    })
  }
})

test('the explanation carries the two ways onward, and they are DERIVED addresses', async () => {
  await withScreen(app(), { url: `${MEASURED}/`, routes: noPool() }, async (screen) => {
    // The pool that DOES exist. "No pool here" on its own reads as "the pool was shut down", and
    // this surface is the one place a miner would go to check. The address is composed from the
    // address of this page (`unlabelledSurfaceUrl`), never written into the bundle — an image
    // naming an estate hostname is the build-time configuration
    // `test/no-build-time-config.test.ts` forbids.
    const elsewhere = screen.byRole('link', /Open the CloudsForge mining pool/)
    assert.equal(elsewhere.getAttribute('href'), 'https://pool.cloudsforge.online')
    // And the prose makes the same claim the link does, from the same condition.
    assert.ok(screen.text().includes('runs on the main network'))

    // And what CAN be mined here. A network without a Stratum pool is not a network without
    // mining: EMBER is mined against the node from a browser tab, on every estate, from Forge
    // Hub's `/mine`. This one stays on the environment the reader is already on.
    const ember = screen.byRole('link', /Mine EMBER on Forge Hub/)
    assert.equal(ember.getAttribute('href'), `https://hub-testnet.cloudsforge.online${HUB_MINE_PATH}`)

    // Not a word about WHEN. There is no schedule for a pool on a network that is not getting one,
    // and "coming soon" on an infrastructure page is a promise nobody has made.
    const text = screen.text().toLowerCase()
    for (const schedule of ['coming soon', 'not yet', 'will be available', 'in a future', 'soon']) {
      assert.ok(!text.includes(schedule), `the explanation says "${schedule}", which is a date`)
    }
  })
})

test('ON THE UNADORNED ENVIRONMENT THE SENTENCE STANDS WITHOUT A LINK BACK TO ITSELF', async () => {
  // `pool.<apex>` has no environment label to strip, so the composed address would be this very
  // page — a link a reader would click to arrive back where they already are. That state is either
  // an estate whose pool profile is genuinely off, which is what mainnet looked like before
  // 2026-08-09, or a misconfiguration; either way the honest rendering is the explanation on its
  // own. See `src/lib/hosts.ts`.
  await withScreen(app(), { url: 'https://pool.cloudsforge.online/', routes: noPool() }, async (screen) => {
    assert.ok(screen.queryByRole('heading', /This network does not run a mining pool/))
    assert.equal(screen.queryByRole('link', /Open the CloudsForge mining pool/), null)
    // Nor does it CLAIM the pool is somewhere it cannot link to. "The pool runs on the main
    // network" said on the main network is the flat sentence being false about the reader's own
    // position, which is the state mainnet was in before its `pool` profile was switched on.
    assert.ok(
      !screen.text().includes('runs on the main network'),
      'the page says where the pool is while being unable to say how to get there',
    )
    // The other way onward does not depend on the composition and is still there.
    assert.ok(screen.queryByRole('link', /Mine EMBER on Forge Hub/))
  })
})

test('an address this router does not know is still a 404, whatever the deployment is', async () => {
  // Answering "this network does not run a mining pool" for `/typo` would be a true sentence about
  // the wrong question, under a status code that contradicts it — nginx serves unknown addresses
  // with a real 404. `src/app.tsx` deliberately leaves `NotFoundPage` out of the substitution.
  await withScreen(app(), { url: `${MEASURED}/payouts`, routes: noPool() }, async (screen) => {
    assert.ok(screen.queryByRole('heading', /Page not found/))
    assert.equal(screen.queryByRole('heading', /This network does not run a mining pool/), null)
  })
})

test('WITH A POOL BEHIND IT, NOTHING ABOUT THIS CONSOLE CHANGES', async () => {
  // The regression that would cost the most. Every deployment that HAS a pool must be untouched by
  // all of the above, including the two that say nothing about themselves at all: an image built
  // before `/deployment.json` existed (404) and a container whose own nginx did not answer.
  const sames: Array<[string, Routes]> = [
    ['a deployment that says it has a pool', noPool({ 'GET /deployment.json': { body: { poolApi: 'present' } } })],
    ['an unset POOL_API_PRESENCE', noPool({ 'GET /deployment.json': { body: { poolApi: '' } } })],
    ['an image that predates the document', noPool({ 'GET /deployment.json': { status: 404, body: {} } })],
    ['a document that never arrived', noPool({ 'GET /deployment.json': { networkError: 'Failed to fetch' } })],
  ]

  for (const [what, routes] of sames) {
    await withScreen(app(), { url: 'https://pool.cloudsforge.online/', routes }, async (screen) => {
      assert.equal(
        screen.queryByRole('heading', /This network does not run a mining pool/),
        null,
        `${what} blanked the pool's own console`,
      )
      // The console did what it has always done: it asked micro-pool, and rendered the answer.
      assert.equal(screen.api.matching('GET /v1/pool').length > 0, true, `${what} stopped asking the API`)
      assert.ok(screen.text().includes('Pointing a miner here'), `${what} did not render the landing page`)
    })
  }
})
