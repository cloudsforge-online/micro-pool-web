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
  ABSENCE_DOGECOIN,
  ABSENCE_PAYOUTS,
  formatCount,
  formatDifficulty,
  formatFee,
  formatHashrate,
  formatWindow,
  mergedUnavailability,
  NOT_IMPLEMENTED,
} from '../lib/format.ts'
import type { MergedChainStatus, PoolChainStatus } from '../lib/pool.ts'
import { defaultChain, usePoolStatus } from '../lib/status.tsx'

export function MinePage() {
  const { resource, chains, payoutsImplemented } = usePoolStatus()
  const status = resource.data
  const [chosen, setChosen] = useState<string | null>(null)
  const chain = chains.find((c) => c.chain === (chosen ?? defaultChain(chains))) ?? null
  // Whether this deployment merge-mines anything AT ALL, which is a different question from whether
  // it is succeeding at it. Configured-and-broken still means the absences list must not say the
  // pool cannot do it — the panel below says what is actually happening, in the state it is in.
  const mergesSomething = chains.some((c) => c.merged !== null)

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

        TWO ENTRIES ARE FILTERED OUT WHEN THE SERVICE CONTRADICTS THEM, and the rest are properties
        of the protocol and of the deployment that no response could contradict.

        `Payouts` goes the moment the service reports payouts implemented, rather than surviving as
        a stale paragraph on a page whose headline notice has already gone.

        `Dogecoin as a chain of its own` goes the moment ANY chain reports a `merged` object — not
        when one reports `committed: true`. The entry's claim is that this deployment merge-mines
        nothing, and a configured aux chain whose node is still syncing makes that false while the
        panel below is already explaining the real state. Leaving both on screen would have the page
        deny a thing it is simultaneously reporting on.
      */}
      <section className="pl-section" aria-labelledby="pl-absent">
        <h2 className="pl-h2" id="pl-absent">
          What this pool does not do
        </h2>
        <dl className="pl-deflist">
          {NOT_IMPLEMENTED.filter(
            (item) =>
              !(payoutsImplemented && item.what === ABSENCE_PAYOUTS) &&
              !(mergesSomething && item.what === ABSENCE_DOGECOIN),
          ).map((item) => (
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
 * The block a miner copies into their firmware — or the sentence that says there is not one.
 *
 * ── THE ENDPOINT IS READ OFF THE API AND IS FREQUENTLY ABSENT ─────────────────────────────────
 *
 * This card used to compose `stratum+tcp://<this page's hostname>:<the port the API reported>` and
 * that was wrong in production, not merely unverified. Stratum v1 is line-delimited JSON-RPC over
 * RAW TCP; this page arrives through a Cloudflare Tunnel and then Traefik, and neither forwards a
 * raw TCP stream, so the hostname a reader is looking at is provably not where the stratum port is.
 * The port it printed was the one micro-pool BINDS, which is the inside of a port mapping and is on
 * loopback by default. The result was a copy-pasteable command that no miner could connect with —
 * and its owner would spend an evening on their hardware before suspecting this page.
 * micro-org#285.
 *
 * So `chain.stratumEndpoint` is the whole of it: both halves, published by an operator who knows
 * the port is genuinely reachable at that name, or `null`. When it is null this card renders a
 * NAMED HOLE — what is missing, who can fix it, and no connection string of any kind, not even a
 * partial one with a placeholder in it. A `<ask-an-operator>` in a command is still a command
 * somebody edits and runs, and the bind port beside it would be a wrong number presented as a fact
 * they can act on.
 */
function ConnectCard({ chain }: { chain: PoolChainStatus }) {
  const endpoint = chain.stratumEndpoint

  return (
    <div className="pl-card">
      <h3 className="pl-h3">
        {chain.name} <span className="pl-dim">({chain.chain})</span>
      </h3>

      <dl className="pl-kv">
        <dt className="pl-kv__key">Address</dt>
        <dd className="pl-kv__val">
          {endpoint ? (
            <code className="cf-num pl-code">{`stratum+tcp://${endpoint.host}:${endpoint.port}`}</code>
          ) : (
            <span className="pl-warn">
              No stratum endpoint has been published for this pool. That is a deliberate answer
              rather than a fault: the address you are reading this on carries HTTPS through a
              tunnel, which cannot carry a mining connection, so this page will not guess a
              hostname or a port for you. Ask an operator for the address and the port before you
              configure anything.
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

        {/*
          THE MERGED CHAIN IS MENTIONED HERE BECAUSE IT CHANGES NOTHING A MINER TYPES.

          That is the whole point and it is the thing most easily misread. There is no second
          address, no second port, no second worker and no extra hashrate: the pool commits the
          Dogecoin header into the Litecoin coinbase, so a miner already pointed here is already
          merge-mining. A reader who was told about DOGE and then given no configuration for it will
          otherwise go looking for the part they missed.

          `committed` is stated in the same breath, because "you are also mining DOGE" and "you would
          also be mining DOGE if its node were up" are different sentences and only one of them is
          true at a time.
        */}
        {chain.merged && (
          <>
            <dt className="pl-kv__key">Also mining</dt>
            <dd className="pl-kv__val">
              {chain.merged.name} ({chain.merged.asset}), merged into this chain&rsquo;s work.{' '}
              <strong>Nothing to configure</strong> — no second address, no second port, and no extra
              hashrate. Solving a {chain.name} block here can solve a {chain.merged.name} one at the
              same instant.{' '}
              {chain.merged.committed
                ? 'The work you are being handed right now carries it.'
                : `It is not happening at the moment: ${mergedUnavailability(chain.merged.unavailability, chain.merged.name)}`}
            </dd>
          </>
        )}

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

      {/*
        THERE IS NO COMMAND WHEN THERE IS NO ENDPOINT.

        Not a command with a placeholder in it, which is what this used to render: a `<pre>` is the
        one thing on a page that a reader copies without finishing it, and a command that cannot
        connect is the most expensive way to be wrong here.
      */}
      {endpoint && (
        <pre className="pl-pre">
          <code>
            {`cgminer -o stratum+tcp://${endpoint.host}:${endpoint.port} -u <your-address>.rig1 -p x`}
          </code>
        </pre>
      )}

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

      {chain.merged && <MergedPanel merged={chain.merged} parent={chain} />}
    </div>
  )
}

/**
 * The second chain this one's work is worth, and whether that is currently true.
 *
 * ── THE THREE STATES ARE RENDERED AS THREE, AND THE MIDDLE ONE IS WHY THIS EXISTS ─────────────
 *
 * This component is only mounted when `merged` is non-null, so it renders the second and third
 * states: configured-and-committing, and configured-and-not. Nothing distinguishes them in any
 * other number on this page — a pool whose dogecoind is in initial block download mines Litecoin
 * exactly as well as one whose dogecoind is healthy, reports the same hashrate, the same shares and
 * the same workers, and simply stops being worth DOGE. `micro-pool`'s own README calls that failing
 * by absence, and a panel that showed "mining DOGE" for the middle state would be telling a miner
 * they are earning an asset they are not.
 *
 * The height and difficulty are shown ONLY while it is committing. They come from the aux block the
 * pool is currently building on, and a stale pair beside a node that has stopped answering is worse
 * than no pair — it is a screen that looks live.
 */
function MergedPanel({ merged, parent }: { merged: MergedChainStatus; parent: PoolChainStatus }) {
  return (
    <div className="pl-merged">
      <h4 className="pl-h4">
        Merged: {merged.name} <span className="pl-dim">({merged.chain})</span>
      </h4>
      <p className="pl-status">
        {/* Icon, word and colour — never colour alone, for the reason tokens.css records above. */}
        <span className={`cf-status ${merged.committed ? 'cf-status--good' : 'cf-status--warn'}`}>
          <span className="cf-status__glyph" aria-hidden="true">
            {merged.committed ? '●' : '▲'}
          </span>
          {merged.committed
            ? `Committed into ${parent.name} work`
            : `Configured, not being mined`}
        </span>
      </p>

      {merged.committed ? (
        <dl className="pl-kv">
          <dt className="pl-kv__key">{merged.name} height</dt>
          <dd className="pl-kv__val cf-num">
            {merged.height === null ? 'unknown' : formatCount(merged.height)}
          </dd>

          <dt className="pl-kv__key">{merged.name} difficulty</dt>
          <dd className="pl-kv__val cf-num">
            {formatDifficulty(merged.networkDifficulty)}
            {/*
              Said beside the number rather than left to be inferred. It is the aux chain's target
              expressed against the PARENT'S proof of work, which is the only unit it means anything
              in — the two numbers on this card are directly comparable, and their ratio is how much
              rarer an aux block is for the same hashing. A reader who compared it against a figure
              from a Dogecoin explorer would be comparing two different measurements.
            */}
            <span className="pl-dim"> · measured on {parent.algorithm}, like the one above</span>
          </dd>
        </dl>
      ) : (
        <p className="pl-note pl-note--warn" role="status">
          <span className="pl-note__icon" aria-hidden="true">
            ▲
          </span>
          <span>
            {mergedUnavailability(merged.unavailability, merged.name)} {parent.name} mining is
            unaffected — every number on this card is still true, and this is the one thing that is
            not happening.
          </span>
        </p>
      )}
    </div>
  )
}
