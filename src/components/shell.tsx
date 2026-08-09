/**
 * The chrome: the logo, the surface name, the navigation, the page, and the two standing notices.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NEITHER `CloudsForgeBar` NOR `CloudsForgeFooter` IS MOUNTED HERE, AND BOTH ABSENCES ARE FORCED
 * BY THE SAME MISSING REGISTRY ROW RATHER THAN CHOSEN.
 *
 * `CloudsForgeBar` — `status-web/src/components/shell.tsx` already argues the general case: the bar
 * always renders an account control, and `AccountMenu` shows a "Sign in" button whenever
 * `account.signedIn` is false. On this surface that button is worse than a dead end, it is a
 * category error. The only identity a miner has here is the stratum username they typed into their
 * own firmware; micro-pool takes no bearer token on any route and there is no estate account behind
 * a mining address (`pool/src/server.ts`). Offering an estate login to somebody whose whole
 * relationship with this service is a TCP connection from an ASIC suggests that signing in would
 * show them something. It would not. There is nothing to sign in to.
 *
 * `CloudsForgeFooter` — this one is not a preference and cannot be worked around from here. Two
 * hard blockers, both read off `ui/packages/ui/src/index.tsx`:
 *
 *   1. `current: SurfaceKey` is REQUIRED, and `surface(current)` THROWS on an unknown key — the
 *      component's own comment says that is deliberate, "a typo must not render a footer at all".
 *      There is no `pool` key (see the header of `src/lib/hosts.ts`), so there is no honest value to
 *      pass. `'network'` would render the identity line "Forge Network — …" and mark the Forge
 *      Network link `aria-current="page"`, which claims this page is a surface it is not.
 *   2. The three legal links are composed from `hosts.site` read INSIDE the component and are NOT
 *      covered by the `surfaceUrls` override, which only reaches the surface columns. Served at
 *      `pool.<apex>`, the registry cannot strip an unknown first label, so `hosts.site` resolves to
 *      `https://pool.<apex>` and all three legal links would point at this bundle's own 404 page.
 *      status-web's shell records the estate paying for exactly this class of defect once already —
 *      two footer links that had been 404s since they were written.
 *
 * So the footer below is local, small, and built from `FOOTER_LEGAL_LINKS` — the shared constant,
 * so the PATHS cannot drift from micro-site's routes — resolved against the locally corrected apex.
 * `test/shared-chrome.test.ts` asserts that this file mounts the shared skip link, main region and
 * cookie banner, and pins the two absences to the registry gap so that the day a `pool` row lands is
 * a day a test tells somebody to delete this footer.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { CloudsForgeLogo, CookieBanner, FOOTER_LEGAL_LINKS, MainRegion, SkipLink } from '@cloudsforge/ui'
import { applyHead, DEFAULT_OG_IMAGE, HTML_LANG } from '@cloudsforge/ui/seo'
import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { hosts, placementIsKnown, SURFACE_DESCRIPTION } from '../lib/hosts.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
import { usePoolStatus } from '../lib/status.tsx'
import { NotPaidNotice, UnregisteredNotice } from './notices.tsx'

/** The surface's own name. There is no registry row to read it from; see the header above. */
export const SURFACE_NAME = 'Mining Pool'

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

      <footer className="pl-foot" role="contentinfo" aria-label="CloudsForge">
        <div className="pl-foot__inner">
          <nav className="pl-foot__links" aria-label="Legal">
            {FOOTER_LEGAL_LINKS.map((link) => (
              // `estate.site` is the CORRECTED apex — see `correctedHosts` in src/lib/hosts.ts.
              // The paths come from the shared constant so they cannot drift from micro-site's own
              // route table, which is the half of this that has been wrong in the estate before.
              <a key={link.path} className="pl-foot__link" href={`${estate.site}${link.path}`}>
                {link.label}
              </a>
            ))}
            <a className="pl-foot__link" href={estate.network}>
              Forge Network
            </a>
            <a className="pl-foot__link" href={estate.status}>
              Status
            </a>
          </nav>
          {/*
            DERIVED, LIKE EVERY OTHER SENTENCE ON THIS SITE THAT SAYS NOTHING SETTLES.

            A footer is exactly where a claim like this survives its own truth: it is on every page,
            nobody reads it twice, and it would go on saying "nothing is settled" for as long as it
            took somebody to remember this file existed. The clause about settlement branches on the
            service's answer; the clause about who owns the addresses and about this page not being
            an offer is true either way and does not.
          */}
          <p className="pl-foot__note">
            This pool is operated by CloudsForge and mines to CloudsForge&rsquo;s own addresses.{' '}
            {!payoutsImplemented && 'Shares are recorded; nothing is settled. '}
            Nothing on this page is an offer, a contract or a promise of reward.
          </p>
          <p className="pl-foot__base">
            <span className="pl-foot__brand">
              <CloudsForgeLogo size={16} />
            </span>
            <span className="pl-foot__here">
              {SURFACE_NAME} — Stratum v1, PPLNS{payoutsImplemented ? '.' : ', no payouts.'}
            </span>
          </p>
        </div>
      </footer>

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
 * `surfaceMeta()` from `@cloudsforge/ui/seo` is NOT used, for the same reason the shared footer is
 * not mounted: it takes a `SurfaceKey` and calls `surface(key)`, which throws. `applyHead` takes a
 * plain `SurfaceMeta` object, so the shared writer — which updates each tag IN PLACE rather than
 * appending, the bug every hand-rolled version of this has — is used with a locally composed value.
 * When the registry row lands, this collapses to one `surfaceMeta(PRODUCT, …)` call.
 *
 * `robots` is `index, follow`: this is a public reference page whose entire purpose is that a
 * stranger with an ASIC can find it. It is the same directive `robotsDirective()` would derive for
 * a surface that serves a UI and is not admin-only.
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
      {
        title: label === null ? SURFACE_NAME : `${label} — ${SURFACE_NAME}`,
        description: SURFACE_DESCRIPTION,
        path: pathname,
        image: DEFAULT_OG_IMAGE,
        robots: 'index, follow, max-image-preview:large',
        lang: HTML_LANG,
      },
      // Read here rather than in the module, which is what keeps a hostname out of the artefact:
      // one bundle serves localhost, a preview deployment and the apex and composes correct
      // absolute URLs on each.
      typeof window === 'undefined' ? '' : window.location.origin,
    )
  }, [pathname])

  return null
}
