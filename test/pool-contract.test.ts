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
 *
 * ── AND ONE THING THAT USED TO BE A FLAT CLAIM AND IS NOW A SPLIT ONE ─────────────────────────
 *
 * This file used to assert that micro-pool takes no credential ANYWHERE, by grepping its whole
 * server file for the word. That claim was true when it was written and is not true now:
 * micro-org#289 added `POST /v1/pool/ticket`, which verifies an estate access token and mints the
 * single-use ticket a browser spends on the WebSocket mining transport. micro-hub-web's `/mine`
 * calls it. THIS bundle does not, and must not — it has no sign-in, no token store, and an audience
 * of people without estate accounts.
 *
 * So the check is now made ROUTE BY ROUTE rather than over the whole file, because the precision is
 * the entire value of it: it exists so this bundle never starts attaching a credential it should
 * not have, and never omits one it needs. Both halves fail loudly and separately — a route this
 * bundle calls growing an authority check is one message, and a credentialled route appearing that
 * nobody has decided about is another.
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

/**
 * What reading a credential off a request looks like in micro-pool's handlers.
 *
 * The names rather than a single word: `bearerFrom` and `Principal` come from `@cloudsforge/auth`
 * and are how every service in the estate takes a token, `requireScope` and `requireAdmin` are the
 * gates the service template ships, and `authorization` is the header itself for anything that
 * reads it by hand. Matched against a route's own source and not against the whole file, so the
 * ticket route's imports at the top do not make every other handler look gated.
 */
const CREDENTIAL = /bearerFrom|authorization|principal|requireScope|requireAdmin|apiKey/i

/**
 * micro-pool's route table, one entry of source per route, keyed `METHOD /path`.
 *
 * ── IF THIS THROWS, RE-POINT IT. DO NOT DELETE THE CHECK. ─────────────────────────────────────
 *
 * This parser reads another repository's source, so micro-pool restructuring it is an ordinary
 * event and not a fault in either side — an hour before this was written, `micro-wallet` deleted
 * the object literal `hub-web/test/wallet-assets.test.ts` parsed, and the fix was to read the
 * record wallet still has. A parser that cannot find the table asserts NOTHING while continuing to
 * report a pass, which is strictly worse than a red one, so it fails with instructions instead.
 */
function routeTable(src: string): Map<string, string> {
  const lost =
    'this parser can no longer find micro-pool’s route table in pool/src/server.ts. RE-POINT IT ' +
    'AT WHEREVER THE ROUTES WENT — DO NOT DELETE THIS CHECK. It is what stops this bundle from ' +
    'attaching a credential it should not have, or omitting one it needs.'

  const table = /function buildRoutes\(\): Route\[\] \{([\s\S]*?)\n\}/.exec(src)?.[1]
  assert.ok(table, lost)

  // Each `method`/`path` pair opens a route and the next one closes it. Slicing between them is
  // what makes "does THIS route read a credential" answerable at all; the file as a whole cannot
  // answer it now that one handler out of eight takes a token.
  const marks = [...table.matchAll(/method: '(\w+)',\s*path: '([^']+)',/g)]
  assert.ok(marks.length > 0, lost)

  const routes = new Map<string, string>()
  marks.forEach((mark, index) => {
    const ends = marks[index + 1]?.index ?? table.length
    routes.set(`${mark[1]} ${mark[2]}`, table.slice(mark.index, ends))
  })
  return routes
}

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
    // The NESTED one is listed by name of its own, because `fieldsOf('PoolChainStatus')` sees
    // `merged` and stops there — a rename inside the merged object would typecheck here and arrive
    // as `undefined`, which renders as a chain that is configured, not committing, and giving no
    // reason. That is indistinguishable on screen from a real outage.
    'MergedChainStatus',
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

test('EVERY ROUTE THIS BUNDLE CALLS TAKES NO CREDENTIAL, AND THIS BUNDLE SENDS NONE', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')
  const routes = routeTable(src)

  // The half that decides what this bundle does. Every route it calls has to be one that reads no
  // credential — which is what makes `account` a query parameter rather than an authenticated
  // subject, so anybody may look up anybody, which is the posture of every public pool and of a
  // block explorer and the only posture available when the sole identity a miner has is the
  // username they typed into their own firmware.
  for (const path of new Set(CALLED)) {
    const handler = routes.get(`GET ${path}`)
    assert.ok(handler, `micro-pool no longer serves GET ${path}`)
    assert.ok(
      !CREDENTIAL.test(handler),
      `GET ${path} now reads a credential in micro-pool, and this bundle sends none — so it is ` +
        `about to render a 401 as "cannot reach the pool". Decide which is wrong before making ` +
        `this green: the service gating a public read, or this bundle calling a gated route.`,
    )
  }
})

test('THE ONLY CREDENTIALLED ROUTE IS THE TICKET, AND IT IS NOT ONE THIS BUNDLE CALLS', (t) => {
  const src = service()
  if (!src) return t.skip('micro-pool is not checked out beside this repository')
  const routes = routeTable(src)
  const gated = [...routes]
    .filter(([, handler]) => CREDENTIAL.test(handler))
    .map(([name]) => name)
    .sort()

  // Named exactly, and one of them. `POST /v1/pool/ticket` verifies an estate access token and
  // mints the single-use ticket a browser spends on the WebSocket mining transport (micro-org#289);
  // micro-hub-web's `/mine` is what calls it. A SECOND entry appearing here is not a failure of
  // micro-pool — it is this repository being told that somebody has to decide whether this bundle
  // calls it, and with what. Answer that, then edit this list.
  assert.deepEqual(
    gated,
    ['POST /v1/pool/ticket'],
    'micro-pool’s set of credentialled routes has changed. Read the new one and decide whether ' +
      'this bundle calls it — do not widen this list to make the suite green.',
  )

  // And the answer for the ticket is no. Browser mining is a signed-in estate feature and it lives
  // on micro-hub-web's `/mine`; this surface is the anonymous pool console, has no sign-in, no
  // token store and no refresh, and an audience of people with no estate account at all. Calling a
  // route that requires a bearer from here would need every one of those things built first.
  for (const name of gated) {
    const path = name.slice(name.indexOf(' ') + 1)
    assert.ok(
      !CLIENT.includes(`'${path}'`),
      `the client calls ${name}, which takes a credential this bundle does not have and must not ` +
        `acquire. Browser mining belongs to micro-hub-web.`,
    )
  }

  // The other direction, unchanged: nothing here puts a credential on the wire. `test/api.test.ts`
  // asserts it of a real request and `test/no-build-time-config.test.ts` greps the whole of src/.
  assert.ok(!/Authorization/i.test(CLIENT))
})

test('the client documents which service source its surface was read from', () => {
  // So the next person to change a field name has somewhere to look, and so this test has something
  // to be a cross-check OF. A client that cites nothing is a client whose types are folklore.
  assert.match(CLIENT_RAW, /pool\/src\/server\.ts/)
})
