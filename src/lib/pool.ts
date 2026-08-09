/**
 * The typed client for `micro-pool`'s public read API. Every `/v1` call in this bundle is here.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ROUTES, AS THEY ACTUALLY EXIST — read off `pool/src/server.ts`'s `buildRoutes()`, not off a
 * description of it. The brief this frontend was written from named `/v1/workers/<address>`, which
 * IS NOT A ROUTE THIS SERVICE SERVES; asking for it returns the 404 envelope. The real surface is
 * eight routes. Four are the anonymous reads this module is made of; three are platform probes; one
 * takes a credential and belongs to another surface entirely:
 *
 * | Route                    | Query                        | Credential | Called here |
 * | ---                      | ---                          | ---        | ---         |
 * | `GET /v1/pool`           | —                            | none       | yes         |
 * | `GET /v1/pool/blocks`    | `chain`, `limit` (max 200)   | none       | yes         |
 * | `GET /v1/pool/workers`   | `chain`, `account`           | none       | yes         |
 * | `GET /v1/pool/shares`    | `chain`, `account`, `limit` (max 1000) | none | yes    |
 * | `GET /livez`             | —                            | none       | no          |
 * | `GET /readyz`            | —                            | none       | no          |
 * | `GET /metrics`           | —                            | none       | no          |
 * | `POST /v1/pool/ticket`   | —                            | **bearer** | no          |
 *
 * `/livez`, `/readyz` and `/metrics` are the service's own platform probes, for a supervisor and a
 * scrape target. A browser rendering `/readyz` as a status light would be a second, worse status
 * page beside the estate's real one, and `/metrics` is an unbounded Prometheus text body.
 * `/v1/pool` already carries the per-chain `ready` flag, which is the same fact in the shape a page
 * needs.
 *
 * `POST /v1/pool/ticket` is the one route on this service that reads an `Authorization` header. It
 * verifies an estate access token and mints the single-use ticket a browser spends on the WebSocket
 * mining transport (micro-org#289), and it is micro-hub-web's `/mine` that calls it. Browser mining
 * needs a session; this surface has none and acquires none, so the ticket route is absent from this
 * module by decision rather than by oversight — `test/pool-contract.test.ts` asserts that decision
 * route by route rather than trusting this table.
 *
 * `account` IS A QUERY PARAMETER AND NOT AN AUTHENTICATED SUBJECT on all four reads. Anybody may
 * read anybody's shares; that is the same posture as every public pool and as a block explorer, and
 * micro-pool's own server file says so. Nothing in this module sends a credential.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { api, type RequestOptions } from './api.ts'

/**
 * What a miner types into their firmware, when an operator has published it.
 *
 * ── BOTH HALVES OR NEITHER, AND THE SERVICE IS WHERE THAT IS DECIDED ──────────────────────────
 *
 * A nested object rather than two fields beside each other, because two fields can be read one at a
 * time and composed into something that looks complete. `pool/src/env.ts` refuses half a pair at
 * boot for the same reason — a host with no published port advertises nothing, and a port with no
 * host is not an endpoint — so this type cannot represent a half either.
 *
 * `port` is the PUBLISHED port and is not `stratumPort` below. The two differ whenever the deploy
 * maps them, which the estate's compose file does today.
 */
export interface StratumEndpoint {
  readonly host: string
  readonly port: number
}

/**
 * One chain's live state, exactly as `/v1/pool` renders it.
 *
 * `chain` is `'btc' | 'ltc'` in the service's own types (`pool/src/chains.ts`), and it is typed as
 * a bare `string` here ON PURPOSE. This bundle must render whatever the API reports and must never
 * hold its own list of chains: which chains exist is a per-deployment fact set by `POOL_CHAINS`,
 * today's estate can only deploy `ltc` because bitcoind is still doing its initial sync, and a
 * union in a frontend would turn the arrival of a third chain into a type error in a repository
 * that has no business having an opinion. Everything on screen is keyed off this array's length
 * and contents.
 */
export interface PoolChainStatus {
  readonly chain: string
  /** The chain's human name, from `@cloudsforge/contracts-chain` via the service. */
  readonly name: string
  readonly asset: string
  readonly decimals: number
  /** `sha256d` or `scrypt`. The pool dispatches proof of work on this; a miner has to match it. */
  readonly algorithm: string
  /**
   * The port micro-pool's stratum listener BINDS for this chain. **Not a port a miner can dial**,
   * and nothing in this bundle renders it.
   *
   * It is the inside of a port mapping — the estate's compose file publishes
   * `${POOL_LTC_STRATUM_PORT:-3334}` onto a container port fixed at 3334, so the two numbers are
   * only equal by default — and the listener is bound to loopback unless the deploy says otherwise.
   * It is read here so that this interface describes the response the service actually sends;
   * `stratumEndpoint` is the field a reader is given. See micro-org#285.
   */
  readonly stratumPort: number
  /**
   * WHERE TO POINT A MINER, OR NULL BECAUSE NOBODY HAS SAID.
   *
   * Null is the ordinary answer and is rendered as a named hole. It is emphatically NOT to be
   * filled in from the page's own address: this bundle is served through a Cloudflare Tunnel and
   * Traefik, neither of which forwards a raw TCP stream, so the hostname a reader is looking at is
   * provably not where stratum is. This bundle derived it that way once and published a
   * copy-pasteable connection string that could not connect — the worst possible version of a
   * plausible screen, because its owner debugs their own hardware instead of asking a question.
   */
  readonly stratumEndpoint: StratumEndpoint | null
  readonly connections: number
  readonly height: number | null
  readonly networkDifficulty: number | null
  readonly templateAgeSeconds: number | null
  /** False when this chain cannot currently serve work — no template, or a stale one. */
  readonly ready: boolean
  /** The window every rate below is measured over. 600 seconds in the service today. */
  readonly windowSeconds: number
  readonly sharesInWindow: number
  readonly workersInWindow: number
  /** Hashes per second, already converted per algorithm by the service. */
  readonly hashrateEstimate: number
}

/** `GET /v1/pool`. */
export interface PoolStatus {
  /** `mainnet` or `testnet`, whichever the pool's nodes were checked against at boot. */
  readonly network: string
  readonly feeBasisPoints: number
  readonly pplnsWindowMultiplier: number
  /**
   * THE FIELD THIS ENTIRE SITE TURNS ON.
   *
   * `pool/src/server.ts` puts it in the body rather than only in its README, and says why: "a
   * `micro-pool-web` written against this API would otherwise have to know from documentation that
   * the number it is about to show is not a balance. Making it a field means the UI can be built
   * now and cannot accidentally imply a payment that will not arrive."
   *
   * It is a literal `false` in the handler today. It is read rather than assumed so that the day
   * it becomes true is the day this site stops saying nothing settles — without anybody having to
   * remember that this site says it.
   */
  readonly payoutsImplemented: boolean
  readonly chains: readonly PoolChainStatus[]
}

/** One block this pool found, as `/v1/pool/blocks` renders it. */
export interface PoolBlock {
  readonly height: number
  readonly hash: string
  readonly foundAt: string
  /**
   * The block reward in the smallest unit, AS A STRING.
   *
   * The service sends it as text on purpose — its own comment: "it is money in the smallest unit
   * and a JSON number is not a safe container for one. Estate convention: `contracts-chain`
   * amounts cross a wire as text." Nothing in this bundle calls `Number()` on it, and the CI grep
   * enforces that.
   */
  readonly reward: string
  readonly networkDifficulty: number
  /**
   * The node's verdict on the submission, verbatim: `accepted` or `rejected` today
   * (`pool/src/blocks.ts`), typed as a string because it is the node's word and not this bundle's
   * enumeration. A rejected block is shown rather than hidden — micro-pool calls it "the single
   * most useful diagnostic this service can publish", and a pool that displayed only its accepted
   * blocks would be hiding the one failure miners must know about.
   */
  readonly submitStatus: string
  readonly submitDetail: string | null
}

export interface PoolBlocks {
  readonly chain: string
  readonly asset: string
  readonly decimals: number
  readonly payoutsImplemented: boolean
  readonly blocks: readonly PoolBlock[]
}

/** One worker under one account, as `/v1/pool/workers` renders it. */
export interface PoolWorker {
  /**
   * The label after the dot in the stratum username, or the EMPTY STRING when the miner gave none.
   *
   * `parseWorkerName` in `pool/src/session.ts` splits on the first `.` and leaves `worker` empty
   * when there is no dot, which is what a miner authorising as a bare address produces. That is an
   * ordinary configuration and not a fault, so the empty string is rendered as such rather than
   * being dropped or shown as a blank cell.
   */
  readonly worker: string
  readonly lastSeenAt: string
  /** The difficulty this worker was last credited at. Null before its first share is recorded. */
  readonly difficulty: number | null
  readonly sharesInWindow: number
  readonly hashrateEstimate: number
}

export interface PoolWorkers {
  readonly chain: string
  readonly account: string
  readonly windowSeconds: number
  readonly workers: readonly PoolWorker[]
}

/** One accepted share, as `/v1/pool/shares` renders it. */
export interface PoolShare {
  /** A bigint on the server, a string on the wire. Never parsed here; it is an identifier. */
  readonly id: string
  readonly worker: string
  readonly jobId: string
  readonly height: number
  /** What the pool credited the share at. */
  readonly creditedDifficulty: number
  /** What the share actually achieved. The pair is what makes a miner's own log reconcilable. */
  readonly achievedDifficulty: number
  readonly isBlock: boolean
  readonly createdAt: string
}

export interface PoolShares {
  readonly chain: string
  readonly account: string
  readonly shares: readonly PoolShare[]
}

/**
 * What `micro-pool` will accept as an `account`, copied from `accountParam` in its `server.ts` and
 * from `parseWorkerName` in its `session.ts` — the two agree, and this is the third copy.
 *
 * It is checked here so that a typed address that could never have been stored is refused on this
 * side, with an explanation, instead of becoming a request the service answers 400 to. The service
 * refuses it for the reverse reason — so it does not become a query returning nothing — and its
 * comment names the failure exactly: the two are indistinguishable to a caller otherwise, and "no
 * shares" is the answer a miner will read as "the pool lost my work".
 */
export const ACCOUNT_PATTERN = /^[A-Za-z0-9_:-]+$/
export const ACCOUNT_MAX_LENGTH = 96

/** Why an account string cannot be looked up, or null when it can. */
export function accountProblem(raw: string): string | null {
  const account = raw.trim()
  if (account === '') return 'Enter the payout address you mine with.'
  if (account.length > ACCOUNT_MAX_LENGTH) {
    return `That is longer than ${ACCOUNT_MAX_LENGTH} characters, which is more than this pool stores.`
  }
  if (!ACCOUNT_PATTERN.test(account)) {
    return 'That is not a name this pool could have stored. Addresses are letters, digits, and - _ : only.'
  }
  return null
}

/**
 * Split a stratum username into the account and the worker.
 *
 * The lookup is by ACCOUNT, so a reader who pastes the whole username from their miner's
 * configuration — `ltc1q….rig1`, which is exactly what they have to hand — gets their whole
 * account rather than a 400. Mirrors the service's split on the FIRST dot.
 */
export function accountOf(username: string): string {
  const trimmed = username.trim()
  const dot = trimmed.indexOf('.')
  return dot === -1 ? trimmed : trimmed.slice(0, dot)
}

export function fetchPool(base: string, opts?: RequestOptions): Promise<PoolStatus> {
  return api<PoolStatus>(base, '/v1/pool', opts)
}

/**
 * Recent blocks for one chain.
 *
 * `limit` is clamped by the service to 200 and defaults to 50 there. 25 is asked for because this
 * is a page somebody reads rather than a feed somebody scrapes, and a pool with no blocks yet —
 * which is every deployment of this service on 2026-08-09 — is not made more informative by asking
 * for 200 of them.
 */
export function fetchBlocks(base: string, chain: string, opts?: RequestOptions): Promise<PoolBlocks> {
  return api<PoolBlocks>(base, '/v1/pool/blocks', { ...opts, query: { chain, limit: 25 } })
}

export function fetchWorkers(
  base: string,
  chain: string,
  account: string,
  opts?: RequestOptions,
): Promise<PoolWorkers> {
  return api<PoolWorkers>(base, '/v1/pool/workers', { ...opts, query: { chain, account } })
}

/**
 * One account's share history, share by share.
 *
 * 50 rather than the service's default of 100: this renders as a table on a page that already
 * carries the worker summary above it, and the point of the list is that a miner can reconcile the
 * most recent rows against their own log — not that they can read a thousand of them in a browser.
 */
export function fetchShares(
  base: string,
  chain: string,
  account: string,
  opts?: RequestOptions,
): Promise<PoolShares> {
  return api<PoolShares>(base, '/v1/pool/shares', { ...opts, query: { chain, account, limit: 50 } })
}
