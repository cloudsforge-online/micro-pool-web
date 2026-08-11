# micro-pool-web

[![ci](https://github.com/cloudsforge-online/micro-pool-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudsforge-online/micro-pool-web/actions/workflows/ci.yml)
![licence](https://img.shields.io/badge/licence-MIT-97CA00)
![node](https://img.shields.io/badge/node-%3E%3D22-5FA04E?logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![module](https://img.shields.io/badge/module-ESM-F7DF1E?logo=javascript&logoColor=black)
![tests](https://img.shields.io/badge/tests-in--process%20DOM-6E56CF)

The public front for the CloudsForge Stratum v1 mining pool: what to type into a miner, what the
pool is doing right now, every block it has submitted including the rejected ones, and a miner's own
share history. It is a static SPA served by nginx — no Node, no toolchain and no environment in the
image.

> ## **This pool does not pay out. Mining here earns nothing.**
>
> Shares are accepted, credited and PPLNS-weighted, and **nothing settles them**. `pool/src/payouts.ts`
> is a set of types and a `PayoutsNotImplementedError`; there is no payouts table, no sink is ever
> constructed, and four product questions — the fee, the asset paid in, the minimum payout, and how
> coinbase maturity is handled — are open in `docs/ecosystem/36-multi-chain-and-mining-pool.md` and
> are answered by a person, not by code.
>
> So there is **no unpaid balance on this site, no estimated earnings and no next payout** — not
> zeroed, not greyed out. A zero reads as *not yet, but soon*; the truth is *not at all, and there is
> no mechanism*. The statement lives in the shell above the outlet, so there is no address on this
> site a stranger can reach without meeting it, and it is **derived from the service's own
> `payoutsImplemented` flag** rather than from a constant here — so it stops being said the moment it
> stops being true.

---

## Routes this app serves

Three, and each one is separate because it has an address somebody needs to be able to paste
somewhere. `src/lib/routes.ts` is the table; `src/app.tsx` mounts it and `nginx.conf` enumerates it,
and `test/routes.test.ts` reads all three as text and cross-checks them against each other.

| Path | Calls the pool? | What it shows |
| --- | --- | --- |
| `/` | yes | What this is, what it does **not** do, what to type into a miner, and what the pool is doing right now. The connection details come last-but-one on purpose: a page that opens with a stratum URL has asked for hashrate before saying what happens to it. |
| `/workers/:chain/:account` | yes ×2 | A miner's own record — workers seen in the window, then the share history share by share. §6 of the multi-chain specification makes a checkable share history a product requirement, and a thing you reconcile against your own machine is a thing you bookmark. |
| `/blocks` | yes | Every block this pool has submitted and the node's verdict on it, **including the rejections**. micro-pool calls a rejected submission "the single most useful diagnostic this service can publish". |

There is deliberately **no payouts page, no earnings page and no dashboard**. Two of those would
have nothing to render and the third would imply the first two exist. `.github/workflows/ci.yml`
greps for one.

`/workers` with no account renders a form rather than an error. The sitemap lists it; it does
**not** list any `/workers/:chain/:account` beneath it, because a mining address is not something a
crawler should be enumerating and there is no finite set of them to enumerate anyway.

### Everything unknown is a real 404

`try_files $uri /index.html` answers **200** for every address in existence, so a typo in a link
becomes a blank page with a successful status and a crawler indexes every one of them. The routes
above are enumerated as `location` blocks instead, and `error_page 404 /index.html` serves the shell
*under the real status*. `test/routes.test.ts` asserts the fallback is absent, and the container
probe in CI checks that `/payouts`, `/earnings` and `/nope/not/a/route` all answer 404 with the shell
in the body.

---

## What it talks to

`micro-pool`, and nothing else. Four routes, all `GET`, all anonymous — none of them reads a
credential, and this bundle sends none.

| Path | Query | Reads |
| --- | --- | --- |
| `/v1/pool` | — | `network`, `feeBasisPoints`, `pplnsWindowMultiplier`, `payoutsImplemented`, and per chain: `chain`, `name`, `asset`, `decimals`, `algorithm`, `stratumPort`, `stratumEndpoint`, `websocketEndpoint`, `browserMining`, `connections`, `height`, `networkDifficulty`, `templateAgeSeconds`, `ready`, `windowSeconds`, `sharesInWindow`, `workersInWindow`, `hashrateEstimate`, `merged` |
| `/v1/pool/blocks` | `chain`, `limit=25` | `chain`, `asset`, `decimals`, `payoutsImplemented`, and per block: `height`, `hash`, `foundAt`, `reward`, `networkDifficulty`, `submitStatus`, `submitDetail` |
| `/v1/pool/workers` | `chain`, `account` | `chain`, `account`, `windowSeconds`, and per worker: `worker`, `lastSeenAt`, `difficulty`, `sharesInWindow`, `hashrateEstimate` |
| `/v1/pool/shares` | `chain`, `account`, `limit=50` | `chain`, `account`, and per share: `id`, `worker`, `jobId`, `height`, `creditedDifficulty`, `achievedDifficulty`, `isBlock`, `createdAt` |

Every field above was read off `buildRoutes` in `pool/src/server.ts` rather than off a document, and
`test/pool-contract.test.ts` keeps them honest: it reads that file as text from the sibling checkout
and fails if any field this bundle's interfaces name has stopped appearing in it. That is a coarse
check and it is the honest one available across a repository boundary — it cannot prove a type, but
it catches the rename, which is the failure that actually happens. A renamed field typechecks
perfectly here and arrives as `undefined` in a browser: a column of blanks, or on the workers page a
column of `NaN`, which reads as a defect in the pool rather than as one here.

The check **skips** when micro-pool is not checked out beside this repository, so `pnpm test` passes
for somebody who cloned only this one. CI checks it out and **fails the job if the skip happened**.

`/livez`, `/readyz` and `/metrics` are deliberately not called. A browser polling them would report
on whichever process it happened to reach through the gateway, which says nothing about whether the
pool is accepting stratum connections — that is a different process on a different port.

### The eighth route, which this bundle does not call

`POST /v1/pool/ticket` is the only route on micro-pool that reads an `Authorization` header. It
verifies an estate access token and mints the single-use ticket a browser spends on the WebSocket
mining transport (micro-org#289), and the page that spends it is **micro-hub-web's `/mine`**, which
is behind the estate session already. Browser mining is not on this surface: this is the anonymous
pool console, it has no sign-in, no token store and no refresh, and its readers are people without
estate accounts.

That makes "micro-pool takes no credential" a claim that has to be made per route rather than per
service, and `test/pool-contract.test.ts` now makes it that way — it splits `buildRoutes()` into one
block of source per route and fails separately when a route this bundle calls grows an authority
check, and when a credentialled route appears that nobody has decided about.

### Amounts and ids are strings on both sides

`reward` is a block reward in the chain's smallest unit and `id` is a bigint sequence. Neither is
safe in a double — 2^53 satoshis is about 90 million coins — so micro-pool sends both as text
(`block.reward.toString()`, `share.id.toString()`) and they stay text here. `formatAmount` does the
decimal placement on the string.

### Anybody may look up anybody

`account` is a query parameter on micro-pool's read API and not an authenticated subject. That is
the posture of every public pool and of a block explorer, and it is the only posture available: the
sole identity a miner has here is the username they typed into their own firmware. Gating the
workers page behind an estate login would make a share history checkable by nobody.

---

## The chain list is whatever the API reports

`POOL_CHAINS` is per-deployment (`pool/src/env.ts`), and this bundle enumerates no chains at all:
the selector, the default, the algorithm and the connection details all come from `/v1/pool`'s
`chains` array. A single-chain deployment renders as a single chain with **no selector** and no
empty second column.

That is not a hypothetical benefit. This paragraph used to read "today only `ltc` is deployable —
bitcoind is still syncing", and it stopped being true without a line of this repository changing:
bitcoind reached the tip on 2026-08-10, `POOL_CHAINS` has named both chains since 2026-08-11, and
the chain selector appeared on the public console by itself. Read from mainnet on 2026-08-11:

| Chain | Algorithm | Height | `ready` | In a browser? |
| --- | --- | --- | --- | --- |
| `ltc` — Litecoin | scrypt | 3,158,124 | yes | yes, over a WebSocket |
| `btc` — Bitcoin | sha256d | 962,013 | yes | **no** — refused by name, see below |

A hard-coded pair of tabs would have rendered an empty BTC panel for two days and then been wrong
again the day a third chain arrives. `.github/workflows/ci.yml` greps for a hard-coded chain list.

### Bitcoin is refused to browsers, and that is a different fact from an absent endpoint

Two fields answer two questions and collapsing them is the mistake to avoid:

* `websocketEndpoint` — **the operator** has published no browser address for this chain. A
  deployment setting, true today, possibly false next week.
* `browserMining: { available: false, reason }` — **the pool** does not offer this chain to browsers
  at all, as a matter of what the chain is, and no deployment setting changes it. BTC is the case,
  and micro-pool publishes the argument rather than leaving this page to compose one: its network
  runs at about 793 EH/s of purpose-built SHA-256 silicon, so a tab would earn shares this pool
  could never turn into a block. The page prints **the pool's sentence**, because it carries dated
  measurements that age and a paraphrase here would be a second copy that goes stale silently.

### The stratum endpoint is REPORTED, and it used to be guessed

The **stratum port** comes from the API (`stratumPort`), and it is honest about itself and useless
as half of an address: it is the port micro-pool *binds*, the inside of a port mapping, on a
listener bound to loopback by default.

The **address a miner dials** is `stratumEndpoint` — `{ host, port }` or `null`, published together
or not at all. This bundle used to derive the host from `window.location.hostname` and print
`stratum+tcp://pool.<apex>:3334` on a public page. That endpoint **cannot connect**: this console
arrives through a Cloudflare Tunnel and then Traefik, neither of which forwards a raw TCP stream, so
the hostname a reader is looking at is provably not where stratum is. It was the worst available
version of a plausible screen, because its owner debugs their own hardware for an evening instead of
asking a question. micro-org#285; `resolveStratumHost` is deleted and `test/hosts.test.ts` holds the
line.

`null` is the ordinary answer and is the answer on this estate today, on both chains. The page
renders it as a **named hole** — what is missing, who can fix it, and no connection string of any
kind, not even one with a placeholder in it. A `<ask-an-operator>` inside a `<pre>` is still a
command somebody edits and runs.

---

## Stratum is raw TCP, and it is not in this container

Stratum v1 is line-delimited JSON-RPC over **raw TCP** on its own port. It is not HTTP, it cannot be
proxied by an HTTP reverse proxy, and micro-pool does not serve it over TLS at all. The HTTPS front
door this page arrives through and the TCP endpoint a miner dials are two separate pieces of deploy
plumbing that only happen to share a hostname.

This image serves HTTP on 8080 and nothing else. `nginx.conf` has no `stream {}` block and no
`listen 3333`, `.github/workflows/ci.yml` fails the build if either appears, and the page tells the
reader the port is raw TCP rather than letting them assume 443 works.

A wrong hostname in a miner's configuration costs its owner a silent outage they will blame on their
hardware, which is why this bundle no longer composes one — see the section above.

---

## What a miner types, and the two ways in

The landing page is the authority and reads it live; this is the same thing in one place.

**With your own hardware or a CPU miner.** Point it at the `stratumEndpoint` the pool published for
the chain you want — plain TCP, and **there is no TLS on that port**: your worker name and your
shares cross the network in the clear, and the HTTPS you read this console over is a different port
and a different protocol.

```
cgminer -o stratum+tcp://<host>:<port> -u <your-address>.rig1 -p x
```

| Field | Value | Why |
| --- | --- | --- |
| Username | `<your-address>.<worker>` | Split on the **first** dot (`parseWorkerName`, `pool/src/session.ts`). A name with no dot is an account with one unnamed worker, which is an ordinary configuration and not a mistake. |
| Password | anything — hardware sends `x` | Never read, never stored, never logged on this transport. |
| Difficulty | set for you | Per connection, adjusted toward a steady share rate. A rig reporting difficulty 1 has not finished authorising. |

**Your address is a label, not a payee.** The pool stores the username to group your shares. It
does **not** validate it as an address on any chain and nothing will ever be sent to it — a typo is
accepted silently, because there is no payment for it to break. That is the most likely way to
misunderstand this pool, so it is on the page as well as here.

**In a browser tab.** A different transport with a different credential, and **not on this
surface**. It is Stratum over a WebSocket (`websocketEndpoint`), the username is ignored, and the
password field carries a single-use ticket minted by `POST /v1/pool/ticket` against an estate
access token — so work is credited to a pool account the service mints, not to an address you typed.
The page that does it is **micro-hub-web's `/mine`**, behind the estate session. This console is
anonymous, has no sign-in and no token store, and its readers are people without estate accounts.

The difficulty bands differ by design: micro-pool starts a browser connection far lower than a
hardware one, because at Litecoin's hardware floor a single share from a tab is on the order of
tens of hours.

---

## Dogecoin is merge-mined from the Litecoin work

**One share, two chains, no extra hashing** — and nothing for a miner to configure. A Dogecoin block
has no nonce of its own: it is won by finding a *Litecoin* header whose scrypt hash meets Dogecoin's
target, where that Litecoin block's coinbase carries a commitment naming the Dogecoin block being
claimed (AuxPoW; `pool/src/auxpow.ts` and `pool/src/auxtemplate.ts`, and `pool/README.md` has the
long form).

So there is **no second address, no second port, no second worker and no extra hashrate**. A miner
already pointed at Litecoin is already merge-mining, and solving a Litecoin block here can solve a
Dogecoin one at the same instant. This is stated on the connection card precisely *because* it
changes nothing a miner types: a reader who is told about DOGE and then given no configuration for
it goes looking for the part they missed.

It also changes nothing about payouts, which do not exist on either chain. See the top of this file.

`merged` is the field, and its **three** states are rendered as three:

| `merged` | Means | Page shows |
| --- | --- | --- |
| `null` | this deployment merge-mines nothing | nothing at all — silence is the honest answer |
| `{ committed: true, … }` | the jobs in flight right now carry the commitment | "Committed into Litecoin work", plus the aux height and difficulty |
| `{ committed: false, unavailability, … }` | an operator configured it and it is not happening | the reason, expanded into a sentence, and that Litecoin mining is unaffected |

The middle state of that table is why the third exists. `committed` is read off micro-pool's live
**job registry** rather than off its configuration, so it is a statement about work in flight and
not about an intention — and nothing else on screen could tell the difference. A pool whose
dogecoind is in initial block download mines Litecoin exactly as well as one whose dogecoind is
healthy, reports the same hashrate, the same shares and the same workers, and simply stops being
worth DOGE. A panel that showed "mining DOGE" for it would be telling a miner they are earning an
asset they are not.

`unavailability` is micro-pool's own vocabulary — `syncing`, `no-peers`, `refused`, `unreachable` —
and `mergedUnavailability` in `src/lib/format.ts` expands each into what is actually true and, where
it exists, how long it lasts. The difference between "wait" and "tell an operator" is the whole
value of publishing the reason. An unrecognised word is rendered **verbatim inside a sentence**
rather than dropped, so the service growing a fifth reason degrades to showing it.

**On this estate today it is `null` on both chains.** The AuxPoW path is merged in micro-pool and
`POOL_LTC_AUX_CHAINS` is unset, because dogecoind is still in initial block download — a node over a
million blocks behind would hand miners an aux template for a chain nobody else is working on, and
the Dogecoin half of every share would be worth nothing.

---

## Configuration

**None of it is built into the bundle.** No `.env`, no `define`, no `envPrefix`, no
`import.meta.env` and no `VITE_` anything. A build-time constant is an environment baked into an
image, and an image with an environment baked into it has to be rebuilt to be promoted — so the
artefact that reaches production is not the artefact that passed CI.

### `POOL_API_PRESENCE` — the one variable, read by nginx and never by the bundle

Default `present`; the only other value that means anything is `absent`.

It answers a question that comes before `GET /v1/pool`: **is there a micro-pool behind this console
at all.** On a testnet estate there is not. micro-pool sits behind `profiles: ["pool"]` in the
estate's compose file and a testnet deployment does not name that profile — deliberately, because
micro-pool validates `POOL_NETWORK` against `getblockchaininfo` and would refuse to boot against a
testnet node anyway. The console is *not* behind the same profile, on purpose, so that the page
explaining the hole is reachable when the service is not.

It could not explain anything until it was told. Measured 2026-08-11: `pool-testnet.<apex>` served
this bundle with a 200 and every `/v1/…` under it answered **502**, so `/`, `/workers` and
`/blocks` each rendered *"The pool did not answer"* with a **Try again** button that could never
succeed — three pages of an incident that was not happening (micro-org#406).

```
POOL_API_PRESENCE=absent   →   GET /deployment.json  →  {"poolApi":"absent"}
```

* **nginx serves it, the bundle reads it.** `deployment.inc.template` is expanded by the stock
  entrypoint into `/etc/nginx/conf.d/deployment.inc` when the *container* starts, and
  `location = /deployment.json` includes it. The image is still built once and promoted by digest;
  the fact arrives the way every other deploy fact does. `src/lib/deployment.tsx` reads it.
* **`absent` has to be said explicitly.** An unreadable document, a 404 from an older image, an
  empty value and a request that never landed all resolve to `present`. The expensive error is the
  other one: telling a miner whose hardware is connected to a working pool that it does not exist.
* **It is not derived from the hostname.** A hostname says which environment this is, not whether
  that environment runs a pool — and the two have already diverged once, when mainnet ran this
  console for weeks before the profile was switched on.
* **`ENV POOL_API_PRESENCE=present` in the `Dockerfile` is load-bearing.** The nginx entrypoint
  substitutes only variables that are *set*, so an unset one is left in the config verbatim and
  nginx exits with `unknown "pool_api_presence" variable`. Measured, on the first build of it.

What a reader gets on a deployment that says `absent`: `src/pages/no-pool.tsx` in place of every
console page, with a link to the pool that does exist (composed from the page address, never
written down) and one to browser mining on Forge Hub. And `src/lib/resource.ts` declines to run any
load at all, so the console issues **no `/v1` request** rather than one per page.

Every host is resolved at runtime from `window.location.hostname` (`src/lib/hosts.ts`), and the API
base is the **empty string**: the gateway serves this bundle and micro-pool's `/v1` on one origin,
exactly as it already does for `explorer.<apex>` and micro-indexer. `test/no-build-time-config.test.ts`
and a grep gate in CI both fail the build if any of that reappears.

The one exception is `pnpm dev`, where the API is on `http://localhost:4146` — chosen by comparing
placements rather than by a `DEV` flag, because a flag is a build-time constant and this repository
has none.

### The registry row this surface does not have

`ui/packages/ui/src/surfaces.ts` has **no `pool` key**, and that absence is not merely one URL that
cannot be looked up. `cloudsforgeHosts()` finds the apex by stripping a *known* first label, so
served at `pool.<apex>` the label is unrecognised, the apex becomes the whole hostname, and every URL
the shared chrome derives lands one level too deep — `hub.pool.<apex>`, `lantern.pool.<apex>`, neither
of which exists. The page renders and every link on it is dead.

There is precedent for both halves: the registry says beside `emberkin` that exactly this happened,
and that micro-emberkin-web "carried a local correction until this entry existed". So does this one —
`correctedHosts()` in `src/lib/hosts.ts`. It is temporary by construction: `placementOf()` checks the
registry's own `KNOWN_SUBS` and `splitEnvLabel` **first**, so the day a `pool` row lands the
correction becomes a no-op, and `test/hosts.test.ts` pins both branches so that day is a day a test
tells somebody.

Three consequences, each with a test that goes red when the row arrives:

| Consequence | Where | What to do when the row lands |
| --- | --- | --- |
| `CloudsForgeFooter` cannot be mounted — `surface(key)` **throws** on an unknown key, and its legal links are composed from `hosts.site` read inside the component, which the `surfaceUrls` override does not reach | `src/components/shell.tsx` | delete the local footer, mount the shared one with `current: 'pool'` |
| `applyHead()` is called by hand instead of `surfaceMeta()` | `src/components/shell.tsx` | collapse to one `surfaceMeta()` call |
| `correctedHosts()` exists at all | `src/lib/hosts.ts` | delete it down to the shape of `explorer-web/src/lib/hosts.ts` |

`test/shared-chrome.test.ts` asserts the absences **and** the cause in one test, so the reason cannot
outlive itself.

### Brand

There is no `brand/assets/pool/` set, so the four chrome files in `public/` are byte-identical copies
of `brand/assets/network/` and `test/brand-chrome.test.ts` asserts that byte-identity — and asserts
that `brand/assets/pool` still does **not** exist, with a message telling the next person what to do
when it does.

`<html data-cf-product="network">`, because there is no `[data-cf-product='pool']` block in
`tokens.css` and naming one would fall through to the company ember in complete silence — the exact
failure `admin` had and `explorer` still has. A mining pool is chain infrastructure and belongs to
Forge Network; `explorer-web` sets `network` for the same reason. The test asserts the selector this
page names really exists upstream, which is the check that catches a fall-through either way.

---

## The empty state is the normal state

This estate has no real miners yet. Every panel here is therefore written for the cold start rather
than for an outage: no worker rows means *nobody has pointed hardware at this pool*, not *the pool is
down*, and no blocks means *this pool has not found one*. The two are different sentences and the
difference is the whole message.

`test/render.test.ts` drives every page with an empty response and asserts the wording; `Failed` —
which does say something is wrong — is reachable only from an actual transport or shape failure.

---

## Running it

```sh
pnpm install          # micro-ui must be checked out beside this repository
pnpm dev              # http://localhost:5191, API on http://localhost:4146
pnpm typecheck
pnpm test             # 143 tests, in-process DOM, no browser
pnpm build
```

`pnpm`, never `npm`. `@cloudsforge/ui` is a `link:` dependency — the design system is not published
yet — which means its own `node_modules` holds a second copy of React, so `vite.config.ts` dedupes
and `pnpm test` runs with `--import @cloudsforge/ui/test-loader`. Delete that flag and the suite goes
red, not quiet: every hook the shared components call throws
`Cannot read properties of null (reading 'useState')`.

```sh
docker build --build-context uipkg=../ui --build-arg RELEASE="$(git rev-parse HEAD)" -t pool-web .
docker run --rm -p 8080:8080 pool-web
```

The build context `uipkg` is the design system; it goes away the day `@cloudsforge/ui` is published.

### What the tests actually hold

Fourteen files, and about half of them do not import a single application module — they read
`nginx.conf`, `index.html`, the `Dockerfile`, `src/styles.css` and sibling repositories **as text**,
with comments stripped first (`test/sources.ts`), because the files in this repository explain the
things they forbid and a naive grep would match the explanation.

| File | Holds |
| --- | --- |
| `honesty.test.ts` | no page renders a balance, an estimate, a next payout or a date, with full data stubbed in |
| `pool-contract.test.ts` | every field and route this bundle names exists in `pool/src/server.ts`, and every route it calls reads no credential |
| `routes.test.ts` | the route table, the router and nginx agree; nothing is gated; the SPA fallback keeps its 404 |
| `no-build-time-config.test.ts` | no `import.meta.env`, no hostname literal, no credential, no stratum port outside `hosts.ts` |
| `hosts.test.ts` | both branches of the registry correction, including the one that is dead today |
| `tokens.test.ts` | every `var(--cf-*)` is declared upstream; every `cf-` class exists upstream; every local class is `pl-` |
| `brand-chrome.test.ts` | the four chrome assets are byte-identical to `brand/assets/network/` |
| `seo.test.ts` | the static and the React-written description are byte-identical; non-mainnet hostnames refuse every crawler |
| `shared-chrome.test.ts` | the two absences **and** the missing registry row that causes them |
| `obs.test.ts` | the Lantern envelope, which this estate shipped broken in six frontends at once |
| `api.test.ts`, `pool.test.ts`, `format.test.ts`, `render.test.ts` | the transport, the client, the formatters, and every page's rendered text |

CI adds what a test cannot reach: grep gates over the built artefacts, and a **container probe** that
starts the image and checks the owned routes answer 200, that `/payouts` answers 404 with the shell,
the security and `Cache-Control` headers on three location types, the release stamp, and that a
non-mainnet `Host` gets `Disallow: /` and a 404 sitemap.

---

## Known gaps

Stated here because they are stated on the site too, and the site is where they matter.

* **Payouts.** See the top of this file. Not implemented, no mechanism, no date.
* **Stratum v2.** Not implemented. The protocol here is v1 with `mining.set_difficulty` vardiff.
* **TLS on the stratum port.** Not implemented. The port is plain TCP; the page says so.
* **Solo and PPS.** Not offered. PPLNS is the only scheme, and it is the only one the share table
  supports.
* **No stratum endpoint is published on this estate.** `stratumEndpoint` is `null` on both chains,
  so there is currently **no address an outside miner can dial** — the console says so in words
  rather than guessing one. This is a deploy decision (the listener binds loopback and no public
  host is set), not a defect in either repository, and it is the single thing standing between this
  pool and an external miner.
* **DOGE is built and switched off.** Merge-mining it against LTC is implemented — see the section
  above — and `POOL_LTC_AUX_CHAINS` is unset while dogecoind is in initial block download. This
  entry used to read "that is not what this pool does", which was true when it was written and has
  been false since the AuxPoW work merged.

Three entries have been **deleted rather than updated**, and are named here so nobody restores them
from an old copy of this file:

* *"Today only `ltc` is deployable — bitcoind is still syncing."* Both chains have been served since
  2026-08-11.
* *"The stratum hostname is derived, not reported."* `/v1/pool` reports `stratumEndpoint` and
  `resolveStratumHost` is deleted (micro-org#285).
* *"`network-site` still says no pool exists."* It says the opposite now: it names both chains, says
  Dogecoin is merge-mined from the Litecoin work, and links to this console through the surface
  registry.

---

## Provenance

Written against `pool/src/server.ts`, `pool/src/env.ts`, `pool/src/blocks.ts` and
`pool/src/payouts.ts` as they stood on 2026-08-09, and against `ui/packages/ui/src/surfaces.ts`,
`tokens.css` and `index.tsx` at the same date. Conventions were taken from `explorer-web`,
`status-web` and `lantern-web` rather than invented.

Re-read against the same files plus `pool/src/auxpow.ts`, `pool/src/auxtemplate.ts` and
`pool/src/session.ts` on **2026-08-11**, and against the LIVE service rather than the repository:
`GET https://pool.cloudsforge.online/v1/pool`, which is where the chain table, the `merged: null`
and the absent `stratumEndpoint` above were read from. Every dated claim in this file is a
measurement; if one is old, re-take it rather than reasoning about it — the three deletions in
*Known gaps* are all cases of a claim that was true when written and stayed in the file after it
stopped being true.
