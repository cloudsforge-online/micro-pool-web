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
 * bearer token on any route it serves (`pool/src/server.ts`): `/v1/pool`, `/v1/pool/blocks`,
 * `/v1/pool/workers` and `/v1/pool/shares` are all anonymous reads, and `account` is a query
 * parameter rather than an authenticated subject. The only identity a miner has here is the stratum
 * username they typed into their own firmware, and the pool never checks it against anything — see
 * the "Your address is a label" section on the landing page. A sign-in on this surface would be a
 * gate in front of facts that are public by construction, guarding an account that does not exist.
 *
 * ── `PoolStatusProvider` wraps the shell, not each page ────────────────────────────────────────
 *
 * `payoutsImplemented` is read from `GET /v1/pool` and the shell renders the standing honesty notice
 * above the outlet on EVERY route, so the provider has to be outside the shell. Putting it inside a
 * layout element instead would give each page its own copy of the answer and let two of them
 * disagree while a deploy is rolling — argued in full in src/lib/status.tsx.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from './components/scroll-to-top.tsx'
import { AppShell } from './components/shell.tsx'
import { PoolStatusProvider } from './lib/status.tsx'
import { BlocksPage } from './pages/blocks.tsx'
import { MinePage } from './pages/mine.tsx'
import { NotFoundPage } from './pages/not-found.tsx'
import { WorkersPage } from './pages/workers.tsx'

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <PoolStatusProvider>
        <Routes>
          <Route element={<AppShell />}>
            {/* How to point a miner here, and what the pool is doing right now. */}
            <Route index element={<MinePage />} />
            {/*
              Two entries for one page, deliberately. `/workers` is the lookup box on its own, which
              is what the landing page's call to action links to; `/workers/:chain/:account` is a
              specific miner's record, which is the address that gets bookmarked and pasted into a
              support conversation. Rendering the form on both means arriving at somebody's record
              and then looking up your own is one field, not a navigation.
            */}
            <Route path="workers" element={<WorkersPage />} />
            <Route path="workers/:chain/:account" element={<WorkersPage />} />
            <Route path="blocks" element={<BlocksPage />} />
            {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
                to get back out — under a real 404, which nginx.conf preserves. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </PoolStatusProvider>
    </BrowserRouter>
  )
}
