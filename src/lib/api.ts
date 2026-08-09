/**
 * The HTTP wrapper. One `fetch`, one error shape, and no credential of any kind.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THERE IS NO AUTHENTICATION IN THIS BUNDLE, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 *
 * The template's `@cloudsforge/auth` wiring, the access and refresh tokens, the `localStorage`
 * probe, the single-flight refresh and the `AuthProvider` are all absent. `micro-pool` has no
 * `@cloudsforge/auth` either, and its `src/server.ts` says why at length:
 *
 *     "The only identity a miner has at this service is the stratum username they typed into their
 *     own firmware — there is no estate account behind it, and there cannot be, because the whole
 *     point is that a stranger with an ASIC can point it here and be paid. Gating the share
 *     history behind an estate login would make it checkable by nobody."
 *
 * A bundle that sent a bearer token to that service would be sending a credential to a surface
 * that has no use for one, and it would put a token in a page whose entire audience is people
 * without estate accounts. So there is nothing here to steal and nothing here to expire.
 *
 * status-web made the same call for a different reason and its CI greps for the tokens by name.
 * This repository's `ci.yml` carries the same grep, so the absence is enforced rather than merely
 * intended.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { pageOrigin } from './hosts.ts'

/**
 * A request that came back unusable.
 *
 * `status: 0` means the request never produced a response at all — DNS, TLS, a refused connection,
 * an offline device. It is kept distinct from every real status because the remedy is different
 * and because "0" is what a reader will quote when they say "it just says failed".
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly requestId: string | undefined

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

/** What a screen renders when something did not load. */
export interface ErrorNotice {
  readonly message: string
  readonly requestId: string | undefined
  readonly code: string | undefined
  readonly status: number
}

export function noticeFor(err: unknown, fallback: string): ErrorNotice {
  if (err instanceof ApiError) {
    return {
      message: err.message || fallback,
      requestId: err.requestId,
      code: err.code,
      status: err.status,
    }
  }
  return { message: fallback, requestId: undefined, code: undefined, status: 0 }
}

/**
 * Read the estate error envelope.
 *
 * `micro-pool/src/server.ts` answers `{ error: { code, message, requestId } }` on every failure
 * and always carries the request id, which is what joins a support conversation to a log line. The
 * flat form is accepted too, because a gateway or a proxy in front of the service may answer in
 * its own words and a 502 from Traefik is still worth rendering properly.
 */
function readErrorBody(body: unknown): { code?: string; message?: string; requestId?: string } {
  if (body === null || typeof body !== 'object') return {}
  const outer = body as Record<string, unknown>
  const inner = (typeof outer['error'] === 'object' && outer['error'] !== null ? outer['error'] : outer) as Record<
    string,
    unknown
  >
  const pick = (key: string): string | undefined =>
    typeof inner[key] === 'string' ? (inner[key] as string) : undefined
  const result: { code?: string; message?: string; requestId?: string } = {}
  const code = pick('code')
  const message = pick('message')
  const requestId = pick('requestId')
  if (code !== undefined) result.code = code
  if (message !== undefined) result.message = message
  if (requestId !== undefined) result.requestId = requestId
  return result
}

export interface RequestOptions {
  readonly query?: Record<string, string | number | undefined> | undefined
  readonly signal?: AbortSignal | undefined
}

/**
 * How long a read may take before it is treated as unreachable.
 *
 * Every route this bundle calls is a bounded read against one Postgres query, so eight seconds is
 * generous. The number exists at all because `fetch` without a timeout hangs for the platform
 * default — which on some mobile browsers is over a minute — and a page that shows a spinner for a
 * minute has told the reader nothing, whereas one that says "cannot reach the pool" after eight
 * seconds has.
 */
export const REQUEST_TIMEOUT_MS = 8000

async function request<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(base + path, pageOrigin())
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  // A caller's abort (an unmounting component) and the timeout both have to reach one signal.
  const onCallerAbort = () => controller.abort()
  opts.signal?.addEventListener('abort', onCallerAbort, { once: true })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      // No cookies, ever. The pool API reads no session and sending one would make an anonymous
      // public read into a CSRF surface for nothing in return.
      credentials: 'omit',
      signal: controller.signal,
    })
  } catch (err) {
    // A caller-initiated abort is this component going away, not a failure. Rethrow it as itself
    // so `useResource` can recognise it; anything else is a real unreachability.
    if (opts.signal?.aborted) throw err
    throw new ApiError(0, 'Cannot reach the pool. Check your connection and try again.')
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onCallerAbort)
  }

  // Present on every response micro-pool sends, including the failures — it sets the header before
  // anything can throw, precisely so a 500 still carries the id the reader will quote.
  const requestId = res.headers.get('x-request-id') ?? undefined

  if (!res.ok) {
    const parsed = readErrorBody(await safeJson(res))
    throw new ApiError(
      res.status,
      parsed.message ?? `The pool answered ${res.status}.`,
      parsed.code,
      parsed.requestId ?? requestId,
    )
  }

  const body = await safeJson(res)
  if (body === undefined) {
    throw new ApiError(res.status, 'The pool answered with something that was not JSON.', 'bad_body', requestId)
  }
  return body as T
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return undefined
  }
}

/** A read against micro-pool, at whatever base the current placement resolves to. */
export const api = <T>(base: string, path: string, opts?: RequestOptions): Promise<T> =>
  request<T>(base, path, opts)
