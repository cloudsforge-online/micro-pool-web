/**
 * Response bodies shaped exactly as `micro-pool` sends them.
 *
 * Every field name and every type here was read off `pool/src/server.ts` — the handlers and the
 * shapes they compose — rather than off a description of the API. Two of them are the ones a
 * frontend gets wrong by reflex and they are pinned here so a test cannot quietly stop checking:
 *
 *   `reward` is a STRING. The service sends the block reward as text so a satoshi value does not
 *   pass through a JSON number; a fixture holding `2500000000` as a number would make the whole
 *   suite agree with a bug.
 *
 *   `id` on a share is a STRING for the same reason — it is a bigint in Postgres.
 *
 * `payoutsImplemented` is `false` here and must stay false while it is false in the service. It is
 * the one field this whole site turns on, and `test/honesty.test.ts` also asserts the TRUE case, so
 * the day micro-pool implements settlement there is already a test describing what should happen.
 */
import type { PoolBlocks, PoolShares, PoolStatus, PoolWorkers } from '../src/lib/pool.ts'

/** One chain, serving work. Litecoin, because on 2026-08-09 `ltc` is all the estate can deploy. */
export const LTC = {
  chain: 'ltc',
  name: 'Litecoin',
  asset: 'LTC',
  decimals: 8,
  algorithm: 'scrypt',
  stratumPort: 3334,
  connections: 2,
  height: 2_912_004,
  networkDifficulty: 34_512_119.5,
  templateAgeSeconds: 4,
  ready: true,
  windowSeconds: 600,
  sharesInWindow: 118,
  workersInWindow: 3,
  hashrateEstimate: 812_000_000,
} as const

/** A second chain, so the multi-chain branches can be exercised without hard-coding two anywhere. */
export const BTC = {
  chain: 'btc',
  name: 'Bitcoin',
  asset: 'BTC',
  decimals: 8,
  algorithm: 'sha256d',
  stratumPort: 3333,
  connections: 0,
  height: null,
  networkDifficulty: null,
  templateAgeSeconds: null,
  // False on purpose: bitcoind is still doing its initial block download, which is the real reason
  // this chain is not deployable today, and `ready: false` is exactly how that presents.
  ready: false,
  windowSeconds: 600,
  sharesInWindow: 0,
  workersInWindow: 0,
  hashrateEstimate: 0,
} as const

export function poolStatus(over: Partial<PoolStatus> = {}): PoolStatus {
  return {
    network: 'mainnet',
    feeBasisPoints: 100,
    pplnsWindowMultiplier: 2,
    payoutsImplemented: false,
    chains: [LTC],
    ...over,
  }
}

/** A pool with nothing in it — the ordinary state of every deployment on 2026-08-09. */
export function coldStatus(): PoolStatus {
  return poolStatus({
    chains: [{ ...LTC, connections: 0, sharesInWindow: 0, workersInWindow: 0, hashrateEstimate: 0 }],
  })
}

export function poolBlocks(over: Partial<PoolBlocks> = {}): PoolBlocks {
  return {
    chain: 'ltc',
    asset: 'LTC',
    decimals: 8,
    payoutsImplemented: false,
    blocks: [
      {
        height: 2_911_988,
        hash: '9f2c0a1d4e5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f',
        foundAt: '2026-08-09T01:10:00.000Z',
        // 12.5 LTC in litoshi, as text.
        reward: '1250000000',
        networkDifficulty: 34_512_119.5,
        submitStatus: 'accepted',
        submitDetail: null,
      },
      {
        height: 2_911_402,
        hash: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
        foundAt: '2026-08-08T22:41:00.000Z',
        reward: '1250000000',
        networkDifficulty: 34_010_887.25,
        // THE ROW THIS PAGE EXISTS FOR. micro-pool calls a rejected submission "the single most
        // useful diagnostic this service can publish", so it is in the default fixture rather than
        // in a special one — a suite whose happy path has no rejection in it stops checking that
        // rejections render at all.
        submitStatus: 'rejected',
        submitDetail: 'inconclusive: stale block time-too-old',
      },
    ],
    ...over,
  }
}

export function poolWorkers(over: Partial<PoolWorkers> = {}): PoolWorkers {
  return {
    chain: 'ltc',
    account: 'ltc1qexampleaddress',
    windowSeconds: 600,
    workers: [
      {
        worker: 'rig1',
        lastSeenAt: '2026-08-09T02:59:30.000Z',
        difficulty: 65_536,
        sharesInWindow: 74,
        hashrateEstimate: 512_000_000,
      },
      {
        // The empty string is a REAL worker name: a miner that authorises as a bare address with no
        // dot produces one (`parseWorkerName`, pool/src/session.ts).
        worker: '',
        lastSeenAt: '2026-08-09T02:58:10.000Z',
        difficulty: null,
        sharesInWindow: 3,
        hashrateEstimate: 21_000_000,
      },
    ],
    ...over,
  }
}

export function poolShares(over: Partial<PoolShares> = {}): PoolShares {
  return {
    chain: 'ltc',
    account: 'ltc1qexampleaddress',
    shares: [
      {
        id: '90071992547409931',
        worker: 'rig1',
        jobId: '4f2a',
        height: 2_912_004,
        creditedDifficulty: 65_536,
        achievedDifficulty: 91_233.5,
        isBlock: false,
        createdAt: '2026-08-09T02:59:30.000Z',
      },
      {
        id: '90071992547409930',
        worker: 'rig1',
        jobId: '4f29',
        height: 2_912_003,
        creditedDifficulty: 65_536,
        achievedDifficulty: 41_012_887.5,
        isBlock: true,
        createdAt: '2026-08-09T02:58:02.000Z',
      },
    ],
    ...over,
  }
}

/** The error envelope micro-pool sends on every failure. */
export function errorBody(code: string, message: string, requestId = 'req-pool-0001') {
  return { error: { code, message, requestId } }
}
