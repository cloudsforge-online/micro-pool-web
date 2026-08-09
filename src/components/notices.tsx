/**
 * The standing statements this site makes on every page.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `NotPaidNotice` IS THE REASON THIS REPOSITORY IS CAREFUL.
 *
 * A mining pool site that implies miners will be paid, when nothing pays them, is the worst defect
 * this frontend could ship: it costs a stranger real electricity, on their own hardware, for a
 * credit that does not exist and has no mechanism behind it. `pool/src/payouts.ts` is a set of types
 * and a `PayoutsNotImplementedError`; there is deliberately no payouts table, no sink is ever
 * constructed, and four product questions (the fee, the asset paid in, the minimum payout and how
 * coinbase maturity is handled) are open in the specification and are answered by a person rather
 * than by code.
 *
 * So the statement is:
 *
 *   * IN THE SHELL, not on one page. It renders above the outlet on every route, so there is no
 *     address on this site a stranger can arrive at without meeting it.
 *   * PRESENT TENSE, with no schedule in it. "Not yet" and "coming soon" both describe a date that
 *     does not exist.
 *   * ACCOMPANIED BY NO NUMBER. There is no unpaid balance on this site, no estimated earnings and
 *     no next payout — not zeroed and not greyed out, because a zero reads as "not yet, but soon"
 *     and the truth is "not at all, and there is no mechanism". `test/honesty.test.ts` asserts the
 *     absence by searching the rendered text of every page.
 *   * DERIVED FROM THE API. See `payoutsImplemented` in `src/lib/status.tsx`. This component is
 *     rendered only when the service has NOT said payouts are implemented, which includes the case
 *     where it has not answered at all — the one asymmetry in this repository, argued there.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { NOT_PAID_DETAIL, NOT_PAID_HEADLINE } from '../lib/format.ts'

export function NotPaidNotice() {
  return (
    // `role="alert"` is deliberately NOT used. This is not an event that has just happened; it is a
    // standing property of the service, present on first paint of every page. An alert interrupts a
    // screen reader mid-sentence to announce something that was already true when the page loaded,
    // and a reader who navigates between three pages would be interrupted three times by the same
    // sentence. A labelled region is announced when it is reached and can be jumped to on purpose.
    <section className="pl-notpaid" aria-label="Payment status of this pool">
      <p className="pl-notpaid__head">
        <span className="pl-notpaid__icon" aria-hidden="true">
          ▲
        </span>
        <strong>{NOT_PAID_HEADLINE}</strong>
      </p>
      <p className="pl-notpaid__body">{NOT_PAID_DETAIL}</p>
    </section>
  )
}

/**
 * This bundle is being served from an address it cannot derive the estate from.
 *
 * Not fatal — every route here is public and the API is same-origin — but not silent either.
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN first label, so served from a name the
 * registry cannot place, the whole name becomes the apex and every estate link on the page resolves
 * one level too deep, including the three legal links the shared footer composes for itself.
 *
 * It says nothing about the STRATUM endpoint, and used to. That was true while this bundle derived
 * the endpoint from its own address; it does not any more — micro-pool publishes it or publishes
 * null, and either answer is the same on a hostname nobody recognises (micro-org#285).
 */
export function UnregisteredNotice() {
  return (
    <p className="pl-note pl-note--warn" role="status">
      <span className="pl-note__icon" aria-hidden="true">
        ▲
      </span>
      <span>
        This page is being served from an address the CloudsForge surface registry does not know, so
        every link out of it is derived from the wrong apex and may go nowhere. Its home is the{' '}
        <code className="cf-num">pool</code> subdomain.
      </span>
    </p>
  )
}
