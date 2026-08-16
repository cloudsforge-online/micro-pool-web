/**
 * `GET /v1/pool`, fetched once for the whole app and shared.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A PROVIDER RATHER THAN A CALL IN EACH PAGE.
 *
 * Three separate things read this one response, and if any of them could get a different answer the
 * site would contradict itself on a single screen:
 *
 *   1. WHICH CHAINS EXIST. `POOL_CHAINS` is a per-deployment environment variable
 *      (`pool/src/env.ts`) and it changed under this bundle without a line of it being edited: the
 *      estate served `ltc` alone until 2026-08-10, because bitcoind was still in its initial block
 *      download, and has served `ltc,btc` since 2026-08-11. Every chain selector, every table
 *      heading and every stratum port on this site is drawn from `status.chains`, and NOTHING in
 *      this bundle holds a list of its own — which is exactly why that change cost nothing here. A
 *      pool serving one chain must not render a two-chain layout with a hole in it, and a pool
 *      serving two must not be shown as one.
 *   2. WHETHER PAYOUTS EXIST. `payoutsImplemented` is the field the whole site turns on. It is read
 *      here, once, and everything that says so downstream branches on this value rather than on a
 *      constant — so the day micro-pool implements settlement is the day this site stops saying it
 *      does not, without anyone having to remember that it says it.
 *   3. THE FEE AND THE WINDOW, which the landing page quotes to a stranger deciding whether to
 *      point hardware here.
 *
 * The alternative — each page calling `fetchPool` for itself — is three requests for one fact and,
 * worse, three chances for them to disagree while a deploy is rolling.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { apiBase } from './hosts.ts'
import { fetchPool, type PoolChainStatus, type PoolStatus } from './pool.ts'
import { lengthOf, useResource, type Resource } from './resource.ts'
import { useViewing } from './viewing.tsx'

export interface PoolStatusValue {
  readonly resource: Resource<PoolStatus>
  /** The chains this deployment serves, in the order the service listed them. Never a local list. */
  readonly chains: readonly PoolChainStatus[]
  /**
   * TRUE ONLY WHEN THE SERVICE HAS SAID SO.
   *
   * `status?.payoutsImplemented === true`, which means loading, unreachable and an unparseable body
   * all resolve to false. That asymmetry is deliberate and is the most consequential line in this
   * repository: the site must not be able to stop saying "this pool does not pay out" because a
   * request timed out. Absence of an answer is not evidence of a payout mechanism, and the failure
   * this guards is somebody pointing a rig here during a five-minute API outage and reading the
   * quiet as a promise.
   */
  readonly payoutsImplemented: boolean
}

const PoolStatusContext = createContext<PoolStatusValue | null>(null)

export function PoolStatusProvider({ children }: { children: ReactNode }) {
  /*
   * ── WHY THIS PROVIDER SUBSCRIBES TO THE SWITCHER (micro-org#459, measured 2026-08-16) ────────
   *
   * `apiBase()` reads `viewedApiOrigin()` from module scope, so it already answers correctly the
   * moment the reader switches. What it cannot do is cause this component to ASK again — and this
   * provider is mounted in `src/app.tsx` above the shell that holds the switcher, so nothing about
   * a click reached it. Measured on mainnet: pressing Testnet flipped the amber band and the
   * address bar and left every number on the page mainnet's, because the one component holding
   * them never re-rendered. `useViewing()` is the subscription; `network` is in the dependency
   * list below beside `base` so the reason survives a refactor that happens to keep `base` equal.
   */
  const { network } = useViewing()
  const base = apiBase()
  /*
   * ── THE REQUEST BELOW IS NOT ALWAYS MADE, AND THAT IS DECIDED ELSEWHERE (micro-org#406) ──────
   *
   * On a deployment with no micro-pool behind it, `GET /v1/pool` is answered by Traefik with a 502
   * — it has no backend to forward to, because the service is behind a compose profile the estate
   * does not name. Measured on `pool-testnet.cloudsforge.online` on 2026-08-11.
   *
   * `useResource` declines to run this loader at all in that case, and holds it during the one
   * round trip in which the answer is not yet known. The branch was HERE first and was wrong here:
   * `/workers/:chain/:account` reads its parameters from the URL rather than from this provider,
   * so it went on firing two doomed requests that no amount of care in this file could stop. The
   * gate belongs in the hook every read goes through, and its header says so at length.
   */
  const resource = useResource<PoolStatus>(
    (signal) => fetchPool(base, { signal }),
    // The count that decides `empty` is the number of CHAINS. A pool answering with an empty chain
    // list is configured to mine nothing, which is a real and renderable state — and it is not the
    // same as a pool that did not answer.
    //
    // `lengthOf` rather than `.length`: a 200 carrying something that is not this shape used to
    // throw here and take the whole tree down with it, honesty notice included. See its header.
    (status) => lengthOf(status?.chains),
    'Could not reach the pool.',
    [base, network],
  )

  const value = useMemo<PoolStatusValue>(
    () => ({
      resource,
      chains: Array.isArray(resource.data?.chains) ? resource.data.chains : [],
      payoutsImplemented: resource.data?.payoutsImplemented === true,
    }),
    [resource],
  )

  return <PoolStatusContext.Provider value={value}>{children}</PoolStatusContext.Provider>
}

/**
 * The shared status.
 *
 * Throws rather than returning a default when the provider is missing. A default would be a second
 * source of truth for `payoutsImplemented`, and the safe-looking default (`false`) would let a page
 * render the honesty notice from a constant while believing it had read it from the API — which is
 * precisely the state this whole module exists to make unreachable.
 */
export function usePoolStatus(): PoolStatusValue {
  const value = useContext(PoolStatusContext)
  if (!value) throw new Error('usePoolStatus was called outside PoolStatusProvider')
  return value
}

/**
 * The chain a page should show when the reader has not chosen one.
 *
 * `chain` is a REQUIRED query parameter on every per-chain route unless the deployment serves
 * exactly one chain, in which case micro-pool defaults it (`chainParam`, `pool/src/server.ts`). This
 * mirrors that rule on the client so a single-chain deployment — which is every deployment today —
 * needs no selector at all, and a multi-chain one gets one.
 */
export function defaultChain(chains: readonly PoolChainStatus[]): string | null {
  return chains.length === 0 ? null : (chains[0]?.chain ?? null)
}

/** A chain a block could have been found on, and how it was found. */
export interface MinedChain {
  readonly chain: string
  readonly name: string
  /** True when this chain has no shares of its own — its blocks came out of a parent's work. */
  readonly merged: boolean
}

/**
 * Every chain this pool can have won a BLOCK on, which is a wider set than the chains it serves.
 *
 * ── TWO DIFFERENT SETS, AND THE SERVICE ENFORCES THE DIFFERENCE ───────────────────────────────
 *
 * `pool_blocks` is keyed by the chain the block is on and `pool_shares` by the chain the share is
 * on, so micro-pool accepts an aux chain on `/v1/pool/blocks` and refuses it with a 400 on
 * `/v1/pool/shares` and `/v1/pool/workers`. That is not an inconsistency to paper over here: a
 * miner's Dogecoin share history IS their Litecoin share history, because the Litecoin work is what
 * produced the Dogecoin block, and a page that offered `doge` in the workers form would be asking a
 * question with no answer.
 *
 * So this is used by the blocks page ALONE. Everything about work in flight — the connection
 * details, the chain selector on `/workers`, the panels of live rates — is keyed off `chains`,
 * where an aux chain has no listener to appear in.
 *
 * The parents come first and each aux chain follows its own parent, so the order is stable and
 * reads as the containment it is.
 */
export function minedChains(chains: readonly PoolChainStatus[]): readonly MinedChain[] {
  return chains.flatMap((chain) => [
    { chain: chain.chain, name: chain.name, merged: false },
    ...(chain.merged ? [{ chain: chain.merged.chain, name: chain.merged.name, merged: true }] : []),
  ])
}
