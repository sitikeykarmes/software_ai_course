---
id: sd-cases-1
title: Worked designs 1: URL shortener, rate limiter, key-value store, notifications, job scheduler
minutes: 80
---

Each design below follows the six steps from [the method lesson](#sd-method): requirements, estimates, API, data model, high-level design, deep dives. Read one, close the page, and reproduce it on paper before reading the next.

## 1. URL shortener (bit.ly)

### Requirements

- **Functional**: create a short link for a long URL; redirect a short link to the original; optional custom alias and expiry.
- **Non-functional**: 100 million new links a month; reads outnumber writes 100 to 1; redirects under 50 ms; a link must never resolve to the wrong URL; reads highly available.
- **Out of scope**: accounts, an analytics dashboard.

### Estimates

About 40 writes and 4,000 reads per second on average; plan for 20,000 reads per second at peak. Six billion links in five years at 500 bytes each is 3 TB.

### API

```
POST /v1/links   {"long_url": "...", "alias": null, "expires_at": null}   -> 201 {"short_code": "aZ3kP9x"}
GET  /{code}                                                               -> 302 Location: <long_url>
```

### Data model

```
links(short_code PK, long_url, created_at, expires_at, owner_id)
```

Access is always by `short_code`. A key-value store (DynamoDB, Cassandra) or sharded PostgreSQL both fit.

### High-level design

```
            +--------- write path ----------+
client -> LB -> app servers -> ID generator -> database (primary + replicas)
                    |
                    +--> Redis cache (code -> long_url)  <- read path checks here first
                    |
                    +--> Kafka "clicks" topic -> analytics store
```

### Deep dive: generating the short code

Seven characters of base62 (0-9, a-z, A-Z) give 62⁷ ≈ 3.5 trillion codes.

| Option | How | Problem |
| --- | --- | --- |
| Hash the URL (MD5) and take 7 characters | Deterministic | Collisions; must check and retry; same URL always gives the same code |
| Random 7 characters | Simple | Must check the database for a collision on every write |
| Counter converted to base62 | No collisions, no lookup | A single counter is a bottleneck and makes codes guessable |
| Counter ranges | Each app server reserves a block of 1,000,000 IDs from a coordination service | Best of both: no collisions, no per-write coordination |
| Snowflake ID in base62 | Unique without coordination | Codes are 11 characters, longer than needed |

```python run
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def encode(n):
    out = []
    while n:
        n, rem = divmod(n, 62)
        out.append(ALPHABET[rem])
    return "".join(reversed(out)) or "0"

def decode(code):
    n = 0
    for ch in code:
        n = n * 62 + ALPHABET.index(ch)
    return n

class RangeAllocator:                      # stands in for ZooKeeper/etcd handing out blocks
    def __init__(self, block=1_000_000):
        self.next_start, self.block = 100_000_000_000, block
    def reserve(self):
        start = self.next_start
        self.next_start += self.block
        return start, start + self.block

class AppServer:
    def __init__(self, allocator):
        self.allocator, self.current, self.end = allocator, 0, 0
    def new_code(self):
        if self.current >= self.end:                       # block used up: fetch another
            self.current, self.end = self.allocator.reserve()
        self.current += 1
        return encode(self.current)

alloc = RangeAllocator()
a, b = AppServer(alloc), AppServer(alloc)
codes = [a.new_code(), a.new_code(), b.new_code(), a.new_code(), b.new_code()]
print(codes, "| unique:", len(set(codes)) == len(codes), "| decode:", decode(codes[0]))
```

To make codes unguessable, shuffle the alphabet or run the counter through a reversible scrambling function before encoding.

### More deep dives

- **301 or 302?** A 301 (permanent) lets browsers cache the redirect, which reduces load and hides later clicks from you. A 302 (temporary) sends every click through your servers, which you need for analytics.
- **Caching**: a small fraction of links gets most of the traffic. Cache-aside in Redis with an LRU policy; a 20 GB cache covers the hot set.
- **Viral link**: a stampede when its cache entry expires. Use a refill lock or never expire hot keys.
- **Custom aliases**: insert with a uniqueness constraint; on conflict return 409.
- **Expiry**: check `expires_at` on read; a background job deletes expired rows in batches.
- **Abuse**: rate-limit creation per user and IP; check URLs against malware lists.
- **Analytics**: publish a click event to Kafka and return the redirect immediately. Never write to an analytics table on the redirect path.

## 2. Distributed rate limiter

### Requirements

- **Functional**: limit each client to N requests per time window per API; return 429 with `Retry-After` when exceeded; rules configurable per endpoint and plan.
- **Non-functional**: adds under 5 ms per request; correct across hundreds of gateway servers; must not take the API down if the limiter fails.

### Where it runs

At the API gateway, before requests reach services. Each gateway instance consults a shared counter store, because a per-server counter would let a client get N requests from every server.

```
client -> load balancer -> API gateway --(allowed)--> services
                               |
                               +--> Redis cluster (counters)      rules loaded from a config store, cached locally
```

### Deep dive: the atomic counter

Read, compare and increment must be one indivisible step, or two gateways will both read 99, both allow, and both write 100. In Redis, run a Lua script, which executes atomically:

```
-- token bucket in Redis; KEYS[1] = bucket key, ARGV = rate, capacity, now
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or tonumber(ARGV[2])
local ts = tonumber(b[2]) or tonumber(ARGV[3])
tokens = math.min(tonumber(ARGV[2]), tokens + (tonumber(ARGV[3]) - ts) * tonumber(ARGV[1]))
local allowed = tokens >= 1
if allowed then tokens = tokens - 1 end
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
redis.call('EXPIRE', KEYS[1], 3600)
return allowed and 1 or 0
```

The same logic with a lock standing in for Redis's single-threaded execution:

```python run
import threading, time

class SharedLimiter:                                  # one instance = the Redis cluster
    def __init__(self, rate, capacity):
        self.rate, self.capacity, self.buckets, self.lock = rate, capacity, {}, threading.Lock()
    def allow(self, client):
        with self.lock:                               # atomic, like a Lua script
            tokens, ts = self.buckets.get(client, (self.capacity, time.monotonic()))
            now = time.monotonic()
            tokens = min(self.capacity, tokens + (now - ts) * self.rate)
            ok = tokens >= 1
            self.buckets[client] = (tokens - 1 if ok else tokens, now)
            return ok

limiter = SharedLimiter(rate=10, capacity=20)
results = []
def gateway(n):                                       # five gateway servers handling the same client
    for _ in range(n):
        results.append(limiter.allow("api-key-123"))
threads = [threading.Thread(target=gateway, args=(10,)) for _ in range(5)]
for t in threads: t.start()
for t in threads: t.join()
print("50 requests through 5 gateways -> allowed:", sum(results), "rejected:", results.count(False))
```

### More deep dives

- **Keys**: `limit:{api_key}:{endpoint}`. Limit by API key or user ID when authenticated, by IP otherwise.
- **Latency**: one Redis round trip per request. Reduce it by keeping a small local allowance per gateway that is synchronised with Redis every 100 ms, accepting slight over-admission.
- **Failure mode**: if Redis is unreachable, **fail open** (allow traffic) for most APIs so the limiter is not a single point of failure; **fail closed** for expensive or sensitive ones such as login.
- **Response headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`.
- **Tiers**: per-second burst limits and per-day quotas are separate counters.
- **Multi-region**: per-region limits, or accept eventual consistency between regions.

## 3. Distributed key-value store (Dynamo style)

### Requirements

- **Functional**: `put(key, value)`, `get(key)`; values up to a few hundred KB.
- **Non-functional**: always writable; scales to hundreds of nodes; tolerates node and data-centre failure; tunable consistency; low latency.

This is an AP design: availability and partition tolerance first, with consistency you can dial up.

### The design, one technique per problem

| Problem | Technique |
| --- | --- |
| Spread keys over nodes; add nodes smoothly | Consistent hashing with virtual nodes |
| Survive node failure | Replicate each key to the next N nodes on the ring |
| Balance consistency and latency | Quorum reads and writes: R + W > N |
| Detect conflicting concurrent writes | Version each value with a vector clock, or use last-write-wins timestamps |
| A replica is temporarily down | Hinted handoff: another node holds the write and forwards it later |
| Replicas drifted apart | Read repair on reads; background anti-entropy comparing Merkle trees |
| Know who is alive | Gossip protocol |
| Fast writes on disk | LSM tree: commit log + memtable + sorted files, with Bloom filters |

```
            client
              |  put(k, v)
        coordinator node  (any node)
        /       |        \
   node A    node B    node C      <- the N=3 nodes clockwise from hash(k)
   ack        ack       (slow)     <- W=2 acks received: reply success
```

### The write and read paths on one node

- **Write**: append to the commit log (durability), update the in-memory **memtable**, reply. When the memtable is full, flush it to disk as an immutable sorted file (**SSTable**). **Compaction** merges files in the background and drops overwritten values.
- **Read**: check the memtable, then SSTables from newest to oldest. A Bloom filter per file says "definitely not here" so most files are skipped.

```python run
class MiniLSM:
    def __init__(self, memtable_limit=3):
        self.memtable, self.sstables, self.limit = {}, [], memtable_limit
    def put(self, key, value):
        self.memtable[key] = value
        if len(self.memtable) >= self.limit:
            self.sstables.append(dict(sorted(self.memtable.items())))   # flush: an immutable sorted file
            self.memtable = {}
    def get(self, key):
        if key in self.memtable:
            return self.memtable[key]
        for table in reversed(self.sstables):                            # newest file first
            if key in table:
                return table[key]
        return None
    def compact(self):
        merged = {}
        for table in self.sstables:                                      # later files overwrite earlier ones
            merged.update(table)
        self.sstables = [dict(sorted(merged.items()))]

db = MiniLSM()
for k, v in [("a", 1), ("b", 2), ("c", 3), ("a", 10), ("d", 4), ("e", 5), ("b", 20)]:
    db.put(k, v)
print("files:", db.sstables, "| memtable:", db.memtable)
print("get a:", db.get("a"), "| get b:", db.get("b"))
db.compact()
print("after compaction:", db.sstables)
```

### Conflicts

Two clients update the same key on different sides of a partition. With **last write wins**, the value with the later timestamp survives and the other is silently lost; clocks also disagree between machines. With **vector clocks**, the store detects that neither version descends from the other and returns both for the application to merge. A shopping cart merges by union. Deletes need **tombstones**, markers that say "deleted", so an old replica does not resurrect the value.

## 4. Notification system

### Requirements

- **Functional**: send push notifications, SMS and email; triggered by services or scheduled; user preferences and opt-outs; templates.
- **Non-functional**: 10 million notifications a day with spikes; no duplicates for transactional messages; delivery within seconds for urgent ones; one provider failing must not block others.

### High-level design

```
services --> Notification API --> validate, dedupe, preferences, template
                                         |
                              Kafka topics per priority
                         /          |           \
                  push workers   SMS workers   email workers
                       |             |              |
                    APNs/FCM     SMS gateway    email provider (SES, SendGrid)
                       \             |              /
                        delivery status events --> status store + analytics
```

### Deep dives

- **Why queues per channel**: an SMS provider outage fills only the SMS queue; push and email continue. Each channel scales its own workers.
- **Priority**: separate topics for OTPs and alerts versus marketing, so a bulk campaign never delays a login code.
- **Deduplication**: the caller supplies an event ID; the API records it with a unique constraint and ignores repeats. Workers are idempotent on notification ID.
- **Retries**: exponential backoff per provider; after the final failure, send to a dead-letter queue and optionally fall back to another channel or provider.
- **Preferences and quiet hours**: check before enqueueing; legal opt-outs are mandatory for marketing.
- **Rate limits**: per user (no more than N marketing messages a day) and per provider (respect their quotas).
- **Templates**: stored with versions and locales; rendered in the worker.
- **Device tokens**: a table of `user_id → device tokens`; remove tokens the push service reports as invalid.
- **Tracking**: provider webhooks report delivered, bounced and opened; store these for analytics and debugging.

## 5. Distributed job scheduler

### Requirements

- **Functional**: run a job at a given time or on a cron schedule; retries; job history.
- **Non-functional**: a job runs at least once and ideally exactly once; millions of scheduled jobs; survive scheduler crashes; a late job starts within seconds.

### High-level design

```
API --> jobs table (id, schedule, next_run_at, status, payload)
              ^
   scheduler instances (several; one leader or partitioned ownership)
     every second: claim jobs where next_run_at <= now
              |
        queue (Kafka / SQS) --> worker pool --> execute, heartbeat, report result
```

### Deep dives

- **Claiming jobs without running them twice**: several schedulers poll the same table. Claim atomically.

```sql
-- PostgreSQL: each scheduler takes a batch that no other scheduler can take
UPDATE jobs SET status = 'queued', claimed_by = 'scheduler-2'
WHERE id IN (
  SELECT id FROM jobs
  WHERE status = 'scheduled' AND next_run_at <= now()
  ORDER BY next_run_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED
)
RETURNING id;
```

- **Efficient polling**: index on `(status, next_run_at)`. For millions of timers, partition jobs by time bucket or use a hierarchical timing wheel in memory.
- **Worker crash**: workers send heartbeats and hold a lease on the job. A job whose lease expires is returned to the queue. Because that can cause a second execution, jobs should be idempotent.
- **Exactly once in practice**: at-least-once delivery plus idempotent jobs keyed by `(job_id, scheduled_time)`.
- **Cron expansion**: after a run, compute `next_run_at` from the cron expression. Decide the policy for missed runs after downtime: run once, run all, or skip.
- **Fairness**: per-tenant queues or quotas so one tenant's million jobs do not starve others.
- **Clock skew**: schedulers use the database's clock, not their own.

Real systems: Airflow, Celery beat, Kubernetes CronJobs, AWS EventBridge Scheduler, Temporal.

## Check yourself

```quiz
[
  {"q": "Why reserve counter ranges per app server in a URL shortener?", "options": ["To make codes longer", "Each server generates unique codes without coordinating on every write", "To encrypt the URL"], "answer": 1, "why": "The coordination service is contacted once per block, not once per link."},
  {"q": "You need click analytics for every redirect. Which status code?", "options": ["301", "302", "200"], "answer": 1, "why": "Browsers cache 301 redirects and skip your server on later clicks."},
  {"q": "Why must a distributed rate limiter's check-and-increment be atomic?", "options": ["For speed", "Otherwise concurrent gateways both read the old count and both allow the request", "Redis requires it"], "answer": 1, "why": "It is the lost-update race across servers."},
  {"q": "The rate limiter's Redis is down. What should a public read API usually do?", "options": ["Reject all requests", "Fail open and allow traffic", "Restart the gateways"], "answer": 1, "why": "The limiter should not become a single point of failure for the whole API."},
  {"q": "In an LSM-based store, why are writes fast?", "options": ["They skip the disk", "They are sequential appends to a log and an in-memory table, not in-place updates", "They are compressed"], "answer": 1, "why": "Sequential I/O is far cheaper than random I/O."},
  {"q": "Why give each notification channel its own queue and workers?", "options": ["It looks cleaner", "A failing or slow provider backs up only its own channel", "Kafka requires it"], "answer": 1, "why": "Isolation between channels is a bulkhead."},
  {"q": "What does `FOR UPDATE SKIP LOCKED` achieve for schedulers?", "options": ["Faster inserts", "Each scheduler claims different rows without waiting on or duplicating another's", "It deletes old jobs"], "answer": 1, "why": "Locked rows are skipped, so batches never overlap."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: url-shortener-design
title: Design a URL shortener from memory
kind: text
level: medium
@@statement
Without looking at the lesson, design a URL shortener in about 35 minutes: think first, then write 15-25 lines. (Afterwards, do the same for the other four designs of this lesson.)

Scenario: 100 million new short links per month, a read to write ratio of 100:1, links live 5 years, an average stored record of 500 bytes, redirect latency p99 under 100 ms, availability 99.95%. Functional requirements: create a short link for a long URL, redirect from the short link, optional custom alias, optional expiry.

**Deliverable**, in this order:
1. APIs (2-4 endpoints with method, path and the important status codes).
2. Data model (table and key).
3. Back-of-envelope: writes per second, reads per second, storage over 5 years, and the number of base62 characters the code needs.
4. The main components (a short diagram in text) and the path of one redirect.
5. Two bottlenecks or deep dives and how you fix each (for example code generation without collisions, a cache for hot links).
@@criteria
- APIs include `POST /links` (long URL, optional alias and expiry) and `GET /{code}` answering with a redirect, saying whether 301 or 302 and why (302 keeps click counting and expiry working), plus 404 or 410 for unknown or expired codes.
- Numbers are correct within rounding: 100M per month is about 40 writes per second, reads about 4,000 per second, storage 100M x 12 x 5 = 6 billion records x 500 B = about 3 TB; 62^7 is about 3.5 trillion, so 7 characters give ample room (62^6 = 56.8 billion is also enough for 6 billion links, with less headroom).
- Data model is a key-value store or a single table keyed by code with long URL, created_at and expires_at; lookups are by primary key only.
- Components: load balancer, stateless app servers, a cache in front of the store (the read path checks the cache first) and the database; the redirect path is traced from request to response.
- Two deep dives with fixes, such as unique code generation (counter or ID ranges with base62, or a hash with a collision check) and caching hot links (LRU cache; a small share of links gets most of the traffic).
@@solution
1. APIs: `POST /api/v1/links` with body `{long_url, alias?, expires_at?}` returns 201 and `{code, short_url}`, 409 if the alias is taken, 400 for an invalid URL. `GET /{code}` returns 302 with a Location header (302 so we can count clicks and honour expiry; a 301 would be cached by browsers), 404 if unknown, 410 if expired. `DELETE /api/v1/links/{code}` for the owner.

2. Data model: table `links(code PK, long_url, owner_id, created_at, expires_at)`. Lookups are only by code, so a key-value store or a SQL table sharded by hash(code) both work.

3. Numbers: writes 100M / 2.6M seconds per month = about 40 per second (peak maybe 100). Reads 100x = about 4,000 per second (peak 10,000). Storage: 100M x 12 x 5 = 6 billion links x 500 B = about 3 TB over 5 years, which fits on a few shards with replicas. Code length: 62^6 = 56.8 billion and 62^7 = 3.5 trillion; 7 characters give plenty of headroom for 6 billion links.

4. Components: client -> load balancer -> stateless app servers -> cache (Redis) -> database. Redirect: the app server looks the code up in the cache; on a miss it reads the database and fills the cache; it checks expiry and returns 302. Create: the app server takes a unique number from the ID service, encodes it in base62 and writes the row.

5. Deep dives. (a) Unique codes: each app server reserves a range of 1,000 numbers from a central counter (a database row or ZooKeeper) and hands them out locally, then base62-encodes them. No collisions and no database check per write; codes are guessable, which a reversible shuffle of the number fixes. (b) Hot links: 4,000 reads per second is easy for the database, but latency is better from a cache. Traffic is very skewed, so caching the hottest 20% of links gives a hit rate above 90%.
````

````task
id: shortener-store
title: Shortener with base62 codes and an LRU cache
kind: code
level: medium
@@statement
Build the core of the URL shortener in memory with the standard library: the code generator, the store, and the cache in front of it.

Write:

1. `base62_encode(n)` and `base62_decode(s)` with the alphabet `"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"` (index = digit value). `base62_encode(0)` is `"0"`, `base62_encode(61)` is `"Z"`, `base62_encode(62)` is `"10"`. No leading zeros.
2. `class UrlShortener` with `UrlShortener(cache_size=2)`:
   - `shorten(url)`: stores the URL and returns its code. The k-th **new** URL (k = 1, 2, 3, ...) gets `base62_encode(k)`. Shortening a URL that is already stored returns the same code and uses no new number.
   - `resolve(code)`: returns the long URL, or `None` for an unknown code. It uses an LRU cache of `cache_size` entries in front of the store: the attribute `cache_hits` counts resolves served from the cache and `cache_misses` counts known codes that had to be read from the store. Unknown codes count as neither. After a store read the code is put in the cache, and the least recently used entry is evicted if the cache is over its size.

**Example**

```
s = UrlShortener(cache_size=2)
s.shorten("https://a.com")  -> "1"
s.shorten("https://b.com")  -> "2"
s.resolve("1")              -> "https://a.com"   # miss
s.resolve("1")              -> "https://a.com"   # hit
```
@@starter
from collections import OrderedDict

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def base62_encode(n):
    pass

def base62_decode(s):
    pass

class UrlShortener:
    def __init__(self, cache_size=2):
        self.cache_hits = 0
        self.cache_misses = 0

    def shorten(self, url):
        pass

    def resolve(self, code):
        pass
@@tests
assert base62_encode(0) == "0" and base62_encode(61) == "Z" and base62_encode(62) == "10", "known codes"
assert base62_encode(125) == "21", "125 = 2*62 + 1"
assert all(base62_decode(base62_encode(_n)) == _n for _n in [0, 1, 61, 62, 3843, 3844, 10 ** 12]), "round trip"
_s = UrlShortener(cache_size=2)
assert _s.shorten("https://a.com") == "1" and _s.shorten("https://b.com") == "2", "counter based codes"
assert _s.shorten("https://a.com") == "1", "same URL, same code"
assert _s.shorten("https://c.com") == "3", "duplicate did not use up a number"
assert _s.resolve("zzz") is None and _s.cache_hits == 0 and _s.cache_misses == 0, "unknown code counts nothing"
assert _s.resolve("1") == "https://a.com" and _s.cache_misses == 1, "first read is a miss"
assert _s.resolve("1") == "https://a.com" and _s.cache_hits == 1, "second read is a hit"
_s.resolve("2")
_s.resolve("3")
assert _s.cache_misses == 3, "2 and 3 are misses; 3 evicts the least recently used entry (1)"
_s.resolve("1")
assert _s.cache_misses == 4, "1 was evicted, so it is a miss again"
_s.resolve("3")
assert _s.cache_hits == 2, "3 is still cached"
@@hint
Keep `self.urls` (code to URL) and `self.codes` (URL to code). For the cache use an `OrderedDict`: `move_to_end` on a hit, `popitem(last=False)` to evict.
@@solution
from collections import OrderedDict

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def base62_encode(n):
    if n == 0:
        return "0"
    digits = []
    while n > 0:
        n, r = divmod(n, 62)
        digits.append(ALPHABET[r])
    return "".join(reversed(digits))

def base62_decode(s):
    n = 0
    for ch in s:
        n = n * 62 + ALPHABET.index(ch)
    return n

class UrlShortener:
    def __init__(self, cache_size=2):
        self.cache_size = cache_size
        self.cache = OrderedDict()
        self.urls = {}
        self.codes = {}
        self.next_id = 1
        self.cache_hits = 0
        self.cache_misses = 0

    def shorten(self, url):
        if url in self.codes:
            return self.codes[url]
        code = base62_encode(self.next_id)
        self.next_id += 1
        self.urls[code] = url
        self.codes[url] = code
        return code

    def resolve(self, code):
        if code in self.cache:
            self.cache.move_to_end(code)
            self.cache_hits += 1
            return self.cache[code]
        if code not in self.urls:
            return None
        self.cache_misses += 1
        self.cache[code] = self.urls[code]
        if len(self.cache) > self.cache_size:
            self.cache.popitem(last=False)
        return self.urls[code]
````

````task
id: limiter-compare
title: Sliding window versus token bucket under a burst
kind: code
level: medium
@@statement
Implement two rate limiters as simulations over a list of request times, then compare them on a burst.

1. `sliding_window_allowed(times, limit, window)`: a request at time `t` is allowed if fewer than `limit` **allowed** requests lie in the window `(t - window, t]`. In other words, an allowed request at time `s` stops counting once `t - s >= window`. Denied requests are not counted.
2. `token_bucket_allowed(times, rate, capacity)`: the bucket starts full with `capacity` tokens. Before each request, add `(t - last_time) * rate` tokens (the first request gets no refill), never above `capacity`. A request is allowed if at least 1 token is available, and then it costs 1 token. Denied requests cost nothing.

**Input**: `times` is a list of non-decreasing numbers (seconds).

**Output**: a list of booleans, one per request. Empty input gives `[]`.

**Example** (limit 5 per 10 s; bucket of 5 that refills 0.5 tokens per second)

```
times = [0, 0, 0, 0, 0, 0, 2, 10]
sliding_window_allowed(times, 5, 10)  -> [T, T, T, T, T, F, F, T]
token_bucket_allowed(times, 0.5, 5)   -> [T, T, T, T, T, F, T, T]
```

The token bucket lets one more request through at `t = 2` because it refills continuously. The sliding window waits until the old requests leave the window.
@@starter
def sliding_window_allowed(times, limit, window):
    pass

def token_bucket_allowed(times, rate, capacity):
    pass
@@tests
_t = [0, 0, 0, 0, 0, 0, 2, 10]
assert sliding_window_allowed(_t, 5, 10) == [True] * 5 + [False, False, True], "sliding window"
assert token_bucket_allowed(_t, 0.5, 5) == [True] * 5 + [False, True, True], "token bucket"
assert sliding_window_allowed([], 5, 10) == [] and token_bucket_allowed([], 1, 1) == [], "empty input"
assert sliding_window_allowed([0, 9.9, 10], 1, 10) == [True, False, True], "a request exactly one window ago no longer counts"
assert sliding_window_allowed([0, 1, 2, 3], 2, 10) == [True, True, False, False], "denied requests are not counted"
assert token_bucket_allowed([0, 0, 1, 1], 1, 1) == [True, False, True, False], "one token per second"
assert token_bucket_allowed([0, 100, 100, 100], 1, 2) == [True, True, True, False], "refill is capped at capacity"
@@hint
Sliding window: keep a deque of allowed timestamps and drop those with `t - s >= window` before checking its length. Token bucket: keep `tokens` and `last`.
@@solution
from collections import deque

def sliding_window_allowed(times, limit, window):
    log = deque()
    result = []
    for t in times:
        while log and t - log[0] >= window:
            log.popleft()
        if len(log) < limit:
            log.append(t)
            result.append(True)
        else:
            result.append(False)
    return result

def token_bucket_allowed(times, rate, capacity):
    tokens = float(capacity)
    last = None
    result = []
    for t in times:
        if last is not None:
            tokens = min(capacity, tokens + (t - last) * rate)
        last = t
        if tokens >= 1:
            tokens -= 1
            result.append(True)
        else:
            result.append(False)
    return result
````

````task
id: bloom-filter
title: Bloom filter for an LSM file
kind: code
level: medium
@@statement
Implement a Bloom filter, the structure an LSM tree keeps per file so a read can skip files that cannot contain the key.

Write `class BloomFilter` with `BloomFilter(num_bits, num_hashes)`:
- `add(item)`: `item` is a string.
- `might_contain(item)`: returns `False` only if the item was definitely never added. It may return `True` for an item that was not added (a false positive), but never `False` for an item that was added.
- `bits_set()`: returns how many bits are currently 1.

Use `hashlib.md5`: for hash number `i` (0-based) the bit index is `int(hashlib.md5(("%d:%s" % (i, item)).encode()).hexdigest(), 16) % num_bits`.

**Example**

```
bf = BloomFilter(1000, 3)
bf.add("user:1")
bf.might_contain("user:1")   -> True
bf.might_contain("user:999") -> False  (very likely)
bf.bits_set()                -> at most 3
```
@@starter
import hashlib

class BloomFilter:
    def __init__(self, num_bits, num_hashes):
        pass

    def add(self, item):
        pass

    def might_contain(self, item):
        pass

    def bits_set(self):
        pass
@@tests
_bf = BloomFilter(1000, 3)
assert _bf.bits_set() == 0, "starts empty"
assert _bf.might_contain("user:1") is False, "empty filter contains nothing"
_bf.add("user:1")
assert _bf.might_contain("user:1") is True, "added item is found"
assert 1 <= _bf.bits_set() <= 3, "one item sets at most k bits"
_before = _bf.bits_set()
_bf.add("user:1")
assert _bf.bits_set() == _before, "adding the same item twice changes nothing"
_big = BloomFilter(2000, 3)
for _i in range(100):
    _big.add("key%d" % _i)
assert all(_big.might_contain("key%d" % _i) for _i in range(100)), "no false negatives"
_fp = sum(1 for _i in range(1000, 1400) if _big.might_contain("key%d" % _i))
assert _fp < 40, "false positive rate must be low (expected well under 1 percent here)"
@@hint
Store the bits in a `bytearray`. A helper `_positions(item)` that returns the `k` indexes keeps `add` and `might_contain` short. Make sure `might_contain` returns a real `bool`.
@@solution
import hashlib

class BloomFilter:
    def __init__(self, num_bits, num_hashes):
        self.m = num_bits
        self.k = num_hashes
        self.bits = bytearray(num_bits)

    def _positions(self, item):
        return [int(hashlib.md5(("%d:%s" % (i, item)).encode()).hexdigest(), 16) % self.m
                for i in range(self.k)]

    def add(self, item):
        for p in self._positions(item):
            self.bits[p] = 1

    def might_contain(self, item):
        return all(self.bits[p] for p in self._positions(item))

    def bits_set(self):
        return sum(self.bits)
````

````task
id: lsm-tombstones
title: LSM store with tombstones and compaction
kind: code
level: hard
@@statement
Write a small LSM store where deletes are recorded as **tombstones** and compaction removes them.

`class MiniLSM` with `MiniLSM(memtable_limit=4)`:
- `put(key, value)` and `delete(key)` write into the in-memory `self.memtable` (a dict). A delete stores the module-level sentinel `TOMBSTONE`. After a write, if `len(memtable) >= memtable_limit`, call `flush()`.
- `flush()`: if the memtable is not empty, append a copy of it to the list `self.runs` (newest run last) and clear the memtable.
- `get(key)`: look in the memtable, then in the runs from newest to oldest. The first place that has the key decides: a tombstone means `None`. A key found nowhere gives `None`.
- `compact()`: merge all runs into one (newer values win), drop every key whose final value is a tombstone, and set `self.runs` to a list with that single merged dict. If there are no runs, nothing changes. If everything was deleted, `self.runs` becomes `[]`.

Runs and the memtable are plain dicts.

**Example**

```
db = MiniLSM(memtable_limit=2)
db.put("a", 1); db.put("b", 2)   # the second write triggers a flush -> 1 run
db.delete("a")                   # tombstone in the memtable
db.get("a")  -> None
db.get("b")  -> 2
```
@@starter
TOMBSTONE = object()

class MiniLSM:
    def __init__(self, memtable_limit=4):
        self.memtable_limit = memtable_limit
        self.memtable = {}
        self.runs = []

    def put(self, key, value):
        pass

    def delete(self, key):
        pass

    def get(self, key):
        pass

    def flush(self):
        pass

    def compact(self):
        pass
@@tests
_db = MiniLSM(memtable_limit=2)
_db.put("a", 1)
assert _db.get("a") == 1 and _db.runs == [], "value in the memtable, nothing flushed yet"
_db.put("b", 2)
assert len(_db.runs) == 1 and _db.memtable == {}, "memtable limit triggers a flush"
_db.delete("a")
assert _db.get("a") is None, "tombstone hides the older value in a run"
assert _db.get("b") == 2, "other keys still readable"
assert _db.get("zzz") is None, "unknown key"
_db.put("c", 3)
assert len(_db.runs) == 2, "second flush"
assert _db.runs[1]["a"] is TOMBSTONE, "the tombstone is stored in the newest run"
_db.put("b", 20)
assert _db.get("b") == 20, "newer value wins"
_db.flush()
_db.compact()
assert len(_db.runs) == 1, "compaction leaves one run"
assert _db.runs[0] == {"b": 20, "c": 3}, "tombstoned key dropped, newest values kept"
assert _db.get("a") is None, "deleted key stays deleted after compaction"
_e = MiniLSM(memtable_limit=10)
_e.put("x", 1); _e.flush(); _e.delete("x"); _e.flush(); _e.compact()
assert _e.runs == [] and _e.get("x") is None, "everything deleted leaves no runs"
@@hint
In `get`, check `key in table` first so that a stored tombstone stops the search. In `compact`, apply the runs oldest to newest into one dict, then filter out `TOMBSTONE`.
@@solution
TOMBSTONE = object()

class MiniLSM:
    def __init__(self, memtable_limit=4):
        self.memtable_limit = memtable_limit
        self.memtable = {}
        self.runs = []

    def _after_write(self):
        if len(self.memtable) >= self.memtable_limit:
            self.flush()

    def put(self, key, value):
        self.memtable[key] = value
        self._after_write()

    def delete(self, key):
        self.memtable[key] = TOMBSTONE
        self._after_write()

    def get(self, key):
        for table in [self.memtable] + list(reversed(self.runs)):
            if key in table:
                value = table[key]
                return None if value is TOMBSTONE else value
        return None

    def flush(self):
        if self.memtable:
            self.runs.append(dict(self.memtable))
            self.memtable = {}

    def compact(self):
        if not self.runs:
            return
        merged = {}
        for run in self.runs:
            merged.update(run)
        live = {k: v for k, v in merged.items() if v is not TOMBSTONE}
        self.runs = [live] if live else []
````

````task
id: snowflake-ids
title: Distributed unique ID generator (Snowflake)
kind: code
level: hard
@@statement
Build the core of a distributed unique ID service. Each ID is a 64-bit integer made of three fields: `(timestamp_ms - epoch)` in the high bits, then a 10-bit worker id, then a 12-bit sequence number.

```
id = ((ts - epoch) << 22) | (worker_id << 12) | sequence
```

Write `class SnowflakeGenerator` with `SnowflakeGenerator(worker_id, clock_ms, epoch=0)` and `next_id()`, and a function `decode_id(i, epoch=0)`.

**Rules**
- `worker_id` must be in `0..1023`, otherwise raise `ValueError`.
- `clock_ms` is a function with no arguments returning the current time in milliseconds. `next_id()` calls it exactly once per ID, plus extra calls while waiting (below).
- First ID, or a new millisecond: sequence 0. Same millisecond as the previous ID: sequence + 1.
- If the sequence would pass 4095 within the same millisecond, keep calling `clock_ms()` until it returns a larger value, then use that millisecond with sequence 0.
- If `clock_ms()` returns a value **smaller** than the last one used, raise `RuntimeError` (the clock moved backwards).
- `decode_id(i, epoch=0)` returns `(ts, worker_id, sequence)`, where `ts` is the original millisecond (epoch added back).

**Example**

```
g = SnowflakeGenerator(worker_id=7, clock_ms=lambda: 1000)
a = g.next_id(); b = g.next_id()
decode_id(a) -> (1000, 7, 0)
decode_id(b) -> (1000, 7, 1)      # and b > a
```
@@starter
class SnowflakeGenerator:
    def __init__(self, worker_id, clock_ms, epoch=0):
        pass

    def next_id(self):
        pass

def decode_id(i, epoch=0):
    pass
@@tests
_g = SnowflakeGenerator(7, lambda: 1000)
_a, _b = _g.next_id(), _g.next_id()
assert decode_id(_a) == (1000, 7, 0) and decode_id(_b) == (1000, 7, 1), "layout and sequence"
assert _b > _a, "ids increase"
_g2 = SnowflakeGenerator(1023, lambda: 5000, epoch=1000)
assert decode_id(_g2.next_id(), epoch=1000) == (5000, 1023, 0), "epoch is subtracted and added back"
assert _g2.next_id() >> 22 == 4000, "high bits hold ts - epoch"
for _bad in (-1, 1024):
    try:
        SnowflakeGenerator(_bad, lambda: 0)
        assert False, "invalid worker id must raise"
    except ValueError:
        pass
_calls = [0]
def _clk():
    _calls[0] += 1
    return 5 if _calls[0] <= 4097 else 6
_g3 = SnowflakeGenerator(3, _clk)
_ids = [_g3.next_id() for _ in range(4097)]
assert len(set(_ids)) == 4097 and _ids == sorted(_ids), "unique and increasing across a sequence overflow"
assert decode_id(_ids[4095]) == (5, 3, 4095), "last id of the first millisecond"
assert decode_id(_ids[4096]) == (6, 3, 0), "overflow waits for the next millisecond"
_time = [100]
_g4 = SnowflakeGenerator(1, lambda: _time[0])
_g4.next_id()
_time[0] = 99
try:
    _g4.next_id()
    assert False, "backwards clock must raise"
except RuntimeError:
    pass
@@hint
Keep `last_ts` (start at -1) and `seq`. The mask for 12 bits is `4095`. On overflow, loop `while ts <= last_ts: ts = clock()`.
@@solution
class SnowflakeGenerator:
    def __init__(self, worker_id, clock_ms, epoch=0):
        if not 0 <= worker_id <= 1023:
            raise ValueError("worker_id must be 0..1023")
        self.worker_id = worker_id
        self.clock = clock_ms
        self.epoch = epoch
        self.last_ts = -1
        self.seq = 0

    def next_id(self):
        ts = self.clock()
        if ts < self.last_ts:
            raise RuntimeError("clock moved backwards")
        if ts == self.last_ts:
            self.seq = (self.seq + 1) & 4095
            if self.seq == 0:
                while ts <= self.last_ts:
                    ts = self.clock()
        else:
            self.seq = 0
        self.last_ts = ts
        return ((ts - self.epoch) << 22) | (self.worker_id << 12) | self.seq

def decode_id(i, epoch=0):
    return (i >> 22) + epoch, (i >> 12) & 1023, i & 4095
````

````task
id: pastebin-design
title: Design a pastebin
kind: text
level: medium
@@statement
Use the same template as the case studies to design a pastebin service.

Scenario: 5 million new pastes per day, 10 reads for every write, average paste 10 KB, maximum 1 MB, pastes expire after a time the user chooses (default 1 year), p99 read latency under 150 ms, availability 99.9%. Functional requirements: create a paste (text, optional expiry, optional password), read it by a short URL, delete it, and an "unlisted" mode (only people with the URL can read it).

**Deliverable** (about 15-25 lines), in this order:
1. Requirements, one line each (functional and non-functional).
2. APIs (3-4 endpoints).
3. Back-of-envelope: writes per second, reads per second, storage per year, and read bandwidth.
4. Data model: what lives in the database and what lives in object storage, and why.
5. The main components and the path of one read.
6. Two deep dives with fixes (for example expiry cleanup and hot pastes).
@@criteria
- APIs include create (`POST /pastes` returning an id or URL), read (`GET /pastes/{id}`) and delete; mentions the size limit (413) and expiry (404 or 410).
- Numbers are right within rounding: 5M / 86,400 = about 58 writes per second, about 580 reads per second, storage 5M x 10 KB = 50 GB per day = about 18 TB per year, read bandwidth about 580 x 10 KB = about 5.8 MB/s.
- Stores metadata (id, owner, created_at, expires_at, size, password hash, blob key) in a database and the paste body in object storage, with the reason (large blobs are cheap and durable there, the database stays small and fast).
- Components include a load balancer, stateless app servers, an id generation approach (counter ranges or random base62 ids that are hard to guess for unlisted pastes), a cache or CDN for hot pastes, and the read path from cache to metadata to blob.
- Two deep dives with fixes, such as expiry (lazy check on read plus a background sweeper that deletes expired metadata and blobs) and hot pastes or abuse (cache or CDN, rate limits, maximum size).
@@solution
1. Requirements. Functional: create, read, delete, optional expiry and password, unlisted pastes. Non-functional: 5M writes per day, 10:1 reads, p99 read under 150 ms, 99.9% availability, durability (no paste lost before it expires).

2. APIs: `POST /v1/pastes` with body `{text, expires_in?, password?}` returns 201 `{id, url}` (413 above 1 MB). `GET /v1/pastes/{id}` returns 200 with the text, 404 if unknown, 410 if expired, 401 if the password is missing. `DELETE /v1/pastes/{id}` with the owner token returns 204.

3. Numbers. Writes: 5M / 86,400 = about 58 per second (peak 3x = 175). Reads: 10x = about 580 per second. Storage: 5M x 10 KB = 50 GB per day = about 18 TB per year (x3 with replication). Read bandwidth: 580 x 10 KB = about 5.8 MB per second, which is small.

4. Data model: metadata table `pastes(id PK, owner_id, created_at, expires_at, size, pw_hash, blob_key)` in a key-value or SQL store; the body goes to object storage under `blob_key`. Object storage is cheaper per TB and durable, and keeps the database rows small and fast.

5. Components: client -> CDN -> load balancer -> stateless app servers -> cache (metadata and small bodies) -> metadata database and object storage. Read path: check the cache by id; on a miss read the metadata, check expiry and password, fetch the blob, return it and fill the cache. Ids: 8 random base62 characters (62^8 = 218 trillion, collision checked on insert), which also makes unlisted URLs hard to guess.

6. Deep dives. (a) Expiry: reads check `expires_at` and return 410 (lazy expiry); a nightly sweeper walks an index on `expires_at` and deletes metadata and blobs in batches, so storage is reclaimed without cost on the hot path. (b) Hot pastes and abuse: a viral paste is served from the CDN and the cache; per-IP rate limits and the size limit protect writes; spam and malware scanning runs asynchronously after creation.
````
