/**
 * THE NETWORK THE READER IS VIEWING, HELD WHERE EVERYTHING THAT READS CAN SEE IT.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `src/lib/viewed.ts` already holds the choice — in module memory, per tab, with `?net=` in the
 * address bar. This file exists because a module variable cannot make React re-render, and on this
 * surface the two things that read micro-pool are mounted ABOVE the component that owned the
 * switch.
 *
 * MEASURED ON MAINNET, 2026-08-16, before this file existed. Pressing Testnet on
 * `pool.cloudsforge.online` flipped the amber band, wrote `?net=testnet` into the address bar, set
 * `aria-pressed` on the right button — and issued no request at all. Every number on the page stayed
 * mainnet's, under a banner announcing testnet. That is worse than the teleport it replaced: the
 * teleport at least took the reader somewhere true.
 *
 * The cause was ordinary React and worth stating plainly, because the same shape is in every bundle
 * that keeps its switcher in the shell. `AppShell` held the choice in `useState` and re-pointed the
 * pages under it with `<Outlet key={viewed} />`. But `DeploymentProvider` and `PoolStatusProvider`
 * are mounted in `src/app.tsx`, OUTSIDE the shell — deliberately, and both for good reasons argued
 * there — so the state change never reached them. The page tree remounted around a status that had
 * already been fetched from the serving estate and was never going to be fetched again.
 *
 * ── SO THE CHOICE MOVES UP, AND THE READERS SUBSCRIBE TO IT ───────────────────────────────────
 *
 * This provider is mounted outermost, above both. A component that consumes it re-renders when the
 * reader switches; a component that does not, does not. That is not incidental — it is how
 * `DeploymentProvider` re-probes and `PoolStatusProvider` re-reads while everything else is left
 * alone. Passing `children` through a provider does NOT re-render them (React bails out on an
 * unchanged element), so each of the two calls {@link useViewing} explicitly rather than relying on
 * being underneath it.
 *
 * Nothing is stored here. The state is a mirror of `viewed.ts`, which is the one source of truth —
 * `choose` writes there FIRST so that any module-scope read taken during the resulting render (and
 * `apiBase()` is exactly that) already sees the new network.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { currentNetwork } from '@cloudsforge/ui'
import { setViewedNetwork, viewedApiOrigin, viewedNetwork, type ViewedNetwork } from './viewed.ts'

export interface Viewing {
  /** The network being read: the reader's in-tab choice, or the hostname's own. */
  readonly network: ViewedNetwork
  /**
   * The network of the estate SERVING this page, or null off-registry (localhost, a preview host).
   *
   * Kept beside `network` because the difference between the two is the whole of what this file is
   * for, and because `NoPoolPage` needs a name for the place it is offering to send the reader
   * back to. Never used to decide what to fetch — that is `viewed.ts`'s job.
   */
  readonly serving: ViewedNetwork | null
  /**
   * The reader is looking at an estate other than the one serving this page.
   *
   * Read off `viewedApiOrigin()` rather than compared against `serving`, so it is true exactly when
   * this bundle's requests are about to leave for another origin — which is the condition every
   * caller actually cares about, and the one that stays correct off-registry, where there is no
   * sibling estate and an override is refused.
   */
  readonly away: boolean
  /** Record the reader's choice. Writes `viewed.ts` first, then re-renders every consumer. */
  readonly choose: (network: ViewedNetwork) => void
}

const ViewingContext = createContext<Viewing | null>(null)

export function ViewedNetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<ViewedNetwork>(() => viewedNetwork())

  const choose = useCallback((next: ViewedNetwork) => {
    // Order matters and is the reason this is not a bare `setState`. `apiBase()` reads
    // `viewedApiOrigin()` from module scope during render; writing the module first means the very
    // first render after the click already resolves to the new estate, rather than making one more
    // request to the old one and correcting itself.
    setViewedNetwork(next)
    setNetwork(next)
  }, [])

  const value = useMemo<Viewing>(
    () => ({
      network,
      serving: currentNetwork(),
      // Recomputed per render rather than derived from `network`, because `setViewedNetwork`
      // normalises: choosing the hostname's own network clears the override, and off-registry it
      // refuses one outright. This asks the module what it actually did.
      away: viewedApiOrigin() !== '',
      choose,
    }),
    [network, choose],
  )

  return <ViewingContext.Provider value={value}>{children}</ViewingContext.Provider>
}

/**
 * The viewed network, and the subscription to it.
 *
 * Throws outside the provider, like `usePoolStatus()` and unlike `usePoolApi()`. The default that
 * would otherwise be returned is "viewing the serving estate", which is silently correct on every
 * page until the reader touches the switcher and then silently wrong forever — the exact failure
 * this file was written to end, reintroduced as a missing provider nobody would notice.
 */
export function useViewing(): Viewing {
  const value = useContext(ViewingContext)
  if (!value) throw new Error('useViewing was called outside ViewedNetworkProvider')
  return value
}
