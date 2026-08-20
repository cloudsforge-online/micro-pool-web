/**
 * Pressing Testnet re-reads this console FROM TESTNET, and the page says so when nothing is there.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG, MEASURED ON MAINNET ON 2026-08-16.
 *
 * `test/viewed.test.ts` already pins the pure half — `apiBase()` follows the switcher — and it
 * passed the whole time this was broken, because the defect was never in `lib/`. Pressing Testnet
 * on `pool.cloudsforge.online` flipped the amber band, wrote `?net=testnet` into the address bar
 * and set `aria-pressed`, AND ISSUED NO REQUEST AT ALL. Every number on the screen stayed
 * mainnet's, under a banner saying the reader was looking at testnet.
 *
 * The cause is two-thirds structural and one-third a React rule that is easy to get wrong:
 *
 *   - `AppShell` holds the switcher, and it held the choice in `useState`. `DeploymentProvider`
 *     and `PoolStatusProvider` are mounted in `src/app.tsx` ABOVE the shell, so nothing about the
 *     click could reach either of them.
 *   - Passing `children` THROUGH a provider does not re-render them: React bails out when the
 *     element is unchanged, however new the context value is. A consumer has to call the hook.
 *
 * So the fix is `src/lib/viewing.tsx` — the choice held above both providers, and both of them
 * subscribing to it — and this file is the test that could not have passed before it.
 *
 * ── WHY THE ROUTE TABLE IS A FUNCTION OF THE URL ──────────────────────────────────────────────
 *
 * `test/dom.ts` matches routes on the PATH, deliberately, so a scenario does not have to know
 * which origin the page is on. That is exactly what this scenario is about: the same `/v1/pool` is
 * requested at two different origins and must be answered differently. So the reply branches on
 * `wire.url`, and the assertions read `wire.url` rather than `wire.path` for the same reason.
 *
 * The testnet estate answers with a NETWORK ERROR rather than a 502, because that is what a
 * browser sees: the edge's 502 for a missing container carries no `access-control-allow-origin`
 * (measured 2026-08-16), so the fetch rejects rather than resolving with a readable status. A stub
 * that returned a 502 here would be testing a code path no browser can reach.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { createElement } from 'react'
import { App } from '../src/app.tsx'
import { setViewedNetwork } from '../src/lib/viewed.ts'
import { installWindow, removeWindow } from './browser-stubs.ts'
import { withScreen, type Routes, type Screen } from './dom.ts'
import { poolBlocks, poolShares, poolStatus, poolWorkers } from './fixtures.ts'

const app = () => createElement(App)

/** The mainnet console: the estate that serves this bundle in the scenarios below. */
const PAGE = 'https://cloudsforge.online/pool/'
/** The estate the reader switches to. `-testnet` on the API host; the web hostname is retired. */
// The testnet console is `testnet.<apex>/pool` since wave 3d, so the ORIGIN a cross-estate read
// goes to is the testnet apex — the mount is a path under it, added by `apiBase()`.
const TESTNET_API = 'testnet.cloudsforge.online'

/** A mainnet estate with a pool, and a testnet estate with nothing behind `/v1`. */
function routes(over: Routes = {}): Routes {
  return {
    'GET /deployment.json': { body: { poolApi: 'present' } },
    'GET /v1/pool': (wire) =>
      wire.url.includes(TESTNET_API) ? { networkError: 'Failed to fetch' } : { body: poolStatus() },
    'GET /v1/pool/blocks': { body: poolBlocks() },
    'GET /v1/pool/workers': { body: poolWorkers() },
    'GET /v1/pool/shares': { body: poolShares() },
    ...over,
  }
}

/** Press one of the switcher's two buttons and let the reads that follow settle. */
async function switchTo(screen: Screen, network: 'Mainnet' | 'Testnet'): Promise<void> {
  await screen.click(screen.byRole('button', network))
  await screen.settle()
}

/** Every request this mount made to the testnet estate. */
const testnetCalls = (screen: Screen): string[] =>
  screen.api.wire.filter((w) => w.url.includes(TESTNET_API)).map((w) => w.url)

describe('the pool console follows the network the reader is viewing', () => {
  /*
   * The choice lives in MODULE memory (`src/lib/viewed.ts`, constructed once at import), so it
   * outlives the mount that set it and would carry into the next test in this file. Reset through
   * the public setter with a window installed, because `setViewedNetwork` normalises its argument
   * against the hostname's own network — the same reset `test/viewed.test.ts` performs.
   */
  afterEach(() => {
    installWindow(PAGE)
    try {
      setViewedNetwork('mainnet')
    } finally {
      removeWindow()
    }
  })

  it('reads the OTHER estate when the reader presses Testnet, without going anywhere', async () => {
    await withScreen(app(), { url: PAGE, routes: routes() }, async (screen) => {
      await screen.settle()
      assert.deepEqual(testnetCalls(screen), [], 'nothing should reach testnet before the click')

      await switchTo(screen, 'Testnet')

      assert.ok(
        testnetCalls(screen).some((url) => url === `https://${TESTNET_API}/pool/v1/pool`),
        `no request reached the testnet estate; the console asked: ${screen.api.wire
          .map((w) => w.url)
          .join(', ')}`,
      )
      // The whole point of the in-place view: the reader is still on the page they were on.
      assert.equal(screen.window.location.hostname, 'cloudsforge.online')
    })
  })

  it('says nothing answered THERE, rather than staging an incident here', async () => {
    await withScreen(app(), { url: PAGE, routes: routes() }, async (screen) => {
      await screen.settle()
      await switchTo(screen, 'Testnet')

      assert.match(screen.text(), /No mining pool answered on the test network/)
      // micro-org#406, one page further along: "The pool did not answer" and a Try again button on
      // a network that has no pool is the incident that is not happening.
      assert.doesNotMatch(screen.text(), /did not answer\./)
      assert.equal(screen.queryByRole('button', /Try again/), null)
      // And not the flat page either, which is written about the DEPLOYMENT serving the reader —
      // every word of it false for somebody whose console has a pool and who switched away from it.
      assert.doesNotMatch(screen.text(), /This network does not run a mining pool/)
    })
  })

  it('switches back in place from the page itself, and re-reads the serving estate', async () => {
    await withScreen(app(), { url: PAGE, routes: routes() }, async (screen) => {
      await screen.settle()
      await switchTo(screen, 'Testnet')

      const before = screen.api.wire.length
      await screen.click(screen.byRole('button', /Show the pool on the main network/))
      await screen.settle()

      const after = screen.api.wire.slice(before)
      assert.ok(
        after.some((w) => w.path === '/v1/pool' && !w.url.includes(TESTNET_API)),
        `switching back asked nobody for the pool again: ${after.map((w) => w.url).join(', ')}`,
      )
      assert.doesNotMatch(screen.text(), /No mining pool answered/)
      assert.equal(screen.window.location.hostname, 'cloudsforge.online')
      screen.clean('switching to testnet and back')
    })
  })
})
