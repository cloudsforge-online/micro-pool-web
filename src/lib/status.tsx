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
 *      (`pool/src/env.ts`) and today's estate can only deploy `ltc`, because bitcoind is still doing
 *      its initial block download. Every chain selector, every table heading and every stratum port
 *      on this site is drawn from `status.chains`, and NOTHING in this bundle holds a list of its
 *      own. A pool serving one chain must not render a two-chain layout with a hole in it.
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
  const base = apiBase()
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
    [base],
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
