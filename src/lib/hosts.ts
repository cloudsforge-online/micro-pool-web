/**
 * Where this app talks to, and what address it tells a miner to point hardware at — both resolved
 * at runtime from `window.location.hostname`, never from a build-time constant.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THIS SURFACE HAS NO ROW IN THE SURFACE REGISTRY YET, AND THAT IS THE WHOLE REASON THIS FILE IS
 * LONGER THAN ITS SIBLINGS.
 *
 * `ui/packages/ui/src/surfaces.ts` declares `SurfaceKey`, and on 2026-08-09 there is no `pool`
 * among its values — micro-pool's own pull request (cloudsforge-online/micro-pool#1) is still open
 * and registration was explicitly held back from it. `cloudsforgeHosts()` is
 * `Record<SurfaceKey, string>` (`ui/packages/ui/src/index.tsx`), so there is no key to ask for.
 *
 * That absence is not merely "one URL we cannot look up". It corrupts EVERY url the shared chrome
 * derives, and it does so silently. `cloudsforgeHosts()` finds the apex by stripping a *known*
 * first label:
 *
 *     const apex = parts.length > 2 && KNOWN_SUBS.has(first) ? parts.slice(1).join('.') : host
 *
 * `KNOWN_SUBS` is built from the registry's own `subdomain` values, so served at
 * `pool.cloudsforge.online` the first label is not recognised, the apex becomes the whole
 * hostname, and the bar, the footer, the product switcher and the Lantern ingest all resolve one
 * level too deep — `hub.pool.cloudsforge.online`, `lantern.pool.cloudsforge.online`. None of those
 * exist. The page still renders; every link on it is dead.
 *
 * This is a KNOWN failure with a KNOWN remedy and there is precedent for both halves. The registry
 * says so itself, beside `emberkin`: "a surface absent from this registry is absent from
 * KNOWN_SUBS — so `cloudsforgeHosts()` could not strip `emberkin.` when deriving the apex, and
 * resolved identity, billing and telemetry to `nimbus.emberkin.<apex>` and friends: three
 * hostnames that do not exist. Found by micro-emberkin-web, WHICH CARRIED A LOCAL CORRECTION UNTIL
 * THIS ENTRY EXISTED."
 *
 * So this file carries the same local correction, and `correctedHosts()` below is it. It is
 * temporary by construction: the moment a `pool` row lands in the registry, `placementOf()` starts
 * taking the `registry` branch, the correction becomes a no-op that changes nothing, and this file
 * can be deleted down to the shape of `explorer-web/src/lib/hosts.ts`. `test/hosts.test.ts` pins
 * both branches so that the day the row lands is a day a test tells somebody.
 *
 * The registry edit is NOT in this repository, because `micro-ui` is not this repository's to
 * change. It is listed in the pull request's registration section.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { cloudsforgeHosts, type CloudsForgeHosts } from '@cloudsforge/ui'
import { ENV_LABELS, KNOWN_SUBS, SURFACES, envLabel, splitEnvLabel } from '@cloudsforge/ui/surfaces'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'pool-web'

/**
 * The first label this bundle expects to be served under, and the label micro-pool expects too.
 *
 * `pool` rather than `mining` or `stratum`: it is the repository name minus the `micro-` prefix,
 * which is the rule every other subdomain in the registry follows.
 */
export const POOL_SUBDOMAIN = 'pool'

/**
 * The port micro-pool's HTTP surface binds, for `pnpm dev` only.
 *
 * 4146, because that is the port the service binds — `pool/src/env.ts`, `pool/.env.example`, and
 * the `PORT=4146` default in both. A dev port is a FACT ABOUT A SERVICE and not an allocation;
 * the registry's own comments record three surfaces that got this wrong by picking a free-looking
 * number instead of reading the service (`foresight` carried beacon's 4011, `emberkin` carried
 * 3014 while binding 4100, `admin` carried 3002 while admin-api binds 4014). When the `pool`
 * registry row lands it must carry 4146 for the same reason, and `test/hosts.test.ts` will read
 * it back off the registry rather than trusting this constant.
 */
export const POOL_API_DEV_PORT = 4146

/**
 * The accent block this page's `<html>` names.
 *
 * There is no `[data-cf-product='pool']` block in `ui/packages/ui/src/tokens.css` and there is no
 * `pool` accent in the registry, so naming one would fall through to the company ember in complete
 * silence — the exact failure `admin` had and `explorer` still has. `network` is the correct
 * selector: a mining pool is chain infrastructure, it belongs to Forge Network, and `explorer-web`
 * already sets `network` for the same reason. `test/brand-chrome.test.ts` asserts the selector
 * this page names really exists in tokens.css, which is the check that catches a fall-through
 * either way.
 */
export const ACCENT_SURFACE = 'network'

/**
 * The sentence a search result carries, declared ONCE.
 *
 * It leads with what this pool does not do, because that is the single most important fact about
 * it and a description is frequently the only thing a person reads before deciding whether to
 * point hardware somewhere. `test/seo.test.ts` compares this byte for byte with the description
 * meta in `index.html`, so the copy a link-preview fetcher gets — those generally do not execute
 * JavaScript — cannot drift from the copy a crawler that does execute JavaScript ends up with.
 */
export const SURFACE_DESCRIPTION =
  'The CloudsForge Stratum v1 mining pool. Shares are recorded and PPLNS-weighted, but payouts ' +
  'are not implemented: mining here earns nothing today.'

/**
 * Where this bundle is being served from, decomposed.
 *
 * `kind` is deliberately three-valued rather than a boolean, because the three cases want three
 * different behaviours and a boolean would collapse two of them:
 *
 *   `local`    — `pnpm dev` or a local compose stack. The API is on another port of the same
 *                machine and every other estate host is on localhost too.
 *   `pool`     — served at this surface's own hostname, in some environment. The API is same
 *                origin behind the gateway, and every other estate host is derivable.
 *   `registry` — served at a hostname the surface registry ALREADY knows how to strip. Today that
 *                means somebody has put this bundle somewhere unexpected, or — the case this
 *                branch exists for — a `pool` row has landed in the registry and the correction
 *                below is no longer needed. Either way `cloudsforgeHosts()` is already right and
 *                must not be second-guessed.
 *   `unknown`  — a hostname nothing can be derived from. Say so; do not guess.
 */
export interface Placement {
  readonly kind: 'local' | 'pool' | 'registry' | 'unknown'
  /** The environment label, `''` for the unadorned (mainnet) form. */
  readonly env: string
  /** The apex the estate is served under, `''` when there is nothing to derive one from. */
  readonly apex: string
}

/** The same four names `cloudsforgeHosts()` treats as development. Kept in step by test. */
export function isLocal(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  )
}

/**
 * Decompose a browser hostname.
 *
 * The `registry` check comes FIRST and that ordering is the point: `splitEnvLabel` and
 * `KNOWN_SUBS` are the registry's own functions, so the moment a `pool` row exists this function
 * stops taking the `pool` branch and the local correction below stops applying. The correction
 * cannot outlive the gap it was written for, which is the failure mode of every local workaround
 * that has ever been left in a repository.
 */
export function placementOf(hostname: string): Placement {
  if (isLocal(hostname)) return { kind: 'local', env: '', apex: '' }

  const parts = hostname.split('.')
  const first = parts[0] ?? ''
  const rest = parts.slice(1).join('.')

  // The registry can already strip this label, either because it is a known subdomain or because
  // it is a known subdomain carrying an environment suffix. Nothing here should interfere.
  if (parts.length > 2 && (KNOWN_SUBS.has(first) || splitEnvLabel(first) !== null)) {
    return { kind: 'registry', env: splitEnvLabel(first)?.env ?? '', apex: rest }
  }
  // The bare environment label at the apex — `testnet.cloudsforge.online`. Also the registry's,
  // and never this surface: the pool is a subdomain, not the front door.
  if (ENV_LABELS.has(first)) return { kind: 'registry', env: first, apex: rest }

  if (parts.length > 2 && first === POOL_SUBDOMAIN) {
    return { kind: 'pool', env: '', apex: rest }
  }
  if (parts.length > 2 && first.startsWith(`${POOL_SUBDOMAIN}-`)) {
    const env = first.slice(POOL_SUBDOMAIN.length + 1)
    if (ENV_LABELS.has(env)) return { kind: 'pool', env, apex: rest }
  }
  return { kind: 'unknown', env: '', apex: '' }
}

/**
 * Every CloudsForge base URL, with the apex derived correctly for THIS surface.
 *
 * A faithful re-implementation of `hostsFrom` in `ui/packages/ui/src/index.tsx` — including the
 * `basePath` suffix and the apex surface's collapse to a bare label — applied to an apex the
 * registry could not work out for itself. It is a copy, which is a cost, and the comment at the
 * top of this file is the receipt for why it is being paid.
 *
 * On every placement except `pool` this returns the registry's own answer untouched.
 */
export function correctedHosts(placement: Placement, registry: CloudsForgeHosts): CloudsForgeHosts {
  if (placement.kind !== 'pool') return registry
  const { env, apex } = placement
  const entries = SURFACES.map((s) => {
    const label = envLabel(s.subdomain, env)
    const origin = label ? `https://${label}.${apex}` : `https://${apex}`
    return [s.key, `${origin}${s.basePath ?? ''}`] as const
  })
  return Object.fromEntries(entries) as CloudsForgeHosts
}

/**
 * The base URL for micro-pool's read API.
 *
 * In production the bundle and the service are one origin — nginx serves this bundle at
 * `pool.<apex>` and micro-pool answers `/v1/...` behind the same hostname, exactly as the gateway
 * already arranges for `explorer.<apex>` and micro-indexer
 * (`deploy/gateway/dynamic/estate-web.yml`: the bundle router matches the host at priority 500,
 * the API router matches host plus `PathPrefix('/v1')` at 600). So the base is the empty string
 * and every request stays relative.
 *
 * `unknown` also resolves to a relative base, deliberately. There is no apex to build an absolute
 * URL from, and a relative request at least reaches whatever is serving this bundle; an invented
 * absolute one reaches a hostname that does not exist and reports itself as a network failure.
 * The shell says the placement is unregistered either way.
 *
 * The distinction is drawn by COMPARING PLACEMENTS rather than by a `DEV` flag, because a flag is
 * a build-time constant and this repository has none: an image built for production and opened on
 * localhost would then point at a host that is not there.
 */
export function resolveApiBase(placement: Placement): string {
  return placement.kind === 'local' ? `http://localhost:${POOL_API_DEV_PORT}` : ''
}

/**
 * The hostname a miner types into their mining firmware.
 *
 * ── THIS IS NOT NECESSARILY THE HOSTNAME OF THE PAGE, AND THE DIFFERENCE MATTERS ───────────────
 *
 * Stratum v1 is line-delimited JSON-RPC over RAW TCP on its own port — 3333 for BTC, 3334 for LTC
 * (`pool/src/env.ts`). It is not HTTP, it cannot be proxied by an HTTP reverse proxy, and it is
 * not served over TLS by micro-pool at all (`pool/README.md` lists "TLS on the stratum port" among
 * the things it does not implement). So the HTTPS front door this page arrives through and the TCP
 * endpoint a miner dials are two separate pieces of deploy plumbing that only happen to share a
 * name.
 *
 * This returns the name they are EXPECTED to share, and the page says the port is raw TCP rather
 * than letting a reader assume 443 works. If the estate ends up exposing stratum on a different
 * name, this function is the one place that changes — and it changes to read the name off the API,
 * not to hold a literal, because a literal here is the build-time configuration this repository
 * does not have.
 *
 * `null` for an unregistered placement. A wrong hostname in a miner's configuration costs its
 * owner a silent outage they will blame on their hardware, so not answering is better than
 * guessing. The page renders the absence rather than a plausible string.
 */
export function resolveStratumHost(placement: Placement): string | null {
  switch (placement.kind) {
    case 'local':
      return 'localhost'
    case 'pool':
      return `${envLabel(POOL_SUBDOMAIN, placement.env)}.${placement.apex}`
    // A registry placement means this bundle is being served somewhere that is not the pool
    // surface. Whatever that host is, it is not where the stratum ports are.
    case 'registry':
    case 'unknown':
      return null
  }
}

/** The current placement, read now. Call it per use; never cache it in a module constant. */
export function placement(): Placement {
  return placementOf(typeof window === 'undefined' ? '' : window.location.hostname)
}

/** Every CloudsForge base URL, for the current environment, corrected for this surface. */
export function hosts(): CloudsForgeHosts {
  return correctedHosts(placement(), cloudsforgeHosts())
}

/** This app's API base, resolved now. Call it per request; never cache it in a module constant. */
export function apiBase(): string {
  return resolveApiBase(placement())
}

/** The stratum hostname to show a miner, or null when it cannot be derived. */
export function stratumHost(): string | null {
  return resolveStratumHost(placement())
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/**
 * Whether this bundle is being served from an address it can derive the estate from.
 *
 * Read by the shell, which says so once when the answer is no. It is not a security boundary —
 * every route here is public — but a page whose every outbound link is silently one level too deep
 * is worse than a page that admits it does not know where it is.
 */
export function placementIsKnown(): boolean {
  return placement().kind !== 'unknown'
}
