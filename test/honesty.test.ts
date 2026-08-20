/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TEST THIS REPOSITORY EXISTS FOR.
 *
 * A mining pool site that implies miners will be paid, when nothing pays them, is the worst defect
 * this frontend could ship. It costs a stranger real electricity, on their own hardware, for a
 * credit that does not exist: `pool/src/payouts.ts` is a set of types and a function that throws,
 * there is deliberately no payouts table, no sink is ever constructed, and four product questions —
 * the fee, the asset paid in, the minimum, coinbase maturity — are open in the specification and
 * are answered by a person rather than by code.
 *
 * Four things are asserted, and each one is a different way the claim could rot:
 *
 *   1. NO FIGURE. No unpaid balance, no estimated earnings, no next payout — not zeroed and not
 *      greyed out, because a zero reads as "not yet, but soon" and the truth is "not at all, and
 *      there is no mechanism".
 *   2. ON EVERY ADDRESS. The statement is in the shell above the outlet, so there is no route a
 *      stranger can arrive at without meeting it.
 *   3. IT SURVIVES THE API FAILING. This is the asymmetry in `src/lib/status.tsx` and it is the one
 *      that would actually happen: somebody points a rig here during a five-minute outage and reads
 *      the quiet as a promise. Absence of an answer is not evidence of a payout mechanism.
 *   4. IT STOPS THE MOMENT IT STOPS BEING TRUE. Every sentence is branched on the service's own
 *      `payoutsImplemented`, not written into the markup — including the ones in the footer and in
 *      the fee description, which are exactly where a stale claim survives unread for months.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { App } from '../src/app.tsx'
import { NOT_PAID_HEADLINE } from '../src/lib/format.ts'
import { withScreen, type Routes, type Screen } from './dom.ts'
import { LTC, mergedWith, poolBlocks, poolShares, poolStatus, poolWorkers } from './fixtures.ts'

const app = () => createElement(App)

/** Every route this site reads, with the fullest fixtures there are. */
function loudRoutes(over: Routes = {}): Routes {
  return {
    // This container's own description of itself, read once above the router before any `/v1` call
    // is made (`src/lib/deployment.tsx`). `present` here, so every scenario in this file is about a
    // deployment that HAS a pool; the deployment that has none has its own sweep at the foot.
    'GET /deployment.json': { body: { poolApi: 'present' } },
    'GET /v1/pool': { body: poolStatus() },
    'GET /v1/pool/blocks': { body: poolBlocks() },
    'GET /v1/pool/workers': { body: poolWorkers() },
    'GET /v1/pool/shares': { body: poolShares() },
    ...over,
  }
}

/** Every address on this site, including one that does not exist. */
const ADDRESSES = [
  'https://cloudsforge.online/pool/',
  'https://cloudsforge.online/pool/workers',
  'https://cloudsforge.online/pool/workers/ltc/ltc1qexampleaddress',
  'https://cloudsforge.online/pool/blocks',
  'https://cloudsforge.online/pool/payouts',
]

/**
 * The phrases that would each be a claim about money this pool cannot make.
 *
 * They are PHRASES rather than single words on purpose. "Balance" alone is not a lie — the blocks
 * page says a reward "is not a balance", which is the sentence doing the work — and banning the
 * word would push this repository into paraphrasing its way around its own honesty. What is banned
 * is the shape of a figure: a label that names an amount a reader is owed.
 */
const CLAIMS: readonly RegExp[] = [
  /\bunpaid\b/i,
  /\bearnings\b/i,
  /\bnext payout\b/i,
  /\bpayout threshold\b/i,
  /\bminimum payout\b/i,
  /\b(estimated|projected|expected|pending)\s+(earnings|payout|payouts|revenue|reward|rewards|income)\b/i,
  /\b(your|available|pending|current|unpaid|running)\s+balance\b/i,
  /\bbalance\s*:/i,
  /\byou (have )?(will )?(earn|earned|are owed|will receive|will be paid)\b/i,
  /\bwithdraw/i,
  /\bprofitab/i,
  /\bper day\b/i,
]

function assertMakesNoClaim(screen: Screen, where: string): void {
  const text = screen.text()
  for (const claim of CLAIMS) {
    const hit = text.match(claim)
    assert.equal(
      hit,
      null,
      `${where} renders ${JSON.stringify(hit?.[0])}, which names an amount this pool has no ` +
        `mechanism to pay. Nothing on this site may imply a figure a miner is owed — not even ` +
        `zeroed, and not even greyed out.`,
    )
  }
}

test('no address on this site names an amount a miner is owed', async () => {
  // The fixtures behind this are deliberately the LOUDEST case there is: a full share history, a
  // worker with a real hashrate, and two blocks with their coinbase rewards. The empty pool is easy
  // to be honest on; the pool that has just found a block is where the figure would appear.
  for (const url of ADDRESSES) {
    await withScreen(app(), { url, routes: loudRoutes() }, async (screen) => {
      assertMakesNoClaim(screen, url)
    })
  }
})

test('a miner’s own record carries no denominated amount at all', async () => {
  await withScreen(
    app(),
    { url: 'https://cloudsforge.online/pool/workers/ltc/ltc1qexampleaddress', routes: loudRoutes() },
    async (screen) => {
      // Every column on this page is WORK — difficulty credited, difficulty achieved, shares,
      // hashrate — and none of it is denominated. A number beside an asset ticker on a miner's own
      // page is a balance whatever it is captioned as.
      const denominated = screen.text().match(/[\d,.]+\s*(LTC|BTC|DOGE)\b/)
      assert.equal(
        denominated,
        null,
        `the workers page renders ${JSON.stringify(denominated?.[0])}, which reads as this ` +
          `miner's money however it is labelled`,
      )
      // The share that solved a block is flagged as work and nothing else. What it was worth to the
      // miner who found it is a question this pool cannot answer at all.
      assert.ok(screen.text().includes('solved a block'))
      assert.ok(!/solved a block[^.]*\d/.test(screen.text()))
    },
  )
})

test('MERGED MINING DOUBLES THE CHAINS AND NOT THE PROMISES', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The temptation this test exists to refuse. "Your Litecoin work is also worth Dogecoin" is TRUE
  // and it is the most exciting sentence on the site, and it sits one word away from being a claim
  // about money: a pool that pays nobody pays them nothing in two assets rather than one. The
  // merged panel is therefore held to exactly the standard the rest of the page is — a statement
  // about BLOCKS, never about a miner's share of one.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  for (const url of ADDRESSES) {
    await withScreen(
      app(),
      { url, routes: loudRoutes({ 'GET /v1/pool': { body: poolStatus({ chains: [mergedWith(LTC)] }) } }) },
      async (screen) => {
        assertMakesNoClaim(screen, `${url} with a committing merged chain`)
        // And the standing statement is untouched by the second chain existing.
        assert.ok(screen.text().includes(NOT_PAID_HEADLINE))
      },
    )
  }
})

test('the statement is on every address, including one that does not exist', async () => {
  for (const url of ADDRESSES) {
    await withScreen(app(), { url, routes: loudRoutes() }, async (screen) => {
      assert.ok(
        screen.text().includes(NOT_PAID_HEADLINE),
        `${url} does not say "${NOT_PAID_HEADLINE}" — it is rendered in the shell above the outlet ` +
          `precisely so no page has to remember to`,
      )
      // A labelled region rather than an alert: this is a standing property of the service and not
      // an event, and a reader navigating three pages must not be interrupted three times by the
      // same sentence.
      assert.ok(screen.queryByRole('region', /Payment status of this pool/))
    })
  }
})

test('THE STATEMENT SURVIVES THE POOL API FAILING', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // The scenario this whole harness was built to make expressible, and the one that would really
  // happen: `/v1/pool` is unreachable for five minutes and a stranger arrives during them.
  //
  // `payoutsImplemented` is `status?.payoutsImplemented === true`, so loading, unreachable and an
  // unparseable body all resolve to FALSE. The site cannot stop refusing to promise payment because
  // a request timed out.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const outages: Routes[] = [
    { 'GET /v1/pool': { networkError: 'Failed to fetch' } },
    { 'GET /v1/pool': { status: 503, body: { error: { code: 'unavailable', message: 'not ready' } } } },
    { 'GET /v1/pool': { status: 200, body: 'this is not the body you are looking for' } },
    { 'GET /v1/pool': { status: 500, body: {} } },
  ]

  for (const outage of outages) {
    for (const url of ADDRESSES) {
      await withScreen(app(), { url, routes: loudRoutes(outage) }, async (screen) => {
        assert.ok(
          screen.text().includes(NOT_PAID_HEADLINE),
          `with ${JSON.stringify(outage)} at ${url}, the site stopped saying it does not pay out`,
        )
        assertMakesNoClaim(screen, `${url} during an outage`)
      })
    }
  }
})

test('the statement is DERIVED: it disappears the moment the service says payouts exist', async () => {
  // The other half, and the reason none of this is a constant. The day micro-pool implements
  // settlement, this site stops saying it does not — without anybody having to remember that it
  // says it, in five different files, one of which is a footer nobody reads.
  const paid = loudRoutes({
    'GET /v1/pool': { body: poolStatus({ payoutsImplemented: true }) },
    'GET /v1/pool/blocks': { body: poolBlocks({ payoutsImplemented: true }) },
  })

  for (const url of ADDRESSES) {
    await withScreen(app(), { url, routes: paid }, async (screen) => {
      const text = screen.text()
      assert.ok(!text.includes(NOT_PAID_HEADLINE), `${url} still refuses to pay`)
      assert.equal(screen.queryByRole('region', /Payment status of this pool/), null)
      for (const stale of [
        'nothing settles',
        'Shares are recorded; nothing is settled',
        'no payouts',
        'It does not pay anybody',
        'has never been deducted from anything',
        'no part of them has been divided or sent to anybody',
      ]) {
        assert.ok(
          !text.includes(stale),
          `${url} still says "${stale}" after the service reported payouts implemented — that ` +
            `sentence is written into the markup instead of being branched on the API`,
        )
      }
    })
  }
})

test('the absences list drops Payouts when payouts exist, and keeps the rest', async () => {
  // The other four absences are properties of the protocol and of the deployment — Stratum v1 only,
  // no TLS on the stratum port, no DOGE, PPLNS only — and `/v1/pool` reports none of them. They are
  // not conditional, because settling shares would not make any of them untrue.
  await withScreen(
    app(),
    {
      url: 'https://cloudsforge.online/pool/',
      routes: loudRoutes({ 'GET /v1/pool': { body: poolStatus({ payoutsImplemented: true }) } }),
    },
    async (screen) => {
      const text = screen.text()
      assert.ok(!text.includes('no payouts table to fill in later'))
      assert.ok(text.includes('Stratum v1 only'))
      assert.ok(text.includes('The stratum ports are plain TCP'))
      assert.ok(text.includes('Refused by name, not missing'))
      assert.ok(text.includes('PPLNS only'))
    },
  )
})

test('THE STATEMENT SURVIVES A DEPLOYMENT THAT HAS NO POOL BEHIND IT AT ALL', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // micro-org#406, and the one case where suppressing the notice would have been tempting: a page
  // that says "there is no pool here" carrying a warning about how the pool does not pay reads, for
  // a second, like an answer to a question nobody asked.
  //
  // It stays, because of what that page's link does. `src/pages/no-pool.tsx` exists to send a
  // reader to a pool that DOES exist, and the single most important thing to tell somebody before
  // they follow that link is that hashrate pointed at the other end of it earns nothing. Dropping
  // the notice here would remove it from the one page whose reader is about to act on it.
  //
  // `/v1/pool` is stubbed and answers `payoutsImplemented: false`, so this cannot pass by accident:
  // the sentence has to come from a request that was never made.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const nowhere = loudRoutes({ 'GET /deployment.json': { body: { poolApi: 'absent' } } })

  for (const url of ADDRESSES) {
    // The measured address, so the page under test is the one that really rendered three error
    // states on 2026-08-11 — first label suffixed, apex untouched.
    const measured = url.replace('//pool.', '//pool-testnet.')
    await withScreen(app(), { url: measured, routes: nowhere }, async (screen) => {
      assert.ok(
        screen.text().includes(NOT_PAID_HEADLINE),
        `${url} on a deployment with no pool stopped saying it does not pay out`,
      )
      assertMakesNoClaim(screen, `${url} on a deployment with no pool`)
      assert.deepEqual(
        screen.api.matching('GET /v1/pool'),
        [],
        `${url} called an API it had already been told is not there — the 502 this page exists ` +
          `to explain would have been in the reader's console`,
      )
    })
  }
})

test('nothing on this site promises a date', async () => {
  // "Not yet", "coming soon" and "will be" all describe a schedule. There is not one: the open
  // product questions are answered by a person, and a softened sentence is how "not at all" becomes
  // "not yet, but soon" without anybody deciding to change the claim.
  for (const url of ADDRESSES) {
    await withScreen(app(), { url, routes: loudRoutes() }, async (screen) => {
      const text = screen.text().toLowerCase()
      for (const schedule of ['coming soon', 'not yet implemented', 'payouts are coming', 'in a future release']) {
        assert.ok(!text.includes(schedule), `${url} says "${schedule}", which is a date`)
      }
    })
  }
})
