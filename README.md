# sharding-strategies

Companion repo for a post in **"From Theory to Tested Code"**: `hash % N` → consistent hashing ring → virtual nodes, each stage proven better than the last with measured numbers, not diagrams.

```sh
git clone https://github.com/sdsubhajitdas/Sharding-Strategies.git
cd Sharding-Strategies
bun install
bun demo       # live ring visualization
bun run compare  # runs every experiment, prints tables, writes analysis/RESULTS.md
bun test       # unit tests + the movement/balance assertions
bun run bench  # lookup throughput and construction time
```

All numbers below are one real captured run — see [`analysis/RESULTS.md`](analysis/RESULTS.md) for the full output, machine details, and the exact command to reproduce it yourself. As of this writing: Bun 1.3.14, TypeScript 7.0.2, zero runtime dependencies.

---

## 1. The problem with `hash % N`

`ModuloSharder` (`src/strategies/modulo.ts`) is the obvious first move: `hash(key) % nodes.length`. It's O(1), and — as the balance numbers below show — it distributes keys about as evenly as physically possible.

It also falls apart completely the moment `N` changes. Resizing from 8 to 9 nodes changes the modulus for *every* key, and the resulting overlap between the old and new assignment is tiny:

| resize | keys moved | % moved |
| --- | --- | --- |
| 8 → 9 nodes (murmur3) | 888,674 / 1,000,000 | **88.9%** |
| 8 → 9 nodes (md5) | 888,169 / 1,000,000 | **88.8%** |

That's `measureKeyMovement` in [`src/analysis/key-movement.ts`](src/analysis/key-movement.ts) — snapshot where 1M keys land, add a node, count what changed. The theoretical expectation for modulo resize is ≈N/(N+1) of all keys (8/9 ≈ 88.9%), and the measured number lands right on it.

Numbers alone can undersell what that means for a real system, so [`src/db/`](src/db) turns it into an operational number instead of a percentage: `ShardedStore.rebalance()` can either actually migrate rows, or — in **naive mode** — just switch routing without moving any data. Naive-mode reads for the same 8→9 resize:

| strategy | failed reads / 1M |
| --- | --- |
| modulo | **888,674** |

"88.9% of keys moved" and "888,674 reads just 404'd" are the same fact. The second one is what shows up in an incident channel.

## 2. The ring data structure

`RingSharder` (`src/strategies/ring.ts`) fixes the resize problem: hash each node onto a point on a circular keyspace (`[0, 2^32)`), and a key belongs to whichever node's position comes next going clockwise. Adding or removing a node only remaps the keys between its position and its neighbor's — not the whole keyspace.

**Backing structure**: a sorted `number[]` of ring positions, binary search for lookup — not a linear scan. This is the part most explanations skip and most implementations get subtly wrong, so it's fully commented in [`src/strategies/ring.ts`](src/strategies/ring.ts), including the wrap-around case (a key that hashes past the highest position wraps to the lowest one — the ring has no end).

Same resize, same 1M keys, now through the ring:

| resize | keys moved | % moved | naive-mode failed reads |
| --- | --- | --- | --- |
| 8 → 9 nodes (murmur3) | 86,749 | **8.7%** | 86,749 |
| 8 → 9 nodes (md5) | 31,532 | **3.1%** | 31,532 |

Both numbers are real, and both are far under modulo's 88.9%. But notice they don't match each other, or the theoretical ≈1/9 ≈ 11.1% expectation, very closely — which is the subject of the next section.

## 3. Why plain rings are unbalanced

With **one ring position per node**, a node's share of the keyspace is whatever arc happens to fall between its position and its predecessor's — determined entirely by where its hash landed. Averaged over many independent topologies that converges toward fair, but any *one* topology can be lopsided, and a small number of physical nodes doesn't average out much at all.

This shows up two ways, measured without any tuning to make the story cleaner (`src/analysis/load-balance.ts`, `src/analysis/node-failure.ts`):

**Static load balance**, 1M keys over a fixed 8-node topology (no resize involved):

| strategy | min | max | CoV |
| --- | --- | --- | --- |
| modulo | 124,741 | 125,422 | **0.0021** |
| plain ring | 7,394 | 309,884 | **0.73–0.76** |

Modulo wins this one outright — plain consistent hashing is *worse balanced* than the naive strategy it's supposed to improve on. That's not a strawman; it's the honest result of hashing 8 points onto a circle and hoping they land evenly.

**Node failure**, 3-node topology, one node killed — where do its keys go?

| strategy | max single survivor's share |
| --- | --- |
| modulo | ~50% (splits evenly across 2 survivors) |
| plain ring | **100%** (one successor inherits the entire arc) |

Killing a node in the plain ring doesn't spread its load — it dumps the whole thing on whichever node's position happens to follow it clockwise. In production that's a cascading failure: the node that absorbs the dead node's traffic is now more likely to fall over too.

Both regressions come from the same root cause: **one position per node is too coarse a sample of "even."**

## 4. Virtual nodes

`VirtualNodeRingSharder` (`src/strategies/vnode-ring.ts`) fixes it with the smallest change that could plausibly work: instead of one ring position per node, give each node `vnodeCount` positions (default 150), each an independently-hashed point (`hash("nodeId#0")`, `hash("nodeId#1")`, ...). More independent samples per node means the law of large numbers actually applies.

It's a genuinely small diff on top of `RingSharder` — the sorted array, the binary search, `getNodes`, `stats`, wrap-around, all inherited unchanged. Only two methods are overridden: `hashesForNode` (1 position → many) and `assertWeightSupported` (now that a node can claim a proportional *number* of positions, weighting has a real implementation — a weight-2 node gets `2 × vnodeCount` positions instead of `vnodeCount`).

Same experiments, same untuned methodology:

| strategy | load-balance CoV | node-failure max survivor share |
| --- | --- | --- |
| modulo | 0.0021 | ~50% |
| plain ring | 0.73–0.76 | 100% |
| **vnode-ring (150)** | **0.044–0.050** | **~51–58%** |

Both failure modes are fixed — not perfectly (modulo still wins balance; vnode-ring's node-failure split isn't perfectly even either), but the regression is gone.

**Weighting** works too — `src/analysis/weighted-nodes.ts` gives a weight-2 node `2×` the ring positions of a weight-1 node and checks it actually receives ~2× the keys, not just ~2× the positions:

| node | weight | keys received (of 300k, murmur3) | keys / weight unit |
| --- | --- | --- | --- |
| node-w1 | 1 | 54,130 | 54,130 |
| node-w2 | 2 | 103,367 | 51,684 |
| node-w3 | 3 | 142,503 | 47,501 |

### The cost: "why 150?"

None of this is free. `src/analysis/vnode-sweep.ts` sweeps vnode count ∈ {1, 10, 50, 100, 150, 500, 1000} and measures balance, memory, build time, and lookup throughput at each point (murmur3, 8 nodes):

| vnodes | CoV | memory | build time¹ | lookup throughput² |
| --- | --- | --- | --- | --- |
| 1 | 0.929 | 0.3 KB | 0.04 ms | 8.6M ops/sec |
| 10 | 0.261 | 3.4 KB | 0.06 ms | 7.8M ops/sec |
| 50 | 0.159 | 17.2 KB | 0.16 ms | 7.4M ops/sec |
| 100 | 0.124 | 34.4 KB | 0.24 ms | 7.2M ops/sec |
| **150** | **0.044** | **51.6 KB** | **0.31 ms** | **7.0M ops/sec** |
| 500 | 0.021 | 171.9 KB | 1.07 ms | 6.4M ops/sec |
| 1000 | 0.023 | 343.8 KB | 2.00 ms | 6.2M ops/sec |

¹ Build time here is one part of `analysis/vnode-sweep.ts`'s combined per-point measurement (8 nodes). For construction-time-specifically, see `bench/build-time.ts`'s dedicated sweep below, which reaches much higher node counts.<br>
² From the same run as the other three columns — see `bench/`'s own lookup-throughput sweep below for numbers measured with a longer, dedicated warmup methodology (same trend, slightly higher absolute throughput since that harness isolates lookup cost more tightly).

150 vnodes captures **~98% of the total CoV improvement** available across the whole sweep (both hash functions). Going further, to 1000, buys under 2% more balance at ~7x the memory and ~6x the build time — and on a single fixed topology, CoV doesn't even improve perfectly monotonically past a few hundred vnodes (500 sometimes beats 1000 for one specific hash/topology pairing — more positions lowers *expected* imbalance, not every single draw). 150 is the point where the curve has clearly flattened; going further is mostly cost with rapidly diminishing returns. That's `bun run src/analysis/vnode-sweep.ts` on your own machine, not folklore.

Building a ring also isn't free at scale — see [`bench/`](bench) for construction time vs node count: modulo build time stays flat (0.3ms at 2000 nodes), plain ring stays cheap (8.6ms at 2000 nodes), vnode-ring(150) grows to **929ms at 2000 nodes**. If you're building a ring with thousands of physical nodes and 150 vnodes each, that construction cost is real and worth knowing about upfront.

---

## Tradeoff table

One 8-node topology, 1M keys, murmur3, from [`analysis/RESULTS.md`](analysis/RESULTS.md) and [`bench/`](bench):

| | modulo | ring | vnode-ring (150) |
| --- | --- | --- | --- |
| Resize (8→9) moves | 88.9% | 8.7%¹ | 11.3%¹ |
| Load balance (CoV) | 0.002 | 0.73 | 0.044 |
| Node failure (max survivor share) | ~50% | 100% | ~51% |
| Weighting support | ✗ (throws) | ✗ (throws) | ✓ |
| Ring positions (8 nodes) | 8 | 8 | 1,200 |
| Memory (`stats().bytesApprox`) | 352 B | 352 B | 52,800 B |
| Lookup throughput | 14.7M ops/sec | 12.9M ops/sec | 8.5M ops/sec |
| Build time (2000 nodes) | 0.3 ms | 8.6 ms | 929 ms |

¹ Plain ring's single-run movedPct has high run-to-run variance (one position per node — see `src/analysis/key-movement.ts`); averaged over many random topologies it converges to the expected ~1/(N+1) ≈ 11.1%, same as vnode-ring.

## Hash functions

Two implementations, both producing a `uint32`, both hand-rolled or standard-library (zero runtime dependencies):

- **murmur3** (`src/hash/murmur3.ts`) — fast, non-cryptographic, hand-rolled from the public-domain x86_32 reference algorithm.
- **md5-truncated** (`src/hash/md5.ts`) — MD5 via `node:crypto`, truncated to the first 4 bytes, little-endian. The same scheme Ketama/libketama uses for memcached consistent hashing.

We didn't use `Bun.hash`'s built-in variants: they're fast, but binding the library to Bun's runtime would break portability to Node/Deno for the two downstream projects this package feeds into. Hand-rolling murmur3 costs ~60 lines and keeps the package runtime-agnostic.

Quality isn't asserted, it's measured — `checkHashQuality` (`src/hash/quality.ts`) distributes 1M keys into 1000 buckets and reports chi-square/CoV for both:

| hash | CoV | chi-square (expect ~999) |
| --- | --- | --- |
| murmur3 | 0.0301 | 905.2 |
| md5 | 0.0310 | 960.2 |

Both land within normal statistical range of the uniform expectation — "use a good hash function" demonstrated, not asserted.

## Running each experiment

Every experiment lives in `src/analysis/` and is runnable standalone (`bun run src/analysis/<name>.ts`) or all at once:

```sh
bun run compare   # runs everything below, prints tables, writes analysis/results.csv + analysis/RESULTS.md
```

| script | what it measures |
| --- | --- |
| `hash-quality.ts` | chi-square/CoV of murmur3 and md5 across 1000 buckets |
| `key-movement.ts` | % of keys that move on an 8→9 node resize, per strategy |
| `naive-reshard.ts` | real read-failure count when routing switches but data doesn't move |
| `load-balance.ts` | min/max/stddev/CoV of keys-per-node on a fixed topology |
| `node-failure.ts` | where a dead node's keys land among survivors |
| `vnode-sweep.ts` | CoV/memory/build-time/lookup-throughput across vnode counts |
| `weighted-nodes.ts` | verifies a weight-2 node receives ~2x the keys |

```sh
bun demo   # ASCII ring visualization + animated resize + side-by-side strategy comparison + demo-output/ring.svg
bun run bench  # lookup throughput and ring construction time, hand-timed with Bun.nanoseconds()
```

## Using the library

```ts
import { VirtualNodeRingSharder, murmur3 } from "./src/index";

const sharder = new VirtualNodeRingSharder(murmur3); // default 150 vnodes
sharder.addNode("shard-1");
sharder.addNode("shard-2");
sharder.addNode("shard-3", 2); // weight-2: claims ~2x the ring

sharder.getNode("user:1023");              // -> "shard-2"
sharder.getNodes("user:1023", 2);          // -> ["shard-2", "shard-3"] (for replication)
sharder.stats();                           // -> { positions: 600, bytesApprox: 27600 }
```

`Sharder` (`src/sharder.ts`) is the interface all three strategies implement, so calling code can swap strategies without changing anything else — that's the contract the two follow-up projects in this series (a Postgres-backed sharded app, and a multi-node distributed cache) build on.

## vs. Redis Cluster's fixed hash slots

Redis Cluster sidesteps both of this repo's problems with a third approach: **16,384 fixed hash slots**, each explicitly assigned to a node. Routing is `CRC16(key) % 16384` to find the slot, then a slot → node lookup table — essentially **modulo plus a layer of indirection**.

That indirection is what fixes modulo's resize disaster: moving a node doesn't change anyone's slot assignment, because the modulus (16,384) never changes — only the slot→node table entries for the slots being moved. No ring needed, no rehashing on resize, and balance is whatever you make it (slots can be assigned in exactly equal counts, or weighted deliberately).

The cost is that slot migration is **explicit and administrative**, not automatic: moving load off a node means a human (or a controller) picks specific slots and migrates them with `CLUSTER SETSLOT`/`MIGRATE`, one slot at a time, live. There's no hash function doing that decision for you.

**Pick fixed hash slots (Redis Cluster's approach) when**: you want precise, plannable control over exactly which node holds what, you're operating at a scale where 16,384 discrete units is fine granularity (adding a node just means moving `16384 / (N+1)` slots to it), and you're fine with (or want) a human/controller in the loop for rebalancing.

**Pick a consistent hashing ring (this repo) when**: you want rebalancing to happen automatically from the hash function alone — no separate slot-assignment table to maintain — and you're fine trading that automation for slightly less precise control over the exact split.

## Repo layout

```
src/
  sharder.ts     # the Sharder interface + error types
  strategies/    # ModuloSharder, RingSharder, VirtualNodeRingSharder
  hash/          # murmur3, md5-truncated, quality checker
  db/            # Shard, ShardedStore (mock DB for the read-failure experiments)
  analysis/      # every experiment + the compare harness
  demo/          # bun demo — ASCII/SVG ring visualization
  index.ts       # public API
bench/           # lookup throughput + construction time benchmarks
analysis/        # captured run: results.csv, RESULTS.md
demo-output/     # generated SVG ring diagram
```
