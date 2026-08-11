/**
 * The route table.
 *
 * Three things have to agree about which addresses this bundle answers, and `test/routes.test.ts`
 * reads all three as text to check they do: `ROUTES` in lib/routes.ts (which the navigation and the
 * page titles derive from), the `<Route>` elements below, and the enumerated `location` blocks in
 * nginx.conf (which is what makes an unknown address a 404 rather than a 200 with a blank page).
 *
 * ── Nothing here is gated, and there is nothing to gate it with ────────────────────────────────
 *
 * There is no `AuthProvider` in this repository and no route guard, because micro-pool takes no
 * bearer token on any route this bundle calls (`pool/src/server.ts`): `/v1/pool`, `/v1/pool/blocks`,
 * `/v1/pool/workers` and `/v1/pool/shares` are all anonymous reads, and `account` is a query
 * parameter rather than an authenticated subject. The only identity a miner has here is the stratum
 * username they typed into their own firmware, and the pool never checks it against anything — see
 * the "Your address is a label" section on the landing page. A sign-in on this surface would be a
 * gate in front of facts that are public by construction, guarding an account that does not exist.
 *
 * The service does have exactly one route that reads a credential — `POST /v1/pool/ticket`, which
 * mints the ticket a browser needs to mine over the WebSocket transport (micro-org#289). It is
 * micro-hub-web's `/mine` that calls it, on a surface that already has a session. Adding it here
 * would mean adding the whole of what is missing above in order to reach one route, on a page whose
 * readers do not have estate accounts. `test/pool-contract.test.ts` holds that line route by route.
 *
 * ── `PoolStatusProvider` wraps the shell, not each page ────────────────────────────────────────
 *
 * `payoutsImplemented` is read from `GET /v1/pool` and the shell renders the standing honesty notice
 * above the outlet on EVERY route, so the provider has to be outside the shell. Putting it inside a
 * layout element instead would give each page its own copy of the answer and let two of them
 * disagree while a deploy is rolling — argued in full in src/lib/status.tsx.
 *
 * ── `DeploymentProvider` WRAPS IT IN TURN, AND THAT ORDER IS LOAD-BEARING ──────────────────────
 *
 * It answers a question that comes BEFORE `GET /v1/pool`: whether there is anything at that address
 * to ask. `useResource` reads it — the hook every read on this surface goes through, including the
 * two that `/workers/:chain/:account` starts from URL parameters — and declines to run a load it
 * has been told will fail. So on a deployment with no pool this console issues no `/v1` call at
 * all, rather than one per page plus two more for a deep link.
 *
 * That is why this provider is OUTSIDE `PoolStatusProvider` and outside the router: everything
 * below it, provider and page alike, calls a hook that reads this context, and a context read above
 * its own provider silently returns the default. `unknown` is a safe default — it renders a loading
 * state — which is exactly why the ordering has to be asserted rather than trusted to fail loudly.
 * micro-org#406.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { ScrollToTop } from './components/scroll-to-top.tsx'
import { AppShell } from './components/shell.tsx'
import { DeploymentProvider, usePoolApi } from './lib/deployment.tsx'
import { PoolStatusProvider } from './lib/status.tsx'
import { BlocksPage } from './pages/blocks.tsx'
import { MinePage } from './pages/mine.tsx'
import { NoPoolPage } from './pages/no-pool.tsx'
import { NotFoundPage } from './pages/not-found.tsx'
import { WorkersPage } from './pages/workers.tsx'

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <DeploymentProvider>
        <PoolStatusProvider>
          <AppRoutes />
        </PoolStatusProvider>
      </DeploymentProvider>
    </BrowserRouter>
  )
}

/**
 * The routes, with one substitution applied in one place.
 *
 * ── WHY THE SUBSTITUTION IS HERE AND NOT IN EACH PAGE ─────────────────────────────────────────
 *
 * Every page below exists to render something micro-pool said, and on a deployment with no
 * micro-pool there is nothing for any of them to render — not an empty table, not a zero, not a
 * chain selector with no chains in it. Three early returns in three files would work exactly as
 * well until the fourth page is written, and then it would not, and the failure would be a page
 * that renders "The pool did not answer" on a network that has no pool. Deciding it once, where
 * the routes are declared, is what makes a new page impossible to forget.
 *
 * `NotFoundPage` is deliberately NOT substituted. An address this router does not know is still an
 * address this router does not know, whatever else is true of the deployment, and nginx serves it
 * under a real 404 (see nginx.conf). Answering "this network does not run a mining pool" for
 * `/typo` would be a true sentence about the wrong question, under a status code that contradicts
 * it.
 *
 * `unknown` — the one same-origin round trip before the answer arrives — renders the real pages,
 * which show their own loading state because `PoolStatusProvider` has not fetched anything yet.
 * The alternative, defaulting to the explanation until told otherwise, would flash "there is no
 * mining pool here" on every load of the pool's own console on mainnet.
 */
function AppRoutes() {
  const poolApi = usePoolApi()
  const page = (real: ReactElement): ReactElement => (poolApi === 'absent' ? <NoPoolPage /> : real)

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* How to point a miner here, and what the pool is doing right now. */}
        <Route index element={page(<MinePage />)} />
        {/*
          Two entries for one page, deliberately. `/workers` is the lookup box on its own, which
          is what the landing page's call to action links to; `/workers/:chain/:account` is a
          specific miner's record, which is the address that gets bookmarked and pasted into a
          support conversation. Rendering the form on both means arriving at somebody's record
          and then looking up your own is one field, not a navigation.
        */}
        <Route path="workers" element={page(<WorkersPage />)} />
        <Route path="workers/:chain/:account" element={page(<WorkersPage />)} />
        <Route path="blocks" element={page(<BlocksPage />)} />
        {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
            to get back out — under a real 404, which nginx.conf preserves. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
