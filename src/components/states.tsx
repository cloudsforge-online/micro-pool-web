/**
 * The states a panel on this site can be in, as visibly different things.
 *
 * Three, not four, and not five:
 *
 *   LOADING — we do not know yet. Waiting is the correct action.
 *   EMPTY   — the pool answered, with nothing in it. NOTHING IS WRONG. On 2026-08-09 this is the
 *             ordinary state of every panel on this site: no miner has ever connected to this pool,
 *             no share has been recorded and no block has been found, and neither network in this
 *             estate has real users at all. So an `Empty` here is written as a cold start with
 *             something to DO, never as an absence to apologise for. A "no data yet" that reads
 *             like an outage teaches a reader to distrust the numbers on the day there are some.
 *   FAILED  — the request did not answer. Retrying may help, and the request id is what support
 *             needs to find the log line.
 *
 * `Missing` is absent because nothing here is looked up by identifier: every route on this site is
 * a query with a filter, so "not found" cannot happen — an account nobody has mined with answers
 * 200 with an empty array, which is `Empty` and is a true answer rather than a 404.
 *
 * `Refused` is absent because micro-pool's read API takes no credential on any route
 * (`pool/src/server.ts`) and this bundle holds none. A 401 or a 403 arriving anyway would be a
 * fault in something in front of the service rather than a state this application can be in, and it
 * lands in `Failed`, where it belongs.
 */
import type { ReactNode } from 'react'
import type { ErrorNotice } from '../lib/api.ts'

// Every optional prop is spelled `?: T | undefined`. Under `exactOptionalPropertyTypes` those are
// two different types, and only the second accepts the `value ?? undefined` a caller writes when it
// may or may not have something to pass.
export function Loading({ label = 'Asking the pool' }: { label?: string | undefined }) {
  return (
    <div className="pl-state pl-state--loading" role="status" aria-live="polite">
      <span className="pl-spinner" aria-hidden="true" />
      <p className="pl-state__title">{label}</p>
    </div>
  )
}

export function Empty({
  title,
  hint,
  action,
}: {
  /**
   * What was asked, and that the answer was nothing. "No data" describes the screen rather than the
   * answer, and on a pool with no miners the screen is going to say it for a while.
   */
  title: string
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="pl-state pl-state--empty" role="status">
      <span className="pl-state__icon" aria-hidden="true">
        ◇
      </span>
      <p className="pl-state__title">{title}</p>
      {hint && <p className="pl-state__hint">{hint}</p>}
      {action && <div className="pl-state__action">{action}</div>}
    </div>
  )
}

/**
 * A failure, with the request id on screen.
 *
 * micro-pool sets `x-request-id` on every response including the failures, and puts it in the error
 * envelope too (`pool/src/server.ts`). It is rendered in the monospace token on a line of its own
 * because it is going to be read aloud or pasted into a support form.
 */
export function Failed({
  notice,
  onRetry,
  title = 'The pool did not answer',
}: {
  notice: ErrorNotice
  onRetry?: (() => void) | undefined
  title?: string | undefined
}) {
  return (
    <div className="pl-state pl-state--failed" role="alert">
      <span className="pl-state__icon" aria-hidden="true">
        ■
      </span>
      <p className="pl-state__title">{title}</p>
      <p className="pl-state__hint">{notice.message}</p>
      {notice.requestId && (
        <p className="pl-state__meta">
          Give support this reference: <code className="cf-num pl-reqid">{notice.requestId}</code>
        </p>
      )}
      {onRetry && (
        <div className="pl-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
