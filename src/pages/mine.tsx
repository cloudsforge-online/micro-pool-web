/**
 * The landing page: everything a stranger with an ASIC needs, and everything they need to refuse.
 *
 * It is one page and not four sections of a brochure because the reader has exactly one question —
 * "what do I type into my miner, and is it worth it" — and the honest answer to the second half is
 * no. So the order below is deliberate and is asserted by `test/render.test.ts`:
 *
 *   1. what this is,
 *   2. what it does NOT do (the shell puts the payout statement above this page's own heading),
 *   3. what to type,
 *   4. what the pool is doing right now,
 *   5. the terms, including the ones that are unflattering.
 *
 * The connection details come last-but-one on purpose. A page that opens with a stratum URL is a
 * page that has already asked for hashrate before saying what happens to it.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import {
  formatCount,
  formatDifficulty,
  formatFee,
  formatHashrate,
  formatWindow,
  NOT_IMPLEMENTED,
} from '../lib/format.ts'
import { stratumHost } from '../lib/hosts.ts'
import type { PoolChainStatus } from '../lib/pool.ts'
import { defaultChain, usePoolStatus } from '../lib/status.tsx'

export function MinePage() {
  const { resource, chains, payoutsImplemented } = usePoolStatus()
  const status = resource.data
  const [chosen, setChosen] = useState<string | null>(null)
  const chain = chains.find((c) => c.chain === (chosen ?? defaultChain(chains))) ?? null

  return (
    <div className="pl-page">
      <h1 className="pl-title">The CloudsForge mining pool</h1>
      <p className="pl-lede">
        A Stratum v1 pool for the chains this estate runs a node for. It accepts work, records every
        share it credits, and weights them PPLNS so that a block found here has a defensible
        division.{' '}
        {/*
          DERIVED, NOT WRITTEN DOWN. This clause used to be part of the sentence above it, which
          meant the page would have gone on refusing to pay long after micro-pool started paying —
          a lie in the other direction, told by a frontend nobody remembered to edit. Everything on
          this site that says nothing settles branches on the service's own `payoutsImplemented`.
        */}
        {!payoutsImplemented && 'It does not pay anybody, and there is no mechanism by which it could.'}
      </p>

      {/*
        THE LIST OF ABSENCES, ABOVE THE CONNECTION DETAILS.

        Each entry says what is missing AND what happens instead, because "no Stratum v2" tells a
        reader nothing and "Stratum v1 only, which is what the firmware on deployed hardware speaks"
        tells them whether their machine will connect. The list is in src/lib/format.ts so this page
        and the tests read the same words.

        The `Payouts` entry is FILTERED OUT the moment the service reports payouts implemented,
        rather than surviving as a stale paragraph on a page whose headline notice has already
        gone. The other four are properties of the protocol and of the deployment, are not things
        `/v1/pool` reports, and are therefore stated unconditionally.
      */}
      <section className="pl-section" aria-labelledby="pl-absent">
        <h2 className="pl-h2" id="pl-absent">
          What this pool does not do
        </h2>
        <dl className="pl-deflist">
          {NOT_IMPLEMENTED.filter((item) => !(payoutsImplemented && item.what === 'Payouts')).map((item) => (
            <div className="pl-deflist__row" key={item.what}>
              <dt className="pl-deflist__term">{item.what}</dt>
              <dd className="pl-deflist__desc">{item.instead}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pl-section" aria-labelledby="pl-connect">
        <h2 className="pl-h2" id="pl-connect">
          Pointing a miner here
        </h2>

        {resource.state === 'loading' && <Loading label="Asking the pool which chains it serves" />}
        {resource.state === 'failed' && resource.error && (
          <Failed
            notice={resource.error}
            onRetry={resource.reload}
            title="The connection details are not on screen"
          />
        )}
        {resource.state === 'empty' && (
          <p className="pl-note" role="status">
            This pool is running and is configured to mine nothing at all. There is no chain to point
            a miner at until an operator sets <code className="cf-num">POOL_CHAINS</code>.
          </p>
        )}

        {/*
          THE CHAIN SELECTOR EXISTS ONLY WHEN THERE IS A CHOICE.

          Which chains this deployment serves is `POOL_CHAINS`, a per-deployment environment
          variable, and on 2026-08-09 the estate can only serve `ltc` because bitcoind is still doing
          its initial block download. A hard-coded pair of tabs would render an empty BTC panel for
          about a month and then be wrong again the day a third chain arrives. So the set is whatever
          the API reported and a one-chain pool gets no selector at all — micro-pool makes the same
          choice on its own side, defaulting `chain` when exactly one is configured.
        */}
        {chains.length > 1 && (
          <p className="pl-chainpick">
            <label className="pl-chainpick__label" htmlFor="pl-chain">
              Chain
            </label>{' '}
            <select
              id="pl-chain"
              className="cf-select cf-select--mono"
              value={chain?.chain ?? ''}
              onChange={(event) => setChosen(event.target.value)}
            >
              {chains.map((c) => (
                <option key={c.chain} value={c.chain}>
                  {c.name} ({c.chain})
                </option>
              ))}
            </select>
          </p>
        )}

        {chain && <ConnectCard chain={chain} />}
      </section>

      {chains.length > 0 && (
        <section className="pl-section" aria-labelledby="pl-now">
          <h2 className="pl-h2" id="pl-now">
            What the pool is doing now
          </h2>
          <p className="pl-hint">
            Every rate below is measured over the last{' '}
            {formatWindow(chains[0]?.windowSeconds ?? 0)} of accepted shares. A pool nobody is mining
            reports zero, which is the honest reading of an empty window rather than a fault.
          </p>
          <div className="pl-grid">
            {chains.map((c) => (
              <ChainPanel key={c.chain} chain={c} />
            ))}
          </div>
        </section>
      )}

      <section className="pl-section" aria-labelledby="pl-terms">
        <h2 className="pl-h2" id="pl-terms">
          The terms, including the unflattering ones
        </h2>
        <dl className="pl-deflist">
          <div className="pl-deflist__row">
            <dt className="pl-deflist__term">Fee</dt>
            <dd className="pl-deflist__desc">
              {/*
                `formatFee` returns "not stated" rather than 0% when the field is absent or
                nonsensical. `POOL_FEE_BASIS_POINTS` is required with no default in micro-pool's
                env.ts precisely because "a default of 0 would be choosing free and a default of 200
                would be choosing 2%", and a fee shown as 0% that is really unset is the same class
                of lie as a balance shown as 0 that is really unpayable.
              */}
              <strong className="cf-num">{formatFee(status?.feeBasisPoints)}</strong> of a block
              reward, taken before the PPLNS division.{' '}
              {!payoutsImplemented &&
                'It is a number in the pool’s configuration and, since nothing is paid out, it has ' +
                  'never been deducted from anything.'}
            </dd>
          </div>
          <div className="pl-deflist__row">
            <dt className="pl-deflist__term">Reward scheme</dt>
            <dd className="pl-deflist__desc">
              PPLNS — pay per last N shares. When a block is found the pool looks backwards over the
              most recent{' '}
              <strong className="cf-num">
                {status ? `${status.pplnsWindowMultiplier}×` : 'unknown'}
              </strong>{' '}
              network difficulty of accepted shares and divides the reward in proportion to each
              share&rsquo;s difficulty. It is not per-round and it is not pay-per-share.
            </dd>
          </div>
          <div className="pl-deflist__row">
            <dt className="pl-deflist__term">What PPLNS costs you</dt>
            <dd className="pl-deflist__desc">
              {/*
                micro-pool's own pplns.ts asks for this to be said here, by name: "a miner who
                leaves is still inside the window for a while and keeps earning; a miner who arrives
                earns nothing extra for their first window. That is a fairness property, not a bug,
                and micro-pool-web is where it has to be explained."
              */}
              Your first window earns you less than your hashrate suggests, because the window is
              full of somebody else&rsquo;s shares — and when you leave you keep a claim on it for a
              while for the same reason. That is a property of the scheme rather than a fault, and it
              penalises miners who switch pools constantly.
            </dd>
          </div>
          <div className="pl-deflist__row">
            <dt className="pl-deflist__term">Difficulty</dt>
            <dd className="pl-deflist__desc">
              Set per connection and adjusted automatically toward a steady share rate. Your miner is
              told its difficulty before it is given work, so a rig that reports a difficulty of 1 has
              not finished authorising.
            </dd>
          </div>
          <div className="pl-deflist__row">
            <dt className="pl-deflist__term">Your address is a label</dt>
            <dd className="pl-deflist__desc">
              {/*
                THIS IS NOT PEDANTRY, IT IS THE MOST LIKELY WAY TO LOSE MONEY HERE.

                `parseWorkerName` (pool/src/session.ts) checks the character set and the length and
                nothing else. It is never handed to an address parser, never checked against a
                network, and never used to send anything, because there is nothing to send. A reader
                who assumes a wrong address would be rejected at authorise time would be wrong.
              */}
              The pool stores the username you authorise with and uses it to group your shares. It
              does <strong>not</strong> validate it as an address on any chain, and nothing will ever
              be sent to it. A typo is accepted silently, because there is no payment for it to
              break.
            </dd>
          </div>
        </dl>
      </section>

      <p className="pl-cta">
        {/*
          `/workers` and not a composed `workerPath(...)`. The link builder needs an account, and
          the only account this page could put in one would be a placeholder — which would send a
          reader to a page reporting that a miner named `your-address` has no shares. That reads as
          a broken pool rather than as an empty form.
        */}
        <Link className="cf-btn" to="/workers">
          Look up a miner&rsquo;s shares
        </Link>
      </p>
    </div>
  )
}

/**
 * The block a miner copies into their firmware.
 *
 * ── The endpoint is derived from the page's own address, and may be absent ─────────────────────
 *
 * Stratum v1 is line-delimited JSON-RPC over RAW TCP. It is not HTTP, so the HTTPS front door this
 * page arrived through cannot carry it, and micro-pool serves no TLS on the stratum port at all. The
 * hostname is therefore the one this page is served from — the deploy is expected to expose the TCP
 * ports on the same name — and `stratumHost()` returns null rather than a plausible guess when the
 * page is being served from somewhere that cannot be reconciled with the registry. A wrong hostname
 * in a miner's configuration costs its owner a silent outage they will blame on their hardware.
 */
function ConnectCard({ chain }: { chain: PoolChainStatus }) {
  const host = stratumHost()

  return (
    <div className="pl-card">
      <h3 className="pl-h3">
        {chain.name} <span className="pl-dim">({chain.chain})</span>
      </h3>

      <dl className="pl-kv">
        <dt className="pl-kv__key">Address</dt>
        <dd className="pl-kv__val">
          {host ? (
            <code className="cf-num pl-code">{`stratum+tcp://${host}:${chain.stratumPort}`}</code>
          ) : (
            <span className="pl-warn">
              Not derivable from this address. The port is{' '}
              <code className="cf-num">{chain.stratumPort}</code>; ask an operator which hostname
              carries it.
            </span>
          )}
        </dd>

        <dt className="pl-kv__key">Transport</dt>
        <dd className="pl-kv__val">
          Plain TCP. <strong>There is no TLS on this port.</strong> Your worker name and your shares
          cross the network in the clear, and the HTTPS you are reading this over is a different port
          and a different protocol.
        </dd>

        <dt className="pl-kv__key">Algorithm</dt>
        <dd className="pl-kv__val">
          <code className="cf-num">{chain.algorithm}</code>
        </dd>

        <dt className="pl-kv__key">Username</dt>
        <dd className="pl-kv__val">
          {/*
            The convention is `<account>.<worker>`, split on the FIRST dot — `parseWorkerName`,
            pool/src/session.ts. A username with no dot is an account with one unnamed worker, which
            is an ordinary configuration rather than a mistake, so it is offered here as a real
            option rather than mentioned as a caveat.
          */}
          <code className="cf-num pl-code">&lt;your-address&gt;.&lt;worker&gt;</code> — split on the
          first dot. A name with no dot is an account with one unnamed worker, which is fine.
        </dd>

        <dt className="pl-kv__key">Password</dt>
        <dd className="pl-kv__val">
          Anything. Hardware sends <code className="cf-num">x</code> by default. The pool never reads
          it, never stores it and never logs it.
        </dd>
      </dl>

      <pre className="pl-pre">
        <code>
          {host
            ? `cgminer -o stratum+tcp://${host}:${chain.stratumPort} -u <your-address>.rig1 -p x`
            : `cgminer -o stratum+tcp://<ask-an-operator>:${chain.stratumPort} -u <your-address>.rig1 -p x`}
        </code>
      </pre>

      {!chain.ready && (
        <p className="pl-note pl-note--warn" role="status">
          <span className="pl-note__icon" aria-hidden="true">
            ▲
          </span>
          <span>
            This chain cannot hand out work right now — the pool has no current block template for
            it, or the one it has is stale. A miner that connects will authorise and then sit idle.
          </span>
        </p>
      )}
    </div>
  )
}

/** One chain's live numbers. Every figure here is work; none of it is money. */
function ChainPanel({ chain }: { chain: PoolChainStatus }) {
  return (
    <div className="pl-card">
      <h3 className="pl-h3">
        {chain.name} <span className="pl-dim">({chain.chain})</span>
      </h3>
      <p className="pl-status">
        {/*
          Icon, word and colour — never colour alone. tokens.css records that the reserved status
          hues measure close enough together under protanopia that a bare coloured dot conveys
          nothing to a large minority of readers, and this is a line somebody checks under stress.
        */}
        <span className={`cf-status ${chain.ready ? 'cf-status--good' : 'cf-status--warn'}`}>
          <span className="cf-status__glyph" aria-hidden="true">
            {chain.ready ? '●' : '▲'}
          </span>
          {chain.ready ? 'Serving work' : 'No usable template'}
        </span>
      </p>
      <dl className="pl-kv">
        <dt className="pl-kv__key">Pool hashrate</dt>
        <dd className="pl-kv__val cf-num">{formatHashrate(chain.hashrateEstimate)}</dd>

        <dt className="pl-kv__key">Workers</dt>
        <dd className="pl-kv__val cf-num">{formatCount(chain.workersInWindow)}</dd>

        <dt className="pl-kv__key">Connections</dt>
        <dd className="pl-kv__val cf-num">{formatCount(chain.connections)}</dd>

        <dt className="pl-kv__key">Shares in window</dt>
        <dd className="pl-kv__val cf-num">{formatCount(chain.sharesInWindow)}</dd>

        <dt className="pl-kv__key">Chain height</dt>
        <dd className="pl-kv__val cf-num">
          {chain.height === null ? 'unknown' : formatCount(chain.height)}
        </dd>

        <dt className="pl-kv__key">Network difficulty</dt>
        <dd className="pl-kv__val cf-num">{formatDifficulty(chain.networkDifficulty)}</dd>
      </dl>
    </div>
  )
}
