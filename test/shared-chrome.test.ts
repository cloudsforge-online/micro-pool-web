/**
 * What this shell takes from the design system, and the one thing it deliberately does not.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE ABSENCE LEFT, AND IT IS PINNED TO A PRODUCT ARGUMENT RATHER THAN TO A GAP.
 *
 * There used to be two, and both were pinned to the same missing `pool` row in
 * `ui/packages/ui/src/surfaces.ts`: `CloudsForgeFooter` requires a `SurfaceKey` and `surface(key)`
 * THROWS on an unknown one, and its three legal links are composed from `hosts.site` read inside the
 * component, so served at `pool.<apex>` with no row to strip they would all have pointed at this
 * bundle's own 404. This file asserted the absences AND the cause, so that the day the row landed
 * the test would go red and say what to delete.
 *
 * micro-ui#3 landed it on 2026-08-09. The footer is mounted, the local one and the local apex
 * correction are deleted, and the tests below check the mount rather than the gap.
 *
 * `CloudsForgeBar` is still out, and its reason NEVER depended on the registry: micro-pool takes no
 * bearer token on any route, there is no estate account behind a mining address, and a "Sign in"
 * button on a surface with nothing to sign in to is a category error. The row landing changed
 * nothing about that, which is exactly why the test below pins the product reason and not the row —
 * an absence whose test cites a cause that has since evaporated is an absence nobody can defend.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOOTER_LEGAL_LINKS } from '@cloudsforge/ui'
import { surface } from '@cloudsforge/ui/surfaces'
import { read, readSibling, stripComments } from './sources.ts'

const SHELL = stripComments(read('src/components/shell.tsx'), 'ts')
const SHELL_RAW = read('src/components/shell.tsx')

/** What the shell imports from the design system, as written. */
function imported(): string[] {
  const line = /import \{([^}]*)\} from '@cloudsforge\/ui'/.exec(SHELL)?.[1] ?? ''
  return line.split(',').map((name) => name.trim()).filter(Boolean)
}

test('the shell takes the shared chrome', () => {
  // Every one of these is a component the estate has already got wrong by hand somewhere. The skip
  // link becomes VISIBLE on focus — a hidden one is worse than none, because the reader activates
  // it and cannot tell whether anything happened. `MainRegion` is the target it skips to.
  // `CookieBanner` is the only place the analytics tag is ever injected, which is what keeps a
  // cookie from being set before consent — and on this surface the path being reported would name
  // a mining address.
  for (const name of ['SkipLink', 'MainRegion', 'CookieBanner', 'CloudsForgeLogo']) {
    assert.ok(imported().includes(name), `src/components/shell.tsx does not use ${name}`)
    assert.ok(SHELL.includes(`<${name}`), `${name} is imported and never mounted`)
  }
})

test('THE SHARED FOOTER IS MOUNTED, AND THERE IS NO LOCAL ONE LEFT BESIDE IT', () => {
  assert.ok(imported().includes('CloudsForgeFooter'))
  assert.ok(SHELL.includes('<CloudsForgeFooter'))
  // `current` is what marks this surface in its own footer and what the base line renders the name
  // and blurb from. Passed as the same constant the meta and the API base are derived from, so the
  // key is written once in this repository.
  assert.match(SHELL, /<CloudsForgeFooter[\s\S]*?current=\{PRODUCT\}/)
  // The local footer is GONE rather than hidden. A second `<footer>` in the document is two
  // landmarks with the same role, which a screen reader announces twice and neither one names.
  assert.ok(!/<footer\b/.test(SHELL), 'src/components/shell.tsx still writes a local <footer>')
  assert.ok(!/pl-foot/.test(SHELL), 'the local footer’s classes survive the local footer')
})

test('THE FOOTER’S LEGAL LINKS ARE MICRO-SITE ROUTES THAT REALLY EXIST', (t) => {
  // The footer composes these itself, from `FOOTER_LEGAL_LINKS` against `hosts.site` read INSIDE the
  // component. That is the arrangement the local footer existed to work around and it is the right
  // one — but it also means nothing in this repository would notice if a path stopped resolving.
  //
  // status-web recorded the estate paying for exactly that: two footer links broken since the day
  // they were written, because a hand-typed `/terms` never became the `/legal/terms` micro-site
  // actually served. So this reads micro-site's router and checks each path against it rather than
  // assuming the shared constant and the shared site agree.
  assert.ok(FOOTER_LEGAL_LINKS.length > 0)
  const app = readSibling('site/src/app.tsx')
  if (!app) return t.skip('micro-site is not checked out beside this repository')
  for (const link of FOOTER_LEGAL_LINKS) {
    const segment = link.path.replace(/^\//, '')
    assert.match(
      app,
      new RegExp(`path=["'](/)?${segment}["']`),
      `the footer links to ${link.path} and site/src/app.tsx has no route for it`,
    )
  }
})

test('THE BAR IS OUT ON PRODUCT GROUNDS, AND THE SHELL STATES THEM WITHOUT CITING THE REGISTRY', () => {
  assert.ok(
    !imported().includes('CloudsForgeBar'),
    'src/components/shell.tsx mounts CloudsForgeBar. The registry row is not the question — it ' +
      'landed and the footer went in on the strength of it. The bar always renders an account ' +
      'control, micro-pool takes no bearer token on any route, and there is no estate account ' +
      'behind a mining address, so a "Sign in" here promises the reader something that does not ' +
      'exist. Answer that first. Then note that the deploy is only half ready for it either way: ' +
      'policy.yml carries this origin in cf-cors but IDENTITY_HANDOFF_ORIGINS does not list pool, ' +
      'so the handoff would be refused and the reader bounced back signed out.',
  )

  // The reason has to survive in the file, not only in this test — a reader deciding whether to
  // mount the bar reads the shell, and the argument is the whole of what stops them. These are the
  // three load-bearing claims, each of which is checkable against micro-pool rather than a taste.
  const header = SHELL_RAW.slice(0, SHELL_RAW.indexOf('import '))
  assert.match(header, /CloudsForgeBar/)
  assert.match(header, /bearer token/i)
  assert.match(header, /category error/i)
  assert.match(header, /IDENTITY_HANDOFF_ORIGINS/)
  // And the retired argument must not be left standing. `surface('pool')` resolves now; a comment
  // still blaming a missing row for the bar's absence is a reason a reader can disprove in ten
  // seconds, and a disprovable reason gets the decision reversed for the wrong cause.
  // Still resolving, and now placed on the apex rather than on a hostname — either way the row
  // exists, which is the fact the retired argument denied.
  assert.equal(surface('pool').basePath, '/pool')
  assert.ok(
    !/(missing|no) `?pool`? row[\s\S]{0,200}CloudsForgeBar/.test(header),
    'the shell still blames the registry for the bar being out; that gap is closed',
  )
})

test('THE BAR BEING OUT DOES NOT TAKE BROWSER MINING WITH IT', () => {
  // The three claims that keep `CloudsForgeBar` out are all claims about the ACCOUNT CONTROL it
  // renders. None of them reaches `MiningControl`, which asks for no session, renders no account
  // and — in the `elsewhere` phase this surface passes — is an anchor to another origin. Mounting
  // it directly is what lets this surface keep the absence and still offer the thing the pool
  // exists for. Without this test the next reader tidying the shell reads "the shared chrome is
  // out on product grounds" and takes the mining control out with the bar.
  assert.ok(imported().includes('MiningControl'), 'the shell does not mount the mining control')
  assert.ok(imported().includes('miningOnHub'))
  assert.ok(SHELL.includes('<MiningControl'))

  // The live flag, not the default. This is the one surface that already reads `payoutsImplemented`
  // off `GET /v1/pool`, so the control's sentence and `NotPaidNotice` are derived from one
  // response and cannot disagree. `test/render.test.ts` asserts the rendered sentence.
  assert.match(SHELL, /miningOnHub\([^)]*payoutsImplemented[^)]*\)/)
})

test('every estate link in the shell is composed by the REGISTRY, through this repository’s wrapper', () => {
  // There is no local correction any more — `hosts()` is a one-line pass to `cloudsforgeHosts()`.
  // The indirection stays because it is the seam a test can stub and because the day this surface
  // needs a placement rule again, there is one place for it. Importing the registry function
  // directly here would spread that decision one import at a time.
  assert.ok(!imported().includes('cloudsforgeHosts'))
  assert.match(SHELL, /import \{[^}]*\bhosts\b[^}]*\} from '\.\.\/lib\/hosts\.ts'/)
})

test('THE SHELL SAYS SO WHEN IT CANNOT WORK OUT WHERE IT IS', () => {
  // A page whose every outbound link is silently one level too deep is worse than a page that
  // admits it does not know where it is. The registry row fixed the ordinary case; a preview
  // hostname the registry cannot place is still unplaceable, and the footer's own links go with it.
  assert.ok(SHELL.includes('placementIsKnown'))
  assert.ok(SHELL.includes('<UnregisteredNotice'))
})

test('the standing payment notice is in the SHELL, above the outlet', () => {
  // So there is no route a stranger can arrive at without meeting it, including one that does not
  // exist. A page-level notice is a notice somebody forgets to add to the fourth page.
  const outlet = SHELL.indexOf('<Outlet')
  const notice = SHELL.indexOf('<NotPaidNotice')
  assert.ok(notice > 0 && outlet > 0 && notice < outlet, 'the payment notice is not above the outlet')
})
