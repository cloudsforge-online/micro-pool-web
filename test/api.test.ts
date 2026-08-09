/**
 * The HTTP wrapper: what it sends, what it refuses to send, and how it fails.
 *
 * The tests worth having here are the negative ones. This bundle must never put a credential on the
 * wire (`src/lib/api.ts` says why at length — the pool's only notion of identity is the stratum
 * username a stranger typed into their own firmware), and a request that hangs must become a stated
 * failure rather than a spinner that outlives the reader's patience.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { ApiError, api, noticeFor, REQUEST_TIMEOUT_MS } from '../src/lib/api.ts'
import { installFetch, installWindow, json, removeWindow } from './browser-stubs.ts'
import { errorBody, poolStatus } from './fixtures.ts'

before(() => {
  installWindow('https://pool.cloudsforge.online/')
})
after(() => {
  removeWindow()
})

test('a relative base resolves against the page, which is what same-origin serving means', async () => {
  const stub = installFetch(() => json(200, poolStatus()))
  try {
    await api('', '/v1/pool')
    assert.equal(stub.calls[0]?.url, 'https://pool.cloudsforge.online/v1/pool')
  } finally {
    stub.restore()
  }
})

test('a local base is used verbatim, so `pnpm dev` reaches the service on its own port', async () => {
  const stub = installFetch(() => json(200, poolStatus()))
  try {
    await api('http://localhost:4146', '/v1/pool')
    assert.equal(stub.calls[0]?.url, 'http://localhost:4146/v1/pool')
  } finally {
    stub.restore()
  }
})

test('query values are encoded, and an undefined one is omitted rather than sent as "undefined"', async () => {
  const stub = installFetch(() => json(200, poolStatus()))
  try {
    await api('', '/v1/pool/shares', { query: { chain: 'ltc', account: 'a:b-c', limit: 50, cursor: undefined } })
    const url = new URL(stub.calls[0]?.url ?? '')
    assert.equal(url.searchParams.get('chain'), 'ltc')
    assert.equal(url.searchParams.get('account'), 'a:b-c')
    assert.equal(url.searchParams.get('limit'), '50')
    // `?cursor=undefined` is a real string the service would have to reject. Sending nothing is the
    // only reading of "this parameter was not supplied" that a server can act on.
    assert.equal(url.searchParams.has('cursor'), false)
  } finally {
    stub.restore()
  }
})

test('NO REQUEST EVER CARRIES A CREDENTIAL', async () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // This bundle has no sign-in, no token store and no refresh, and micro-pool takes no bearer token
  // on any route. A header added here later would be a credential handed to a service with no use
  // for one, in a page whose entire audience is people without estate accounts.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const stub = installFetch(() => json(200, poolStatus()))
  try {
    await api('', '/v1/pool')
    const headers = stub.calls[0]?.headers ?? {}
    assert.deepEqual(Object.keys(headers), ['accept'])
    assert.equal(headers['accept'], 'application/json')
    for (const name of Object.keys(headers)) {
      assert.notEqual(name.toLowerCase(), 'authorization')
      assert.notEqual(name.toLowerCase(), 'cookie')
    }
  } finally {
    stub.restore()
  }
})

test('the estate error envelope is read, request id and all', async () => {
  const stub = installFetch(() =>
    json(404, errorBody('not_found', 'No such chain: doge.', 'req-pool-abc'), 'req-header-xyz'),
  )
  try {
    await assert.rejects(
      () => api('', '/v1/pool/blocks', { query: { chain: 'doge' } }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 404)
        assert.equal(err.code, 'not_found')
        assert.equal(err.message, 'No such chain: doge.')
        // The id in the BODY wins over the one in the header when both are present: it is the one
        // micro-pool put there deliberately, and it is what a reader will quote.
        assert.equal(err.requestId, 'req-pool-abc')
        return true
      },
    )
  } finally {
    stub.restore()
  }
})

test('a proxy that answers in its own flat shape is still rendered properly', async () => {
  // Traefik sits in front of this service. A 502 from the gateway is not micro-pool's envelope, and
  // "The pool answered 502." with nothing else is a worse thing to show than the proxy's own words.
  const stub = installFetch(() => json(502, { code: 'bad_gateway', message: 'upstream unavailable' }, 'req-gw-1'))
  try {
    await assert.rejects(
      () => api('', '/v1/pool'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.code, 'bad_gateway')
        assert.equal(err.message, 'upstream unavailable')
        assert.equal(err.requestId, 'req-gw-1')
        return true
      },
    )
  } finally {
    stub.restore()
  }
})

test('a failure with no body at all still carries the status and the header id', async () => {
  const stub = installFetch(
    () => new Response('<html>gateway timeout</html>', { status: 504, headers: { 'x-request-id': 'req-gw-2' } }),
  )
  try {
    await assert.rejects(
      () => api('', '/v1/pool'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 504)
        assert.equal(err.message, 'The pool answered 504.')
        assert.equal(err.requestId, 'req-gw-2')
        return true
      },
    )
  } finally {
    stub.restore()
  }
})

test('a 200 that is not JSON is a failure and not an empty page', async () => {
  // The shape of a bundle served where the API was expected: nginx answers the SPA shell with a 200
  // for an address micro-pool was supposed to handle. Treating that as data renders an empty pool.
  const stub = installFetch(
    () => new Response('<!doctype html>', { status: 200, headers: { 'x-request-id': 'req-html' } }),
  )
  try {
    await assert.rejects(
      () => api('', '/v1/pool'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.code, 'bad_body')
        return true
      },
    )
  } finally {
    stub.restore()
  }
})

test('an unreachable service is status 0 with an actionable message', async () => {
  const stub = installFetch(() => {
    throw new TypeError('Failed to fetch')
  })
  try {
    await assert.rejects(
      () => api('', '/v1/pool'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        // Kept distinct from every real status: "0" is what a reader quotes, and the remedy for a
        // refused connection is not the remedy for a 500.
        assert.equal(err.status, 0)
        assert.match(err.message, /Cannot reach the pool/)
        return true
      },
    )
  } finally {
    stub.restore()
  }
})

test('a request that never answers gives up after the stated budget', async (t) => {
  // Not eight real seconds. The clock is mocked and advanced, so this asserts the budget EXISTS and
  // is the one the module documents — a `fetch` with no timeout hangs for the platform default,
  // which on some mobile browsers is over a minute of spinner that has told the reader nothing.
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const stub = installFetch(
    (call) =>
      new Promise<Response>((_resolve, reject) => {
        call.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  try {
    const pending = api('', '/v1/pool')
    const settled = assert.rejects(pending, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 0)
      return true
    })
    t.mock.timers.tick(REQUEST_TIMEOUT_MS)
    await settled
  } finally {
    stub.restore()
  }
})

test('a caller abort is rethrown as itself, so an unmount is not rendered as an outage', async () => {
  const controller = new AbortController()
  const stub = installFetch(
    (call) =>
      new Promise<Response>((_resolve, reject) => {
        call.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  try {
    const pending = api('', '/v1/pool', { signal: controller.signal })
    controller.abort()
    // NOT an ApiError. `useResource` recognises an abort and renders nothing at all for it; wrapping
    // it here would put "cannot reach the pool" on a page the reader has already navigated away
    // from, and leave it there.
    await assert.rejects(pending, (err: unknown) => {
      assert.equal(err instanceof ApiError, false)
      return true
    })
  } finally {
    stub.restore()
  }
})

test('noticeFor keeps what the service said and falls back only when there is nothing', () => {
  const fromApi = noticeFor(new ApiError(503, 'The pool is not ready.', 'not_ready', 'req-1'), 'fallback')
  assert.deepEqual(fromApi, {
    message: 'The pool is not ready.',
    requestId: 'req-1',
    code: 'not_ready',
    status: 503,
  })

  const fromNothing = noticeFor(new Error('kaboom'), 'Could not reach the pool.')
  assert.deepEqual(fromNothing, {
    // A raw exception message is a stack-trace fragment shown to a stranger. The fallback is the
    // sentence the page author wrote for this specific screen.
    message: 'Could not reach the pool.',
    requestId: undefined,
    code: undefined,
    status: 0,
  })
})
