/**
 * What this shell takes from the design system, and the two things it cannot take yet.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ABSENCES ARE PINNED TO THEIR CAUSE, NOT TO A PREFERENCE.
 *
 * `CloudsForgeBar` and `CloudsForgeFooter` are not mounted, and a reader six months from now will
 * assume that was taste. It was not: both are forced by the same missing `pool` row in
 * `ui/packages/ui/src/surfaces.ts`. `CloudsForgeFooter` requires a `SurfaceKey` and `surface(key)`
 * THROWS on an unknown one — the component's own comment says that is deliberate, "a typo must not
 * render a footer at all" — and its three legal links are composed from `hosts.site` read inside the
 * component, which the `surfaceUrls` override does not reach, so served at `pool.<apex>` they would
 * all point at this bundle's own 404 page.
 *
 * So this file asserts the absences AND asserts the cause, in one test. The day a `pool` row lands
 * the cause disappears, that test goes red, and it says what to delete. An absence with no test on
 * it is a decision that has already been forgotten; an absence with a test that only checks the
 * absence is a decision that outlives its reason.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOOTER_LEGAL_LINKS } from '@cloudsforge/ui'
import { SURFACES } from '@cloudsforge/ui/surfaces'
import { read, stripComments } from './sources.ts'

const SHELL = stripComments(read('src/components/shell.tsx'), 'ts')

/** What the shell imports from the design system, as written. */
function imported(): string[] {
  const line = /import \{([^}]*)\} from '@cloudsforge\/ui'/.exec(SHELL)?.[1] ?? ''
  return line.split(',').map((name) => name.trim()).filter(Boolean)
}

test('the shell takes the shared chrome it CAN take', () => {
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

test('THE TWO ABSENCES, AND THE ROW THAT WOULD END THEM', () => {
  for (const name of ['CloudsForgeBar', 'CloudsForgeFooter']) {
    assert.ok(
      !imported().includes(name),
      `src/components/shell.tsx mounts ${name}. Check first that a \`pool\` row has landed in ` +
        `@cloudsforge/ui/surfaces — without one, CloudsForgeFooter throws on surface('pool') and ` +
        `its legal links resolve to this bundle's own 404 page.`,
    )
  }

  // The cause, asserted alongside the effect. When this goes red the absences above are obsolete.
  const pool = SURFACES.find((s) => s.subdomain === 'pool')
  assert.equal(
    pool,
    undefined,
    'A `pool` row is now in @cloudsforge/ui/surfaces, so the shared bar and footer can be mounted: ' +
      'delete the local footer in src/components/shell.tsx, mount CloudsForgeFooter with ' +
      "current: 'pool', and collapse DocumentMeta to a single surfaceMeta() call. Then decide the " +
      'bar separately — the account control is a category error on a surface where the only ' +
      'identity is a stratum username, so status-web\'s argument for leaving it out may still hold.',
  )
})

test('the local footer takes its LEGAL PATHS from the shared constant', () => {
  // The paths belong to micro-site's routes, and a hand-typed `/terms` that becomes `/legal/terms`
  // upstream is a 404 nobody notices — status-web recorded the estate paying for exactly that, two
  // footer links that had been broken since they were written. Only the ORIGIN is composed locally,
  // because that is the part the registry cannot derive for this surface.
  assert.ok(SHELL.includes('FOOTER_LEGAL_LINKS'))
  assert.ok(FOOTER_LEGAL_LINKS.length > 0)
  for (const link of FOOTER_LEGAL_LINKS) {
    assert.ok(
      !SHELL.includes(`"${link.path}"`) && !SHELL.includes(`'${link.path}'`),
      `src/components/shell.tsx writes the legal path ${link.path} out by hand as well as reading ` +
        `it from FOOTER_LEGAL_LINKS`,
    )
  }
})

test('every estate link in the shell is composed from the CORRECTED hosts', () => {
  // `cloudsforgeHosts()` finds the apex by stripping a KNOWN first label. `pool` is not one, so the
  // apex resolves to the whole hostname and every derived URL lands one level too deep —
  // `hub.pool.<apex>`, `lantern.pool.<apex>`, neither of which exists. The page still renders and
  // every link on it is dead. `correctedHosts()` is the local repair; calling the registry's
  // function directly here would reintroduce the defect one import at a time.
  assert.ok(!imported().includes('cloudsforgeHosts'))
  assert.match(SHELL, /import \{[^}]*\bhosts\b[^}]*\} from '\.\.\/lib\/hosts\.ts'/)
})

test('THE SHELL SAYS SO WHEN IT CANNOT WORK OUT WHERE IT IS', () => {
  // A page whose every outbound link is silently one level too deep is worse than a page that
  // admits it does not know where it is — and on this surface the same unknown placement means
  // there is no honest stratum endpoint to hand a miner either.
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
