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
import { defaultChain, usePoolStatus } from '../lib/status.tsx'

export function BlocksPage() {
  const { chains } = usePoolStatus()
  const [chosen, setChosen] = useState<string | null>(null)
  const chain = chosen ?? defaultChain(chains)
  const base = apiBase()

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

      {chains.length > 1 && (
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
            {chains.map((c) => (
              <option key={c.chain} value={c.chain}>
                {c.name} ({c.chain})
              </option>
            ))}
          </select>
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
