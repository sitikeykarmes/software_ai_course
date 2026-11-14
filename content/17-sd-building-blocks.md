---
id: sd-building-blocks
title: System design building blocks
minutes: 70
---

Every large system is assembled from about a dozen standard parts. This lesson explains each one: what problem it solves, how it works inside, and where it is used. Learn them well and most designs become a matter of choosing and connecting.

## Load balancers

A load balancer receives requests and spreads them across a pool of servers. It also stops sending traffic to servers that fail their **health check**, which is what turns several unreliable servers into one reliable service.

| Kind | Sees | Can do | Examples |
| --- | --- | --- | --- |
| Layer 4 | IP addresses and ports | Fast forwarding of TCP or UDP | AWS NLB, HAProxy in TCP mode |
| Layer 7 | HTTP method, path, headers, cookies | Route `/api` and `/images` to different pools; terminate TLS; retry; rewrite | Nginx, HAProxy, Envoy, AWS ALB |

| Algorithm | How | Use when |
| --- | --- | --- |
| Round robin | Each server in turn | Requests cost about the same |
| Weighted round robin | Bigger servers get a larger share | Mixed machine sizes |
| Least connections | Send to the server with the fewest open requests | Request durations vary a lot |
| Least response time | Send to the fastest responder | Latency-sensitive services |
| IP or key hash | The same client or key always reaches the same server | Sticky sessions, cache locality |
| Random with two choices | Pick two servers at random, use the less loaded | Very large pools; simple and effective |

```python run
import itertools, random

servers = ["app-1", "app-2", "app-3"]
rr = itertools.cycle(servers)
print("round robin      :", [next(rr) for _ in range(7)])

open_connections = {"app-1": 12, "app-2": 3, "app-3": 9}
def least_connections():
    s = min(open_connections, key=open_connections.get)
    open_connections[s] += 1
    return s
print("least connections:", [least_connections() for _ in range(7)])

def ip_hash(client_ip):
    return servers[hash(client_ip) % len(servers)]
print("ip hash          :", ip_hash("10.1.4.7") == ip_hash("10.1.4.7"), "(same client, same server)")

healthy = {"app-1": True, "app-2": False, "app-3": True}        # app-2 failed its health check
print("after failure    :", [random.choice([s for s in servers if healthy[s]]) for _ in range(5)])
```

Things to mention in a design:

- **The load balancer must not be a single point of failure**. Run an active-passive pair sharing a virtual IP, or use a managed one that is already redundant.
- **Sticky sessions** tie a user to one server. Prefer stateless servers with a shared session store so that any server will do.
- **Global load balancing** uses DNS or anycast to send users to the nearest region.
- **Connection draining**: when removing a server, let in-flight requests finish.

## Reverse proxy and API gateway

A **reverse proxy** stands in front of your servers and handles concerns you do not want in application code: TLS termination, compression, caching, static files, request buffering.

An **API gateway** is a reverse proxy with API features. With many services behind it, clients talk to one address and the gateway provides:

- Authentication and authorization checks
- Rate limiting and quotas per client
- Routing to the right service, and request or response transformation
- Request logging, metrics and tracing headers
- API versioning

Examples: Kong, AWS API Gateway, Apigee, Envoy-based gateways. The risk is putting business logic in the gateway; keep it to cross-cutting concerns.

## Horizontal and vertical scaling

- **Vertical** (scale up): a bigger machine. Simple, no code changes, has a ceiling, and the machine remains a single point of failure.
- **Horizontal** (scale out): more machines. Practically unlimited, tolerates failure, and requires statelessness and a load balancer.
- **Autoscaling** adds or removes instances based on a metric such as CPU or queue length. Scale out quickly and scale in slowly to avoid flapping.

Databases are harder to scale horizontally than app servers because they hold state. That is the subject of [the next lesson](#sd-data-at-scale).

## Rate limiting

A rate limiter caps how many requests a client may make in a period. It protects the service from abuse, bugs and overload, and keeps one noisy client from hurting everyone else. Rejected requests get HTTP 429 with a `Retry-After` header.

```sim
token-bucket
```

| Algorithm | How it works | Strength | Weakness |
| --- | --- | --- | --- |
| Fixed window | Count requests in each clock minute | Trivial; one counter | A client can send double the limit across a window boundary |
| Sliding window log | Store a timestamp per request; count those in the last 60 seconds | Exact | Memory grows with traffic |
| Sliding window counter | Weighted blend of the current and previous window counts | Smooth, little memory | Approximate |
| Token bucket | Tokens refill steadily up to a capacity; each request spends one | Allows short bursts; most common | Two parameters to tune |
| Leaky bucket | Requests queue and leave at a fixed rate | Smooth output rate | Bursts wait or are dropped |

```python run
import time
from collections import deque

class TokenBucket:
    def __init__(self, rate, capacity):
        self.rate, self.capacity = rate, capacity
        self.tokens, self.updated = capacity, time.monotonic()
    def allow(self):
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False

class SlidingWindowLog:
    def __init__(self, limit, window):
        self.limit, self.window, self.times = limit, window, deque()
    def allow(self):
        now = time.monotonic()
        while self.times and self.times[0] <= now - self.window:
            self.times.popleft()
        if len(self.times) < self.limit:
            self.times.append(now)
            return True
        return False

bucket = TokenBucket(rate=5, capacity=3)          # 5 per second, bursts of 3
print("burst of 6 :", [bucket.allow() for _ in range(6)])
time.sleep(0.4)                                   # 2 tokens refill
print("after 0.4s :", [bucket.allow() for _ in range(3)])

log = SlidingWindowLog(limit=2, window=0.3)
print("window     :", [log.allow() for _ in range(3)], end=" ")
time.sleep(0.31)
print("then", log.allow())
```

In a real system with many app servers, the counters live in Redis so all servers share one limit, and the read-modify-write is done atomically with a Lua script or `INCR` with `EXPIRE`. Decide what you limit by: user ID, API key, IP address, or a combination. The full design is worked through in [the first set of cases](#sd-cases-1).

## Consistent hashing

You have N cache servers and need to decide which server holds each key. The obvious `hash(key) % N` breaks when N changes: almost every key maps to a different server, the whole cache misses at once, and the database is flooded.

**Consistent hashing** places servers and keys on a ring of hash values. A key belongs to the first server clockwise from it. Adding or removing a server only moves the keys in one arc of the ring, about 1/N of them.

```sim
hash-ring
```

One point per server gives uneven arcs, so each server is placed at many points called **virtual nodes**. That evens out the load and spreads a failed server's keys across all the others.

```python run
import bisect, hashlib

def h(value):
    return int(hashlib.md5(value.encode()).hexdigest(), 16)

class HashRing:
    def __init__(self, nodes, vnodes=100):
        self.vnodes, self.ring = vnodes, []            # sorted list of (position, node)
        for n in nodes:
            self.add(n)
    def add(self, node):
        for v in range(self.vnodes):
            bisect.insort(self.ring, (h(f"{node}#{v}"), node))
    def remove(self, node):
        self.ring = [(p, n) for p, n in self.ring if n != node]
    def lookup(self, key):
        i = bisect.bisect(self.ring, (h(key), ""))
        return self.ring[i % len(self.ring)][1]         # wrap around the ring

keys = [f"user:{i}" for i in range(10_000)]

ring = HashRing(["cache-a", "cache-b", "cache-c"])
before = {k: ring.lookup(k) for k in keys}
ring.add("cache-d")
moved_ring = sum(before[k] != ring.lookup(k) for k in keys)

nodes = ["cache-a", "cache-b", "cache-c"]
mod_before = {k: nodes[h(k) % 3] for k in keys}
nodes.append("cache-d")
moved_mod = sum(mod_before[k] != nodes[h(k) % 4] for k in keys)

print(f"consistent hashing moved {moved_ring / len(keys):.0%} of keys (ideal: 25%)")
print(f"hash % N moved           {moved_mod / len(keys):.0%} of keys")
counts = {}
for k in keys:
    counts[ring.lookup(k)] = counts.get(ring.lookup(k), 0) + 1
print("load per node:", counts)
```

Used by: Cassandra and DynamoDB to place data, Memcached clients, CDNs to choose an edge cache, load balancers that need the same key on the same backend.

## Unique ID generation

A single database can use an auto-increment column. Many databases or services need IDs that are unique without asking a central authority.

| Approach | Size | Sortable by time | Notes |
| --- | --- | --- | --- |
| Auto-increment | 64 bits | Yes | Needs one database; reveals volumes; a bottleneck when sharded |
| UUID v4 (random) | 128 bits | No | No coordination; large; random values scatter index inserts |
| UUID v7 / ULID | 128 bits | Yes | Timestamp first, then random bits; index-friendly |
| Snowflake-style | 64 bits | Yes | Timestamp + machine ID + sequence; needs unique machine IDs and sane clocks |
| Ticket server / ranges | 64 bits | Roughly | A central service hands each app server a block of 1,000 IDs |

The Snowflake layout: 41 bits of milliseconds since a chosen epoch, 10 bits of machine ID, 12 bits of sequence. That is 4,096 IDs per millisecond per machine for about 69 years.

```python run
import time, threading

class Snowflake:
    EPOCH = 1_704_067_200_000                      # 2024-01-01 in milliseconds
    def __init__(self, machine_id):
        self.machine_id, self.last_ms, self.seq = machine_id & 0x3FF, -1, 0
        self.lock = threading.Lock()
    def next_id(self):
        with self.lock:
            now = int(time.time() * 1000)
            if now == self.last_ms:
                self.seq = (self.seq + 1) & 0xFFF   # 12-bit sequence within one millisecond
                if self.seq == 0:
                    while now <= self.last_ms:      # sequence exhausted: wait for the next millisecond
                        now = int(time.time() * 1000)
            else:
                self.seq = 0
            self.last_ms = now
            return ((now - self.EPOCH) << 22) | (self.machine_id << 12) | self.seq

gen = Snowflake(machine_id=7)
ids = [gen.next_id() for _ in range(5)]
print(ids)
print("unique:", len(set(ids)) == 5, "| increasing:", ids == sorted(ids))
i = ids[0]
print("decoded -> ms since epoch:", i >> 22, "machine:", (i >> 12) & 0x3FF, "sequence:", i & 0xFFF)
```

## Bloom filters

A Bloom filter answers "have I seen this item?" using very little memory. It can say **definitely not** or **probably yes**. It never gives a false negative, and it has a small, tunable rate of false positives.

It is a bit array plus k hash functions. To add an item, set the k bits its hashes point at. To check, test those k bits: if any is 0 the item was never added.

```python run
import hashlib

class BloomFilter:
    def __init__(self, bits=5000, hashes=4):
        self.bits, self.hashes, self.array = bits, hashes, bytearray(bits)
    def _positions(self, item):
        for i in range(self.hashes):
            yield int(hashlib.sha256(f"{i}:{item}".encode()).hexdigest(), 16) % self.bits
    def add(self, item):
        for p in self._positions(item):
            self.array[p] = 1
    def might_contain(self, item):
        return all(self.array[p] for p in self._positions(item))

bf = BloomFilter()
for i in range(500):
    bf.add(f"user{i}@example.com")
print("known item        :", bf.might_contain("user42@example.com"))
false_positives = sum(bf.might_contain(f"stranger{i}@example.com") for i in range(5000))
print(f"false positive rate on 5,000 unknown items: {false_positives / 5000:.2%}")
```

Used by: databases such as Cassandra and RocksDB to skip disk files that cannot contain a key; browsers checking a URL against a malicious-site list; web crawlers remembering visited URLs; "this username is taken" pre-checks; avoiding cache penetration.

## Heartbeats, health checks and failure detection

In a distributed system you cannot distinguish a dead node from a slow one or a broken network link. Systems cope with timeouts and periodic signals.

- **Health check**: the load balancer or orchestrator calls `/health` on each server. **Liveness** asks "is the process alive?" (restart if not); **readiness** asks "can it take traffic?" (remove from rotation if not).
- **Heartbeat**: each node sends "I am alive" every few seconds. Missing several in a row marks it failed.
- **Gossip protocol**: each node periodically exchanges state with a few random peers; information spreads to the whole cluster without a central coordinator. Cassandra and Consul use it.

## Coordination: locks and leader election

Some jobs must be done by exactly one node at a time: running a nightly billing job, being the primary database. This needs **leader election** or a **distributed lock**.

- A **coordination service** (ZooKeeper, etcd, Consul) keeps a small amount of strongly consistent data and offers locks, leases and leader election. Kubernetes stores all its state in etcd.
- A **lease** is a lock with an expiry, so a crashed holder does not block forever.
- **Fencing tokens**: each lock grant comes with an increasing number. The protected resource rejects writes carrying an older number, which defends against a paused process that still believes it holds the lock.
- **Split brain** is the failure being prevented: two nodes both believing they are the leader and both accepting writes. Requiring a majority (a quorum) prevents it, which is why clusters have 3 or 5 nodes and not 2 or 4.

The consensus algorithms behind this, Raft and Paxos, are explained in [data at scale](#sd-data-at-scale).

## Content delivery networks

A CDN caches content at edge locations near users. Design points:

- Serve all static assets, images and video from the CDN.
- **Cache key** and **TTL** decide what is reused and for how long.
- **Invalidation** when content changes: versioned URLs are simpler and more reliable than purging.
- Dynamic content can use the CDN for TLS termination, connection reuse and DDoS protection even when it cannot be cached.

## Object storage

Object storage (Amazon S3, Azure Blob, Google Cloud Storage) holds files of any size as objects in buckets, addressed by key, with very high durability through replication or erasure coding across data centres.

- Store images, video, documents, backups, logs, datasets and model files there. Never store large files in a relational database; store the object key.
- **Presigned URLs** let a client upload or download one object directly for a few minutes, so file bytes never pass through your app servers.
- **Multipart upload** sends a large file in parts that can be retried individually.
- **Storage classes** move rarely read data to cheaper tiers.

## Search

Relational `LIKE '%word%'` scans every row. A search engine (Elasticsearch, OpenSearch, Apache Solr, built on Lucene) builds an **inverted index**: a map from each word to the list of documents containing it.

```python run
from collections import defaultdict

docs = {1: "gearbox oil leak found on line two",
        2: "oil pressure sensor replaced",
        3: "line two stopped for gearbox inspection"}

index = defaultdict(set)
for doc_id, text in docs.items():
    for word in text.lower().split():
        index[word].add(doc_id)

def search(query):
    sets = [index.get(w, set()) for w in query.lower().split()]
    return sorted(set.intersection(*sets)) if sets else []

print(dict(list(index.items())[:4]))
print("gearbox      ->", search("gearbox"))
print("gearbox line ->", search("gearbox line"))
print("oil          ->", search("oil"))
```

Real engines add tokenisation, stemming ("running" matches "run"), relevance ranking (BM25), fuzzy matching and sharding. The search index is usually a secondary copy of data whose source of truth is a database, kept in sync through a queue or change data capture.

## Putting the blocks together

| Need | Building block |
| --- | --- |
| More request capacity; survive a server failure | Load balancer and stateless servers |
| One entry point with auth and limits | API gateway |
| Faster reads | Cache, CDN, read replicas |
| Slow or unreliable work | Message queue and workers |
| Protect against overload and abuse | Rate limiter |
| Spread keys across changing servers | Consistent hashing |
| IDs without a central database | Snowflake or UUID v7 |
| Cheap "definitely not present" check | Bloom filter |
| Exactly one node does a job | Leader election or a distributed lock |
| Large files | Object storage and presigned URLs |
| Full-text queries | Search engine with an inverted index |

## Check yourself

```quiz
[
  {"q": "What does a layer 7 load balancer do that a layer 4 one cannot?", "options": ["Forward TCP connections", "Route by URL path or header and terminate TLS", "Balance by IP address"], "answer": 1, "why": "Layer 7 understands HTTP; layer 4 sees only addresses and ports."},
  {"q": "With `hash(key) % N`, what happens when a cache server is added?", "options": ["About 1/N of keys move", "Almost all keys map to a different server", "Nothing changes"], "answer": 1, "why": "Changing N changes nearly every remainder. Consistent hashing limits movement to about 1/N."},
  {"q": "Why does a token bucket suit most APIs?", "options": ["It never rejects requests", "It allows short bursts while enforcing an average rate", "It needs no storage"], "answer": 1, "why": "Real clients are bursty; the bucket capacity absorbs that."},
  {"q": "A Bloom filter says an item is not present. How sure can you be?", "options": ["Completely: there are no false negatives", "About 99%", "Not at all"], "answer": 0, "why": "False positives are possible; false negatives are not."},
  {"q": "Why do coordination clusters use 3 or 5 nodes instead of 2 or 4?", "options": ["Odd numbers are faster", "A majority is needed to decide; an odd count tolerates failures without ties and prevents split brain", "Licensing"], "answer": 1, "why": "Three nodes survive one failure and five survive two; four survives only one, the same as three."},
  {"q": "Where should a 2 GB video upload be stored?", "options": ["In a PostgreSQL column", "In object storage, with only the key in the database", "In Redis"], "answer": 1, "why": "Object stores are built for large blobs; clients upload directly through a presigned URL."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: weighted-round-robin
title: Smooth weighted round robin
kind: code
level: medium
@@statement
Write `weighted_round_robin(servers, n)` that picks `n` servers in proportion to their weights, spreading the heavy server's picks out instead of sending them all in a row (the algorithm nginx uses).

**Input**
- `servers`: a list of `(name, weight)` tuples with integer weights `>= 1`.
- `n`: how many picks to make (`>= 0`).

**Algorithm** (repeat `n` times). Keep a `current` value per server, starting at 0.
1. Add each server's weight to its `current`.
2. Pick the server with the largest `current` (on a tie, the one that comes first in the list).
3. Subtract the **total weight** of all servers from the picked server's `current`.

**Output**: a list of `n` server names. Empty `servers` or `n = 0` gives `[]`.

**Example**

```
weighted_round_robin([("a", 5), ("b", 1), ("c", 1)], 7)
-> ["a", "a", "b", "a", "c", "a", "a"]
```
@@starter
def weighted_round_robin(servers, n):
    pass
@@tests
assert weighted_round_robin([("a", 5), ("b", 1), ("c", 1)], 7) == ["a", "a", "b", "a", "c", "a", "a"], "nginx example"
assert weighted_round_robin([("x", 1), ("y", 1)], 4) == ["x", "y", "x", "y"], "equal weights alternate"
assert weighted_round_robin([], 5) == [], "no servers"
assert weighted_round_robin([("a", 2)], 0) == [], "zero picks"
_picks = weighted_round_robin([("a", 3), ("b", 2), ("c", 1)], 60)
assert (_picks.count("a"), _picks.count("b"), _picks.count("c")) == (30, 20, 10), "proportional to weights"
assert "aaa" not in "".join(weighted_round_robin([("a", 3), ("b", 3)], 12)), "no long runs of one server"
@@hint
Use a list `current` with one 0 per server. In each round add the weights, find the largest with a loop that only switches on `>` (so ties keep the earlier server), then subtract the total.
@@solution
def weighted_round_robin(servers, n):
    if not servers:
        return []
    total = sum(w for _, w in servers)
    current = [0] * len(servers)
    picks = []
    for _ in range(n):
        best = 0
        for i, (_, w) in enumerate(servers):
            current[i] += w
            if current[i] > current[best]:
                best = i
        current[best] -= total
        picks.append(servers[best][0])
    return picks
````

````task
id: fixed-window-limiter
title: Fixed-window rate limiter and its boundary burst
kind: code
level: easy
@@statement
Write a class `FixedWindowLimiter(limit, window_seconds)`.

**Method**: `allow(now)` returns `True` if the request at time `now` (seconds, a number) is allowed, otherwise `False`.

**Rules**
- Time is cut into fixed windows: window number = `int(now // window_seconds)`. For a 10 second window, times `0 <= t < 10` are window 0, `10 <= t < 20` are window 1.
- In each window at most `limit` requests are allowed. Denied requests do not count.
- A new window starts counting from 0.
- Calls come with non-decreasing `now`.

**Boundary burst**: with `limit=5` and a 10 second window, 5 requests at `t=9.5` and 5 more at `t=10.0` are all allowed. That is 10 requests in half a second, twice the limit.

**Example**

```
lim = FixedWindowLimiter(2, 10)
[lim.allow(t) for t in (0, 1, 2, 10)] -> [True, True, False, True]
```
@@starter
class FixedWindowLimiter:
    def __init__(self, limit, window_seconds):
        pass

    def allow(self, now):
        pass
@@tests
_l = FixedWindowLimiter(2, 10)
assert [_l.allow(t) for t in (0, 1, 2, 10)] == [True, True, False, True], "basic windows"
_l = FixedWindowLimiter(5, 10)
assert all([_l.allow(9.0 + i * 0.1) for i in range(5)]), "5 allowed at the end of window 0"
assert not _l.allow(9.9), "6th in the same window is denied"
assert all([_l.allow(10.0 + i * 0.1) for i in range(5)]), "window 1 allows 5 more immediately (the burst)"
assert not _l.allow(10.6), "window 1 is full"
assert _l.allow(25), "later window is fresh"
_z = FixedWindowLimiter(0, 10)
assert not _z.allow(1), "limit 0 denies everything"
@@hint
Remember the number of the current window and the count in it. When `now` falls in a different window, reset the count.
@@solution
class FixedWindowLimiter:
    def __init__(self, limit, window_seconds):
        self.limit = limit
        self.window = window_seconds
        self.current = None
        self.count = 0

    def allow(self, now):
        w = int(now // self.window)
        if w != self.current:
            self.current = w
            self.count = 0
        if self.count < self.limit:
            self.count += 1
            return True
        return False
````

````task
id: hash-ring
title: Consistent hash ring with virtual nodes
kind: code
level: hard
@@statement
Write a class `HashRing(nodes, vnodes=100)` and a function `load_distribution(ring, keys)`.

**Hashing** (use exactly this): `_h(s) = int(hashlib.md5(s.encode()).hexdigest(), 16)`. It is given in the starter.

**Ring**
- For each node name and each `i` in `range(vnodes)`, place a point at `_h("<node>#<i>")` (for example `_h("A#0")`) that belongs to that node.
- `get_node(key)` returns the node owning the first point with hash `>= _h(key)` going clockwise (use `bisect_left`), wrapping around to the first point if there is none. `key` is a string.
- `add_node(name)` adds a node's points. `remove_node(name)` removes them. The attribute `nodes` is the list of node names.

**load_distribution(ring, keys)**: returns a dict `{node: how many of the keys it owns}` that includes every node on the ring (0 if it owns none).

**Example**

```
ring = HashRing(["A", "B", "C"], vnodes=200)
load_distribution(ring, ["k%d" % i for i in range(3000)])
-> about 1000 keys each; with vnodes=1 the split is far more uneven
```
@@starter
import bisect
import hashlib

def _h(s):
    return int(hashlib.md5(s.encode()).hexdigest(), 16)

class HashRing:
    def __init__(self, nodes, vnodes=100):
        pass

    def add_node(self, name):
        pass

    def remove_node(self, name):
        pass

    def get_node(self, key):
        pass

def load_distribution(ring, keys):
    pass
@@tests
_keys = ["k%d" % i for i in range(3000)]
_r = HashRing(["A", "B", "C"], vnodes=200)
assert _r.get_node("k1") == _r.get_node("k1") and _r.get_node("k1") in ("A", "B", "C"), "deterministic owner"
_d = load_distribution(_r, _keys)
assert sum(_d.values()) == 3000 and set(_d) == {"A", "B", "C"}, "every key counted once"
assert max(_d.values()) / min(_d.values()) < 1.5, "200 vnodes spread load evenly"
_before = {k: _r.get_node(k) for k in _keys}
_r.add_node("D")
_moved = [k for k in _keys if _r.get_node(k) != _before[k]]
assert 0 < len(_moved) < 1500, "only a fraction of keys move"
assert all(_r.get_node(k) == "D" for k in _moved), "moved keys all went to the new node"
_r.remove_node("D")
assert {k: _r.get_node(k) for k in _keys} == _before, "removing the node restores the old mapping"
_one = HashRing(["solo"], vnodes=1)
assert _one.get_node("anything") == "solo", "single node owns everything"
assert load_distribution(HashRing(["A", "B"], vnodes=1), []) == {"A": 0, "B": 0}, "no keys"
@@hint
Keep a sorted list of `(hash, node)` tuples and a parallel list of just the hashes for `bisect_left`. Rebuild both in `add_node` and `remove_node`.
@@solution
import bisect
import hashlib

def _h(s):
    return int(hashlib.md5(s.encode()).hexdigest(), 16)

class HashRing:
    def __init__(self, nodes, vnodes=100):
        self.vnodes = vnodes
        self.nodes = []
        self.points = []
        self.hashes = []
        for n in nodes:
            self.add_node(n)

    def _rebuild(self):
        self.points = sorted(
            (_h("%s#%d" % (n, i)), n) for n in self.nodes for i in range(self.vnodes)
        )
        self.hashes = [p[0] for p in self.points]

    def add_node(self, name):
        if name not in self.nodes:
            self.nodes.append(name)
            self._rebuild()

    def remove_node(self, name):
        if name in self.nodes:
            self.nodes.remove(name)
            self._rebuild()

    def get_node(self, key):
        i = bisect.bisect_left(self.hashes, _h(key))
        if i == len(self.points):
            i = 0
        return self.points[i][1]

def load_distribution(ring, keys):
    counts = {n: 0 for n in ring.nodes}
    for k in keys:
        counts[ring.get_node(k)] += 1
    return counts
````

````task
id: snowflake-decode
title: Decode a Snowflake ID
kind: code
level: medium
@@statement
A Snowflake ID is a 64-bit integer laid out like this (from the highest bit to the lowest):

```
[ 41 bits: milliseconds since a custom epoch ][ 10 bits: machine id ][ 12 bits: sequence ]
```

Write `decode_snowflake(snowflake_id, epoch_ms=1288834974657)`.

**Input**: the integer ID, and the custom epoch in milliseconds since 1970-01-01 UTC.

**Output**: a dict with exactly these keys:
- `"timestamp_ms"`: the absolute time in ms since 1970 (`(id >> 22) + epoch_ms`).
- `"machine_id"`: the 10-bit machine number.
- `"sequence"`: the 12-bit sequence number.
- `"time"`: the UTC time as text `"YYYY-MM-DD HH:MM:SS.mmm"` (always three digits of milliseconds).

**Example**

```
an ID made from timestamp 1700000000123 ms, machine 5, sequence 9 ->
{"timestamp_ms": 1700000000123, "machine_id": 5, "sequence": 9, "time": "2023-11-14 22:13:20.123"}
```
@@starter
import datetime

def decode_snowflake(snowflake_id, epoch_ms=1288834974657):
    pass
@@tests
_E = 1288834974657
def _make(ts, machine, seq):
    return ((ts - _E) << 22) | (machine << 12) | seq

_r = decode_snowflake(_make(1700000000123, 5, 9))
assert _r == {"timestamp_ms": 1700000000123, "machine_id": 5, "sequence": 9, "time": "2023-11-14 22:13:20.123"}, "full decode"
_r = decode_snowflake(_make(1700000000000, 1023, 4095))
assert _r["machine_id"] == 1023 and _r["sequence"] == 4095, "maximum field values"
assert _r["time"] == "2023-11-14 22:13:20.000", "zero milliseconds keep three digits"
assert decode_snowflake(_make(_E, 0, 0))["timestamp_ms"] == _E, "time part 0 is the epoch"
assert decode_snowflake(5 << 22, epoch_ms=0)["timestamp_ms"] == 5, "custom epoch"
assert decode_snowflake(_make(1700000000007, 2, 1))["time"].endswith(".007"), "milliseconds padded"
@@hint
Use shifts and masks: `id >> 22`, `(id >> 12) & 0x3FF`, `id & 0xFFF`. For the text, add `timedelta(milliseconds=ts)` to `datetime.datetime(1970, 1, 1)`, format with `%Y-%m-%d %H:%M:%S`, then append the milliseconds.
@@solution
import datetime

def decode_snowflake(snowflake_id, epoch_ms=1288834974657):
    ts = (snowflake_id >> 22) + epoch_ms
    machine = (snowflake_id >> 12) & 0x3FF
    seq = snowflake_id & 0xFFF
    moment = datetime.datetime(1970, 1, 1) + datetime.timedelta(milliseconds=ts)
    text = moment.strftime("%Y-%m-%d %H:%M:%S") + ".%03d" % (ts % 1000)
    return {"timestamp_ms": ts, "machine_id": machine, "sequence": seq, "time": text}
````

````task
id: bloom-math
title: Bloom filter false positive rate
kind: code
level: medium
@@statement
A Bloom filter with `m` bits, `k` hash functions and `n` inserted items has a false positive probability of about `(1 - e^(-k*n/m)) ** k`. Write two functions.

1. `bloom_false_positive_rate(m_bits, k_hashes, n_items)` returns that probability as a float. With `n_items = 0` it is `0.0`.
2. `best_k(m_bits, n_items)` returns the best number of hash functions: `round((m / n) * ln 2)`, but never less than 1.

**Input**: positive integers (`n_items` may be 0 for the first function; `best_k` gets `n_items >= 1`).

**Output**: a float and an int.

**Example**

```
bloom_false_positive_rate(8000, 3, 1000) -> about 0.0306
best_k(9600, 1000)                       -> 7
```
Try it yourself: print the rate for `k = 1..12` with `m = 9600, n = 1000` and see where it is lowest.
@@starter
import math

def bloom_false_positive_rate(m_bits, k_hashes, n_items):
    pass

def best_k(m_bits, n_items):
    pass
@@tests
assert bloom_false_positive_rate(1000, 3, 0) == 0.0, "empty filter"
assert abs(bloom_false_positive_rate(8000, 3, 1000) - 0.0306) < 0.0005, "worked example"
assert best_k(9600, 1000) == 7, "about 10 bits per item"
assert best_k(100, 1000) == 1, "never below 1"
assert bloom_false_positive_rate(16000, 3, 1000) < bloom_false_positive_rate(8000, 3, 1000), "more bits, fewer false positives"
_rates = [bloom_false_positive_rate(9600, k, 1000) for k in range(1, 13)]
assert _rates.index(min(_rates)) + 1 == best_k(9600, 1000), "best_k is where the rate is lowest"
assert 0 < bloom_false_positive_rate(9600, 7, 1000) < 0.011, "about 1 percent"
@@hint
`math.exp(-k * n / m)` is the fraction of bits that are still 0. Raise `1 - that` to the power `k`.
@@solution
import math

def bloom_false_positive_rate(m_bits, k_hashes, n_items):
    if n_items == 0:
        return 0.0
    return (1 - math.exp(-k_hashes * n_items / m_bits)) ** k_hashes

def best_k(m_bits, n_items):
    return max(1, round((m_bits / n_items) * math.log(2)))
````

````task
id: inverted-index-ranking
title: Inverted index with term-frequency ranking
kind: code
level: medium
@@statement
Write two functions for a tiny search engine.

1. `build_index(docs)`: `docs` is a dict `{doc_id: text}`. Return an inverted index `{term: {doc_id: count}}`, where `count` is how many times the term occurs in that document.
2. `search(index, query)`: return a ranked list of `(doc_id, score)` tuples.

**Tokenizing** (both functions): lowercase the text and take runs of letters and digits: `re.findall(r"[a-z0-9]+", text.lower())`.

**Ranking**: the score of a document is the **sum of the term frequencies** of all query terms in it. Only documents with a score above 0 are returned. Sort by score, highest first. Break ties by `doc_id`, A to Z. An empty query returns `[]`.

**Example**

```
docs = {"d1": "the cat sat", "d2": "cat cat dog", "d3": "dog"}
search(build_index(docs), "cat")      -> [("d2", 2), ("d1", 1)]
search(build_index(docs), "cat dog")  -> [("d2", 3), ("d1", 1), ("d3", 1)]
```
@@starter
import re

def build_index(docs):
    pass

def search(index, query):
    pass
@@tests
_docs = {"d1": "the cat sat", "d2": "cat cat dog", "d3": "dog"}
_idx = build_index(_docs)
assert _idx["cat"] == {"d1": 1, "d2": 2}, "term counts per document"
assert _idx["dog"] == {"d2": 1, "d3": 1}, "another term"
assert search(_idx, "cat") == [("d2", 2), ("d1", 1)], "ranked by term frequency"
assert search(_idx, "cat dog") == [("d2", 3), ("d1", 1), ("d3", 1)], "scores add up, ties by id"
assert search(_idx, "unicorn") == [], "unknown term"
assert search(_idx, "") == [], "empty query"
assert search(_idx, "CAT!") == [("d2", 2), ("d1", 1)], "query is normalised"
assert build_index({}) == {}, "empty corpus"
assert build_index({"a": "Hello, hello WORLD"})["hello"] == {"a": 2}, "case-insensitive counting"
@@hint
While building, use `index.setdefault(term, {})` and add 1 to `index[term][doc_id]`. For search, keep a dict `scores` and add `index[term][doc_id]` for every query term that exists.
@@solution
import re

def _tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower())

def build_index(docs):
    index = {}
    for doc_id, text in docs.items():
        for term in _tokens(text):
            postings = index.setdefault(term, {})
            postings[doc_id] = postings.get(doc_id, 0) + 1
    return index

def search(index, query):
    scores = {}
    for term in _tokens(query):
        for doc_id, count in index.get(term, {}).items():
            scores[doc_id] = scores.get(doc_id, 0) + count
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))
````
