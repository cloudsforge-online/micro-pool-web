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
import { HUB_MINE_PATH, NOT_PAID_CLAUSE } from '@cloudsforge/ui'
import { App } from '../src/app.tsx'
import { hosts } from '../src/lib/hosts.ts'
import { withScreen, type Routes } from './dom.ts'
import {
  BTC,
  coldStatus,
  LTC,
  mergedWith,
  poolBlocks,
  poolShares,
  poolStatus,
  poolWorkers,
  published,
} from './fixtures.ts'

/** Every route stubbed with the default fixtures, so a scenario only overrides what it is about. */
function allRoutes(over: Routes = {}): Routes {
  return {
    // NOT part of micro-pool's API: this is the container's own answer to "is there a pool behind
    // me at all" (`src/lib/deployment.tsx`, micro-org#406), served by this bundle's nginx beside
    // the bundle. It is stubbed in the DEFAULT table rather than per scenario because every mount
    // reads it before it reads anything else, and an unstubbed request is a harness error by
    // design — see `test/dom.ts`. `present` is what a deployment WITH a pool serves, so every
    // scenario below is a scenario about the console this repository has always shipped.
    'GET /deployment.json': { body: { poolApi: 'present' } },
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

/* ------------------------------------------------------------------ merged mining (micro-org#29) */

test('A CONFIGURED MERGED CHAIN THAT IS NOT COMMITTING IS NEVER SHOWN AS ONE THAT IS', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The state this whole panel exists for. A pool whose dogecoind is in initial block download
  // mines Litecoin exactly as well as one whose dogecoind is healthy — same hashrate, same shares,
  // same workers, same everything on this page — and simply stops being worth DOGE. Merged mining
  // fails by ABSENCE, so the only way a reader learns it stopped is if the page says so.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({
        'GET /v1/pool': { body: poolStatus({ chains: [mergedWith(published(LTC, 4334), 'syncing')] }) },
      }),
    },
    async (screen) => {
      const text = screen.text()
      assert.ok(text.includes('Configured, not being mined'))
      // The one-word reason, expanded into something a reader can act on — and this one is "wait",
      // which is a different instruction from the other three.
      assert.ok(text.includes('still downloading its chain'))
      // The parent is explicitly unaffected. A miner reading a warning on this card must not
      // conclude their Litecoin work is also in trouble and unplug.
      assert.ok(text.includes('Litecoin mining is unaffected'))

      // And nothing claims it IS happening. These are the sentences the committing case renders.
      assert.ok(!text.includes('Committed into'), 'an uncommitted chain was shown as committed')
      assert.ok(
        !text.includes('The work you are being handed right now carries it'),
        'the connection card promised DOGE that is not being mined',
      )
      // No height and no difficulty either: they would be read off an aux block that does not
      // exist, and a stale pair beside a node that has stopped answering looks live.
      assert.ok(!text.includes('Dogecoin height'))
      assert.ok(!text.includes('5,015,467'))
    },
  )
})

test('a committing merged chain reports its own height and difficulty, and says the work is free', async () => {
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({
        'GET /v1/pool': { body: poolStatus({ chains: [mergedWith(published(LTC, 4334))] }) },
      }),
    },
    async (screen) => {
      const text = screen.text()
      assert.ok(text.includes('Committed into Litecoin work'))
      assert.ok(text.includes('Dogecoin height'))
      assert.ok(text.includes('5,015,467'))
      // The aux chain's own difficulty, which is a different number from the parent's — a panel
      // that rendered the parent's here would be caught by the two fixtures being orders of
      // magnitude apart.
      assert.ok(text.includes('12.3M'), 'the merged difficulty is missing or is the parent’s')
      assert.ok(text.includes('measured on scrypt'))

      // THE THING A MINER HAS TO BE TOLD, on the card they are configuring from: there is nothing
      // to configure. A reader told about a second asset and given no settings for it goes looking
      // for the part they missed.
      assert.ok(text.includes('Nothing to configure'))
      assert.ok(text.includes('no second address'))

      // And the absence is gone from the list above, because the pool is doing the thing the list
      // said it does not do.
      assert.ok(!text.includes('Refused by name, not missing'))

      // The new markup is held to the same bar as the rest of the page: no console noise, no
      // element without an accessible name, nothing rendered into a void.
      screen.clean('the landing page with a merged chain')
    },
  )
})

test('a configured-but-broken merged chain still removes the absence, because the pool CAN do it', async () => {
  // The distinction the filter turns on. "This deployment merge-mines nothing" is false the moment
  // an operator configures an aux chain, whatever its node is doing — and leaving the entry on
  // screen would have the page deny a thing it is simultaneously reporting on, three sections down.
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/',
      routes: allRoutes({
        'GET /v1/pool': { body: poolStatus({ chains: [mergedWith(LTC, 'unreachable')] }) },
      }),
    },
    async (screen) => {
      assert.ok(!screen.text().includes('Refused by name, not missing'))
      assert.ok(screen.text().includes('cannot reach the Dogecoin node'))
      // The other absences are properties of the protocol and are untouched by any of this.
      assert.ok(screen.text().includes('Stratum v1 only'))
    },
  )
})

test('a pool with no aux chain says nothing about merged mining except that it is refused', async () => {
  // The estate's own configuration on 2026-08-09 and the default everywhere. `merged: null` is not
  // `committed: false`: the first says nobody asked for it, the second says somebody did and it is
  // not working, and a page that collapsed them would invent an absence or hide a fault.
  await withScreen(app(), { url: 'https://pool.cloudsforge.online/', routes: allRoutes() }, async (screen) => {
    const text = screen.text()
    assert.ok(text.includes('Refused by name, not missing'))
    assert.ok(!text.includes('Merged: '), 'a panel was rendered for a chain nothing is merged into')
    assert.ok(!text.includes('Configured, not being mined'))
    assert.ok(!text.includes('Dogecoin height'))
  })
})

test('THE BLOCKS PAGE CAN REACH A MERGE-MINED CHAIN, OR THE POOL WINS DOGE NOBODY CAN SEE', async () => {
  // `pool_blocks` is keyed by the chain the BLOCK is on, so a Dogecoin block won by merged mining
  // is a real row with a real reward — and this page is the only place it is ever visible. The
  // selector is therefore drawn from the MINED set and not from the served set, which is the one
  // place on this site where those two differ.
  await withScreen(
    app(),
    {
      url: 'https://pool.cloudsforge.online/blocks',
      routes: allRoutes({
        'GET /v1/pool': { body: poolStatus({ chains: [mergedWith(LTC)] }) },
        'GET /v1/pool/blocks': {
          body: poolBlocks({ chain: 'doge', asset: 'DOGE', decimals: 8 }),
        },
      }),
    },
    async (screen) => {
      const picker = screen.byRole('combobox', /Chain/)
      // Labelled as merged in the option itself. An unlabelled `Dogecoin (doge)` beside
      // `Litecoin (ltc)` says this pool has two stratum ports; it has one.
      assert.ok(screen.text().includes('Dogecoin (doge) — merged'))
      await screen.type(picker, 'doge')
      assert.ok(screen.text().includes('found by merged mining'))
      assert.ok(screen.text().includes('the shares are all on Litecoin'))
      assert.ok(screen.byRole('table', /Blocks this pool has submitted/))
    },
  )
})

test('AN ACCEPTED BLOCK THAT LOST A REORG STOPS READING AS ACCEPTED', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // `submitStatus` is what the node said when it took the block; `maturityStatus` is what it says
  // now. They disagree exactly once and it is the expensive time: a block accepted onto the tip,
  // orphaned well inside the coinbase maturity window, whose reward is spendable by nobody.
  // micro-pool has sent both fields since 2.5.9 and this page rendered only the first, so an
  // orphaned block read as `accepted` for ever.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  await withScreen(
    app(),
    { url: 'https://pool.cloudsforge.online/blocks', routes: allRoutes() },
    async (screen) => {
      // PER ROW, not over the page. Every assertion here is about two facts appearing TOGETHER, and
      // a regex over the whole table would be satisfied by a page that rendered the words in
      // different rows — which is the exact defect, one block's verdict read against another's.
      const rowFor = (height: string): string => {
        const rows = [...screen.document.querySelectorAll('tr')]
        const found = rows.filter((tr) => screen.textOf(tr).includes(height))
        assert.equal(found.length, 1, `expected one row for height ${height}, found ${found.length}`)
        return screen.textOf(found[0])
      }

      // Both verdicts, on the same row: the node took it, and the node no longer has it.
      const orphan = rowFor('2,911,301')
      assert.match(orphan, /accepted/)
      assert.match(orphan, /orphaned/)
      // The count is the node's own, sign and all. -1 is Core's signal for a block it holds that is
      // not on the active chain, and rendering it as 1 would say the opposite of what it means.
      assert.match(orphan, /-1 conf/)

      // NULL IS NOT ZERO. The rejected block was never in any node's index, so micro-pool leaves it
      // pending with no count; a table that printed `0 conf` there would be asserting the node has
      // the block and has reorged it out, which is a different and much worse fact.
      const unchecked = rowFor('2,911,402')
      assert.match(unchecked, /not checked yet/)
      assert.doesNotMatch(unchecked, /\bconf\b/)
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

/*
 * BROWSER MINING IS OFFERED FROM THE CHROME OF THE POOL'S OWN SITE.
 *
 * The owner's report was that starting a browser miner is "hidden deep in mining page, it should
 * be easily found near the account on all pages". This surface was the sharpest case of it: the
 * one page a stranger arrives at explains how to point firmware at the stratum endpoint and, until
 * this control, never mentioned that a browser can hash for the same pool at all. The only way in
 * was to already know Forge Hub has a `/mine` address.
 *
 * It is a LINK rather than a Start, and that is not a compromise: the ticket a browser miner needs
 * is `POST /v1/pool/ticket`, the one micro-pool route an estate session unlocks, and this surface
 * deliberately holds no session. A Start here could not be honoured.
 */
test('the chrome offers browser mining, on every page, as a link to the surface that holds it', async () => {
  for (const url of [
    'https://pool.cloudsforge.online/',
    'https://pool.cloudsforge.online/blocks',
    'https://pool.cloudsforge.online/nothing-here',
  ]) {
    await withScreen(app(), { url, routes: allRoutes() }, async (screen) => {
      // Addressed by role and name, per doc 22 §2.4.3. The name is matched exactly because the
      // landing page's own nav entry is called "Mine here" and a substring would take either.
      const mine = screen.byRole('link', /^Mine$/)
      assert.equal(
        mine.getAttribute('href'),
        `${hosts().hub}${HUB_MINE_PATH}`,
        `${url} offers a mining control that does not point at Forge Hub’s mining address`,
      )

      // The sentence it carries is the pool's OWN payout answer, read from `GET /v1/pool` in the
      // same run — not a constant in the design system and not a constant here. The fixture says
      // payouts are not implemented, which is what the estate measured; a control that ignored the
      // response would still carry the clause and would be wrong the day the response changes.
      const described = screen.document.getElementById(mine.getAttribute('aria-describedby') ?? '')
      assert.ok(described, `${url} renders a mining control nothing describes`)
      assert.ok(
        (described.textContent ?? '').includes(NOT_PAID_CLAUSE),
        `${url} offers mining without the standing statement that nothing is paid for it`,
      )
    })
  }
})
