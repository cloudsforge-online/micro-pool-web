/**
 * The page this console shows when there is no pool behind it.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IT REPLACES, AND WHY REPLACING IT IS THE FIX.
 *
 * micro-org#406, measured 2026-08-11. `pool-testnet.cloudsforge.online` served this bundle with a
 * 200 and every `/v1/…` request under it answered 502, so `/`, `/workers` and `/blocks` each
 * rendered `Failed` — "The pool did not answer", a fallback sentence, and a **Try again** button.
 * Three pages of an incident that was not happening. The estate was working exactly as designed:
 * micro-pool is behind a compose profile a testnet estate does not name, deliberately and
 * permanently, and this console is deliberately NOT behind it so that somebody arriving here has
 * something to read. What they had to read was an error.
 *
 * So this page is not an error state and does not look like one. It carries no request id, because
 * no request failed; no retry, because there is nothing to retry; and no apology, because nothing
 * is wrong. It is a signpost, and the whole of its job is the link at the bottom.
 *
 * ── THE THREE THINGS IT HAS TO SAY, IN THIS ORDER ─────────────────────────────────────────────
 *
 *   1. THERE IS NO POOL HERE. First, plainly, in the heading — because a reader who arrived with an
 *      ASIC to point somewhere needs that fact before they need anything else, and because the
 *      previous version of this page let them believe the pool existed and was merely down, which
 *      is the belief that makes somebody wait and try again in an hour.
 *   2. THE POOL EXISTS SOMEWHERE. "No pool here" alone reads as "the pool was shut down", and this
 *      surface is the one place a miner would go to check. The address is DERIVED from the address
 *      of this page (`unlabelledPoolUrl()`) rather than written down: one image serves every
 *      environment and a literal hostname in it would be a second, unversioned copy of the surface
 *      registry — see `test/no-build-time-config.test.ts`.
 *   3. WHAT CAN BE MINED ON THIS NETWORK ANYWAY. A network without a Stratum pool is not a network
 *      without mining: EMBER is mined directly against the node from a browser tab, on this estate
 *      and on every estate, from Forge Hub's `/mine`. Sending a reader away with nothing when the
 *      thing they asked for is one link away would be its own smaller dishonesty.
 *
 * ── AND THE ONE IT MUST NOT SAY ───────────────────────────────────────────────────────────────
 *
 * Not a word about WHEN. There is no schedule for a pool on a network that is not getting one, and
 * "coming soon" on an infrastructure page is a promise nobody has made. `test/honesty.test.ts`
 * holds the same line for payouts, for the same reason, and this page is inside its sweep.
 *
 * ── THE STANDING PAYOUT NOTICE IS STILL ABOVE THIS PAGE, AND IT SHOULD BE ─────────────────────
 *
 * The shell renders "This pool does not pay out." on every route whenever the service has not said
 * otherwise, which includes here, where no service was asked. That reads oddly for a second — a
 * payout warning about a pool that is not there — and it stays, because of what the link below
 * does: this page's entire purpose is to send a reader to a pool that DOES exist, and the single
 * most important thing to tell somebody before they follow it is that hashrate pointed at it earns
 * nothing. Suppressing the notice here would remove it from the one page whose reader is about to
 * act on it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { HUB_MINE_PATH } from '@cloudsforge/ui'
import { hosts, unlabelledPoolUrl } from '../lib/hosts.ts'

export function NoPoolPage() {
  const elsewhere = unlabelledPoolUrl()
  const estate = hosts()

  return (
    <div className="pl-page">
      <h1 className="pl-title">This network does not run a mining pool</h1>
      {/*
        THE SENTENCE IS BRANCHED, BECAUSE THE UNBRANCHED ONE IS FALSE HALF THE TIME.

        "The pool runs on the main network" is a claim about where the pool IS, and this page is
        rendered whenever a deployment says it has none — including a MAIN-network one, which is
        what mainnet itself looked like before the `pool` profile was switched on. Written flat,
        that sentence would tell a reader standing on the main network that the pool they cannot
        see is on the main network. The branch is the same condition as the link below, so the two
        cannot disagree: the claim is made exactly when there is an address to back it.
      */}
      {elsewhere !== null ? (
        <p className="pl-lede">
          Nothing is broken and nothing is down. The CloudsForge mining pool runs on the main
          network; the deployment serving this page is a different network and has no pool behind
          it, so there is no Stratum endpoint here, no share history, and no blocks to list.
        </p>
      ) : (
        <p className="pl-lede">
          Nothing is broken and nothing is down. The deployment serving this page has no mining pool
          behind it, so there is no Stratum endpoint here, no share history, and no blocks to list.
        </p>
      )}

      <section className="pl-section" aria-labelledby="pl-nopool-why">
        <h2 className="pl-h2" id="pl-nopool-why">
          Why this address exists at all
        </h2>
        <p className="pl-hint">
          Every CloudsForge network publishes the same set of addresses, so this console answers on
          all of them. The pool itself is a separate service that mines real chains against real
          nodes with a real payout address, and it is only brought up where all three of those
          exist. Rather than leave this address dark or hand you an error, it says so.
        </p>
      </section>

      {/*
        THE LINK, AND THE ONE CASE WHERE THERE IS NOT ONE.

        `unlabelledPoolUrl()` is null on localhost and on any address the surface registry cannot
        place — a preview deployment, somebody's tunnel — because composing a sibling address from
        an apex nobody derived would produce a hostname that resolves to nothing, and a "the pool is
        over here" link that 404s teaches the reader that the pool is gone. It is also null when
        this page is ALREADY on the unlabelled environment, where the composed address would be
        this very page. In both cases the sentence stands on its own without a link, which is the
        honest shape: see `src/lib/hosts.ts`.
      */}
      {elsewhere !== null && (
        <p className="pl-cta">
          {/* `cf-btn--ember` is the design system's emphasis modifier and the one this repository
              already uses for its primary action (`src/pages/workers.tsx`). There is no
              `cf-btn--primary` in `ui.css`, and naming one would leave the element unstyled in
              complete silence — the failure `test/tokens.test.ts` exists to catch. */}
          <a className="cf-btn cf-btn--ember" href={elsewhere}>
            Open the CloudsForge mining pool
          </a>
        </p>
      )}

      <section className="pl-section" aria-labelledby="pl-nopool-ember">
        <h2 className="pl-h2" id="pl-nopool-ember">
          You can still mine this network
        </h2>
        <p className="pl-hint">
          EMBER, the CloudsForge chain, is mined directly against the network rather than through a
          pool — no Stratum, no pool account, and nothing to point hardware at. A browser tab can do
          it from Forge Hub.
        </p>
        <p className="pl-cta">
          <a className="cf-btn" href={`${estate.hub}${HUB_MINE_PATH}`}>
            Mine EMBER on Forge Hub
          </a>
        </p>
      </section>
    </div>
  )
}
