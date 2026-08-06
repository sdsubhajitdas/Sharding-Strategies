# Results

Captured: 2026-08-02T21:30:39.469Z

Reproduce with:

```sh
bun run compare
```

## Machine

- Bun: 1.3.14
- OS: darwin 25.5.0 (arm64)
- CPU: Apple M1 Pro x8
- Memory: 16.0 GB

## Hash quality (1000 buckets, 1M keys)

| strategy | hashFn | keys | buckets | min | max | stddev | coefficientOfVariation | chiSquare |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| - | murmur3 | 1000000 | 1000 | 892 | 1136 | 30.09 | 0.0301 | 905.22 |
| - | md5 | 1000000 | 1000 | 901 | 1106 | 30.99 | 0.031 | 960.22 |

## Key movement on scale-out (8 -> 9 nodes, 1M keys)

| strategy | hashFn | keys | nodesBefore | nodesAfter | moved | movedPct |
| --- | --- | --- | --- | --- | --- | --- |
| modulo | murmur3 | 1000000 | 8 | 9 | 888674 | 0.8887 |
| ring | murmur3 | 1000000 | 8 | 9 | 86749 | 0.0867 |
| vnode-ring | murmur3 | 1000000 | 8 | 9 | 113308 | 0.1133 |
| modulo | md5 | 1000000 | 8 | 9 | 888169 | 0.8882 |
| ring | md5 | 1000000 | 8 | 9 | 31532 | 0.0315 |
| vnode-ring | md5 | 1000000 | 8 | 9 | 137631 | 0.1376 |

## Naive reshard: failed reads (8 -> 9 nodes, 1M keys)

| strategy | hashFn | keys | nodesBefore | nodesAfter | failedReads | failureRate |
| --- | --- | --- | --- | --- | --- | --- |
| modulo | murmur3 | 1000000 | 8 | 9 | 888674 | 0.8887 |
| ring | murmur3 | 1000000 | 8 | 9 | 86749 | 0.0867 |
| vnode-ring | murmur3 | 1000000 | 8 | 9 | 113308 | 0.1133 |
| modulo | md5 | 1000000 | 8 | 9 | 888169 | 0.8882 |
| ring | md5 | 1000000 | 8 | 9 | 31532 | 0.0315 |
| vnode-ring | md5 | 1000000 | 8 | 9 | 137631 | 0.1376 |

## Load balance (8-node fixed topology, 1M keys)

| strategy | hashFn | keys | nodeCount | min | max | stddev | coefficientOfVariation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| modulo | murmur3 | 1000000 | 8 | 124741 | 125422 | 262.52 | 0.0021 |
| ring | murmur3 | 1000000 | 8 | 7394 | 309884 | 91206.2 | 0.7296 |
| vnode-ring | murmur3 | 1000000 | 8 | 117235 | 130533 | 5490.43 | 0.0439 |
| modulo | md5 | 1000000 | 8 | 124703 | 125457 | 266.98 | 0.0021 |
| ring | md5 | 1000000 | 8 | 39069 | 319156 | 95358.45 | 0.7629 |
| vnode-ring | md5 | 1000000 | 8 | 118336 | 139083 | 6235.88 | 0.0499 |

## Node failure (3-node topology)

| strategy | hashFn | keys | nodeCount | deadNodeId | deadNodeKeyCount | maxSurvivorSharePct | minSurvivorSharePct |
| --- | --- | --- | --- | --- | --- | --- | --- |
| modulo | murmur3 | 300000 | 3 | node-0 | 99589 | 0.5014 | 0.4986 |
| ring | murmur3 | 300000 | 3 | node-0 | 153440 | 1 | 0 |
| vnode-ring | murmur3 | 300000 | 3 | node-0 | 107379 | 0.5069 | 0.4931 |
| modulo | md5 | 300000 | 3 | node-0 | 99536 | 0.5004 | 0.4996 |
| ring | md5 | 300000 | 3 | node-0 | 161257 | 1 | 0 |
| vnode-ring | md5 | 300000 | 3 | node-0 | 104115 | 0.5785 | 0.4215 |

## Vnode sweep (vnode-ring only)

| strategy | hashFn | vnodeCount | nodeCount | coefficientOfVariation | bytesApprox | buildTimeMs | lookupOpsPerSec |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vnode-ring | murmur3 | 1 | 8 | 0.9291 | 352 | 0.034 | 8695148 |
| vnode-ring | murmur3 | 10 | 8 | 0.2608 | 3520 | 0.062 | 7904175 |
| vnode-ring | murmur3 | 50 | 8 | 0.1589 | 17600 | 0.156 | 7346279 |
| vnode-ring | murmur3 | 100 | 8 | 0.1244 | 35200 | 0.238 | 7161154 |
| vnode-ring | murmur3 | 150 | 8 | 0.0439 | 52800 | 0.323 | 7220575 |
| vnode-ring | murmur3 | 500 | 8 | 0.0214 | 176000 | 1.537 | 6443636 |
| vnode-ring | murmur3 | 1000 | 8 | 0.0228 | 352000 | 2.137 | 6016349 |
| vnode-ring | md5 | 1 | 8 | 1.2647 | 352 | 0.087 | 1374841 |
| vnode-ring | md5 | 10 | 8 | 0.2476 | 3520 | 0.099 | 1375407 |
| vnode-ring | md5 | 50 | 8 | 0.1157 | 17600 | 0.369 | 1345786 |
| vnode-ring | md5 | 100 | 8 | 0.1012 | 35200 | 0.614 | 1335326 |
| vnode-ring | md5 | 150 | 8 | 0.0514 | 52800 | 0.962 | 1315178 |
| vnode-ring | md5 | 500 | 8 | 0.0437 | 176000 | 3.117 | 1299719 |
| vnode-ring | md5 | 1000 | 8 | 0.0266 | 352000 | 6.355 | 1273578 |

## Weighted nodes (vnode-ring only)

| strategy | hashFn | keys | nodeId | weight | keysReceived | keysPerWeightUnit |
| --- | --- | --- | --- | --- | --- | --- |
| vnode-ring | murmur3 | 300000 | node-w1 | 1 | 54130 | 54130 |
| vnode-ring | murmur3 | 300000 | node-w2 | 2 | 103367 | 51684 |
| vnode-ring | murmur3 | 300000 | node-w3 | 3 | 142503 | 47501 |
| vnode-ring | md5 | 300000 | node-w1 | 1 | 45010 | 45010 |
| vnode-ring | md5 | 300000 | node-w2 | 2 | 99108 | 49554 |
| vnode-ring | md5 | 300000 | node-w3 | 3 | 155882 | 51961 |
