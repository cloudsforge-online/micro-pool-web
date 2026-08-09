/**
 * The formatters, and the two of them that are load-bearing rather than cosmetic.
 *
 * `formatAmount` must never call `Number()`, and `formatFee` must never invent a zero. Both of those
 * are ways of showing a reader a figure that is wrong in the direction that costs them something,
 * which is the failure mode this whole repository is organised around.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatAgo,
  formatAmount,
  formatCount,
  formatDifficulty,
  formatFee,
  formatHashrate,
  formatWindow,
  NOT_IMPLEMENTED,
  NOT_PAID_DETAIL,
  NOT_PAID_HEADLINE,
  shortHash,
} from '../src/lib/format.ts'

test('hashrate uses decimal prefixes, because mining hardware is sold in them', () => {
  // A TH/s is 10^12 H/s everywhere hardware is sold and discussed. Using 2^40 instead would report
  // every rig on the site about 10% slow, which reads as a pool that loses work.
  assert.equal(formatHashrate(1_000_000_000_000), '1.00 TH/s')
  assert.equal(formatHashrate(812_000_000), '812 MH/s')
  assert.equal(formatHashrate(12_500), '12.5 kH/s')
  assert.equal(formatHashrate(999), '999 H/s')
})

test('a pool with nothing pointed at it reports zero rather than nothing', () => {
  // The ordinary state on 2026-08-09. "0 H/s" is the honest reading of an empty window; a dash or a
  // blank would read as a measurement that failed.
  assert.equal(formatHashrate(0), '0 H/s')
  assert.equal(formatHashrate(Number.NaN), '0 H/s')
  assert.equal(formatHashrate(-1), '0 H/s')
})

test('a null difficulty is unknown and not zero', () => {
  // `networkDifficulty` is nullable in the API: a chain whose node has not answered yet has no
  // difficulty rather than a difficulty of nothing.
  assert.equal(formatDifficulty(null), 'unknown')
  assert.equal(formatDifficulty(Number.NaN), 'unknown')
  assert.equal(formatDifficulty(34_512_119.5), '34.5M')
  assert.equal(formatDifficulty(1.5), '1.50')
})

test('an unset fee reads as "not stated" and never as 0%', () => {
  // `POOL_FEE_BASIS_POINTS` is required with no default in micro-pool precisely because "a default
  // of 0 would be choosing free and a default of 200 would be choosing 2%". A fee rendered as 0%
  // that is really unset is the same class of lie as a balance rendered as 0 that is unpayable.
  assert.equal(formatFee(undefined), 'not stated')
  assert.equal(formatFee(null), 'not stated')
  assert.equal(formatFee(Number.NaN), 'not stated')
  assert.equal(formatFee(-1), 'not stated')
  assert.equal(formatFee(100), '1%')
  assert.equal(formatFee(250), '2.50%')
  assert.equal(formatFee(0), '0%')
})

test('an amount is rendered from the string and never through a JavaScript number', () => {
  // The value below is larger than Number.MAX_SAFE_INTEGER. micro-pool sends amounts as text for
  // exactly this reason, and a formatter that parsed it would lose the last digits silently — on
  // the largest values, which are the ones worth being right about.
  const huge = '90071992547409931'
  assert.equal(formatAmount(huge, 8), '900719925.47409931')
  assert.notEqual(String(Number(huge)), huge, 'the fixture must actually exceed a safe integer')

  assert.equal(formatAmount('1250000000', 8), '12.5')
  assert.equal(formatAmount('1', 8), '0.00000001')
  assert.equal(formatAmount('0', 8), '0')
  assert.equal(formatAmount('-1250000000', 8), '-12.5')
  assert.equal(formatAmount('100', 0), '100')
  // Anything that is not an integer string is passed through untouched rather than coerced: it is
  // the service's word, and inventing a shape for it would hide a change in the API.
  assert.equal(formatAmount('not-a-number', 8), 'not-a-number')
})

test('counts and windows', () => {
  assert.equal(formatCount(2_912_004), '2,912,004')
  assert.equal(formatCount(0), '0')
  assert.equal(formatCount(Number.NaN), '—')
  assert.equal(formatWindow(600), '10 minutes')
  assert.equal(formatWindow(3600), '1 hour')
  assert.equal(formatWindow(7200), '2 hours')
  assert.equal(formatWindow(0), 'an unknown window')
})

test('relative times, including the clock-skew case', () => {
  const now = Date.parse('2026-08-09T03:00:00.000Z')
  assert.equal(formatAgo('2026-08-09T02:59:30.000Z', now), '30s ago')
  assert.equal(formatAgo('2026-08-09T02:30:00.000Z', now), '30m ago')
  assert.equal(formatAgo('2026-08-08T03:00:00.000Z', now), '24h ago')
  assert.equal(formatAgo('2026-08-01T03:00:00.000Z', now), '8d ago')
  // A share timestamped in the future is a clock difference between the pool and the reader, not a
  // negative age. "-3s ago" would look like a defect in the pool.
  assert.equal(formatAgo('2026-08-09T03:00:03.000Z', now), 'just now')
  assert.equal(formatAgo('not a date', now), 'unknown')
})

test('a hash is shortened but never truncated to something ambiguous', () => {
  const hash = '9f2c0a1d4e5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f'
  const short = shortHash(hash)
  assert.ok(short.startsWith('9f2c0a1d4e'))
  assert.ok(short.endsWith('2c3d4e5f'))
  assert.equal(shortHash('short'), 'short')
})

test('the standing statement is present tense and promises no date', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE ASSERTION THIS REPOSITORY EXISTS FOR, IN ITS SMALLEST FORM.
  //
  // "not yet", "coming soon" and "will be" all describe a schedule. There is none:
  // `pool/src/payouts.ts` is a set of types and a function that throws, there is deliberately no
  // payouts table, and four product questions are open in the specification and are answered by a
  // person rather than by code. A softened sentence is how "not at all" becomes "not yet, but
  // soon" without anybody deciding to change the claim.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const words = `${NOT_PAID_HEADLINE} ${NOT_PAID_DETAIL}`.toLowerCase()
  for (const forbidden of ['not yet', 'coming soon', 'will be', 'soon', 'for now', 'currently']) {
    assert.ok(!words.includes(forbidden), `the standing statement must not say "${forbidden}"`)
  }
  assert.ok(NOT_PAID_HEADLINE.includes('does not pay'))
  assert.ok(words.includes('earns nothing today'))
})

test('every absence names what happens instead', () => {
  // "No Stratum v2" tells a reader nothing. "Stratum v1 only, which is what the firmware on deployed
  // hardware speaks" tells them whether their machine will connect, which is the question they came
  // with. A one-sided list would be a disclaimer rather than documentation.
  const named = NOT_IMPLEMENTED.map((item) => item.what)
  // "Dogecoin" alone was the name until micro-pool implemented AuxPoW (micro-org#29), and it stopped
  // being true: DOGE is mineable here now, as a chain OF Litecoin rather than a chain of its own.
  // The longer name is the whole of what is still refused, and the entry is dropped entirely on a
  // deployment that has an aux chain configured.
  for (const required of ['Payouts', 'Dogecoin as a chain of its own', 'Stratum v2', 'TLS on the stratum port']) {
    assert.ok(named.includes(required), `the absences must name ${required}`)
  }
  for (const item of NOT_IMPLEMENTED) {
    assert.ok(item.instead.length > 40, `"${item.what}" says what is missing and not what happens`)
  }
})
