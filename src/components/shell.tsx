/**
 * The chrome: the logo, the surface name, the navigation, the page, and the two standing notices.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `CloudsForgeBar` IS NOT MOUNTED HERE, AND THE REASON IS ABOUT THIS PRODUCT RATHER THAN ABOUT THE
 * REGISTRY.
 *
 * The bar always renders an account control, and `AccountMenu` shows a "Sign in" button whenever
 * `account.signedIn` is false (`ui/packages/ui/src/index.tsx`). On this surface that button is not
 * a dead end, it is a category error:
 *
 *   - micro-pool takes NO BEARER TOKEN on any route (`pool/src/server.ts`), so there is nothing an
 *     account could unlock here. Every page is public to everybody, deliberately — 36 §6 requires
 *     that a miner can check their own share history, and the only identity they have is the
 *     stratum username they typed into their own firmware.
 *   - There is no estate account behind a mining address and there cannot be. The whole point is
 *     that a stranger with an ASIC can point it here without asking anybody for anything.
 *
 * So a "Sign in" on this page would suggest that signing in would show the reader something. It
 * would not; there is nothing to sign in to. `test/shared-chrome.test.ts` pins that reason, and
 * `test/render.test.ts` asserts no page here offers the words at all.
 *
 * ── FOR WHOEVER MOUNTS IT LATER: THE DEPLOY IS ONLY HALF READY ────────────────────────────────
 *
 * `deploy/gateway/dynamic/policy.yml` now carries `https://pool{{ env "CF_WEB_SUFFIX" }}` in its
 * `cf-cors` origin list, so a browser on this surface may already call the identity API. But
 * `IDENTITY_HANDOFF_ORIGINS` in `deploy/compose/docker-compose.estate.yml` deliberately does NOT
 * list `pool`, so the handoff that completes a sign-in would be refused and the reader would be
 * bounced back signed out. Mounting the bar is therefore a deploy change as well as this one, and
 * the product argument above has to be answered first regardless.
 *
 * ── `CloudsForgeFooter` IS MOUNTED, AND THAT IS NEW ───────────────────────────────────────────
 *
 * It was not, for two mechanical reasons that are both now gone: `surface('pool')` used to throw
 * because the registry had no `pool` row, and `hosts.site` — composed INSIDE the component, where
 * the `surfaceUrls` override cannot reach — resolved to this bundle's own origin because
 * `cloudsforgeHosts()` could not strip an unknown first label, which would have pointed all three
 * legal links at this surface's 404 page. micro-ui#3 landed the row, `pool` joined `KNOWN_SUBS`,
 * and the local footer and the local apex correction that fed it are both deleted.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { CloudsForgeFooter, CloudsForgeLogo, CookieBanner, MainRegion, SkipLink } from '@cloudsforge/ui'
import { applyHead, surfaceMeta } from '@cloudsforge/ui/seo'
import { useEffect } from 'react'
import { surface } from '@cloudsforge/ui/surfaces'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { hosts, placementIsKnown, PRODUCT, SURFACE_DESCRIPTION } from '../lib/hosts.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
import { usePoolStatus } from '../lib/status.tsx'
import { NotPaidNotice, UnregisteredNotice } from './notices.tsx'

/**
 * The surface's own name, READ OFF THE REGISTRY rather than typed here.
 *
 * It used to be a literal, because there was no row to read. There is now, and the header of a page
 * disagreeing with the name in the product switcher and in every footer on the estate is exactly
 * the drift a registry exists to stop.
 */
export const SURFACE_NAME = surface(PRODUCT).name

export function AppShell() {
  const { payoutsImplemented } = usePoolStatus()
  const known = placementIsKnown()
  const estate = hosts()

  return (
    <>
      {/*
        First focusable element in the document. The shared one, which becomes VISIBLE on focus
        rather than staying off-screen — a skip link that stays hidden when focused is worse than
        none, because the reader activates it and cannot tell whether anything happened.
      */}
      <SkipLink>Skip to the page</SkipLink>

      <DocumentMeta />

      <header className="pl-head">
        <div className="pl-head__inner">
          <a className="pl-head__logo" href={estate.site} aria-label="CloudsForge home">
            <CloudsForgeLogo size={20} />
          </a>
          <span className="pl-head__sep" aria-hidden="true" />
          <span className="pl-head__name">{SURFACE_NAME}</span>
          <nav className="pl-nav" aria-label="Pool pages">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                // `pl-nav__link--current` rather than a bare `is-current`: an unprefixed state
                // class is in the design system's namespace without being in the design system,
                // so it works until the day upstream defines one. test/tokens.test.ts holds the
                // prefix rule for every class this repository writes.
                className={({ isActive }) =>
                  `pl-nav__link${isActive ? ' pl-nav__link--current' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/*
        `MainRegion` rather than a bare `<main>`: it carries `tabIndex={-1}` and owns the id the
        skip link composes its href from, so the two cannot disagree. Without the tabindex, following
        the link scrolls the page in Chrome and Safari and leaves focus on the link — so the reader's
        next Tab goes back into the header they asked to skip.
      */}
      <MainRegion className="pl-main">
        {!known && <UnregisteredNotice />}
        {/*
          ABOVE THE OUTLET, ON EVERY ROUTE. This is the sentence a stranger must not be able to
          miss, so it is not left to a page to remember to render. It disappears the moment the
          service reports `payoutsImplemented: true` and not one moment before — including while the
          service is unreachable, which is argued in `src/lib/status.tsx`.
        */}
        {!payoutsImplemented && <NotPaidNotice />}
        <Outlet />
      </MainRegion>

      {/*
        THE SHARED FOOTER, WITH THIS SURFACE'S ONE SENTENCE IN THE PLACE PROVIDED FOR IT.

        Every link in its columns is derived from the registry and its three legal links are
        micro-site's real routes — `/terms`, `/privacy` and `/risk` all resolve in `site/src/app.tsx`,
        checked rather than assumed. The local footer this replaces hand-composed the same links
        against a locally corrected apex, which was the only thing it was ever for.

        `note` carries the claim that was load-bearing in the local one, and it stays DERIVED: the
        settlement clause branches on the service's own `payoutsImplemented`, because a footer is
        exactly where a claim survives its own truth — it is on every page, nobody reads it twice,
        and it would go on saying "nothing is settled" for as long as it took somebody to remember
        this file existed. The rest is true either way and does not branch.

        No `account` is passed, which hides every `adminOnly` surface. That is the correct default
        here and not an omission: nobody is ever signed in on this surface — see the header.
      */}
      <CloudsForgeFooter
        current={PRODUCT}
        note={
          <>
            This pool is operated by CloudsForge and mines to CloudsForge&rsquo;s own addresses.{' '}
            {!payoutsImplemented && 'Shares are recorded; nothing is settled. '}
            Nothing on this page is an offer, a contract or a promise of reward.
          </>
        }
      />

      {/*
        LAST IN THE DOCUMENT, AND THEREFORE LAST IN THE TAB ORDER. The banner is a dialog and is
        explicitly not modal, so a reader who came here to find the stratum address can read it and
        answer about analytics afterwards. It renders nothing at all until it knows the reader has
        not already been asked, and nothing on an origin where analytics would not report anyway.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * The document head, kept in step with the address.
 *
 * `surfaceMeta()` composes the title as `Page — Surface Name` from the registry, so the name is
 * read once and the suffix cannot drift. It was hand-composed here until `surface('pool')` started
 * resolving; that is the whole of what changed.
 *
 * `description` is passed EXPLICITLY rather than derived. `descriptionFor()` would compose one from
 * the registry blurb plus the company line, and that is a fine description of a mining pool and a
 * poor description of THIS one — what a prospective miner has to be told first is that it pays
 * nothing, and a description is frequently the only sentence they read before deciding whether to
 * point hardware here. `test/seo.test.ts` compares the constant byte for byte with `index.html`.
 *
 * `robots` is likewise stated rather than derived. `robotsDirective()` would produce the same
 * string today, from `servesUi: true` and no `adminOnly` — but this surface's indexability is a
 * decision it makes about itself (a pool a stranger with an ASIC cannot find is a pool with no
 * miners), not a side effect of two registry flags somebody may set for another reason.
 *
 * The page title is read off `ROUTES`, the same declaration the navigation, the router and nginx's
 * enumerated locations all derive from, rather than typed a fifth time.
 */
function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const segment = pathname.split('/')[1] ?? ''
    const label =
      segment === '' ? null : (ROUTES.find((route) => route.path === segment)?.label ?? null)
    applyHead(
      surfaceMeta(PRODUCT, {
        ...(label === null ? {} : { title: label }),
        description: SURFACE_DESCRIPTION,
        path: pathname,
        robots: 'index, follow, max-image-preview:large',
      }),
      // Read here rather than in the module, which is what keeps a hostname out of the artefact:
      // one bundle serves localhost, a preview deployment and the apex and composes correct
      // absolute URLs on each.
      typeof window === 'undefined' ? '' : window.location.origin,
    )
  }, [pathname])

  return null
}
