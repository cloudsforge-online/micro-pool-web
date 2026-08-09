/**
 * Every block this pool has submitted, and what the node said about it.
 *
 * ── The rejections are shown, and that is the reason this page exists ─────────────────────────
 *
 * `submitStatus` is the node's verdict — `accepted` or `rejected` today (`pool/src/blocks.ts`) —
 * and micro-pool calls a rejected submission "the single most useful diagnostic this service can
 * publish". A pool that displayed only its accepted blocks would be hiding the one failure its
 * miners must know about: work was done, a solution was found, and the network threw it away. So
 * both are in one table, in one order, with the node's own detail string beside the verdict.
 *
 * ── The reward column is an amount, and it is nobody's ────────────────────────────────────────
 *
 * `reward` is the block reward in the chain's smallest unit, sent AS A STRING so a satoshi value
 * does not pass through a JSON number. It is rendered because it is a fact about the block, and it
 * is captioned as belonging to the pool's own address, because on a page listing blocks the reflex
 * is to read any number in the row as one's own share of it. There is no per-miner column here and
 * there is no total, because no miner has a claim this service can settle.
 */
import { useState } from 'react'
import { Empty, Failed, Loading } from '../components/states.tsx'
import { formatAgo, formatAmount, formatCount, formatDifficulty, shortHash } from '../lib/format.ts'
import { apiBase } from '../lib/hosts.ts'
import { fetchBlocks, type PoolBlocks } from '../lib/pool.ts'
import { lengthOf, useResource } from '../lib/resource.ts'
import { defaultChain, minedChains, usePoolStatus } from '../lib/status.tsx'

export function BlocksPage() {
  const { chains } = usePoolStatus()
  const [chosen, setChosen] = useState<string | null>(null)
  // THE ONE PAGE WHOSE CHAIN LIST IS THE MINED SET RATHER THAN THE SERVED SET. A merge-mined
  // Dogecoin block is a block this pool found — with a hash, a reward and a maturity countdown —
  // and it is the only kind of record an aux chain has. Leaving it off this page would mean the
  // pool could win DOGE that no reader could ever see. The default stays the parent.
  const mined = minedChains(chains)
  const chain = chosen ?? defaultChain(chains)
  const base = apiBase()
  /** The chain whose work won these blocks, when the selected one is merge-mined. Null otherwise. */
  const parentOf = (selected: string | null) =>
    chains.find((c) => c.merged !== null && c.merged.chain === selected) ?? null

  const blocks = useResource<PoolBlocks>(
    (signal) => {
      // The resource hook runs its loader unconditionally, and there is nothing to ask for until the
      // chain list has arrived. A rejected promise here would render `Failed`, which would report a
      // pool outage during the first few hundred milliseconds of every visit.
      if (!chain) return Promise.resolve({ chain: '', asset: '', decimals: 0, payoutsImplemented: false, blocks: [] })
      return fetchBlocks(base, chain, { signal })
    },
    (data) => lengthOf(data?.blocks),
    'Could not read this pool’s blocks.',
    [base, chain],
  )

  return (
    <div className="pl-page">
      <h1 className="pl-title">Blocks found</h1>
      <p className="pl-lede">
        Every block this pool has submitted to a node, accepted or not. A rejection means the work
        was done and the network did not take it, which is worth seeing.
      </p>

      {mined.length > 1 && (
        <p className="pl-chainpick">
          <label className="pl-chainpick__label" htmlFor="pl-blocks-chain">
            Chain
          </label>{' '}
          <select
            id="pl-blocks-chain"
            className="cf-select cf-select--mono"
            value={chain ?? ''}
            onChange={(event) => setChosen(event.target.value)}
          >
            {mined.map((c) => (
              <option key={c.chain} value={c.chain}>
                {/*
                  The word "merged" is in the option rather than only in a caption underneath,
                  because the selector is what a reader acts on and an unlabelled `Dogecoin (doge)`
                  beside `Litecoin (ltc)` says this pool has two stratum ports. It has one.
                */}
                {c.name} ({c.chain}){c.merged ? ' — merged' : ''}
              </option>
            ))}
          </select>
        </p>
      )}

      {/*
        The caption for the state a reader is most likely to misread: a table of Dogecoin blocks on
        a pool that has no Dogecoin port. Rendered from the SELECTION rather than from the response,
        so it is on screen while the request is still in flight and cannot flicker in after the
        rows.
      */}
      {parentOf(chain) && (
        <p className="pl-hint">
          These were found by <strong>merged mining</strong>: the work was {parentOf(chain)?.name}{' '}
          work, and each block here was solved by the same share that had a chance at a{' '}
          {parentOf(chain)?.name} one. There is no separate miner, no separate hashrate and no share
          history of its own — the shares are all on {parentOf(chain)?.name}.
        </p>
      )}

      {blocks.state === 'loading' && <Loading />}
      {blocks.state === 'failed' && blocks.error && (
        <Failed notice={blocks.error} onRetry={blocks.reload} />
      )}
      {blocks.state === 'empty' && (
        <Empty
          title="This pool has never found a block."
          hint={
            // The normal state, said as the normal state. A pool with no hashrate pointed at it
            // finds nothing, and that is arithmetic rather than a fault. See the header of
            // src/lib/resource.ts.
            'That is what a pool with no miners looks like. Blocks appear here the moment one is ' +
            'submitted, including the ones the node refuses.'
          }
        />
      )}
      {blocks.state === 'ok' && blocks.data && <BlockTable found={blocks.data} />}
    </div>
  )
}

/**
 * How each maturity verdict is drawn. Icon AND word AND colour, never colour alone.
 *
 * `pending` is deliberately neutral rather than a warning: every block is pending for its first
 * four hours, so an amber row for the ordinary state would train a reader to ignore the column
 * before the one row that matters appears in it. An unrecognised status — the service is free to
 * grow one — falls through to a warning and is printed verbatim, which is the safe direction.
 */
const MATURITY_TONE: Readonly<Record<string, string>> = {
  matured: 'cf-status--good',
  // The bare `.cf-status`, which the design system draws in the neutral surface colours. There is
  // no `--info` modifier and this does not want one.
  pending: '',
  orphaned: 'cf-status--critical',
}

const MATURITY_GLYPH: Readonly<Record<string, string>> = {
  matured: '●',
  pending: '◌',
  orphaned: '■',
}

/**
 * The table itself, taking the response as a prop.
 *
 * Split out rather than inlined because a `blocks.data &&` narrowing does not survive into the
 * `.map` callback below, and the alternative is a non-null assertion in the one place where an
 * absent response is genuinely possible. A prop is the honest form of the same claim.
 */
function BlockTable({ found }: { found: PoolBlocks }) {
  return (
    <>
      {/*
        `/v1/pool/blocks` carries its OWN `payoutsImplemented`, which is why this reads it from the
        response beside the rewards rather than from the shared provider: the caption is about the
        numbers in this table, and it is answered by the same request that produced them. It cannot
        disagree with them even for the moment a deploy is rolling.
      */}
      <p className="pl-hint">
        Rewards are the whole coinbase, paid to an address this pool controls.{' '}
        {!found.payoutsImplemented &&
          'They are not a balance and no part of them has been divided or sent to anybody.'}
      </p>
      <table className="pl-table">
        <caption className="cf-sr">Blocks this pool has submitted</caption>
        <thead>
          <tr>
            <th scope="col">Height</th>
            <th scope="col">Found</th>
            <th scope="col">Verdict</th>
            {/*
              TWO VERDICT COLUMNS, BECAUSE THEY ARE TWO DIFFERENT ANSWERS FROM THE SAME NODE.

              `submitStatus` is what it said when the block was handed to it; `maturityStatus` is
              what it says now. A block accepted onto the tip can still lose a reorg well inside the
              coinbase maturity window, and its coinbase is then spendable by nobody. Collapsing the
              two into one cell would let a table go on reporting `accepted` for a block that no
              longer exists.
            */}
            <th scope="col">Maturity</th>
            <th scope="col">Hash</th>
            <th scope="col">Reward ({found.asset})</th>
            <th scope="col">Network difficulty</th>
          </tr>
        </thead>
        <tbody>
          {found.blocks.map((block) => (
            <tr key={block.hash}>
              <th scope="row" className="cf-num">
                {formatCount(block.height)}
              </th>
              <td className="cf-num" title={block.foundAt}>
                {formatAgo(block.foundAt)}
              </td>
              <td>
                <span
                  className={`cf-status ${
                    block.submitStatus === 'accepted' ? 'cf-status--good' : 'cf-status--critical'
                  }`}
                >
                  <span className="cf-status__glyph" aria-hidden="true">
                    {block.submitStatus === 'accepted' ? '●' : '■'}
                  </span>
                  {block.submitStatus}
                </span>
                {/*
                  The node's own words, not a translation of them. A rejection reason is the thing an
                  operator greps for, and paraphrasing it would break that.
                */}
                {block.submitDetail && <span className="pl-dim pl-detail"> {block.submitDetail}</span>}
              </td>
              <td>
                <span className={`cf-status ${MATURITY_TONE[block.maturityStatus] ?? 'cf-status--warn'}`}>
                  <span className="cf-status__glyph" aria-hidden="true">
                    {MATURITY_GLYPH[block.maturityStatus] ?? '▲'}
                  </span>
                  {block.maturityStatus}
                </span>
                {/*
                  The count beside the word, because "pending" alone does not say whether it is four
                  minutes or four hours from being settled. Null is rendered as "not checked" and
                  NEVER as 0: zero confirmations means the node does not have the block, and the two
                  readings send an operator to opposite conclusions.
                */}
                <span className="pl-dim pl-detail">
                  {' '}
                  {block.confirmations === null
                    ? 'not checked yet'
                    : `${formatCount(block.confirmations)} conf`}
                </span>
              </td>
              <td className="cf-num" title={block.hash}>
                {shortHash(block.hash)}
              </td>
              <td className="cf-num">{formatAmount(block.reward, found.decimals)}</td>
              <td className="cf-num">{formatDifficulty(block.networkDifficulty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
