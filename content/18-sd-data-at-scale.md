---
id: sd-data-at-scale
title: Data at scale: replication, sharding, CAP and consensus
minutes: 65
---

Application servers are easy to scale because they hold no data. Databases are hard because they do. This lesson covers the ideas every distributed data system is built on: copying data (replication), splitting data (partitioning), and the guarantees you can and cannot have when machines and networks fail.

## Replication

Replication keeps copies of the same data on several machines. It gives you three things: survival when a machine dies, more capacity for reads, and copies close to users in different regions.

### Single leader (primary and replicas)

All writes go to one node, the **leader**. It records each change in a log and streams it to **followers**, which apply the changes in the same order. Reads can go to any node.

- **Synchronous** replication: the leader waits for a follower to confirm before telling the client the write succeeded. No data loss if the leader dies; every write is slower; a slow follower stalls writes.
- **Asynchronous** replication: the leader confirms immediately and followers catch up. Fast; a leader crash can lose the last few writes.
- **Semi-synchronous**: wait for one follower, let the rest lag. The usual production choice.

### Replication lag and what it breaks

A follower may be milliseconds or seconds behind. If you read from it right after writing, you may not see your own change.

```python run
class Primary:
    def __init__(self):
        self.data, self.log = {}, []
    def write(self, key, value):
        self.data[key] = value
        self.log.append((key, value))

class Replica:
    def __init__(self):
        self.data, self.applied = {}, 0
    def catch_up(self, primary, entries=None):
        end = len(primary.log) if entries is None else min(len(primary.log), self.applied + entries)
        for key, value in primary.log[self.applied:end]:
            self.data[key] = value
        self.applied = end

primary, replica = Primary(), Replica()
primary.write("profile:7:name", "Asha")
replica.catch_up(primary)

primary.write("profile:7:name", "Asha K.")                       # user edits their name
print("read from replica :", replica.data["profile:7:name"], " <- stale: the user sees the old name")
print("read from primary :", primary.data["profile:7:name"])
replica.catch_up(primary)
print("after lag clears  :", replica.data["profile:7:name"])
```

| Anomaly | What the user sees | Fix |
| --- | --- | --- |
| Not reading your own writes | You save a profile and the page shows the old one | Read your own recent writes from the leader; or route by "last write time" |
| Going back in time | Refresh shows newer data, refresh again shows older data (two replicas with different lag) | Pin each user to one replica (monotonic reads) |
| Out-of-order view | You see a reply before the question it answers | Keep related writes in the same partition |

### Failover

When the leader dies, a follower is promoted. The hard parts: deciding the leader is truly dead (not just slow), choosing the most up-to-date follower, redirecting clients, and making sure the old leader does not come back still believing it is in charge (split brain). Managed databases automate this; you should still know it takes seconds to minutes and may lose recent asynchronous writes.

### Multi-leader and leaderless

- **Multi-leader**: several nodes accept writes, typically one per region, and replicate to each other. Good for multi-region writes and offline clients. The cost is **write conflicts**: two users edit the same record in different regions. Resolution strategies: last write wins (simple and loses data), merge the values, or data types designed to merge automatically (CRDTs, as used by collaborative editors).
- **Leaderless** (Dynamo style: Cassandra, DynamoDB, Riak): any node accepts writes. Clients write to several nodes and read from several, using quorums.

## Quorums

With N copies of each item, a write must be acknowledged by W nodes and a read asks R nodes. If **R + W > N**, every read set overlaps every write set in at least one node, so a read always sees the latest acknowledged write.

```python run
import random

N = 3
def simulate(W, R, trials=20_000):
    stale = 0
    for _ in range(trials):
        versions = [1] * N                              # every replica has version 1
        for i in random.sample(range(N), W):            # the new write reaches W replicas
            versions[i] = 2
        read_from = random.sample(range(N), R)          # the read contacts R replicas
        if max(versions[i] for i in read_from) != 2:    # the reader takes the newest version it sees
            stale += 1
    return stale / trials

for W, R in [(1, 1), (2, 1), (1, 2), (2, 2), (3, 1)]:
    print(f"N=3 W={W} R={R}  R+W{'>' if R + W > N else '<='}N  stale reads: {simulate(W, R):.1%}")
```

Tuning: `W=N, R=1` gives fast reads and slow, fragile writes; `W=1, R=N` the opposite; `W=2, R=2` with `N=3` is the balanced default that tolerates one node failure for both.

## Partitioning and sharding

When data or write volume outgrows one machine, split the data so each machine holds a part. Inside one database this is **partitioning**; across separate database servers it is usually called **sharding**.

| Strategy | How keys are assigned | Good | Bad |
| --- | --- | --- | --- |
| Range | By key range: A–F, G–M, …; or by month | Efficient range scans | Hot spots when writes cluster (all of today's data hits one shard) |
| Hash | `hash(key)` decides the shard | Even spread | Range scans touch every shard |
| Directory | A lookup table maps each key or tenant to a shard | Flexible; move tenants individually | The lookup table is a dependency and a bottleneck |
| Geographic | By user region | Data near users; data residency rules | Uneven region sizes |

### Choosing the shard key

This is the most consequential decision and the hardest to change.

- **High cardinality and even distribution**, so no shard is much bigger than the others.
- **Present in the common queries**, so most queries hit one shard.
- **Stable**: it should not change for a record.

Examples:

- A chat system shards messages by `conversation_id`: one conversation's messages stay together and in order.
- A multi-tenant business application shards by `tenant_id`: one customer's data stays together. Watch for one giant tenant.
- An e-commerce order table shards by `user_id`: "my orders" is one shard. The query "all orders for this seller" then hits every shard, so you keep a second copy organised by seller.

```python run
import hashlib
from collections import Counter

def shard_for(key, shards=4):
    return int(hashlib.md5(str(key).encode()).hexdigest(), 16) % shards

user_ids = range(1, 100_001)
print("hash on user_id      :", sorted(Counter(shard_for(u) for u in user_ids).items()))

# A poor key: country. Most users are in a few countries.
import random
countries = random.choices(["IN", "US", "BR", "DE", "JP"], weights=[60, 20, 10, 6, 4], k=100_000)
print("hash on country code :", sorted(Counter(shard_for(c) for c in countries).items()))
```

### What sharding costs you

- **Cross-shard queries** must be sent to every shard and merged (scatter-gather), which is slow.
- **Cross-shard transactions** need two-phase commit or sagas.
- **Joins** across shards are done in application code or avoided by denormalising.
- **Rebalancing** when adding shards moves data; consistent hashing or many small logical partitions make it manageable.
- **Hot keys**: one celebrity account or one huge tenant overloads its shard. Split it further or give it dedicated capacity.
- **Unique IDs** can no longer come from one auto-increment column.

Because of all this, exhaust the alternatives first: indexes, caching, read replicas, a bigger machine, archiving old data. Many very large products run on one well-tuned primary with replicas.

## The CAP theorem

In a distributed data store, when the network splits and some nodes cannot reach others (a **partition**), you must choose:

- **Consistency**: refuse requests that cannot be guaranteed correct. Some users get errors.
- **Availability**: keep answering on both sides. Some users get stale data, and writes may conflict.

Partitions will happen, so "CA" is not a real option for a distributed system. The choice is **CP** or **AP**, and it can differ per operation.

| System or data | Choice | Why |
| --- | --- | --- |
| Bank ledger, inventory count, seat booking | CP | A wrong answer costs money |
| Leader election, configuration (etcd, ZooKeeper) | CP | Two leaders would be a disaster |
| Shopping cart, social feed, likes, view counts | AP | A slightly stale value is harmless; an error loses a sale |
| DNS | AP | Must always answer; updates spread gradually |

**PACELC** extends it: if there is a Partition, choose Availability or Consistency; Else, choose Latency or Consistency. Even with a healthy network, waiting for all replicas to agree costs time.

## Consistency models

| Model | Guarantee | Example |
| --- | --- | --- |
| Linearizable (strong) | Behaves like one copy; every read sees the latest completed write | A single PostgreSQL primary; etcd |
| Sequential / serializable | Operations appear in one agreed order | Serializable transactions |
| Causal | You never see an effect before its cause | Reply appears after the message it answers |
| Read-your-writes | You always see your own changes | Editing your own profile |
| Eventual | If writes stop, all copies converge | DNS, Cassandra with low consistency settings |

Stronger models are easier to program against and cost latency and availability. Pick the weakest model that keeps each feature correct.

## Distributed transactions

A purchase must reduce stock in one service and charge in another. No single database transaction covers both.

- **Two-phase commit (2PC)**: a coordinator asks every participant to prepare; if all say yes, it tells them to commit. It gives atomicity, and it blocks if the coordinator dies between phases, so it is avoided across services.
- **Saga**: a sequence of local transactions, each with a **compensating action** that undoes it. If step 3 fails, run the compensations for steps 2 and 1. Covered with code in [architecture patterns](#sd-patterns).
- **Avoid the need**: keep data that must change together in the same database.

## Consensus: Raft in plain words

Consensus is how a group of nodes agrees on a sequence of values even though some may crash. It powers etcd, Consul, ZooKeeper, and the metadata layer of Kafka, CockroachDB and many others. Raft is the algorithm designed to be understood.

1. **Roles**: every node is a follower, a candidate, or the leader.
2. **Leader election**: followers expect heartbeats from the leader. If one hears nothing for a randomised timeout, it becomes a candidate, increments the **term** number, and asks for votes. A node votes once per term. Whoever gets a **majority** becomes leader.
3. **Log replication**: clients send commands to the leader. It appends each to its log and sends it to followers. Once a majority have stored an entry it is **committed** and applied.
4. **Safety**: a candidate can win only if its log is at least as up to date as the voters' logs, so a committed entry is never lost.

Why a majority: any two majorities share at least one node, so two leaders cannot both be elected in the same term, and a new leader always includes someone who has every committed entry. A cluster of 5 keeps working with 2 nodes down.

```python run
def can_make_progress(cluster_size, failed):
    majority = cluster_size // 2 + 1
    return cluster_size - failed >= majority

for size in (2, 3, 4, 5):
    tolerated = max(f for f in range(size) if can_make_progress(size, f))
    print(f"cluster of {size}: majority = {size // 2 + 1}, tolerates {tolerated} failure(s)")
```

A 4-node cluster tolerates the same single failure as a 3-node one, which is why odd sizes are used.

## How databases store data

Two designs dominate, and the choice explains a database's strengths.

| | B-tree | LSM tree (log-structured merge) |
| --- | --- | --- |
| Write path | Find the page, update it in place | Append to memory, flush sorted files, merge them later |
| Reads | Fast and predictable | May check several files; Bloom filters help |
| Writes | Slower: random disk access | Very fast: sequential appends |
| Used by | PostgreSQL, MySQL, SQL Server | Cassandra, RocksDB, ScyllaDB, HBase, LevelDB |
| Fits | Read-heavy and mixed workloads, transactions | Write-heavy workloads, time-series, event data |

Both rely on a **write-ahead log**: every change is appended to a log on disk before it is acknowledged, so a crash can be recovered by replaying the log.

**Row stores** keep each row together, which suits fetching whole records. **Column stores** keep each column together, which suits analytics that scan a few columns over billions of rows, and they compress far better.

## Change data capture and derived data

Most systems have one **source of truth** (a relational database) and several **derived** copies: a cache, a search index, a data warehouse, materialised views. Keeping them in sync is a design problem in itself.

- **Dual writes** (the app writes to the database and to the search index) fail when one write succeeds and the other does not.
- **Change data capture (CDC)** reads the database's own change log (Debezium is a common tool) and publishes each change to Kafka. Every derived system consumes that stream. The database remains the single source of truth, and derived stores can be rebuilt by replaying.

## Multi-region

| Setup | How | Trade-off |
| --- | --- | --- |
| Active-passive | One region serves; another holds a replica for disaster recovery | Simple; failover takes minutes; some data loss possible |
| Active-active, read local | Reads served locally, writes go to one primary region | Fast reads worldwide; writes from far regions are slow |
| Active-active, write local | Each region accepts writes | Fast everywhere; conflict resolution required |

Two recovery measures to state in a design: **RPO** (recovery point objective: how much data you may lose, in time) and **RTO** (recovery time objective: how long you may be down).

## Check yourself

```quiz
[
  {"q": "A user updates their profile and immediately sees the old value. Most likely cause?", "options": ["A database bug", "The read went to a replica that has not yet received the write", "The cache was too fast"], "answer": 1, "why": "Asynchronous replication lag. Read your own recent writes from the leader."},
  {"q": "With N=3 replicas, which setting guarantees a read sees the latest acknowledged write?", "options": ["W=1, R=1", "W=2, R=2", "W=1, R=2"], "answer": 1, "why": "R + W must exceed N so the read and write sets overlap."},
  {"q": "Which is the best shard key for a chat application's messages?", "options": ["The message timestamp", "The conversation ID", "The sender's country"], "answer": 1, "why": "A conversation's messages stay on one shard, in order, and are fetched together."},
  {"q": "During a network partition, a CP system will:", "options": ["Serve possibly stale data from both sides", "Reject some requests to avoid returning inconsistent data", "Lose all data"], "answer": 1, "why": "It trades availability for consistency."},
  {"q": "Why can a 5-node Raft cluster survive 2 failures?", "options": ["Each node has a backup", "3 remaining nodes still form a majority", "The leader never fails"], "answer": 1, "why": "Progress needs a majority: 3 of 5."},
  {"q": "A workload is mostly appending sensor readings at very high rates. Which storage design fits?", "options": ["B-tree", "LSM tree", "Inverted index"], "answer": 1, "why": "LSM trees turn writes into sequential appends."},
  {"q": "Why is change data capture safer than writing to the database and the search index from application code?", "options": ["It is faster", "The database log is the single source; consumers cannot miss a change that committed", "It needs no queue"], "answer": 1, "why": "Dual writes can partially fail and leave the two stores disagreeing."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: replica-lag
title: Reproduce "going back in time"
kind: code
level: medium
@@statement
Build a tiny simulated primary-replica store where each replica applies writes after a fixed delay. Then use it to show a reader going back in time.

Write a class `ReplicatedStore` with:

- `ReplicatedStore(lags)`: `lags` is a list of integers, one per replica. Replica `i` shows a write `lags[i]` ticks after the write happened. The clock starts at 0.
- `write(key, value)`: writes at the current clock time. The primary sees it immediately.
- `tick(n=1)`: moves the clock forward by `n`.
- `read(key, replica=None)`: `replica=None` reads the primary. Otherwise it reads replica number `replica`. Returns the newest value that is visible there at the current time, or `None` if the key has no visible value.

A write made at time `t` is visible on a replica when `t + lag <= now`. If two writes are visible, the later write wins.

**Example**

```
s = ReplicatedStore([1, 3])
s.write("x", "old"); s.tick(3)
s.write("x", "new"); s.tick(1)      # now = 4
s.read("x")              -> "new"   (primary)
s.read("x", replica=0)   -> "new"   (lag 1)
s.read("x", replica=1)   -> "old"   (lag 3, still behind)
```

A user who is sent to replica 0 and then replica 1 sees "new" and then "old": time went backwards.
@@starter
class ReplicatedStore:
    def __init__(self, lags):
        pass

    def write(self, key, value):
        pass

    def tick(self, n=1):
        pass

    def read(self, key, replica=None):
        pass

s = ReplicatedStore([1, 3])
s.write("x", "old")
print(s.read("x"))
@@tests
_s = ReplicatedStore([1, 3])
_s.write("x", "old"); _s.tick(3)
_s.write("x", "new"); _s.tick(1)
assert _s.read("x") == "new", "primary sees the newest write"
assert _s.read("x", replica=0) == "new", "fast replica has caught up"
assert _s.read("x", replica=1) == "old", "slow replica is still behind"
_t = ReplicatedStore([2])
_t.write("k", 1)
assert _t.read("k") == 1, "primary is immediate"
assert _t.read("k", replica=0) is None, "replica has not applied the write yet"
_t.tick(2)
assert _t.read("k", replica=0) == 1, "visible exactly when t + lag <= now"
assert _t.read("missing") is None, "unknown key"
_u = ReplicatedStore([0])
_u.write("a", 1); _u.write("a", 2)
assert _u.read("a", replica=0) == 2, "later write wins; lag 0 is instant"
@@hint
Keep a list of `(time, key, value)` writes. A read walks the list in order and keeps the last value whose key matches and whose `time + lag <= now`.
@@solution
class ReplicatedStore:
    def __init__(self, lags):
        self.lags = list(lags)
        self.now = 0
        self.log = []

    def write(self, key, value):
        self.log.append((self.now, key, value))

    def tick(self, n=1):
        self.now += n

    def read(self, key, replica=None):
        lag = 0 if replica is None else self.lags[replica]
        result = None
        for t, k, v in self.log:
            if k == key and t + lag <= self.now:
                result = v
        return result
````

````task
id: quorum-pairs
title: Quorum pairs that guarantee fresh reads
kind: code
level: easy
@@statement
With `N` replicas, a write waits for `W` acknowledgements and a read asks `R` replicas. A read is guaranteed to see the latest write when the read set and the write set must overlap, which is exactly when `W + R > N`.

Write `quorum_pairs(n)` that returns every `(w, r)` with `1 <= w <= n` and `1 <= r <= n` that guarantees fresh reads.

**Input**: `n`, an integer `>= 1`.

**Output**: a list of `(w, r)` tuples, sorted by `w` and then by `r`.

**Example**

```
quorum_pairs(3)
-> [(1, 3), (2, 2), (2, 3), (3, 1), (3, 2), (3, 3)]
```

Run it for `n = 5` and look at the result: which pairs still work when two replicas are down for both reads and writes (`w <= 3` and `r <= 3`)?
@@starter
def quorum_pairs(n):
    pass

print(quorum_pairs(3))
@@tests
assert quorum_pairs(3) == [(1, 3), (2, 2), (2, 3), (3, 1), (3, 2), (3, 3)], "n = 3"
assert quorum_pairs(1) == [(1, 1)], "single replica"
_p = quorum_pairs(5)
assert len(_p) == 15, "n = 5 has 15 pairs"
assert (3, 3) in _p and (1, 5) in _p and (5, 1) in _p, "known good pairs"
assert (2, 3) not in _p and (1, 1) not in _p, "W + R = N is not enough"
assert _p == sorted(_p), "sorted output"
assert [x for x in _p if x[0] <= 3 and x[1] <= 3] == [(3, 3)], "only (3, 3) tolerates two failures both ways"
@@hint
Two nested loops over `range(1, n + 1)` and the condition `w + r > n` are enough.
@@solution
def quorum_pairs(n):
    return [(w, r) for w in range(1, n + 1) for r in range(1, n + 1) if w + r > n]
````

````task
id: hash-ring
title: Consistent hashing ring
kind: code
level: medium
@@statement
Implement a consistent hash ring with virtual nodes so that adding or removing a node moves only a small share of the keys.

Write a class `HashRing`:

- `HashRing(nodes=(), vnodes=100)`: `nodes` is an iterable of node names (strings).
- `add_node(node)` and `remove_node(node)`.
- `get_node(key)`: returns the node that owns the string `key`, or `None` if the ring is empty.

**Rules**
- Hash with `int(hashlib.md5(text.encode()).hexdigest(), 16)` so results are the same on every run.
- Each node places `vnodes` points on the ring, at the hash of `"<node>#<i>"` for `i` in `0..vnodes-1`.
- A key belongs to the first point clockwise from its hash (the first point strictly greater, wrapping around to the smallest point).
- Removing a node removes all of its points.

**Example**

```
r = HashRing(["A", "B", "C"])
r.get_node("user:42")   -> one of "A", "B", "C" (always the same one)
r.add_node("D")         # only keys that now belong to "D" change owner
```
@@starter
import bisect
import hashlib

def _hash(text):
    return int(hashlib.md5(text.encode()).hexdigest(), 16)

class HashRing:
    def __init__(self, nodes=(), vnodes=100):
        pass

    def add_node(self, node):
        pass

    def remove_node(self, node):
        pass

    def get_node(self, key):
        pass
@@tests
_keys = ["key%d" % i for i in range(1000)]
_r = HashRing(["A", "B", "C"])
_before = {k: _r.get_node(k) for k in _keys}
assert set(_before.values()) == {"A", "B", "C"}, "every key maps to a known node"
assert all(_r.get_node(k) == _before[k] for k in _keys), "deterministic"
for _n in "ABC":
    assert list(_before.values()).count(_n) > 150, "virtual nodes keep the load roughly even"
_r.add_node("D")
_after = {k: _r.get_node(k) for k in _keys}
_moved = [k for k in _keys if _after[k] != _before[k]]
assert all(_after[k] == "D" for k in _moved), "keys only ever move to the new node"
assert 100 < len(_moved) < 400, "about a quarter of the keys move"
_r.remove_node("D")
assert {k: _r.get_node(k) for k in _keys} == _before, "removing D restores the old mapping"
assert HashRing().get_node("x") is None, "empty ring"
@@hint
Keep a sorted list of point hashes plus a dict from point to node. `bisect.bisect(points, h) % len(points)` gives the first point clockwise from `h`, with wrap-around.
@@solution
import bisect
import hashlib

def _hash(text):
    return int(hashlib.md5(text.encode()).hexdigest(), 16)

class HashRing:
    def __init__(self, nodes=(), vnodes=100):
        self.vnodes = vnodes
        self._points = []
        self._owner = {}
        for n in nodes:
            self.add_node(n)

    def add_node(self, node):
        for i in range(self.vnodes):
            p = _hash("%s#%d" % (node, i))
            self._owner[p] = node
            bisect.insort(self._points, p)

    def remove_node(self, node):
        self._owner = {p: o for p, o in self._owner.items() if o != node}
        self._points = sorted(self._owner)

    def get_node(self, key):
        if not self._points:
            return None
        i = bisect.bisect(self._points, _hash(key)) % len(self._points)
        return self._owner[self._points[i]]
````

````task
id: choose-shard-keys
title: Shard keys and the queries they break
kind: text
level: medium
@@statement
You are the data architect for four tables. For each one choose a shard key, justify it, and name one query that becomes hard or expensive with that key.

Scenario and numbers:

1. **Ride history** of a ride-hailing app: 20 million rides per day, each row about 300 bytes, kept for 3 years.
2. **Product reviews** of a marketplace: 2 billion reviews, 100 million products, a few products have 5 million reviews each.
3. **IoT sensor readings**: 500,000 sensors, one reading per second each, queried mostly as "last 24 hours of sensor X".
4. **Bank transactions**: 50 million accounts, 2,000 transactions per second, transfers move money between two accounts.

**Deliverable** (about 12-20 lines): a numbered list of four entries. Each entry has 1) the shard key (hash or range, and why), 2) one query that becomes hard (and the cost: scatter-gather, cross-shard transaction, hotspot), 3) one way to cope. For entry 1 also compute the total data size and say how many 1 TB shards you need.
@@criteria
- Ride history: shards by rider id or driver id (or a hash of it), not by time alone, with a clear reason (for example a time-only key puts all new writes on one hot shard). Total size is about 20M x 300 B x 365 x 3 = about 6.6 TB, so at least 7 shards of 1 TB (more with headroom).
- Product reviews: shards by product id and deals with the hot products (a few products with millions of reviews), for example by splitting them further; names "all reviews by one user" as a hard query.
- IoT readings: the key is the sensor id combined with a time bucket (or a sensor id hash with time ranges inside the shard), which keeps "last 24 hours of sensor X" on one shard; names a cross-sensor aggregate as the hard query, or notes that a pure time key creates a write hotspot.
- Bank transactions: shards by account id; the hard query is a transfer between accounts on different shards, which needs a saga or two-phase commit; mentions that every transaction must be strongly consistent.
- Each entry names a concrete hard query AND a mitigation (secondary index, denormalised copy, scatter-gather with a cap, a saga, bucketing).
@@solution
1. Ride history: shard by hash(rider_id). Size: 20M x 300 B = 6 GB per day, x 365 x 3 = about 6.6 TB, so at least 7 shards, more like 10-12 with headroom (each shard also has replicas). A pure time key would send all of today's writes to one shard, so I avoid it. Hard query: "all rides of driver X", because it hits every shard. Mitigation: a second copy of the data keyed by driver_id, fed from the same event stream.

2. Product reviews: shard by hash(product_id), so a product page reads one shard. Hard queries: "all reviews written by user U" (scatter-gather), and the hot products with 5M reviews (one shard overloaded). Mitigation: a user-keyed secondary index for the first, and splitting the hot products across sub-shards (product_id plus a bucket number) for the second.

3. IoT readings: key (sensor_id, day) with the sensor hashed, so "last 24 hours of sensor X" touches one or two partitions, and the 500k writes per second spread over many shards. A time-only key would put every write on the latest range, a classic hotspot. Hard query: "average temperature across all sensors in a region", which reads every shard. Mitigation: pre-aggregate by region and minute with a stream job.

4. Bank transactions: shard by hash(account_id). Hard query: a transfer between two accounts on different shards, which needs a cross-shard transaction. Mitigation: a saga with a ledger (debit with a pending entry, credit, then confirm), or two-phase commit for these cases. 2,000 tx per second is small, so fewer, larger shards with strong consistency are also a valid choice.
````

````task
id: consistency-classification
title: Strong or eventual: classify ten features
kind: text
level: easy
@@statement
Pick an app you use every day (for example a bank, a chat app, a shop or a video app). Write down **ten** concrete features of it and decide for each whether it needs **strong consistency** or whether **eventual consistency** is fine.

**Deliverable** (10 lines plus a 3-line summary):

- One line per feature in the form `feature -> strong | eventual -> one-sentence reason`. The reason must say what goes wrong for the user if the data is stale.
- At least 3 features must be strong and at least 3 eventual.
- Then 3 lines: name one feature you would serve from read replicas and the staleness you accept (for example "up to 5 seconds"), and one feature that must read from the primary.
@@criteria
- Lists exactly ten distinct, concrete features (not vague words such as "data").
- Marks money, stock or seat counts, password or permission changes and "do not double-book" features as strong, each with a concrete harm (overdraft, oversell, double booking, stale access rights).
- Marks like counts, view counts, feeds, recommendations, "last seen" and search results as eventual, with a reason why a delay of seconds is harmless.
- Each reason says what goes wrong for the user when the data is stale, not only the word "important".
- The summary names one feature served from a replica with an explicit staleness bound in seconds, and one feature read from the primary, with the reason.
@@solution
App: an online shop.
1. Account balance / payment charge -> strong -> a stale balance could allow a double charge or an overdraft.
2. Remaining stock at checkout -> strong -> two buyers could both get the last item (oversell).
3. Changing the password -> strong -> the old password must stop working immediately.
4. Order status right after payment -> strong -> the user would think the payment failed and pay twice.
5. Product star rating -> eventual -> being off by a few reviews for some seconds changes nothing.
6. "1,234 people bought this" counter -> eventual -> it is approximate by nature.
7. Recommendations -> eventual -> they are recomputed every hour anyway.
8. Search results -> eventual -> a new product showing up 10 seconds late is harmless.
9. Browsing history -> eventual -> a missing last item for a few seconds is fine.
10. Wishlist count badge -> eventual -> a stale badge fixes itself on the next refresh.

Summary: product pages are read from replicas and I accept up to 5 seconds of lag, because a stale description or rating hurts nobody. Checkout stock and payment state are read from the primary (or with a quorum read), because a stale value there causes overselling and double charges. One extra rule helps: read-your-own-writes, so a user who just posted a review sees it even if the replica is behind.
````

````task
id: raft-election
title: Explain Raft leader election
kind: text
level: medium
@@statement
Write an explanation of Raft leader election as you would say it aloud in two minutes to a colleague (about 200-300 words, or 15-20 lines). Use a cluster of **5 nodes** where the leader crashes as the running example.

You must cover:

1. The three roles and the role of the **term** number.
2. What makes a follower start an election (the randomized election timeout), and what the candidate does step by step.
3. How many votes the candidate needs in the 5-node cluster, and **why a majority is required** (what would go wrong with, say, 2 of 5).
4. What happens if two candidates start at the same time (split vote).
5. What happens to a client write while there is no leader.
@@criteria
- Names the roles follower, candidate and leader, and says a term is a logical clock that increases with every election; a node that sees a higher term steps down to follower.
- Explains that a follower that gets no heartbeat before its randomized election timeout becomes a candidate, increments its term, votes for itself and sends RequestVote to the others.
- States that 3 of 5 votes (a majority, floor(N/2)+1) are needed and that each node votes at most once per term.
- Explains why a majority is required: two majorities always share at least one node, so two leaders cannot win the same term, and a minority partition (for example 2 of 5) can neither elect a leader nor commit writes (no split brain).
- Covers the split vote (nobody reaches a majority; random timeouts make one candidate retry first) and says that writes fail or are retried until a new leader exists.
@@solution
There are three roles: follower, candidate and leader. Time is cut into terms, a number that only goes up, and each term has at most one leader. In normal operation the leader sends heartbeats and the four followers stay quiet.

Say the leader of our 5 nodes crashes. Each follower has a randomized election timeout, for example 150-300 ms. The first follower whose timer fires without a heartbeat becomes a candidate. It adds 1 to its term, votes for itself and sends RequestVote to the other four. A node grants its vote if it has not voted in that term yet and the candidate's log is at least as up to date as its own.

The candidate needs 3 votes out of 5, a majority. The reason is overlap: any two groups of 3 out of 5 share at least one node, and that node votes only once per term, so two leaders can never win the same term. With a threshold of 2 of 5, two candidates could both win and the cluster would have two leaders (split brain) accepting different writes. The same rule protects a network partition: the side with 2 nodes can never elect a leader or commit a write; only the side with 3 can.

If two followers time out at almost the same moment, the votes may split, for example 2-2 with one vote lost. Nobody has a majority, the term ends without a leader, and because the timeouts are random one node usually times out first in the next round and wins. A node that sees a higher term, or a heartbeat from a valid leader, goes back to follower.

While there is no leader, client writes fail or wait and are retried, because only a leader may append to the log. Once the new leader has won, it sends heartbeats and service continues, usually after a few hundred milliseconds.
````
