/**
 * A miner's own record: the workers seen under one account, and the shares behind them.
 *
 * ── Why this is its own address rather than a tab on the landing page ─────────────────────────
 *
 * §6 of `docs/ecosystem/36-multi-chain-and-mining-pool.md` makes a checkable share history a
 * product requirement: a miner has to be able to reconcile what this pool says it credited against
 * what their own machine says it submitted. A thing you reconcile is a thing you bookmark, paste
 * into a support conversation and come back to — so it has an address, and the account and the
 * chain are both path segments rather than component state.
 *
 * ── There is no balance on this page, and there is no room for one ────────────────────────────
 *
 * The columns are work: difficulty credited, difficulty achieved, shares, hashrate. There is
 * deliberately no "estimated earnings", no "unpaid", no "next payout" and no total-at-the-bottom of
 * anything denominated in money — not zeroed and not greyed out. `test/honesty.test.ts` renders
 * this page with a full share history stubbed in and fails on any of those words.
 *
 * ── Anybody may look up anybody ───────────────────────────────────────────────────────────────
 *
 * `account` is a query parameter on micro-pool's read API and not an authenticated subject. That is
 * the same posture as every public pool and as a block explorer, and it is the only posture
 * available: the sole identity a miner has here is the username they typed into their own firmware.
 * Gating this behind an estate login would make it checkable by nobody.
 */
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Empty, Failed, Loading } from '../components/states.tsx'
import { apiBase } from '../lib/hosts.ts'
import { formatAgo, formatCount, formatDifficulty, formatHashrate, formatWindow } from '../lib/format.ts'
import {
  accountOf,
  accountProblem,
  fetchShares,
  fetchWorkers,
  type PoolShares,
  type PoolWorkers,
} from '../lib/pool.ts'
import { workerPath } from '../lib/routes.ts'
import { defaultChain, usePoolStatus } from '../lib/status.tsx'
import { lengthOf, useResource } from '../lib/resource.ts'

export function WorkersPage() {
  const { chain, account } = useParams()
  return (
    <div className="pl-page">
      <h1 className="pl-title">Workers and shares</h1>
      <LookupForm chain={chain ?? null} account={account ?? null} />
      {chain && account && <WorkerRecord chain={chain} account={account} />}
    </div>
  )
}

/**
 * The lookup box.
 *
 * It accepts a WHOLE stratum username and splits it, because the string a reader has to hand is the
 * one in their miner's configuration — `ltc1q….rig1` — and asking them to delete the part after the
 * dot is asking them to do the parsing micro-pool already does on the first dot. The lookup is by
 * account, so pasting the whole thing shows every rig rather than a 400.
 */
function LookupForm({ chain, account }: { chain: string | null; account: string | null }) {
  const { chains } = usePoolStatus()
  const navigate = useNavigate()
  const [typed, setTyped] = useState(account ?? '')
  const [chosen, setChosen] = useState(chain ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const target = chosen || defaultChain(chains) || ''

  function submit(event: FormEvent) {
    event.preventDefault()
    const asked = accountOf(typed)
    // Checked HERE as well as by the service, and the reason is which failure the reader sees. A
    // string the pool could never have stored produces a 400 from `accountParam`, and a 400 in a
    // panel reads as "the pool is broken" rather than "that is not a name". The service refuses it
    // for the mirror-image reason: so it does not become a query that returns nothing, which reads
    // as "the pool lost my work".
    const why = accountProblem(asked)
    if (why) {
      setProblem(why)
      return
    }
    if (!target) {
      setProblem('This pool is not serving any chain, so there is nothing to look shares up in.')
      return
    }
    setProblem(null)
    navigate(workerPath(target, asked))
  }

  return (
    <form className="pl-form" onSubmit={submit}>
      <p className="pl-form__row">
        <label className="pl-form__label" htmlFor="pl-account">
          Mining address or full stratum username
        </label>
        <input
          id="pl-account"
          className="cf-input cf-input--mono"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="ltc1q… or ltc1q….rig1"
          autoComplete="off"
          spellCheck={false}
        />
      </p>
      {chains.length > 1 && (
        <p className="pl-form__row">
          <label className="pl-form__label" htmlFor="pl-lookup-chain">
            Chain
          </label>
          <select
            id="pl-lookup-chain"
            className="cf-select cf-select--mono"
            value={target}
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
      <p className="pl-form__row">
        <button type="submit" className="cf-btn cf-btn--ember">
          Show shares
        </button>
      </p>
      {problem && (
        <p className="pl-form__problem" role="alert">
          {problem}
        </p>
      )}
      <p className="pl-hint">
        Anyone can look up any address here. There is no account and no sign-in: the only identity
        this pool has for you is the username your miner authorises with.
      </p>
    </form>
  )
}

function WorkerRecord({ chain, account }: { chain: string; account: string }) {
  const base = apiBase()
  const workers = useResource<PoolWorkers>(
    (signal) => fetchWorkers(base, chain, account, { signal }),
    (data) => lengthOf(data?.workers),
    'Could not read this account’s workers.',
    [base, chain, account],
  )
  const shares = useResource<PoolShares>(
    (signal) => fetchShares(base, chain, account, { signal }),
    (data) => lengthOf(data?.shares),
    'Could not read this account’s shares.',
    [base, chain, account],
  )

  return (
    <>
      <section className="pl-section" aria-labelledby="pl-workers">
        <h2 className="pl-h2" id="pl-workers">
          Workers under <code className="cf-num pl-code">{account}</code>
        </h2>
        {workers.state === 'loading' && <Loading />}
        {workers.state === 'failed' && workers.error && (
          <Failed notice={workers.error} onRetry={workers.reload} />
        )}
        {workers.state === 'empty' && (
          <Empty
            title="No worker on this account has been seen in the window."
            hint={
              // Two true things, in the order that matters. The first is far likelier on 2026-08-09
              // than the second, because nothing has ever mined here.
              'Either nothing has connected with this username, or nothing has submitted a share ' +
              'recently enough to be inside the measurement window. A rig that is connected but ' +
              'idle does not appear here.'
            }
          />
        )}
        {workers.state === 'ok' && workers.data && (
          <>
            <p className="pl-hint">
              Rates are measured over the last {formatWindow(workers.data.windowSeconds)}.
            </p>
            <table className="pl-table">
              <caption className="cf-sr">Workers seen under this account</caption>
              <thead>
                <tr>
                  <th scope="col">Worker</th>
                  <th scope="col">Last share</th>
                  <th scope="col">Difficulty</th>
                  <th scope="col">Shares</th>
                  <th scope="col">Hashrate</th>
                </tr>
              </thead>
              <tbody>
                {workers.data.workers.map((worker) => (
                  <tr key={worker.worker}>
                    <th scope="row" className="cf-num">
                      {/*
                        The empty string is a REAL worker name, not a missing value: a miner that
                        authorises as a bare address with no dot produces one (`parseWorkerName`,
                        pool/src/session.ts). Rendering it as a blank cell would look like a defect;
                        naming it says what happened and how to change it.
                      */}
                      {worker.worker === '' ? (
                        <span className="pl-dim">(unnamed)</span>
                      ) : (
                        worker.worker
                      )}
                    </th>
                    <td className="cf-num" title={worker.lastSeenAt}>
                      {formatAgo(worker.lastSeenAt)}
                    </td>
                    <td className="cf-num">{formatDifficulty(worker.difficulty)}</td>
                    <td className="cf-num">{formatCount(worker.sharesInWindow)}</td>
                    <td className="cf-num">{formatHashrate(worker.hashrateEstimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="pl-section" aria-labelledby="pl-shares">
        <h2 className="pl-h2" id="pl-shares">
          Recent shares
        </h2>
        <p className="pl-hint">
          {/*
            BOTH difficulties, side by side, and that pairing is the whole point of the page. The
            credited difficulty is what the pool set for the connection; the achieved difficulty is
            what the submission actually hashed to. A miner reconciling this against their own log
            needs both, because a run of achieved values far above credited is a difficulty that has
            not caught up, and that is a real conversation to be able to have with evidence.
          */}
          Credited is the difficulty this pool set for the connection when the share arrived.
          Achieved is what the share actually hashed to. The two together are what makes this
          checkable against your own miner&rsquo;s log.
        </p>
        {shares.state === 'loading' && <Loading />}
        {shares.state === 'failed' && shares.error && (
          <Failed notice={shares.error} onRetry={shares.reload} />
        )}
        {shares.state === 'empty' && (
          <Empty
            title="No share has been recorded for this account."
            hint="Shares appear here as soon as the pool accepts one. Nothing has been recorded under this username yet."
          />
        )}
        {shares.state === 'ok' && shares.data && (
          <table className="pl-table">
            <caption className="cf-sr">The most recent shares recorded for this account</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Worker</th>
                <th scope="col">Height</th>
                <th scope="col">Credited</th>
                <th scope="col">Achieved</th>
              </tr>
            </thead>
            <tbody>
              {shares.data.shares.map((share) => (
                <tr key={share.id}>
                  <th scope="row" className="cf-num" title={share.createdAt}>
                    {formatAgo(share.createdAt)}
                  </th>
                  <td className="cf-num">
                    {share.worker === '' ? <span className="pl-dim">(unnamed)</span> : share.worker}
                  </td>
                  <td className="cf-num">{formatCount(share.height)}</td>
                  <td className="cf-num">{formatDifficulty(share.creditedDifficulty)}</td>
                  <td className="cf-num">
                    {formatDifficulty(share.achievedDifficulty)}
                    {/*
                      A share that met the NETWORK's difficulty is a block. It is flagged as work,
                      with no amount beside it: which block it was and what the node said about the
                      submission is on the blocks page, and what it was worth to the miner who found
                      it is a question this pool cannot answer at all.
                    */}
                    {share.isBlock && <span className="pl-flag"> — solved a block</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
