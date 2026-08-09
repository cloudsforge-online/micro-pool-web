/**
 * The typed client for micro-pool's read API.
 *
 * The point of these is that the four URLs are the ones the service actually serves. The brief this
 * repository was written from named `GET /v1/workers/<address>`, and so does `pool/README.md`; there
 * is no such route in `buildRoutes()`, and a frontend built against the documentation would have
 * shipped a share history that 404s on every load. The URLs below were read off the handlers.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  ACCOUNT_MAX_LENGTH,
  accountOf,
  accountProblem,
  fetchBlocks,
  fetchPool,
  fetchShares,
  fetchWorkers,
} from '../src/lib/pool.ts'
import { installFetch, installWindow, json, removeWindow } from './browser-stubs.ts'
import { poolBlocks, poolShares, poolStatus, poolWorkers } from './fixtures.ts'

before(() => {
  installWindow('https://pool.cloudsforge.online/')
})
after(() => {
  removeWindow()
})

async function urlOf(run: () => Promise<unknown>, body: unknown): Promise<URL> {
  const stub = installFetch(() => json(200, body))
  try {
    await run()
    return new URL(stub.calls[0]?.url ?? '')
  } finally {
    stub.restore()
  }
}

test('GET /v1/pool takes no parameters', async () => {
  const url = await urlOf(() => fetchPool(''), poolStatus())
  assert.equal(url.pathname, '/v1/pool')
  assert.equal(url.search, '')
})

test('GET /v1/pool/blocks asks for a readable page rather than the service maximum', async () => {
  // The service clamps at 200 and defaults to 50. 25 because this is a page somebody reads, and
  // because every deployment of this service on 2026-08-09 has found zero blocks — asking for 200
  // of nothing is not more informative.
  const url = await urlOf(() => fetchBlocks('', 'ltc'), poolBlocks())
  assert.equal(url.pathname, '/v1/pool/blocks')
  assert.equal(url.searchParams.get('chain'), 'ltc')
  assert.equal(url.searchParams.get('limit'), '25')
})

test('GET /v1/pool/workers is keyed by chain and account, and by nothing else', async () => {
  // `account` is a QUERY PARAMETER and not a path segment and not an authenticated subject. Anybody
  // may read anybody's workers, which is the posture of every public pool and of a block explorer.
  const url = await urlOf(() => fetchWorkers('', 'ltc', 'ltc1qexampleaddress'), poolWorkers())
  assert.equal(url.pathname, '/v1/pool/workers')
  assert.equal(url.searchParams.get('chain'), 'ltc')
  assert.equal(url.searchParams.get('account'), 'ltc1qexampleaddress')
  assert.equal(url.searchParams.has('limit'), false)
})

test('GET /v1/pool/shares asks for fifty', async () => {
  const url = await urlOf(() => fetchShares('', 'ltc', 'ltc1qexampleaddress'), poolShares())
  assert.equal(url.pathname, '/v1/pool/shares')
  assert.equal(url.searchParams.get('limit'), '50')
})

test('this bundle never calls the platform probes', async () => {
  // `/livez`, `/readyz` and `/metrics` exist on the service and are deliberately not called here: a
  // browser rendering `/readyz` as a status light is a second, worse status page beside the
  // estate's real one, and `/metrics` is an unbounded Prometheus body. The per-chain `ready` flag
  // in `/v1/pool` is the same fact in the shape a page needs.
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../src/lib/pool.ts', import.meta.url), 'utf8'),
  )
  const calls = [...source.matchAll(/api<[^>]+>\(\s*base,\s*'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(calls)].sort(), ['/v1/pool', '/v1/pool/blocks', '/v1/pool/shares', '/v1/pool/workers'])
})

test('the response bodies are passed through, string fields included', async () => {
  const stub = installFetch(() => json(200, poolBlocks()))
  try {
    const blocks = await fetchBlocks('', 'ltc')
    const first = blocks.blocks[0]
    assert.ok(first)
    // Still a string after the round trip. A client that "normalised" this into a number would undo
    // the reason the service sends it as text.
    assert.equal(typeof first.reward, 'string')
    assert.equal(first.reward, '1250000000')
    // And the rejection is carried through with the node's own detail, unedited.
    const rejected = blocks.blocks.find((b) => b.submitStatus === 'rejected')
    assert.ok(rejected, 'the fixture must contain a rejection')
    assert.equal(rejected.submitDetail, 'inconclusive: stale block time-too-old')
  } finally {
    stub.restore()
  }
})

test('a share id is a string and stays one', async () => {
  const stub = installFetch(() => json(200, poolShares()))
  try {
    const shares = await fetchShares('', 'ltc', 'ltc1qexampleaddress')
    const id = shares.shares[0]?.id
    assert.equal(typeof id, 'string')
    // A bigint in Postgres. Parsing it would round the identifier of a row, which is worse than
    // useless: it would point at a different share.
    assert.equal(id, '90071992547409931')
    assert.notEqual(String(Number(id)), id)
  } finally {
    stub.restore()
  }
})

test('an address that could never have been stored is refused here, with a reason', () => {
  // The service refuses the same strings, for the mirror-image reason — so a malformed address does
  // not become a query that legitimately returns nothing. "No shares" is the answer a miner reads as
  // "the pool lost my work", and the two are indistinguishable unless one of them explains itself.
  assert.equal(accountProblem('ltc1qexampleaddress'), null)
  assert.equal(accountProblem('  ltc1qexampleaddress  '), null)
  assert.equal(accountProblem('a:b-c_d'), null)

  assert.match(accountProblem('') ?? '', /Enter the payout address/)
  assert.match(accountProblem('   ') ?? '', /Enter the payout address/)
  assert.match(accountProblem('x'.repeat(ACCOUNT_MAX_LENGTH + 1)) ?? '', /longer than 96 characters/)
  assert.match(accountProblem('ltc1q address') ?? '', /letters, digits/)
  assert.match(accountProblem('ltc1q/address') ?? '', /letters, digits/)
  // A dot is NOT allowed in an account, because the dot is the separator between the account and
  // the worker. Somebody pasting their whole stratum username is handled by `accountOf`, not by
  // widening this.
  assert.match(accountProblem('ltc1qaddr.rig1') ?? '', /letters, digits/)
})

test('a whole stratum username is split on the first dot, as the service splits it', () => {
  // The string a reader has to hand is the one in their miner's configuration, which is
  // `<address>.<worker>`. Making them edit it before the form will accept it is a lookup that fails
  // for a reason that is nobody's fault.
  assert.equal(accountOf('ltc1qexampleaddress.rig1'), 'ltc1qexampleaddress')
  assert.equal(accountOf('ltc1qexampleaddress'), 'ltc1qexampleaddress')
  assert.equal(accountOf('  ltc1qexampleaddress.rig1.spare  '), 'ltc1qexampleaddress')
  assert.equal(accountOf(''), '')
})
