/**
 * The route table, as data.
 *
 * This module imports NOTHING. Three separate things have to agree about which addresses this app
 * answers — this table, `src/app.tsx`, and the enumerated `location` blocks in `nginx.conf` — and
 * `test/routes.test.ts` reads all three as text and cross-checks them. It can only do that if this
 * file is readable without a bundler.
 *
 * The nginx side is the half that fails quietly. `try_files $uri /index.html` answers 200 for every
 * address in existence, including the ones this router does not know, so a typo in a link becomes a
 * blank page with a successful status and a crawler indexes every one of them. The routes are
 * therefore enumerated there, and `error_page 404 /index.html` is what serves the shell UNDER the
 * real status.
 */

export interface AppRoute {
  /** The path segment, without a leading slash. The index route is the empty string. */
  readonly path: string
  /** What the sub-navigation calls it, or null when it is not a navigation destination. */
  readonly label: string | null
  /** True when the router genuinely has children beneath this path. Decides the nginx form. */
  readonly wildcard: boolean
}

/**
 * Three routes, and the argument for each one being separate rather than a section of the landing
 * page:
 *
 *   `''`        — how to point a miner here, and what the pool is doing right now. The one page a
 *                 stranger needs, and the page every honesty statement on this site lives on first.
 *   `workers`   — a miner's own record: their workers, and their share history share by share.
 *                 §6 of the multi-chain specification makes this a product requirement — "the share
 *                 history has to be checkable by the miner against their own machine" — and a
 *                 checkable thing has to have an address that can be bookmarked and shared, which
 *                 a tab on the landing page does not.
 *   `blocks`    — every block this pool has submitted and what the node said about it, INCLUDING
 *                 the rejections. micro-pool calls that "the single most useful diagnostic this
 *                 service can publish".
 *
 * There is deliberately no payouts page, no earnings page and no dashboard. Two of those would have
 * nothing to render and the third would imply the first two exist.
 */
/**
 * ── WHERE THIS BUNDLE IS MOUNTED ─────────────────────────────────────────────────────────────
 *
 * The pool console used to be a hostname. It is a FOLDER on the apex now: `/pool`, wave 3d of the
 * consolidation argued in micro-deploy `docs/apex-consolidation.md`. The registry says the same
 * thing in one line — `subdomain: ''`, `basePath: '/pool'`.
 *
 *   A ROUTER PATH is what `react-router` matches, relative to the mount: `workers`. Everything in
 *     `ROUTES` below and every `<Link to>`. `basename` in `src/app.tsx` puts the prefix back.
 *
 *   A PUBLIC PATH is what the address bar shows and what a crawler is handed: `/pool/workers`.
 *     Every `<loc>` in the sitemap and every `location` in `nginx.conf`.
 *
 * `publicPath()` is the one crossing and the only place `BASE` is concatenated.
 *
 * ── WHAT DOES NOT CARRY THIS PREFIX, AND WHY ─────────────────────────────────────────────────
 *
 * The stratum WebSocket. `hub-web` opens the URL micro-pool PUBLISHES from
 * `POOL_WEBSOCKET_PUBLIC_ORIGIN`, which is an operator-set absolute address on `pool.<apex>` —
 * the hostname whose API this plan deliberately leaves un-redirected. Nothing in this repository
 * composes it and nothing here should start.
 */
export const BASE = '/pool'

/** A router path as a public one. No trailing slash: the console is `/pool`, not `/pool/`. */
export function publicPath(path: string): string {
  const rooted = path.startsWith('/') ? path : `/${path}`
  return rooted === '/' ? BASE : `${BASE}${rooted}`
}

export const ROUTES: readonly AppRoute[] = [
  { path: '', label: 'Mine here', wildcard: false },
  { path: 'workers', label: 'Workers', wildcard: true },
  { path: 'blocks', label: 'Blocks', wildcard: false },
]

/** The sub-navigation, in order. Derived, so a route cannot be added without deciding this. */
export const NAV: readonly { readonly to: string; readonly label: string }[] = ROUTES.filter(
  (route): route is AppRoute & { label: string } => route.label !== null,
).map((route) => ({ to: `/${route.path}`, label: route.label }))

/** Every non-index path, for the nginx cross-check. */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((route) => route.path !== '').map(
  (route) => route.path,
)

/**
 * A worker page's address.
 *
 * The chain is its own segment rather than a query parameter because a link to a miner's record has
 * to survive being pasted into a chat window, and because this pool's chain set is per-deployment:
 * `/workers/ltc/…` still means the same thing on a deployment that later adds `btc`, whereas a
 * chainless URL would start meaning something different the day a second chain appeared.
 *
 * Both segments are encoded. An account is `[A-Za-z0-9_:-]` by the service's own rule so nothing in
 * it needs escaping today, but a link builder that assumes its input is clean is a link builder
 * that breaks the first time the rule widens.
 */
export function workerPath(chain: string, account: string): string {
  return `/workers/${encodeURIComponent(chain)}/${encodeURIComponent(account)}`
}
