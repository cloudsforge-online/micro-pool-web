/**
 * One fetch, four states.
 *
 * Every screen needs the same four-way answer — loading, ok, empty, failed — and every screen that
 * computes it by hand eventually gets one of the cases wrong: an empty array rendered for a
 * timeout, or a spinner that never resolves. The decision is made once here, as a pure function.
 *
 * The template's fifth state, `forbidden`, is deleted rather than carried. Nothing on this surface
 * is gated: `micro-pool`'s HTTP surface takes no bearer token on any route and this bundle holds no
 * credential, so a 403 from it would be the gateway's and not the application's. A state nothing
 * can reach is a branch nothing tests, and it would have suggested to the next reader that some
 * part of this site is behind a login. None of it is.
 *
 * ── EMPTY IS THE NORMAL STATE HERE, AND THE COPY HAS TO KNOW THAT ─────────────────────────────
 *
 * On 2026-08-09 this pool has no miners, no shares and no blocks, and neither network in this
 * estate has real users at all — the accounts on both are beacon's synthetic traffic and test
 * residue. So the empty state is not an incident to be apologised for; it is the state this site
 * will be in on the day it launches, and every `Empty` on it is written as a cold start with
 * something to DO rather than as an absence to be sorry about.
 */
import { useCallback, useEffect, useState } from 'react'
import { ApiError, noticeFor, type ErrorNotice } from './api.ts'
import { NO_POOL_HERE, usePoolApi } from './deployment.tsx'

export type ResourceState = 'loading' | 'ok' | 'empty' | 'failed'

/**
 * Which state a resource is in.
 *
 * FAILURE OUTRANKS EMPTINESS. A request that threw has told us nothing about whether data exists,
 * so reporting "nothing here" for a timeout is how an outage reads as a quiet week — and on a
 * mining pool it is how "the pool lost my shares" reads as "you have not mined any".
 */
export function resourceState(opts: {
  readonly loading: boolean
  readonly error: ErrorNotice | null
  readonly count: number | null
}): ResourceState {
  if (opts.error) return 'failed'
  if (opts.loading) return 'loading'
  if (opts.count === null) return 'loading'
  return opts.count > 0 ? 'ok' : 'empty'
}

/**
 * The length of a list the service was supposed to send, and 0 for anything else.
 *
 * ── THIS IS NOT DEFENSIVENESS FOR ITS OWN SAKE. IT WAS FOUND BY A RED TEST ────────────────────
 *
 * `test/honesty.test.ts` mounts this app against a `/v1/pool` that answers 200 with a body that is
 * not the shape it promised — the shape of an nginx or a gateway answering where micro-pool was
 * expected. Reading `.length` off the missing array threw during render, React unmounted the whole
 * tree, and the page went BLANK: no chains, no error state, and — the part that matters — no
 * standing statement that this pool does not pay out.
 *
 * A crash is the one failure mode that defeats the asymmetry in `src/lib/status.tsx`, because a
 * component that never renders cannot say anything at all. So a malformed body resolves to `empty`
 * or `failed`, which are states this site can be honest in.
 */
export function lengthOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

export interface Resource<T> {
  readonly state: ResourceState
  readonly data: T | null
  readonly error: ErrorNotice | null
  readonly reload: () => void
}

/**
 * Run `load` on mount and on demand, and reduce the outcome to one of the four states.
 *
 * `count` exists because "empty" is a property of the DATA and not of the response: a 200 carrying
 * an empty `workers` array is the empty state, not the ok state.
 *
 * `deps` re-runs the load when the thing being loaded changes — navigating from one miner's page to
 * another is a route parameter change and not a remount, so without it the second address would
 * render the first one's shares.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * IT DOES NOT RUN `load` AT ALL ON A DEPLOYMENT WITH NO POOL BEHIND IT — micro-org#406.
 *
 * MEASURED 2026-08-11: `pool-testnet.cloudsforge.online` serves this bundle with a 200 and answers
 * every `/v1/…` under it with a Traefik 502, because micro-pool is behind a compose profile a
 * testnet estate does not name. `src/lib/deployment.tsx` is how this bundle learns that, and this
 * is where knowing it stops requests being made.
 *
 * ── WHY THE GATE IS HERE, IN THE GENERIC HOOK, AND NOT IN EACH CALLER ─────────────────────────
 *
 * Because a caller can forget, and one that forgot was found by a red test rather than by reading.
 * The first version of this fix put the branch in `PoolStatusProvider` alone, on the reasoning that
 * every page reads its `chains` and a page with no chains asks for nothing. That is true of the
 * landing page and of `/blocks` — and false of `/workers/:chain/:account`, which takes its chain
 * and its account from the URL and therefore fired `GET /v1/pool/workers` and `GET /v1/pool/shares`
 * with no chain list at all. A deep link into a miner's record — the address that gets bookmarked
 * and pasted into support conversations — still put two 502s in the reader's console.
 *
 * Every read on this surface is a read of micro-pool: there is exactly one upstream, its presence
 * is a property of the deployment rather than of the caller, and every one of those reads comes
 * through this hook. So the question "is there anything at the other end" is answered once, here,
 * and a page written next year cannot be the one that forgets.
 *
 * ── AND WHY `unknown` WAITS RATHER THAN FETCHING OPTIMISTICALLY ───────────────────────────────
 *
 * `unknown` lasts exactly one same-origin round trip against this container's own nginx — shorter
 * than any request this would have started, and it delays no static content, because it holds up
 * the DATA and not the render. The optimistic alternative fires the doomed request and then cannot
 * cancel it before the answer arrives, which is the whole of what this is here to prevent.
 *
 * The opposite default — treating `unknown` as `absent` — is the one that must never be taken: it
 * would put "this network does not run a mining pool" on the pool's own console, on mainnet, on
 * every load, for the length of that round trip.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  count: (data: T) => number,
  fallbackMessage: string,
  deps: readonly unknown[] = [],
): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const deployment = usePoolApi()

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setData(null)

    // Not yet told. Stay in `loading`, which is what every page on this site already renders
    // correctly, and re-run when the answer lands — `deployment` is in the dependency list below.
    if (deployment === 'unknown') return () => controller.abort()

    if (deployment === 'absent') {
      // `status: 0` is the code this bundle already reserves for "the request never produced a
      // response at all" (`src/lib/api.ts`), which is precisely what happened: no request was made.
      // It carries no request id, because no request exists to quote to anybody.
      //
      // Almost nothing renders this. `src/app.tsx` substitutes the whole page for an explanation
      // whenever the deployment says `absent`, so this reaches a screen only from a future page
      // that reads a resource outside that substitution — where the reader gets the true sentence
      // instead of "The pool did not answer", which is the sentence micro-org#406 was about.
      setError(noticeFor(new ApiError(0, NO_POOL_HERE), fallbackMessage))
      setLoading(false)
      return () => controller.abort()
    }

    load(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        setData(value)
        setLoading(false)
      })
      .catch((err: unknown) => {
        // An abort is this component going away, not a failure. Rendering the failed state for it
        // is how a fast double-navigation leaves an error on a screen nobody is looking at.
        if (controller.signal.aborted) return
        setError(noticeFor(err, fallbackMessage))
        setLoading(false)
      })
    return () => controller.abort()
    // `load` is recreated every render by most callers, so it is deliberately not a dependency.
    // `deployment` IS one: the whole point of the gate above is that the load runs the moment — and
    // only the moment — this container has said there is something at the other end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, deployment, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    state: resourceState({ loading, error, count: data === null ? null : count(data) }),
    data,
    error,
    reload,
  }
}
