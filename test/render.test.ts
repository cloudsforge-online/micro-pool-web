/**
 * The pages, mounted, with micro-pool stubbed.
 *
 * Doc 22 §2.4.3: elements are addressed by accessible role and name, never by class or DOM path. A
 * markup change must not break these; an accessible-name change must.
 *
 * The scenarios here are the ones that would be wrong in a way a reader would act on — a chain
 * selector on a pool that serves one chain, a rejected block hidden, an empty pool that reads like
 * an outage. The payout language is not tested here at all; it has its own file, because it is the
 * one claim worth failing the build over.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { App } from '../src/app.tsx'
import { withScreen, type Routes } from './dom.ts'
import {
  BTC,
  coldStatus,
  LTC,
  poolBlocks,
  poolShares,
  poolStatus,
  poolWorkers,
  published,
} from './fixtures.ts'

/** Every route stubbed with the default fixtures, so a scenario only overrides what it is about. */
function allRoutes(over: Routes = {}): Routes {
  return {
    'GET /v1/pool': { body: poolStatus() },
    'GET /v1/pool/blocks': { body: poolBlocks() },
    'GET /v1/pool/workers': { body: poolWorkers() },
    'GET /v1/pool/shares': { body: poolShares() },
    ...over,
  }
}

const app = () => createElement(App)

test('the landing page says what the pool will not do before it says how to connect', async () => {
  await withScreen(app(), { url: 'https://pool.cloudsforge.online/', routes: allRoutes() }, async (screen) => {
    // The order is the argument. A page that opens with a stratum URL has asked for hashrate before
    // saying what happens to it.
    screen.before(
      'What this pool does not do',
      'Pointing a miner here',
      'the absences are the thing a reader must weigh before they act',
    )
    screen.before(
      'This pool does not pay out.',
      'What this pool does not do',
      'the standing statement is in the shell, above every page',
    )
    screen.clean('the landing page')
  })
})

test('THE ENDPOINT ON SCREEN IS THE ONE THE API PUBLISHED, NOT THE ADDRESS OF THE PAGE', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // This page used to compose `stratum+tcp://<its own hostname>:<the bound port>` and that string
  // could not connect: the console arrives through a Cloudflare Tunnel and then Traefik, neither of
  // which forwards a raw TCP stream, and the port it printed was the inside of a port mapping. The
  // fixture therefore publishes a DIFFERENT host and a DIFFERENT port from both, so a regression
  // that reached for either one is a red test rather than a plausible screen. micro-org#285.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({ 'GET /v1/pool': { body: poolStatus({ chains: [published(LTC, 4334)] }) } }),
    },
    async (screen) => {
      assert.ok(screen.text().includes('stratum+tcp://stratum.example.com:4334'))
      assert.ok(!screen.text().includes('pool.cloudsforge.online:'), 'the page address became an endpoint')
      assert.ok(!screen.text().includes(':3334'), 'the BOUND port was offered as one a miner can dial')
      assert.ok(screen.text().includes('scrypt'))
      // Said in the same breath as the address, because a reader who assumes the HTTPS they are
      // reading this over covers the mining port will configure TLS and get a silent failure.
      assert.ok(screen.text().includes('There is no TLS on this port.'))
      // The copy-pasteable form is there when, and only when, it can work.
      assert.ok(screen.text().includes('cgminer -o stratum+tcp://stratum.example.com:4334'))
    },
  )
})

test('WITH NO PUBLISHED ENDPOINT THE PAGE NAMES THE HOLE AND OFFERS NO CONNECTION STRING AT ALL', async () => {
  // The default fixture, because it is the state of every deployment of micro-pool there is: the
  // endpoint is optional configuration and nothing has set it. A named hole rather than a plausible
  // screen — and a copy-pasteable command that cannot connect is the worst possible version of a
  // plausible screen, because its owner debugs their own hardware instead of asking a question.
  await withScreen(app(), { url: 'https://pool.cloudsforge.online/', routes: allRoutes() }, async (screen) => {
    assert.ok(!screen.text().includes('stratum+tcp://'), 'a connection string was rendered anyway')
    assert.ok(!screen.text().includes('cgminer'), 'a command was rendered with a hole in it')
    assert.ok(!screen.text().includes('3334'), 'the bound port was offered as something to dial')
    assert.ok(screen.text().includes('No stratum endpoint has been published'))
    assert.ok(screen.text().includes('Ask an operator'))
    // The rest of the card still renders. The endpoint is missing; the algorithm, the username
    // convention and the warning about TLS are all still facts a reader needs.
    assert.ok(screen.text().includes('scrypt'))
    assert.ok(screen.text().includes('There is no TLS on this port.'))
  })
})

test('served from an address the registry cannot place, the shell says so', async () => {
  await withScreen(
    app(),
    { url: 'https://some-preview.example.net/', routes: allRoutes() },
    async (screen) => {
      // A page whose every outbound link is silently wrong is worse than one that admits it does not
      // know where it is. This is now the WHOLE of what an unregistered placement affects: the
      // stratum endpoint is no longer derived from the address, so it is null here for the same
      // reason it is null everywhere else — nobody published one.
      assert.ok(screen.queryByRole('status', /surface registry does not know/))
      assert.ok(!screen.text().includes('stratum+tcp://'))
    },
  )
})

test('a pool serving ONE chain renders no chain selector', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // This is the deployable configuration on 2026-08-09 and for about a month afterwards: bitcoind
  // is still doing its initial block download, so `POOL_CHAINS` is `ltc` alone. A hard-coded pair
  // of tabs would render an empty BTC panel for that whole period and then be wrong again the day a
  // third chain arrives. Everything on screen is drawn from what the API reported.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  await withScreen(app(), { url: 'https://pool.cloudsforge.online/', routes: allRoutes() }, async (screen) => {
    assert.deepEqual(screen.allByRole('combobox'), [])
    assert.ok(screen.text().includes('Litecoin'))
    assert.ok(!screen.text().includes('Bitcoin'))
  })
})

test('a pool serving two chains renders a selector and a panel for each', async () => {
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({
        'GET /v1/pool': {
          body: poolStatus({ chains: [published(LTC, 4334), published(BTC, 4333)] }),
        },
      }),
    },
    async (screen) => {
      const picker = screen.byRole('combobox', /Chain/)
      assert.ok(screen.text().includes('Litecoin'))
      assert.ok(screen.text().includes('Bitcoin'))
      // BTC is `ready: false` in the fixture because bitcoind has not finished syncing, and the
      // live panel says so for every chain at once.
      assert.ok(screen.text().includes('No usable template'))

      // The warning on the CONNECTION card is per selected chain, because it is about the machine
      // the reader is about to configure: a miner pointed at a chain with no template authorises
      // and then sits idle, which looks exactly like their own hardware failing.
      assert.ok(!screen.text().includes('cannot hand out work right now'))
      await screen.type(picker, 'btc')
      // A pool serving two chains publishes two PORTS under one name, which is why the port is
      // per chain in micro-pool's configuration and the host is not.
      assert.ok(screen.text().includes('stratum+tcp://stratum.example.com:4333'))
      assert.ok(screen.text().includes('cannot hand out work right now'))
      assert.ok(screen.text().includes('sha256d'))
    },
  )
})

test('a pool configured to mine nothing says so instead of rendering an empty page', async () => {
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({ 'GET /v1/pool': { body: poolStatus({ chains: [] }) } }),
    },
    async (screen) => {
      assert.ok(screen.text().includes('configured to mine nothing at all'))
      assert.ok(screen.text().includes('POOL_CHAINS'))
    },
  )
})

test('a pool nobody is mining reports zero, and the page says zero is the right answer', async () => {
  // The ordinary state. Written as a cold start rather than as an outage: neither network in this
  // estate has real users, so an empty window is arithmetic and not a fault.
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({ 'GET /v1/pool': { body: coldStatus() } }),
    },
    async (screen) => {
      assert.ok(screen.text().includes('0 H/s'))
      assert.ok(screen.text().includes('honest reading of an empty window rather than a fault'))
    },
  )
})

test('the fee is rendered as unknown when the service did not state one', async () => {
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      // `feeBasisPoints` absent from the body entirely, which is what a service that had made it
      // optional would send. A fee of 0% shown here would be this site choosing "free" on the
      // operator's behalf.
      routes: allRoutes({
        'GET /v1/pool': { body: { ...poolStatus(), feeBasisPoints: undefined } },
      }),
    },
    async (screen) => {
      assert.ok(screen.text().includes('not stated'))
      assert.ok(!/\b0% of a block reward/.test(screen.text()))
    },
  )
})

test('the blocks page shows the rejections, with the node’s own words', async () => {
  await withScreen(
    app(),
    { url: 'https://pool.cloudsforge.online/blocks', routes: allRoutes() },
    async (screen) => {
      assert.ok(screen.byRole('table', /Blocks this pool has submitted/))
      assert.ok(screen.text().includes('accepted'))
      // The row this page exists for. A pool that displayed only its accepted blocks would be
      // hiding the one failure its miners must know about: work was done, a solution was found,
      // and the network threw it away.
      assert.ok(screen.text().includes('rejected'))
      assert.ok(screen.text().includes('inconclusive: stale block time-too-old'))
      // The reward is rendered from the string, and is captioned as nobody's.
      assert.ok(screen.text().includes('12.5'))
      assert.ok(screen.text().includes('not a balance'))
    },
  )
})

test('a pool that has never found a block says so as a normal state', async () => {
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/blocks',
      routes: allRoutes({ 'GET /v1/pool/blocks': { body: poolBlocks({ blocks: [] }) } }),
    },
    async (screen) => {
      assert.ok(screen.text().includes('This pool has never found a block.'))
      assert.ok(screen.text().includes('what a pool with no miners looks like'))
    },
  )
})

test('a failed read is a failure with a reference, never an empty result', async () => {
  // FAILURE OUTRANKS EMPTINESS. Reporting "no blocks" for a request that threw is how an outage
  // reads as a quiet week — and on a mining pool it is how "the pool lost my shares" reads as "you
  // have not mined any".
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/blocks',
      routes: allRoutes({
        'GET /v1/pool/blocks': {
          status: 503,
          body: { error: { code: 'unavailable', message: 'The pool is not ready.', requestId: 'req-503' } },
        },
      }),
    },
    async (screen) => {
      assert.ok(screen.queryByRole('alert', /The pool did not answer/))
      assert.ok(screen.text().includes('The pool is not ready.'))
      assert.ok(screen.text().includes('req-503'), 'the request id is what support needs')
      assert.ok(!screen.text().includes('This pool has never found a block.'))
    },
  )
})

test('a miner’s record renders both difficulties, and names an unnamed worker', async () => {
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/workers/ltc/ltc1qexampleaddress',
      routes: allRoutes(),
    },
    async (screen) => {
      assert.ok(screen.byRole('table', /Workers seen under this account/))
      assert.ok(screen.byRole('table', /The most recent shares recorded/))
      // The pairing is the whole point of the page: a run of achieved values far above credited is
      // a difficulty that has not caught up, and that is a conversation worth having with evidence.
      assert.ok(screen.text().includes('Credited'))
      assert.ok(screen.text().includes('Achieved'))
      // The empty string is a real worker name — a miner authorising as a bare address with no dot
      // produces one. A blank cell would look like a defect.
      assert.ok(screen.text().includes('(unnamed)'))
      // A share that met the network's difficulty is flagged as WORK, with no amount beside it.
      assert.ok(screen.text().includes('solved a block'))

      const wire = screen.api.matching('GET /v1/pool/shares')[0]
      assert.ok(wire)
      assert.ok(wire.path.includes('account=ltc1qexampleaddress'))
      assert.ok(wire.path.includes('chain=ltc'))
    },
  )
})

test('the lookup box accepts a whole stratum username and navigates to the account', async () => {
  await withScreen(
    app(),
    { url: 'https://pool.cloudsforge.online/workers', routes: allRoutes() },
    async (screen) => {
      await screen.type(screen.byRole('textbox', /Mining address/), 'ltc1qexampleaddress.rig1')
      await screen.click(screen.byRole('button', /Show shares/))
      // Split on the FIRST dot, as micro-pool splits it. The string a reader has to hand is the one
      // in their miner's configuration; making them edit it is asking them to do the pool's parsing.
      assert.equal(screen.window.location.pathname, '/workers/ltc/ltc1qexampleaddress')
      assert.ok(screen.api.matching('GET /v1/pool/workers').length > 0)
    },
  )
})

test('an address the pool could never have stored is refused here, with a reason', async () => {
  await withScreen(
    app(),
    { url: 'https://pool.cloudsforge.online/workers', routes: allRoutes() },
    async (screen) => {
      await screen.type(screen.byRole('textbox', /Mining address/), 'not a valid address')
      await screen.click(screen.byRole('button', /Show shares/))
      assert.ok(screen.queryByRole('alert', /not a name this pool could have stored/))
      // And nothing was asked for. A 400 in a panel reads as "the pool is broken" rather than as
      // "that is not a name".
      assert.deepEqual(screen.api.matching('GET /v1/pool/workers'), [])
      assert.equal(screen.window.location.pathname, '/workers')
    },
  )
})

test('an unknown address renders the shell under a not-found page, with a way back', async () => {
  await withScreen(
    app(),
    { url: 'https://pool.cloudsforge.online/payouts', routes: allRoutes() },
    async (screen) => {
      // `/payouts` specifically. It is the address somebody will try, and what it must not do is
      // resolve to something reassuring.
      assert.ok(screen.queryByRole('heading', 'Page not found'))
      // The shell is still around it, so a reader who mistyped keeps the navigation they need to
      // get back out — and the page says the SERVER agreed, because nginx.conf keeps the 404.
      assert.ok(screen.text().includes('The server said 404'))
      assert.ok(screen.queryByRole('link', /Mine here/))
      assert.ok(screen.queryByRole('link', /Blocks/))
    },
  )
})

test('there is no sign-in anywhere on this site', async () => {
  // micro-pool takes no bearer token on any route this bundle calls and there is no estate account
  // behind a mining address. A "Sign in" here would suggest that signing in would show the reader
  // something; the one route an estate session unlocks at micro-pool is the browser-mining ticket,
  // and the page that spends it is micro-hub-web's `/mine` rather than anything on this surface.
  for (const url of [
    'https://pool.cloudsforge.online/',
    'https://pool.cloudsforge.online/workers/ltc/ltc1qexampleaddress',
    'https://pool.cloudsforge.online/blocks',
  ]) {
    await withScreen(app(), { url, routes: allRoutes() }, async (screen) => {
      const text = screen.text().toLowerCase()
      for (const word of ['sign in', 'sign up', 'log in', 'my account']) {
        assert.ok(!text.includes(word), `${url} offers "${word}"`)
      }
    })
  }
})
