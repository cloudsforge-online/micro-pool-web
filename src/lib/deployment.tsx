/**
 * WHETHER THIS DEPLOYMENT HAS A MINING POOL BEHIND IT AT ALL.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * This is the only thing this bundle learns from its container rather than from `window.location`
 * or from the API, and it took a measured defect to justify the exception. micro-org#406,
 * 2026-08-11: `pool-testnet.cloudsforge.online/` answered 200 and every `/v1/…` under it answered
 * 502, so `/`, `/workers` and `/blocks` all rendered "The pool did not answer" with a Try again
 * button that could never succeed.
 *
 * Nothing was broken. micro-pool is behind `profiles: ["pool"]` in
 * `deploy/compose/docker-compose.estate.yml`; `compose/mainnet.env` names that profile and
 * `compose/testnet.env` does not, so on a testnet estate the API container is never created and
 * Traefik has no backend to forward `/v1` to. That is deliberate and permanent — micro-pool
 * validates `POOL_NETWORK` against what the node reports and requires a node URL and a payout
 * address per chain, so a pool started on a testnet estate refuses to boot. This console is
 * deliberately NOT behind the same profile, because `deploy/gateway/dynamic/estate-web.yml`
 * expects it to be "the page that explains the hole". It could not explain anything: a 502 is
 * indistinguishable from an outage to a client that has never been told the difference.
 *
 * ── WHY THIS IS NOT DERIVED FROM THE HOSTNAME, WHICH IS THIS FILE'S WHOLE POINT ───────────────
 *
 * Everything else in this bundle resolves from `window.location.hostname` (`src/lib/hosts.ts`), and
 * the tempting move is to do it here too: this hostname carries an environment label, `testnet` has
 * no pool, done. It is wrong, and it is wrong in the direction that costs the most.
 *
 * "Which network is this" and "does this network run a mining pool" are two different questions.
 * The second is a property of one `COMPOSE_PROFILES` line in one env file, and it can change on
 * either network without a hostname changing: a staging estate could run a pool, and mainnet's own
 * pool was behind that same profile until 2026-08-09, when its payout address and its fee were
 * decided. A rule that read the environment label would have declared mainnet poolless for as long
 * as that was true and then lied about it the moment it stopped being true — a page telling miners
 * there is no pool while there is one is the more expensive of the two errors by a distance.
 *
 * ── WHY IT IS NOT A BUILD ARG EITHER ──────────────────────────────────────────────────────────
 *
 * `test/no-build-time-config.test.ts` forbids every form of build-time environment anywhere in
 * `src/` — the bundler's own env object, the prefixed variables it inlines, and Node's `process`
 * env — and it is not alone: the `rules` job in `.github/workflows/ci.yml` greps for the same three
 * WITHOUT stripping comments, so naming them here in prose fails the build. (Deliberate on their
 * part, and left that way rather than loosened: a rule that tolerates its own name in a comment is
 * a rule somebody disables with a comment.) The reason for all of it is that the image is built
 * once, tagged once and promoted, and the estate pins one
 * image per deployable by digest. So the answer arrives at RUNTIME, as a document this container's
 * own nginx composes from `POOL_API_PRESENCE` in its environment. One image, one digest, and the
 * environment stays in the environment. See `nginx.conf` under "IS THERE A POOL API ON THIS
 * DEPLOYMENT AT ALL?" for the mechanism and its three traps.
 *
 * ── ABSENT IS SAID EXPLICITLY OR NOT AT ALL ───────────────────────────────────────────────────
 *
 * `PRESENT` is the answer to every ambiguity: a 404, a body that is not JSON, a field that is
 * missing, a value that is anything other than the exact string `absent`, a request that never
 * landed. The asymmetry runs the opposite way to `payoutsImplemented` in `src/lib/status.tsx`, and
 * for the same underlying reason — each defaults to the answer whose failure mode is survivable.
 * There, silence must not become a promise of payment. Here, silence must not become a page
 * telling a miner with hardware pointed at a working pool that the pool does not exist. An
 * operator who deletes an environment variable gets today's console back, which is a console that
 * works.
 *
 * ── AND THE OTHER ESTATE, WHICH THIS DOCUMENT CANNOT ANSWER FOR ───────────────────────────────
 *
 * Everything above is about the container serving this page. Since micro-org#459 the reader can
 * also VIEW the other network in place (`src/lib/viewing.tsx`), and the same question has to be
 * asked of an estate that is not serving anything here. It cannot be asked the same way, and the
 * obvious attempt is a trap worth writing down so nobody spends an afternoon on it:
 *
 *     $ curl -sI https://pool-testnet.cloudsforge.online/deployment.json
 *     HTTP/2 302   location: https://pool.cloudsforge.online/deployment.json
 *
 * The `-testnet` WEB hostnames are retired under the combined view and 302 to their mainnet
 * siblings, preserving path and query. Only `/v1` is exempt. So a fetch of the sibling's
 * `/deployment.json` follows the redirect and comes back with MAINNET'S answer wearing a testnet
 * hostname — `{"poolApi":"present"}` — which would authorise a console viewing testnet to go on
 * and read a pool that is not there. The one form of this that is worse than not asking.
 *
 * {@link probeViewedApi} asks the service instead, at the one prefix the redirect does not touch,
 * and it inverts the asymmetry above: for the viewed estate every ambiguity is ABSENT. That is not
 * inconsistency, it is the same rule — default to the survivable failure — applied to a reader in
 * a different position. Nobody's hardware is pointed at the estate they are merely LOOKING at, so
 * "nothing answered there" costs them nothing; whereas defaulting to `present` sends them to a
 * page reading "The pool did not answer" with a Try again button, on a network that has no pool,
 * which is micro-org#406 exactly — resurrected through the switcher rather than through a
 * hostname. Measured 2026-08-16: `pool-testnet.cloudsforge.online/v1/pool` answers 502 from the
 * edge with no `access-control-allow-origin` on it, so a browser cannot even read the STATUS; the
 * fetch rejects. There is no more precise answer available to this bundle than "nothing answered",
 * and `src/pages/no-pool.tsx` says exactly that and no more.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { REQUEST_TIMEOUT_MS } from './api.ts'
import { pageOrigin } from './hosts.ts'
import { BASE } from './routes.ts'
import { viewedApiOrigin } from './viewed.ts'
import { useViewing } from './viewing.tsx'

/**
 * Where the answer lives.
 *
 * Same origin and a fixed path, so no hostname is composed and no CORS grant is needed. It is NOT
 * under `/v1`: the gateway routes that prefix to micro-pool, which is the service this document
 * exists to report the absence of, so a `/v1` address would be answered by the 502 it is meant to
 * explain. `nginx.conf` serves it from this container, beside the bundle.
 */
export const DEPLOYMENT_PATH = `${BASE}/deployment.json`

/**
 * How long the console waits for its own container to answer a static string.
 *
 * Two seconds rather than `REQUEST_TIMEOUT_MS`'s eight. This is not a read against a service across
 * an estate; it is nginx answering a `return 200` from the same origin that just served the
 * document. Eight seconds of blank page while waiting for it would be eight seconds spent on the
 * pathological case, and the pathological case resolves to `present` anyway — so the cost of the
 * timeout being short is nil and the cost of it being long is paid by every reader.
 */
export const DEPLOYMENT_TIMEOUT_MS = 2000

/**
 * `unknown` is a real state and pages must render it as such.
 *
 * It lasts one same-origin round trip. What it must not do is default to `absent` for that round
 * trip — a console that flashed "this network does not run a mining pool" before its own numbers
 * arrived would be showing every reader, on every load, on every estate, the one sentence that is
 * only true on some of them.
 */
export type PoolApiPresence = 'unknown' | 'present' | 'absent'

/**
 * What a resource says when there was no service to ask.
 *
 * Lives here rather than in `src/lib/status.tsx` because `src/lib/resource.ts` is what renders it —
 * the gate that declines to fetch is in the hook every page's data goes through — and a constant in
 * `status.tsx` would make the generic hook depend on the one provider it is used by.
 *
 * It is a statement about the deployment, not about a request. Nothing routinely reaches a screen
 * with it: `src/app.tsx` substitutes an explanation for any page that would show it.
 */
export const NO_POOL_HERE = 'This network does not run a mining pool.'

/**
 * Read the document's claim, refusing to be clever about it.
 *
 * Anything that is not the exact string `absent` in the `poolApi` field is `present`, including the
 * empty string — which is what an unset `POOL_API_PRESENCE` renders as, and therefore what every
 * host that has never heard of this flag serves.
 */
export function readPresence(body: unknown): 'present' | 'absent' {
  if (body === null || typeof body !== 'object') return 'present'
  return (body as Record<string, unknown>)['poolApi'] === 'absent' ? 'absent' : 'present'
}

/**
 * Ask this container what it is.
 *
 * Never rejects and never throws. Every failure — a 404 from an older image that has no such
 * location, an nginx that answered HTML, an abort, a timeout — is `present`, which is the state
 * this console has always been in and knows how to render.
 */
export async function fetchPresence(signal?: AbortSignal): Promise<'present' | 'absent'> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEPLOYMENT_TIMEOUT_MS)
  const onCallerAbort = () => controller.abort()
  signal?.addEventListener('abort', onCallerAbort, { once: true })
  try {
    const res = await fetch(new URL(DEPLOYMENT_PATH, pageOrigin()), {
      method: 'GET',
      headers: { accept: 'application/json' },
      // No cookies, for the reason `src/lib/api.ts` gives: nothing on this surface reads a session,
      // and sending one would make a static read into a CSRF surface for nothing in return.
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return 'present'
    return readPresence(await res.json())
  } catch {
    // Deliberately swallowed and deliberately not reported to observability. There is no failure
    // here that a reader or an operator can act on: the fallback IS the working console, and an
    // image built before this document existed would otherwise report an error on every page load
    // on every estate for as long as it took somebody to notice.
    return 'present'
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

/**
 * The one route on the viewed estate that the retirement redirect does not touch.
 *
 * `/v1` is exempt from the `-testnet` → mainnet 302 precisely so the combined view can read the
 * other network's data; everything else on that hostname comes back as mainnet's. So this is not
 * merely "a route that happens to work", it is the only address on the sibling estate whose answer
 * is about the sibling estate.
 */
const VIEWED_PROBE_PATH = `${BASE}/v1/pool`

/**
 * Whether the estate the reader is VIEWING has a pool behind it — asked of the service itself.
 *
 * Never rejects and never throws, like {@link fetchPresence}, and for the opposite default: every
 * ambiguity here is `absent`. The argument is at the top of this file. The short form is that a
 * reader looking at another network has no hardware pointed at it, so "nothing answered there" is
 * a cheap error, while `present` on an estate with no pool puts an incident page in front of them
 * for a state that is not an incident.
 *
 * `REQUEST_TIMEOUT_MS` rather than {@link DEPLOYMENT_TIMEOUT_MS}: this one really is a read across
 * the estate, over the edge and through a second gateway, so it gets the budget every other
 * cross-estate read in this bundle gets.
 */
export async function probeViewedApi(
  origin: string,
  signal?: AbortSignal,
): Promise<'present' | 'absent'> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onCallerAbort = () => controller.abort()
  signal?.addEventListener('abort', onCallerAbort, { once: true })
  try {
    const res = await fetch(new URL(VIEWED_PROBE_PATH, origin), {
      method: 'GET',
      headers: { accept: 'application/json' },
      // Same posture as every other read on this surface: no session is sent anywhere, and a
      // cross-origin read that carried one would need the credentialed CORS grant for no gain.
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
    return res.ok ? 'present' : 'absent'
  } catch {
    // Includes the case a browser cannot distinguish from a refusal: the edge's 502 for an estate
    // with no pool container carries no `access-control-allow-origin`, so the fetch rejects rather
    // than resolving with a status. Measured 2026-08-16. Either way nothing answered.
    return 'absent'
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

const PoolApiContext = createContext<PoolApiPresence>('unknown')

/**
 * Fetched once for the whole app, above the router — and again whenever the reader switches network.
 *
 * A provider rather than a call per page, for the reason `src/lib/status.tsx` gives about
 * `GET /v1/pool`: three pages reading one deploy fact separately is three requests for one answer
 * and three chances to disagree about it on one screen. It is also what lets `PoolStatusProvider`
 * below it decline to make a request that is known to fail — and that is why the answer has to
 * follow the SWITCHER rather than the container. Before micro-org#459's in-place view this was a
 * property of the deployment and was fetched once; it is now a property of the network being read,
 * and a provider still holding the serving estate's answer would authorise exactly the doomed
 * request this file exists to prevent.
 *
 * `presence` goes back to `unknown` on every switch, deliberately. `unknown` renders a loading
 * state and stops every read below, so the one thing that cannot happen in the gap is the previous
 * network's numbers sitting under the new network's banner.
 */
export function DeploymentProvider({ children }: { children: ReactNode }) {
  // Subscribing is the point: passing `children` through a provider does not re-render them, so
  // this component has to consume the context itself to learn that the reader switched.
  const { network } = useViewing()
  const [presence, setPresence] = useState<PoolApiPresence>('unknown')

  useEffect(() => {
    const controller = new AbortController()
    setPresence('unknown')
    // `''` is this deployment's own origin, which is the only case the document can answer for.
    const elsewhere = viewedApiOrigin()
    const ask =
      elsewhere === ''
        ? fetchPresence(controller.signal)
        : probeViewedApi(elsewhere, controller.signal)
    void ask.then((answer) => {
      if (!controller.signal.aborted) setPresence(answer)
    })
    return () => controller.abort()
    // `network` rather than the origin: it is the reader's choice, it is a string, and it changes
    // exactly when the answer might.
  }, [network])

  return <PoolApiContext.Provider value={presence}>{children}</PoolApiContext.Provider>
}

/**
 * Whether there is a pool behind this console.
 *
 * Returns `unknown` outside the provider rather than throwing, which is the opposite of
 * `usePoolStatus()`. The difference is what a wrong answer costs: a default `payoutsImplemented`
 * would be a second source of truth for the claim this whole repository exists to make, whereas a
 * default `unknown` here renders a loading state and then nothing at all — it cannot make this
 * console say something untrue, only make it slower to say the truth.
 */
export function usePoolApi(): PoolApiPresence {
  return useContext(PoolApiContext)
}
