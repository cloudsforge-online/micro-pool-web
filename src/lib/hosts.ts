/**
 * Where this app talks to, resolved at runtime from `window.location`, never from a build-time
 * constant.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE USED TO BE TWICE THIS LENGTH, AND THE HALF THAT IS GONE IS THE INTERESTING PART.
 *
 * `ui/packages/ui/src/surfaces.ts` had no `pool` row, so `cloudsforgeHosts()` could not strip
 * `pool.` when deriving the apex and resolved every sibling address one level too deep —
 * `hub.pool.<apex>`, `lantern.pool.<apex>`, hostnames that do not exist. The page rendered and every
 * link on it was dead. This file carried a local correction for that, `correctedHosts()`, exactly as
 * micro-emberkin-web did until its own row landed, and `test/hosts.test.ts` asserted the GAP so the
 * workaround could not outlive it.
 *
 * The row landed (micro-ui#3, merged 2026-08-09), the alarm went off, and the correction is deleted.
 * `cloudsforgeHosts()` now answers for this surface like any other, and what is left here is the
 * shape every other frontend in the estate has.
 *
 * ── WHAT IS *NOT* HERE, AND WILL NOT BE COMING BACK ───────────────────────────────────────────
 *
 * The stratum hostname. This file used to derive one from `window.location.hostname` on the theory
 * that "the deploy is expected to expose the TCP ports on the same name". It is not, and cannot be:
 * the console arrives through a Cloudflare Tunnel and then Traefik, neither of which forwards a raw
 * TCP stream, and micro-pool binds the stratum listener to loopback by default. So the derivation
 * was not merely unverified, it was WRONG, and it published a copy-pasteable
 * `stratum+tcp://pool.<apex>:3334` that no miner on earth could connect to. The endpoint is now
 * configuration in micro-pool, reported by `GET /v1/pool` as `stratumEndpoint`, and `null` until an
 * operator publishes one — see `src/lib/pool.ts` and micro-org#285.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'
import { envLabel, splitEnvLabel, surface } from '@cloudsforge/ui/surfaces'
import { BASE } from './routes.ts'
import { viewedApiOrigin } from './viewed.ts'

/**
 * The surface this application IS.
 *
 * `pool`, registered as a `service` with `inSwitcher: false`, subdomain `pool`, devPort 4146, accent
 * `#b28e1e`, glyph `▨` and **`markId: null`**. The null is a decision rather than a gap, and it is
 * the same one `explorer` carries: a mining pool is chain infrastructure and belongs to Forge
 * Network rather than being a product with a mark of its own. Nothing in this bundle renders a mark
 * and `test/brand-chrome.test.ts` asserts there is none to render.
 */
export const PRODUCT: SurfaceKey = 'pool'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'pool-web'

/**
 * The port micro-pool's HTTP surface binds, for `pnpm dev` only — READ OFF THE REGISTRY.
 *
 * Read rather than restated, because the registry row is now the estate's copy of this fact and a
 * constant here would be a second one. A dev port is a FACT ABOUT A SERVICE and not an allocation;
 * the registry's own comments record three surfaces that got it wrong by picking a free-looking
 * number instead of reading the service (`foresight` carried beacon's 4011, `emberkin` carried 3014
 * while binding 4100, `admin` carried 3002 while admin-api binds 4014). `test/hosts.test.ts` checks
 * this against micro-pool's own `.env.example` when that repository is checked out beside this one,
 * which is the only check that can catch the registry being wrong.
 */
export const POOL_API_DEV_PORT = surface(PRODUCT).devPort

/**
 * The accent block this page's `<html>` names.
 *
 * The registry gives `pool` the accent `#b28e1e`, but `ui/packages/ui/src/tokens.css` has no
 * `[data-cf-product='pool']` block — and naming one would fall through to the company ember in
 * complete silence, the exact failure tokens.css calls out ("a silent fallthrough is a latent bug,
 * so every key an app may set is declared") and the one `admin` had and `explorer` still has.
 * `network` is a real block and the correct one: a mining pool is chain infrastructure, and
 * explorer-web names it for the same reason. `test/brand-chrome.test.ts` asserts the selector this
 * page names really exists in tokens.css, which is the check that catches a fall-through either way.
 */
export const ACCENT_SURFACE = 'network'

/**
 * The sentence a search result carries, declared ONCE.
 *
 * It leads with what this pool does not do, because that is the single most important fact about it
 * and a description is frequently the only thing a person reads before deciding whether to point
 * hardware somewhere. `test/seo.test.ts` compares this byte for byte with the description meta in
 * `index.html`, so the copy a link-preview fetcher gets — those generally do not execute JavaScript
 * — cannot drift from the copy a crawler that does execute JavaScript ends up with.
 */
export const SURFACE_DESCRIPTION =
  'The CloudsForge Stratum v1 mining pool. Shares are recorded and PPLNS-weighted, but payouts ' +
  'are not implemented: mining here earns nothing today.'

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
 * The base URL for micro-pool's read API.
 *
 * In production the bundle and the service are one origin — nginx serves this bundle at
 * `pool.<apex>` and micro-pool answers `/v1/...` behind the same hostname, exactly as the gateway
 * already arranges for `explorer.<apex>` and micro-indexer (`deploy/gateway/dynamic/estate-web.yml`:
 * the bundle router matches the host at priority 500, the API router matches host plus
 * `PathPrefix('/v1')` at 600). So the base is the empty string and every request stays relative.
 *
 * An UNREGISTERED placement resolves to a relative base too, and that is a departure from
 * explorer-web's version of this function on purpose. Composing `https://pool.<whatever-this-is>`
 * for a preview deployment invents a hostname that does not exist and the failure presents as a
 * network error; a relative request at least reaches whatever is serving this bundle, and the shell
 * says the placement is unregistered either way.
 *
 * The distinction is drawn by COMPARING HOSTNAMES rather than by a `DEV` flag, because a flag is a
 * build-time constant and this repository has none: an image built for production and opened on
 * localhost would then point at a host that is not there.
 */
export function resolveApiBase(hostname: string): string {
  return isLocal(hostname) ? `http://localhost:${POOL_API_DEV_PORT}` : ''
}

/**
 * Whether this bundle is being served from an address the surface registry knows.
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN first label. Served from an unknown
 * name — a preview deployment, somebody's tunnel — the whole name becomes the apex and every
 * CloudsForge URL derived from it resolves one level too deep. The app still renders, because every
 * route here is public and nothing on this surface is a security boundary; but it says so, once, in
 * the shell. A page whose every outbound link is silently wrong is worse than a page that admits it
 * does not know where it is.
 */
export function isRegisteredPlacement(
  pageOrigin: string,
  hostname: string,
  estate: CloudsForgeHosts,
): boolean {
  if (isLocal(hostname)) return true
  if (!pageOrigin) return true
  try {
    if (new URL(estate[PRODUCT]).origin !== pageOrigin) return false
  } catch {
    return false
  }
  // ── AND FOR AN APEX-MOUNTED SURFACE THAT COMPARISON PROVES NOTHING BY ITSELF ────────────────
  //
  // Wave 3d gave this surface an EMPTY subdomain, so `cloudsforgeHosts()` composes its URL as the
  // page's own apex plus `/pool` — and the page's own apex is whatever hostname the page is on.
  // The comparison above is therefore TRUE ON EVERY ORIGIN IN THE WORLD, including a preview
  // deployment and somebody's tunnel, which is precisely what this function exists to catch. It
  // did catch them until the mount, because `pool.<whatever>` never matched.
  //
  // What actually goes wrong on an unplaceable name has not changed: `cloudsforgeHosts()` derives
  // the apex by stripping a KNOWN first label, so on `some-preview.example.net` the whole name
  // becomes the apex and every SIBLING resolves one level too deep — `nimbus.some-preview.example.
  // net`, the shared footer's legal links, the hub. This surface's own URL happening to look right
  // is a coincidence of it having no subdomain, not evidence that the estate is where the page
  // thinks it is.
  //
  // So the question is asked of the APEX rather than of this surface: a hostname is placeable when
  // it is a bare two-label apex, or when its first label is one the registry can split. Same rule
  // `unlabelledSurfaceUrl` below uses, and reusing it rather than restating it is what stops the
  // two answering differently.
  if (surface(PRODUCT).subdomain === '') {
    const parts = hostname.split('.')
    if (parts.length <= 2) return true
    return splitEnvLabel(parts[0] ?? '') !== null
  }
  return true
}

/**
 * THE SAME SURFACE ON THE UNADORNED ENVIRONMENT — the one address this console may point AWAY from
 * itself, and the only place in this repository that composes a hostname other than its own.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `cloudsforgeHosts()` answers "where are my siblings", and every one of its answers is on the
 * environment this page is being served from. It has no way to say "and where is this surface on
 * the environment that has no label", which is exactly the sentence a reader on a network with no
 * pool needs (`src/lib/deployment.tsx`, micro-org#406): the pool runs somewhere, and telling
 * somebody it does not run HERE without telling them where it does run is half an answer.
 *
 * It is derived rather than written down, for the reason `test/no-build-time-config.test.ts` gives
 * about literal hostnames: an image naming `pool.cloudsforge.online` is an image that only works on
 * one estate, and it is the same build-time environment wearing a different hat. So the apex comes
 * off the address of the page and the first label is recomposed with `envLabel(subdomain, '')` —
 * the registry's own inverse of `splitEnvLabel()`, which is what guarantees this produces the name
 * the registry would have produced rather than a second opinion about how the estate is named.
 *
 * ── NULL IS THE ANSWER MORE OFTEN THAN A CALLER EXPECTS, AND EVERY CASE IS DELIBERATE ─────────
 *
 *   * ON LOCALHOST, and on any address whose first label the registry cannot split. That is a
 *     preview deployment, somebody's tunnel, a two-label hostname. `cloudsforgeHosts()` refuses to
 *     guess an apex from those and so does this: a composed `https://pool.<whatever-this-is>` is a
 *     hostname that resolves to nothing, and a "the pool is over here" link that 404s is worse than
 *     no link, because the reader concludes the pool is gone rather than that the page is confused.
 *   * ON THE UNADORNED ENVIRONMENT ITSELF. `pool.<apex>` has no environment label to strip, so the
 *     composed address would be this very page — a link a reader would click to arrive back where
 *     they already are. A caller that has been told there is no pool HERE while it is being served
 *     from the unlabelled name is in a state this function must not paper over: it is either an
 *     estate whose pool profile is genuinely off, which is what mainnet looked like before
 *     2026-08-09, or a misconfiguration. Either way the honest rendering is the explanation without
 *     a link, and `src/components/notices.tsx` renders exactly that.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function unlabelledSurfaceUrl(hostname: string): string | null {
  if (isLocal(hostname)) return null
  const parts = hostname.split('.')
  // `parts.length > 2` for the same reason `cloudsforgeHosts()` requires it: a two-label hostname
  // IS an apex and has no first label to spend on a subdomain or an environment.
  if (parts.length <= 2) return null
  if (splitEnvLabel(parts[0] ?? '') === null) return null
  const apex = parts.slice(1).join('.')
  // ── AN EMPTY SUBDOMAIN IS AN APEX, NOT A LABEL — AND A MOUNT COMES AFTER IT ─────────────────
  //
  // This read `https://${envLabel(subdomain, '')}.${apex}`, which was right while this surface
  // owned `pool.<apex>`. Wave 3d made the console `<apex>/pool`, so `subdomain` is the empty string
  // and `envLabel('', '')` is the empty string too — the old form composed `https://.cloudsforge.
  // online`, a leading dot, an address that is not a hostname at all.
  //
  // The same composition micro-ui's `viewedSurfaceUrl` uses, and for the same reason: the label is
  // OMITTED rather than emptied when there is none, and the `basePath` is appended after the host.
  // A reader on `testnet.<apex>/pool` being told the pool runs elsewhere now gets
  // `https://<apex>/pool` — the folder, not the bare apex, which would have landed them on the
  // marketing site with no idea why.
  const s = surface(PRODUCT)
  const label = envLabel(s.subdomain, '')
  return `https://${label ? `${label}.${apex}` : apex}${s.basePath ?? ''}`
}

/** This surface on the unadorned environment, resolved now, or null. See above for every null. */
export function unlabelledPoolUrl(): string | null {
  return unlabelledSurfaceUrl(typeof window === 'undefined' ? '' : window.location.hostname)
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/**
 * This app's API base, resolved now. Call it per request; never cache it in a module constant.
 *
 * Two layers, and they answer two different questions. `resolveApiBase` answers "is this a
 * development stack?" — the only case where the pool API is somewhere other than this origin —
 * and it stays a pure function of the hostname so `test/hosts.test.ts` can pin it without a
 * browser. `viewedApiOrigin()` answers "is the reader looking at the other network?" and is `''`
 * until they touch the switcher (micro-org#459), so in production this is the empty string and
 * every request stays relative exactly as before.
 *
 * The order matters. A local stack has no sibling estate to view — `NetworkSwitcher` hides itself
 * off-registry — so the dev port wins outright and `viewedApiOrigin()` is never consulted there.
 *
 * ── AND SINCE WAVE 3d THERE IS A THIRD QUESTION, WHICH IS NOT THE SECOND ────────────────────────
 *
 * `viewedApiOrigin()` answers WHICH ESTATE. `BASE` answers WHERE UNDER IT — `/pool`, because this
 * bundle is a folder on the apex now. They are different questions and the `||` above could only
 * ever carry one answer, so the mount is composed rather than substituted.
 *
 * Getting this wrong is not subtle in its cause and is invisible in its effect. If `resolveApiBase`
 * returned the mount, it would be TRUTHY in production and `viewedApiOrigin()` would stop being
 * consulted at all: the switcher would say Testnet while every read went on hitting mainnet. That
 * is the shape micro-agora-web nearly shipped in wave 3c, and it is recorded there too.
 *
 * The dev branch returns early rather than composing, because `pnpm dev` runs micro-pool directly
 * on its own port with no gateway in front of it — there is nothing there to strip `/pool` back
 * off, so `localhost:41xx/pool/v1` would 404.
 */
export function apiBase(): string {
  const dev = resolveApiBase(typeof window === 'undefined' ? '' : window.location.hostname)
  if (dev) return dev
  // `''` + `/pool` when reading this estate; the sibling's origin + `/pool` when reading the other.
  // Both estates serve the console from the same folder.
  return `${viewedApiOrigin()}${BASE}`
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  return isRegisteredPlacement(window.location.origin, window.location.hostname, cloudsforgeHosts())
}
