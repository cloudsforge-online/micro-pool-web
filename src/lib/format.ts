/**
 * Numbers and phrases, formatted in one place.
 *
 * The phrases are here for the same reason the numbers are: this site makes one claim it must make
 * identically everywhere, and six paraphrases of "nothing settles" scattered across four pages is
 * how one of them softens into "not yet" and then into nothing at all.
 */

/**
 * THE SENTENCE. Declared once, rendered wherever the subject comes up.
 *
 * Present tense and no future tense anywhere in it. "Payouts are not implemented yet" and "payouts
 * are coming soon" both describe a schedule that does not exist: `pool/src/payouts.ts` is types and
 * a function that throws, there is deliberately no payouts table, and four separate product
 * questions (the fee, the asset, the minimum, coinbase maturity) are open in the specification and
 * are answered by a person rather than by code. There is no date to imply.
 */
export const NOT_PAID_HEADLINE = 'This pool does not pay out.'

/** The whole of it, in the words the service's own README and source use. */
export const NOT_PAID_DETAIL =
  'Shares are recorded and PPLNS-weighted, and when a block is found the pool works out what each ' +
  'miner is owed. Nothing settles that debt: there is no ledger credit, no balance and no payment ' +
  'mechanism of any kind. Hashrate pointed here earns nothing today.'

/**
 * The two absences that are CONDITIONAL, named once so the list and the filter cannot drift.
 *
 * Everything else in `NOT_IMPLEMENTED` is a property of the protocol or of the deployment that no
 * response could contradict. These two are facts the service reports, so the page that renders the
 * list branches on the API rather than on a constant — and a filter matching a string literal that
 * somebody later edits here would fail open, leaving a stale absence on screen beside the live
 * panel that contradicts it.
 */
export const ABSENCE_PAYOUTS = 'Payouts'
export const ABSENCE_DOGECOIN = 'Dogecoin as a chain of its own'

/** What is NOT here, said plainly rather than left to be discovered. See `pool/README.md`. */
export const NOT_IMPLEMENTED: readonly { readonly what: string; readonly instead: string }[] = [
  {
    what: ABSENCE_PAYOUTS,
    instead:
      'Shares and blocks are recorded. Nothing credits a ledger or moves a balance, and there is ' +
      'no payouts table to fill in later.',
  },
  {
    // Shown only while no chain reports a `merged` object — the pool CAN merge-mine Dogecoin now,
    // and the last sentence would be false on a deployment where an operator has configured it.
    // `mine.tsx` drops this entry the moment the API says otherwise.
    what: ABSENCE_DOGECOIN,
    instead:
      'Refused by name, not missing. There is no Dogecoin stratum port here and there never will ' +
      'be: DOGE is merge-mined with Litecoin through AuxPoW, so it is a second thing Litecoin work ' +
      'is worth rather than a chain to point a miner at. This deployment has no aux chain ' +
      'configured, so nothing is being merge-mined on it.',
  },
  {
    what: 'Stratum v2',
    instead: 'Stratum v1 only. It is what the firmware on deployed hardware speaks.',
  },
  {
    what: 'TLS on the stratum port',
    instead:
      'The stratum ports are plain TCP. Your worker name and your shares cross the network in the ' +
      'clear. The HTTPS you are reading this over is a different port and a different protocol.',
  },
  {
    what: 'Solo mining and PPS',
    instead: 'PPLNS only. There is no solo mode and no pay-per-share mode.',
  },
]

/**
 * Why a configured merged chain is not being merged, as a sentence a miner can act on.
 *
 * ── ONE WORD IS NOT AN EXPLANATION, AND THIS IS THE PAGE THAT OWES ONE ────────────────────────
 *
 * micro-pool reports `syncing`, `no-peers`, `refused` or `unreachable`, which are precise and mean
 * nothing to somebody who has just been told they are not earning an asset. Each is expanded here
 * into what is actually true of the pool and, where it exists, how long it lasts — because the
 * difference between "wait" and "tell an operator" is the whole value of publishing the reason.
 *
 * An unrecognised word is rendered VERBATIM inside a sentence rather than swallowed. The service is
 * free to grow a fifth reason, and a page that dropped it would go back to reporting the state this
 * whole field exists to make visible: not committing, no reason given.
 */
export function mergedUnavailability(reason: string | null, name: string): string {
  switch (reason) {
    case 'syncing':
      return `The ${name} node is still downloading its chain. Until it has caught up it will not hand out work to merge, and it does not know how long that will take.`
    case 'no-peers':
      return `The ${name} node has no peers. It is running, but a block found against the work it would give is a block nobody could be told about.`
    case 'refused':
      return `The ${name} node refused to give the pool work to merge. It is reachable and it is answering — this needs an operator rather than time.`
    case 'unreachable':
      return `The pool cannot reach the ${name} node at all. This needs an operator rather than time.`
    case null:
      return `The pool did not say why, which is itself worth reporting to an operator.`
    default:
      return `The pool gave the reason “${reason}”, which this page does not have a longer explanation for.`
  }
}

/**
 * Hashes per second, with a unit.
 *
 * Binary-adjacent prefixes are wrong here and decimal ones are right: mining hardware is sold and
 * spoken about in TH/s meaning 10^12, never 2^40, and a site that quietly used the other one would
 * report every rig about 10% slow.
 */
const HASHRATE_UNITS = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'] as const

export function formatHashrate(hashesPerSecond: number): string {
  if (!Number.isFinite(hashesPerSecond) || hashesPerSecond <= 0) return '0 H/s'
  let value = hashesPerSecond
  let unit = 0
  while (value >= 1000 && unit < HASHRATE_UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${HASHRATE_UNITS[unit]}`
}

/**
 * A difficulty, which spans about fifteen orders of magnitude across the two chains this pool
 * mines, so it gets a suffix rather than fifteen digits.
 */
export function formatDifficulty(difficulty: number | null): string {
  if (difficulty === null || !Number.isFinite(difficulty)) return 'unknown'
  if (difficulty < 1000) return difficulty.toFixed(difficulty < 10 ? 2 : 0)
  const units = ['', 'K', 'M', 'G', 'T', 'P', 'E'] as const
  let value = difficulty
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)}${units[unit]}`
}

/**
 * The pool fee as a percentage.
 *
 * `POOL_FEE_BASIS_POINTS` is REQUIRED with no default anywhere in micro-pool, and its `env.ts`
 * refuses to start without it, because §7.1 of the multi-chain specification records that the fee
 * has not been chosen and "a default of 0 would be choosing free and a default of 200 would be
 * choosing 2%". So the number this renders is whatever a person typed into the deploy, and this
 * function never supplies one of its own — an absent or nonsensical value reads as unknown rather
 * than as zero. A fee shown as 0% that is actually unset is the same class of lie as a balance
 * shown as 0 that is actually unpayable.
 */
export function formatFee(basisPoints: number | null | undefined): string {
  if (typeof basisPoints !== 'number' || !Number.isFinite(basisPoints) || basisPoints < 0) {
    return 'not stated'
  }
  const percent = basisPoints / 100
  return `${percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(2)}%`
}

/**
 * A smallest-unit integer amount, as text, rendered with its decimal point.
 *
 * The input is a STRING and stays one. `micro-pool` sends block rewards as text precisely so that
 * a 64-bit satoshi value does not pass through a JSON number, and parsing it here with `Number()`
 * would reintroduce exactly the loss the service went out of its way to avoid — silently, and only
 * on the largest values, which are the ones worth being right about.
 */
export function formatAmount(smallestUnits: string, decimals: number): string {
  if (!/^-?\d+$/.test(smallestUnits)) return smallestUnits
  const negative = smallestUnits.startsWith('-')
  const digits = negative ? smallestUnits.slice(1) : smallestUnits
  if (decimals <= 0) return `${negative ? '-' : ''}${digits}`
  const padded = digits.padStart(decimals + 1, '0')
  const whole = padded.slice(0, padded.length - decimals)
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** A whole number with thousands separators, in the page's locale-independent form. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-GB') : '—'
}

/**
 * A timestamp as "how long ago", with the absolute value available as a title.
 *
 * Relative is what a reader of this site actually wants — "is my rig still hashing" is a question
 * about the last two minutes — and the absolute form is kept beside it because a relative time
 * with no anchor is unreconcilable against a miner's own log, which is the one thing this site
 * exists to make possible.
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return 'unknown'
  const seconds = Math.round((now - then) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** A window in seconds, said in words. Used to caption every rate on the site. */
export function formatWindow(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'an unknown window'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`
  if (seconds % 60 === 0) return `${seconds / 60} minutes`
  return `${seconds} seconds`
}

/** A long hash, shortened for a table but never for a link's own text content. */
export function shortHash(hash: string): string {
  return hash.length <= 20 ? hash : `${hash.slice(0, 10)}…${hash.slice(-8)}`
}
