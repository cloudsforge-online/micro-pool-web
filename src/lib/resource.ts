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
import { noticeFor, type ErrorNotice } from './api.ts'

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

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setData(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    state: resourceState({ loading, error, count: data === null ? null : count(data) }),
    data,
    error,
    reload,
  }
}
