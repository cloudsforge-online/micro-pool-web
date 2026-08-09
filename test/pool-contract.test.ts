/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TYPES IN src/lib/pool.ts ARE A CLAIM ABOUT ANOTHER REPOSITORY, CHECKED AGAINST IT.
 *
 * Every field this bundle reads was taken off micro-pool's actual handlers. TypeScript cannot help
 * with any of it: `PoolStatus` is an `interface`, the response is `unknown` until it is cast, and a
 * field the service renamed typechecks perfectly here and arrives as `undefined` in a browser. The
 * symptom is a table of blanks or, on a page whose entire job is to be checkable against a miner's
 * own log, a column of `NaN`.
 *
 * So the service's source is read as text and the field names are looked for in it. That is a
 * coarse check and it is the honest one available across a repository boundary — it cannot prove a
 * type, but it catches the rename, which is the failure that actually happens.
 *
 * The check SKIPS when micro-pool is not checked out beside this repository, so `pnpm test` passes
 * for somebody who cloned only this one. CI checks it out and fails the job if the skip happened —
 * a skipped test is an unmeasured one, and on the runner the difference matters.
 *
 * ── AND IT CHECKS ONE THING THAT IS NOT A FIELD NAME ──────────────────────────────────────────
 *
 * `payoutsImplemented: false` is a LITERAL in micro-pool's handlers, not a computed value. This
 * whole site's refusal to promise payment is derived from that flag, so the flag being real — and
 * being false because the service says so, not because this bundle assumes it — is the load-bearing
 * fact underneath `test/honesty.test.ts`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { SIBLINGS, read, stripComments } from './sources.ts'

/**
 * The client, with its comments removed — and the same file WITH them, for the one assertion that
 * is about a citation rather than about code. A citation lives in a comment by definition, so
 * checking for it in the stripped copy would be checking that the comment had been deleted.
 */
const CLIENT_RAW = read('src/lib/pool.ts')
const CLIENT = stripComments(CLIENT_RAW, 'ts')

/** micro-pool's HTTP surface, or null when that repository is not checked out. */
function service(): string | null {
  const path = join(SIBLINGS, 'pool/src/server.ts')
  return existsSync(path) ? stripComments(readFileSync(path, 'utf8'), 'ts') : null
}

/** The interface bodies in the client, by name. */
function fieldsOf(name: string): string[] {
  const body = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(CLIENT)?.[1] ?? ''
  // `readonly (\w+):` and not `readonly (\w+)` — the second form also matches the ELEMENT TYPE in
  // `readonly chains: readonly PoolChainStatus[]`, so it would ask micro-pool's server file to
  // contain this repository's own interface names. Found by a red test.
  return [...body.matchAll(/readonly (\w+):/g)].map((m) => m[1] as string)
}

/** The routes the client calls, read out of the client rather than listed here. */
const CALLED = [...CLIENT.matchAll(/api<[^>]+>\(\s*base,\s*'([^']+)'/g)].map((m) => m[1] as string)

test('the client calls exactly the four public read routes', () => {
  assert.deepEqual(
    [...new Set(CALLED)].sort(),
    ['/v1/pool', '/v1/pool/blocks', '/v1/pool/shares', '/v1/pool/workers'],
  )
  // `/livez`, `/readyz` and `/metrics` are the service's OWN health surface. A browser polling them
  // would report on the one process it happens to have reached through the gateway, which says
  // nothing about whether the pool is accepting stratum connections — that is a different process
  // on a different port. And `/metrics` is a Prometheus surface, not a public one.
  for (const operational of ['/livez', '/readyz', '/metrics']) {
    assert.ok(!CLIENT.includes(`'${operational}'`), `the client calls ${operational}`)
  }
})

test('EVERY ROUTE THIS CLIENT CALLS EXISTS IN THE SERVICE', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')
  for (const route of new Set(CALLED)) {
    assert.ok(
      src.includes(`path: '${route}'`),
      `micro-pool serves no ${route}. The route table is in pool/src/server.ts.`,
    )
  }
})

test('EVERY FIELD THIS BUNDLE READS IS A FIELD THE SERVICE SENDS', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')

  // Each interface, and the response it describes. A field missing from the service arrives as
  // `undefined` and renders as a blank cell or NaN — which reads as a defect in the pool rather
  // than as a defect here.
  for (const name of [
    'PoolChainStatus',
    'PoolStatus',
    'PoolBlock',
    'PoolBlocks',
    'PoolWorker',
    'PoolWorkers',
    'PoolShare',
    'PoolShares',
  ]) {
    const fields = fieldsOf(name)
    assert.ok(fields.length > 0, `${name} has no fields, or the interface was renamed`)
    for (const field of fields) {
      assert.ok(
        new RegExp(`\\b${field}\\b`).test(src),
        `src/lib/pool.ts's ${name} reads "${field}", which does not appear anywhere in ` +
          `pool/src/server.ts. Either micro-pool renamed it — in which case this bundle is about ` +
          `to render a blank column — or it was guessed rather than read off the handler.`,
      )
    }
  }
})

test('PAYOUTS ARE NOT IMPLEMENTED, AND THE SERVICE IS WHERE THAT IS DECIDED', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')

  // Two responses carry the flag and both hard-code it. When either becomes a computed value, or
  // starts arriving true, this site stops saying it does not pay — which is the point of deriving
  // it rather than writing it into the markup.
  const literals = [...src.matchAll(/payoutsImplemented:\s*(\w+)/g)].map((m) => m[1])
  assert.deepEqual(literals, ['false', 'false'])

  // And the module behind it is still a set of types and a function that throws, rather than a
  // settlement path nobody wired up. If this file grows a sink, the flag is what should change.
  const payouts = join(SIBLINGS, 'pool/src/payouts.ts')
  if (existsSync(payouts)) {
    assert.match(readFileSync(payouts, 'utf8'), /throw/)
  }
})

test('THE AMOUNTS THAT MUST NOT PASS THROUGH A JSON NUMBER ARE STRINGS ON BOTH SIDES', (t) => {
  // A block reward is money in the chain's smallest unit and a share id is a bigint sequence.
  // Neither is safe in a double: 2^53 satoshis is about 90 million coins, and the id will pass
  // 2^53 eventually. Both cross the wire as text, and both stay text here — `formatAmount` does
  // the decimal placement on the string.
  assert.match(CLIENT, /readonly reward: string/)
  assert.match(CLIENT, /readonly id: string/)
  assert.ok(!/Number\(\s*\w*\.?reward/.test(CLIENT), 'the client parses a reward into a number')

  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')
  assert.match(src, /reward: block\.reward\.toString\(\)/)
  assert.match(src, /id: share\.id\.toString\(\)/)
})

test('THE ACCOUNT RULE THIS FORM ENFORCES IS THE SERVICE’S OWN RULE', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')

  // Checked here as well as by the service, and the reason is which failure the reader sees: a
  // string the pool could never have stored produces a 400, and a 400 in a panel reads as "the pool
  // is broken" rather than "that is not a name". The service refuses it for the mirror-image
  // reason — so it does not become a query that returns nothing, which reads as "the pool lost my
  // work". Two different messages for one rule, and the rule has to be the same one.
  const theirs = /\/\^\[([^\]]+)\]\+\$\//.exec(src)?.[1]
  const ours = /\/\^\[([^\]]+)\]\+\$\//.exec(CLIENT)?.[1]
  assert.equal(ours, theirs, 'the client and micro-pool disagree about which characters an account may contain')

  const theirMax = /account\.length > (\d+)/.exec(src)?.[1]
  const ourMax = /ACCOUNT_MAX_LENGTH = (\d+)/.exec(CLIENT)?.[1]
  assert.equal(ourMax, theirMax, 'the client and micro-pool disagree about the maximum account length')
})

test('the limits this client asks for are within the ceilings the service clamps to', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')

  // The service CLAMPS rather than refusing, so asking for too much is not an error — it is a
  // silent difference between the number of rows asked for and the number rendered. Asking for
  // less than the ceiling on purpose is the honest form.
  const ceilings = [...src.matchAll(/limitParam\(ctx, \d+, (\d+)\)/g)].map((m) => Number(m[1]))
  const asked = [...CLIENT.matchAll(/limit: (\d+)/g)].map((m) => Number(m[1]))
  assert.ok(asked.length > 0, 'the client asks for no limits at all')
  assert.ok(ceilings.length > 0, 'micro-pool clamps nothing, or limitParam was renamed')
  const max = Math.max(...ceilings)
  for (const value of asked) {
    assert.ok(value <= max, `the client asks for limit=${value}, above every ceiling in the service`)
  }
})

test('MICRO-POOL TAKES NO CREDENTIAL, WHICH IS WHY THIS BUNDLE SENDS NONE', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')
  // The service's own header says the template's auth wiring is gone and none of these routes takes
  // a bearer token. That is what makes `account` a query parameter rather than an authenticated
  // subject — anybody may look up anybody, which is the posture of every public pool and of a block
  // explorer, and the only posture available when the sole identity a miner has is the username
  // they typed into their own firmware.
  assert.ok(!/authoriseRead|requireScope|bearer/i.test(src), 'micro-pool has grown an authority check')
  assert.ok(!/Authorization/i.test(CLIENT))
})

test('the client documents which service source its surface was read from', () => {
  // So the next person to change a field name has somewhere to look, and so this test has something
  // to be a cross-check OF. A client that cites nothing is a client whose types are folklore.
  assert.match(CLIENT_RAW, /pool\/src\/server\.ts/)
})
