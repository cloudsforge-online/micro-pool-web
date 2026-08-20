/**
 * The route table, the router and the web server, cross-checked as text.
 *
 * ── WHY THIS IS A TEXT TEST RATHER THAN A RENDER TEST ─────────────────────────────────────────
 *
 * Three separate artefacts decide which addresses this bundle answers, and only two of them are
 * JavaScript:
 *
 *   `src/lib/routes.ts`  — `ROUTES`, which the sub-navigation and the nginx cross-check derive from
 *   `src/app.tsx`        — the `<Route>` elements the router actually mounts
 *   `nginx.conf`         — the enumerated `location` blocks, which decide the HTTP STATUS
 *
 * A render test can see the first two disagree. Nothing that runs in this process can see the third
 * at all: nginx is not imported, it is not typechecked, and a route added to the router without a
 * matching `location` still renders perfectly in every test in this directory. It fails only in
 * production, and it fails QUIETLY — the address answers 404, the shell is served under it by
 * `error_page`, React renders the right page, and the only symptom is that a crawler and an uptime
 * check both believe a working page is missing. That is a defect nobody reports.
 *
 * So the config is read as a string. It is the only way this repository can hold nginx to anything.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NAV, NON_INDEX_PATHS, ROUTES, publicPath, workerPath } from '../src/lib/routes.ts'
import { read, stripComments } from './sources.ts'

const nginx = stripComments(read('nginx.conf'), 'nginx')
const appSource = read('src/app.tsx')
const app = stripComments(appSource, 'ts')

/** Every `path=` on a `<Route>` in app.tsx, plus `''` for the index route. */
function routerPaths(): string[] {
  const paths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1] ?? '')
  if (/<Route\s+index\b/.test(app)) paths.unshift('')
  return paths
}

test('every route in the table is mounted by the router', () => {
  const mounted = routerPaths()
  for (const route of ROUTES) {
    const matches = mounted.filter((p) => p === route.path || p.startsWith(`${route.path}/`))
    assert.ok(
      matches.length > 0,
      `ROUTES declares ${JSON.stringify(route.path)} but no <Route> in src/app.tsx mounts it, so ` +
        `the navigation links to an address that renders the not-found page`,
    )
  }
})

test('the router mounts nothing the table does not declare', () => {
  for (const path of routerPaths()) {
    // The catch-all is not a route; it is what happens when none of them matched.
    if (path === '*') continue
    const head = path.split('/')[0] ?? ''
    assert.ok(
      ROUTES.some((route) => route.path === head),
      `src/app.tsx mounts ${JSON.stringify(path)}, which is not in ROUTES — so nginx.conf will not ` +
        `have a location for it and the address answers 404 in production while passing every ` +
        `render test here`,
    )
  }
})

test('WILDCARD IS NOT DECORATION: it is what decides the nginx form', () => {
  // `location = /blocks` matches that one address and nothing beneath it. A route with children
  // needs the prefix form, and getting this backwards is the failure this flag exists to prevent:
  // `/workers/ltc/<address>` is the address a miner pastes into a chat window, and if nginx only
  // enumerated `/workers` it would 404 on the one link this site asks people to share.
  for (const route of ROUTES) {
    const hasChildren = routerPaths().some((p) => p.startsWith(`${route.path}/`))
    assert.equal(
      route.wildcard,
      hasChildren,
      `ROUTES says ${JSON.stringify(route.path)} wildcard=${route.wildcard}, but src/app.tsx ` +
        `${hasChildren ? 'does' : 'does not'} mount children beneath it`,
    )
  }
})

test('NGINX ENUMERATES EVERY ROUTE, AND THE INDEX IS EXACT', () => {
  // `location = /pool` and not `location /pool`: the prefix form would match every address under
  // the mount and turn the whole "unknown paths answer 404" argument in nginx.conf's header into a
  // comment. BOTH spellings are required — a folder has a trailing-slash form a hostname root never
  // had, and the 301 from the retired hostname lands on it.
  assert.match(nginx, /location\s*=\s*\/pool\s*\{/, 'nginx.conf has no exact-match location for the index')
  assert.match(nginx, /location\s*=\s*\/pool\/\s*\{/, 'nginx.conf does not serve the trailing-slash front door')

  for (const path of NON_INDEX_PATHS) {
    // The alternation form `location ~ ^/(workers|blocks)(/|$)` is one block for several routes, so
    // this looks for the path INSIDE a regex location rather than for a block of its own.
    const found = [...nginx.matchAll(/location\s+[~^=]*\s*([^\s{]+)\s*\{/g)].some((m) =>
      (m[1] ?? '').includes(path),
    )
    assert.ok(
      found,
      `nginx.conf enumerates no location matching ${JSON.stringify(path)}. A route the server does ` +
        `not know answers 404 with the shell under it: the page renders, and the status line says ` +
        `it does not exist. Add it to the alternation in nginx.conf.`,
    )
  }
})

test('nginx enumerates nothing that is not a route', () => {
  // The mirror of the test above, and the one that catches a route being REMOVED. A stale
  // alternation is worse than a missing one: it answers 200 for an address the router no longer
  // knows, which is the "every address is a success" failure the enumeration exists to stop.
  const alternations = [...nginx.matchAll(/location\s+~\s+\^\/\(([^)]+)\)/g)].flatMap((m) =>
    (m[1] ?? '').split('|'),
  )
  for (const alt of alternations) {
    assert.ok(
      NON_INDEX_PATHS.includes(alt),
      `nginx.conf serves the app shell for /${alt}, which is not in ROUTES — that address answers ` +
        `200 with a not-found page, which is a success status on a missing page`,
    )
  }
})

test('THE SPA FALLBACK IS ABSENT AND error_page IS PRESENT', () => {
  // The single most important line in nginx.conf, asserted as an absence because it is the default
  // everybody reaches for. `try_files $uri /index.html` answers 200 for every address in existence.
  assert.doesNotMatch(
    nginx,
    /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/,
    'nginx.conf has the SPA fallback, which makes "page not found" a 200 — see its own header',
  )
  // `/pool/index.html`: the shell moved into the folder with the bundle, and `error_page 404
  // /index.html` would name a file the document root no longer holds — nginx would then serve its
  // own error page instead of the app's not-found screen.
  assert.match(nginx, /error_page\s+404\s+\/pool\/index\.html/)
})

test('the sitemap lists the routes a crawler should have, and NOT a miner’s address', () => {
  const sitemap = nginx.slice(nginx.indexOf('location = /pool/sitemap.xml'))
  // `publicPath()` composes what the `<loc>` must say, mount and all, the same way the app composes
  // it. The index is `/pool` and not `/pool/` — a trailing slash is the classic way one page
  // acquires two addresses — so there is no special case for the empty path any more.
  for (const path of ['', ...NON_INDEX_PATHS]) {
    assert.ok(
      sitemap.includes(`$scheme://$host${publicPath(path)}<`),
      `${publicPath(path)} is a route and is not in the sitemap`,
    )
  }
  // `/workers/<chain>/<account>` is unbounded and each entry is somebody's mining address.
  // Publishing them in the one document a crawler treats as authoritative would turn this pool's
  // index into an address directory. Argued in full in nginx.conf.
  assert.doesNotMatch(sitemap, /workers\/[^<]*\//)
})

test('NOTHING ON THIS SURFACE IS GATED, AND THERE IS NOTHING TO GATE IT WITH', () => {
  // micro-pool takes no bearer token on any route this bundle calls, and `account` is a query parameter
  // rather than an authenticated subject. A guard here would put a login in front of facts that are
  // public by construction. Asserted as an absence, because the reflex is to add one back — and
  // comments are stripped first because src/app.tsx NAMES what it refuses in order to explain it.
  for (const forbidden of ['ProtectedRoute', 'RequireAuth', 'AuthProvider', 'useSession']) {
    assert.ok(
      !app.includes(forbidden),
      `src/app.tsx references ${forbidden}; every route on this surface renders for everybody`,
    )
  }
})

test('the navigation is derived from the table and cannot drift from it', () => {
  assert.deepEqual(
    NAV.map((item) => item.to),
    ROUTES.filter((r) => r.label !== null).map((r) => `/${r.path}`),
  )
  // Every navigation target is an address nginx serves. A link in the header that 404s is the
  // easiest of these failures to ship and the most embarrassing to find.
  for (const item of NAV) {
    const path = item.to.replace(/^\//, '')
    assert.ok(path === '' || NON_INDEX_PATHS.includes(path))
  }
})

test('a worker link is a route nginx serves, with both segments encoded', () => {
  const built = workerPath('ltc', 'ltc1qexample')
  assert.equal(built, '/workers/ltc/ltc1qexample')
  assert.ok(NON_INDEX_PATHS.includes(built.split('/')[1] ?? ''))
  // The account is somebody's typed input. Nothing in the service's own rule needs escaping today,
  // and a link builder that assumes its input is clean breaks the first time the rule widens.
  assert.equal(workerPath('l/tc', 'a b'), '/workers/l%2Ftc/a%20b')
})

test('there is no payouts route, and that is a decision rather than an omission', () => {
  // A payouts page would have nothing to render, and an earnings page would imply a payouts page.
  // Both would be an address a miner could bookmark and read as a promise.
  for (const route of ROUTES) {
    assert.ok(!/payout|earning|balance|dashboard/i.test(route.path))
    assert.ok(!/payout|earning|balance/i.test(route.label ?? ''))
  }
  assert.doesNotMatch(nginx, /location[^\n]*payout/i)
})

test('routes.ts imports nothing, so this test can read it without a bundler', () => {
  // The module's own claim, checked. An import of a `.css` or of `@cloudsforge/ui` here would make
  // this file unloadable outside vite, and this cross-check would quietly stop running.
  assert.doesNotMatch(read('src/lib/routes.ts'), /^\s*import\s/m)
})
