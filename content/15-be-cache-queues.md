---
id: be-cache-queues
title: Caching, queues and background processing
minutes: 50
---

Caches make reads fast by keeping a copy of the answer closer to where it is needed. Queues make writes reliable by letting slow work happen later. Almost every system that scales uses both.

## Where caches sit

| Layer | What it stores | Example |
| --- | --- | --- |
| Browser | Static files and API responses, per cache headers | `Cache-Control: max-age=86400` |
| CDN | Images, JS, CSS, video, sometimes whole pages, on servers near the user | Cloudflare, CloudFront, Akamai |
| Reverse proxy | Whole HTTP responses | Nginx, Varnish |
| Application cache | Query results, computed objects, sessions | Redis, Memcached |
| In-process | Function results inside one server's memory | `functools.lru_cache`, a dict |
| Database | Pages and query plans in memory | PostgreSQL shared buffers |

Why it works: memory is about a thousand times faster than disk, and most traffic goes to a small share of the data. Caching the hot 20% often serves 80% or more of requests.

## Cache-aside, the default strategy

On a read: check the cache; on a miss read the database, store the result with a time to live (TTL), return it. On a write: update the database, then delete the cache key so the next read refills it.

```python run
import time

class TTLCache:                                   # stands in for Redis
    def __init__(self):
        self.data = {}
    def get(self, key):
        item = self.data.get(key)
        if item and item[1] > time.time():
            return item[0]
        self.data.pop(key, None)
        return None
    def set(self, key, value, ttl):
        self.data[key] = (value, time.time() + ttl)
    def delete(self, key):
        self.data.pop(key, None)

DB = {42: {"id": 42, "name": "Gearbox", "price": 18500}}
cache, stats = TTLCache(), {"hit": 0, "miss": 0}

def db_fetch(pid):
    time.sleep(0.05)                              # a slow query
    return dict(DB[pid])

def get_product(pid):
    key = f"product:{pid}"
    value = cache.get(key)
    if value is not None:
        stats["hit"] += 1
        return value
    stats["miss"] += 1
    value = db_fetch(pid)
    cache.set(key, value, ttl=300)
    return value

def update_price(pid, price):
    DB[pid]["price"] = price
    cache.delete(f"product:{pid}")                # invalidate

start = time.perf_counter()
for _ in range(200):
    get_product(42)
print(stats, f"{(time.perf_counter() - start) * 1000:.0f} ms for 200 reads")
update_price(42, 19900)
print(get_product(42)["price"], stats)
```

Without the cache those 200 reads would take 10 seconds.

| Strategy | How | Trade-off |
| --- | --- | --- |
| Cache-aside | The application reads and fills the cache | Simple; the first read after expiry is slow |
| Read-through | The cache library loads from the database on a miss | Same behaviour, hidden in a library |
| Write-through | Every write goes to the cache and the database together | Reads are always warm; writes are slower |
| Write-behind | Write to the cache now, flush to the database later | Very fast writes; data loss if the cache dies first |
| Refresh-ahead | Reload popular keys shortly before they expire | No slow read; wasted work on keys nobody asks for again |

## Cache problems and their fixes

| Problem | What happens | Fix |
| --- | --- | --- |
| Stale data | The cache and the database disagree | A TTL the business accepts, and delete on write |
| Stampede (thundering herd) | A hot key expires and a thousand requests hit the database together | A lock so one request refills while others wait; refresh early; add random jitter to TTLs |
| Penetration | Requests for keys that do not exist always miss and hit the database | Cache the "not found" answer briefly; a Bloom filter in front |
| Avalanche | Many keys expire at the same moment, or the cache server dies | Spread TTLs randomly; replicate the cache; degrade gracefully |
| Hot key | One key gets a huge share of traffic | Local in-process copy of that key; split the key |
| Eviction | Memory is full, so entries are removed | Choose a policy: LRU (least recently used), LFU (least frequently used), TTL-based |

"There are only two hard things in computer science: cache invalidation and naming things" is a joke with a real point. Decide how stale each piece of data is allowed to be before you cache it. A product description can be an hour old; an account balance cannot.

## Redis

Redis is an in-memory data-structure server. Almost every backend uses it for more than caching.

| Structure | Commands | Typical use |
| --- | --- | --- |
| String | `SET`, `GET`, `INCR`, `EXPIRE` | Cached values, counters, rate limits |
| Hash | `HSET`, `HGETALL` | An object's fields, a session |
| List | `LPUSH`, `RPOP`, `BRPOP` | Simple job queue |
| Set | `SADD`, `SISMEMBER`, `SINTER` | Unique visitors, tags |
| Sorted set | `ZADD`, `ZRANGE`, `ZRANK` | Leaderboards, time-ordered feeds, sliding-window rate limits |
| Stream | `XADD`, `XREADGROUP` | A durable log with consumer groups |
| Pub/sub | `PUBLISH`, `SUBSCRIBE` | Fan-out between app servers, such as chat |

```
SET session:9f2c '{"user_id": 42}' EX 3600        # expires in an hour
INCR rate:user42:minute:28371                      # atomic counter
ZADD leaderboard 9120 "asha" 8770 "ravi"
ZREVRANGE leaderboard 0 9 WITHSCORES               # top ten
SET lock:invoice:77 worker-3 NX EX 30              # a lock: only succeeds if the key is absent
```

Redis is single-threaded for commands, so each command is atomic. It can persist to disk (snapshots and an append-only file), replicate to followers, and shard across a cluster.

## CDNs

A content delivery network keeps copies of your static files on servers in hundreds of cities. A user in Chennai downloads from a Chennai server instead of one in Virginia, which cuts latency from hundreds of milliseconds to tens. CDNs also absorb traffic spikes and attacks, and terminate TLS near the user.

- Give static files a content hash in the filename (`app.3f9a1c.js`) and a year-long cache lifetime; a new deploy produces a new filename.
- A **pull CDN** fetches from your origin on the first request and caches it; a **push CDN** has you upload files in advance.

## Why queues

When a user places an order you must charge the card now. Sending the email, updating analytics and notifying the warehouse can happen a few seconds later. The API writes a message to a queue and returns immediately; **workers** consume messages at their own pace.

What that buys:

- **Speed**: the user gets a response without waiting for slow steps.
- **Decoupling**: the order service does not know or care who consumes the event.
- **Buffering**: a traffic spike fills the queue instead of crashing the workers.
- **Reliability**: a failed job is retried instead of lost.

```python run
import queue, threading, time, random

jobs = queue.Queue()
dead_letters = []

def worker(name):
    while True:
        job = jobs.get()
        if job is None:
            break
        try:
            if random.random() < 0.3:
                raise RuntimeError("mail server timeout")
            print(f"{name} sent email for order {job['order']}")
        except RuntimeError as exc:
            job["attempts"] += 1
            if job["attempts"] < 3:
                print(f"{name} retrying order {job['order']} (attempt {job['attempts'] + 1})")
                jobs.put(job)                       # back on the queue
            else:
                dead_letters.append(job)            # give up: park it for a human
        finally:
            jobs.task_done()

threads = [threading.Thread(target=worker, args=(f"worker-{i}",)) for i in range(2)]
for t in threads: t.start()

for order_id in range(1, 6):                        # the API handler: enqueue and return at once
    jobs.put({"order": order_id, "attempts": 0})
print("API responded to all 5 customers immediately")

jobs.join()
for _ in threads: jobs.put(None)
for t in threads: t.join()
print("dead-letter queue:", dead_letters)
```

In production the queue is a separate server (a **broker**), so jobs survive a restart and workers can run on other machines.

## Queue, pub/sub and log

| | Message queue | Pub/sub | Log |
| --- | --- | --- | --- |
| Examples | RabbitMQ, Amazon SQS | Redis pub/sub, SNS | Kafka, Redpanda, Kinesis |
| Delivery | Each message goes to one consumer, then is deleted | Each message goes to every current subscriber | Messages are appended and kept; each consumer tracks its own position |
| Replay old messages | No | No | Yes |
| Fits | Background jobs | Live notifications | Event streams, analytics, many independent consumers |

### Kafka concepts

- A **topic** is a named stream, split into **partitions** for parallelism.
- Each message in a partition has an **offset**, its position. Consumers commit the offset they have processed.
- A **consumer group** shares the work: each partition is read by exactly one member, so adding members scales consumption up to the number of partitions.
- A message **key** decides the partition. All events for one user share a key, so they stay in order.
- **Retention**: messages are kept for a configured time or size whether or not anyone read them, so a new consumer can replay history.
- **Replication**: each partition has a leader and followers on other brokers.

Example: an e-commerce site publishes `OrderPlaced` to the `orders` topic. The inventory service, the email service, the fraud model and the analytics pipeline each read it as a separate consumer group. Adding a fifth consumer requires no change to the order service.

## Delivery guarantees

| Guarantee | Meaning | How |
| --- | --- | --- |
| At most once | May lose messages, never duplicates | Acknowledge before processing |
| At least once | Never loses, may deliver twice | Acknowledge after processing; the normal choice |
| Exactly once | Each message takes effect once | At-least-once delivery plus **idempotent consumers** |

An idempotent consumer can process the same message twice with the same result as once, usually by recording processed message IDs:

```python run
processed_ids = set()             # in production: a unique-keyed table, written in the same transaction as the effect
balance = {"acct-1": 0}

def handle(message):
    if message["id"] in processed_ids:
        return "duplicate ignored"
    balance[message["account"]] += message["amount"]
    processed_ids.add(message["id"])
    return "applied"

m = {"id": "evt-501", "account": "acct-1", "amount": 250}
print(handle(m), handle(m), balance)        # delivered twice, applied once
```

More vocabulary:

- **Dead-letter queue**: where messages go after repeated failure, so one poison message does not block the rest.
- **Backpressure**: slowing producers when consumers cannot keep up.
- **Visibility timeout** (SQS): a message taken by a worker is hidden for a while; if the worker dies without acknowledging, it reappears.
- **Outbox pattern**: write the business change and the event to an `outbox` table in one database transaction; a separate relay publishes outbox rows to the broker. This prevents saving the order and then crashing before publishing the event.

## Task queues in Python

Celery, RQ, Dramatiq and Arq wrap a broker (Redis or RabbitMQ) so you write `send_email.delay(user_id)` and a worker process runs it, with retries, scheduling and result tracking. Long LLM calls, document ingestion, report generation and image processing belong in a task queue.

```python
# tasks.py
from celery import Celery
app = Celery("tasks", broker="redis://localhost:6379/0")

@app.task(bind=True, max_retries=3, default_retry_delay=10)
def send_receipt(self, order_id):
    try:
        mailer.send(order_id)
    except MailError as exc:
        raise self.retry(exc=exc)

# in the API handler
send_receipt.delay(order.id)       # returns immediately
```

## Check yourself

```quiz
[
  {"q": "In cache-aside, what should a write do?", "options": ["Update the cache only", "Update the database, then delete the cache key", "Nothing"], "answer": 1, "why": "The database is the source of truth; deleting the key makes the next read reload fresh data."},
  {"q": "A very popular key expires and the database is flooded with identical queries. This is called:", "options": ["Cache penetration", "A cache stampede", "Eviction"], "answer": 1, "why": "Mitigate with a refill lock, early refresh, or jittered TTLs."},
  {"q": "Which task belongs on a queue rather than in the request path?", "options": ["Checking the password at login", "Generating a 40-page PDF report", "Validating the request body"], "answer": 1, "why": "It is slow and the user does not need it before the response."},
  {"q": "With at-least-once delivery, how do you avoid charging a customer twice?", "options": ["Use a faster broker", "Make the consumer idempotent by recording processed message IDs", "Disable retries"], "answer": 1, "why": "Duplicates are expected; the handler must be safe to repeat."},
  {"q": "What does a Kafka message key control?", "options": ["Encryption", "Which partition the message goes to, and so the ordering among messages with that key", "The retention time"], "answer": 1, "why": "Same key, same partition, preserved order."},
  {"q": "Why give static assets a content hash in the filename?", "options": ["For security", "So they can be cached for a long time and a new version gets a new URL", "To compress them"], "answer": 1, "why": "Long cache lifetimes with instant updates on deploy."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: cached-function
title: TTL cache with hit rate
kind: code
level: medium
@@statement
Write a class `CachedFunction(fn, ttl, clock)` that wraps a slow one-argument function with a time-to-live cache and counts hits and misses.

**Input**
- `fn`: a function of one hashable argument.
- `ttl`: seconds an entry stays valid.
- `clock`: a function with no arguments that returns the current time in seconds (so tests can control time).

**Behavior**
- `obj(key)` returns `fn(key)`. If the key was computed at time `t` and `clock() < t + ttl`, return the cached value without calling `fn` (a **hit**). Otherwise call `fn` and store the value with the current time (a **miss**).
- Attributes `hits` and `misses` are integers, both start at 0.
- `hit_rate()` returns `hits / (hits + misses)` as a float, or `0.0` if there were no calls.

**Example**

```
now = [0]
c = CachedFunction(lambda k: k * 2, ttl=10, clock=lambda: now[0])
c(5); c(5)          # miss, hit
now[0] = 10
c(5)                # expired -> miss
c.hits, c.misses    -> (1, 2)
```
@@starter
class CachedFunction:
    def __init__(self, fn, ttl, clock):
        pass

    def __call__(self, key):
        pass

    def hit_rate(self):
        pass
@@tests
_now = [0]
_calls = []
def _slow(k):
    _calls.append(k)
    return k * 2

_c = CachedFunction(_slow, ttl=10, clock=lambda: _now[0])
assert _c.hit_rate() == 0.0, "no calls yet"
assert _c(5) == 10 and _c(5) == 10, "values are correct"
assert _calls == [5], "second call came from the cache"
assert (_c.hits, _c.misses) == (1, 1), "one hit one miss"
_now[0] = 9.9
_c(5)
assert _calls == [5], "still valid just before the ttl"
_now[0] = 10
assert _c(5) == 10 and _calls == [5, 5], "expired at exactly ttl seconds"
assert _c(6) == 12, "another key"
assert (_c.hits, _c.misses) == (2, 3), "counters"
assert abs(_c.hit_rate() - 0.4) < 1e-9, "hit rate 2/5"
@@hint
Store `key -> (value, stored_at)` in a dict. On every call check the dict first, then compare `clock()` with `stored_at + ttl`.
@@solution
class CachedFunction:
    def __init__(self, fn, ttl, clock):
        self.fn = fn
        self.ttl = ttl
        self.clock = clock
        self.store = {}
        self.hits = 0
        self.misses = 0

    def __call__(self, key):
        now = self.clock()
        entry = self.store.get(key)
        if entry is not None and now < entry[1] + self.ttl:
            self.hits += 1
            return entry[0]
        self.misses += 1
        value = self.fn(key)
        self.store[key] = (value, now)
        return value

    def hit_rate(self):
        total = self.hits + self.misses
        return self.hits / total if total else 0.0
````

````task
id: stampede-lock
title: Stop the cache stampede
kind: code
level: hard
@@statement
Write a thread-safe class `StampedeSafeCache` with the method `get(key, loader)`.

**Input**
- `key`: a hashable value.
- `loader`: a function with no arguments that computes the value (slow, expensive).

**Behavior**
- If `key` is cached, return the cached value and do not call `loader`.
- If it is missing, call `loader()` **once**, cache the result forever, and return it. `None` is a valid value.
- If many threads ask for the same missing key at the same time, only **one** of them runs `loader`. The others wait and then get the same value.
- Different keys must not block each other more than needed (use one lock per key).

**Example**

```
cache = StampedeSafeCache()
cache.get("user:1", lambda: "Ana")   -> "Ana"      (loader runs)
cache.get("user:1", lambda: "Bob")   -> "Ana"      (cached, loader not run)
```
@@starter
import threading

class StampedeSafeCache:
    def __init__(self):
        pass

    def get(self, key, loader):
        pass
@@tests
import threading
import time

_cache = StampedeSafeCache()
assert _cache.get("a", lambda: "Ana") == "Ana", "first load"
assert _cache.get("a", lambda: "Bob") == "Ana", "cached value wins"

_count = [0]
_guard = threading.Lock()
def _loader():
    with _guard:
        _count[0] += 1
    time.sleep(0.05)
    return "value"

_results = []
def _worker():
    _results.append(_cache.get("hot", _loader))

_threads = [threading.Thread(target=_worker) for _ in range(8)]
for _t in _threads:
    _t.start()
for _t in _threads:
    _t.join()
assert _results == ["value"] * 8, "every thread gets the value"
assert _count[0] == 1, "loader ran exactly once for 8 concurrent requests"

_other = StampedeSafeCache()
assert _other.get("x", lambda: 1) == 1 and _other.get("y", lambda: 2) == 2, "different keys are independent"
_none_calls = []
_other.get("z", lambda: _none_calls.append(1))
_other.get("z", lambda: _none_calls.append(1))
assert _none_calls == [1], "None is cached too"
@@hint
Keep a dict of values, a dict of per-key locks, and one small guard lock to protect those dicts. After you get the key's lock, check the cache again before calling the loader.
@@solution
import threading

class StampedeSafeCache:
    def __init__(self):
        self._data = {}
        self._locks = {}
        self._guard = threading.Lock()

    def get(self, key, loader):
        with self._guard:
            if key in self._data:
                return self._data[key]
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            with self._guard:
                if key in self._data:
                    return self._data[key]
            value = loader()
            with self._guard:
                self._data[key] = value
            return value
````

````task
id: retry-backoff
title: Retry with exponential backoff
kind: code
level: easy
@@statement
Write `run_with_retries(fn, max_attempts=4, base=0.5, factor=2, cap=5.0, sleep=time.sleep)`.

**Behavior**
- Call `fn()` (no arguments). If it returns, return that value at once.
- If it raises an `Exception`, wait and try again, up to `max_attempts` calls in total.
- The wait after failed attempt number `i` (starting at 0) is `min(cap, base * factor ** i)` seconds. Wait by calling `sleep(delay)`.
- Do **not** sleep after the last failed attempt. Re-raise that last exception instead.

**Example**

```
fn fails twice, then returns "ok"
run_with_retries(fn)  -> "ok"      sleep was called with 0.5, then 1.0
```
@@starter
import time

def run_with_retries(fn, max_attempts=4, base=0.5, factor=2, cap=5.0, sleep=time.sleep):
    pass
@@tests
def _flaky(fail_times):
    state = {"n": 0}
    def fn():
        state["n"] += 1
        if state["n"] <= fail_times:
            raise ValueError("boom %d" % state["n"])
        return "ok"
    fn.state = state
    return fn

_sleeps = []
assert run_with_retries(_flaky(0), sleep=_sleeps.append) == "ok" and _sleeps == [], "no failure, no sleep"
_f = _flaky(2)
assert run_with_retries(_f, sleep=_sleeps.append) == "ok", "succeeds on 3rd attempt"
assert _sleeps == [0.5, 1.0] and _f.state["n"] == 3, "delays 0.5 then 1.0"

_sleeps = []
_f = _flaky(99)
try:
    run_with_retries(_f, max_attempts=3, sleep=_sleeps.append)
    _msg = None
except ValueError as e:
    _msg = str(e)
assert _msg == "boom 3", "the last exception is re-raised"
assert _sleeps == [0.5, 1.0] and _f.state["n"] == 3, "no sleep after the last attempt"

_sleeps = []
try:
    run_with_retries(_flaky(99), max_attempts=6, base=1, cap=5, sleep=_sleeps.append)
except ValueError:
    pass
assert _sleeps == [1, 2, 4, 5, 5], "delay is capped"
@@hint
Use `for attempt in range(max_attempts)` with try/except. In the except block, re-raise if this is the last attempt, otherwise sleep.
@@solution
import time

def run_with_retries(fn, max_attempts=4, base=0.5, factor=2, cap=5.0, sleep=time.sleep):
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception:
            if attempt == max_attempts - 1:
                raise
            sleep(min(cap, base * factor ** attempt))
````

````task
id: outbox-pattern
title: Transactional outbox
kind: code
level: hard
@@statement
Implement the outbox pattern on SQLite. The helper `init_db(conn)` is given and creates:

```
orders(id INTEGER PRIMARY KEY, item TEXT)
outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, sent INTEGER DEFAULT 0)
```

Write two functions.

1. `place_order(conn, item, crash=False)`: in **one transaction** insert the order and insert an outbox row with payload `"order_created:<order_id>"`. Return the new order id. If `crash` is `True`, raise `RuntimeError` after inserting the order but before inserting the outbox row. Then **nothing** may be saved (neither row).
2. `relay(conn, publish)`: read the unsent outbox rows in `id` order. For each, call `publish(payload)`; after it returns, mark the row `sent = 1`. If `publish` raises an exception, stop and leave that row and the later rows unsent (do not raise). Return how many messages were published successfully.

**Example**

```
place_order(conn, "book")   -> 1     (outbox has "order_created:1")
relay(conn, print)          -> 1     (prints it, marks it sent)
relay(conn, print)          -> 0
```
@@starter
import sqlite3

def init_db(conn):
    conn.executescript("""
    CREATE TABLE orders(id INTEGER PRIMARY KEY, item TEXT);
    CREATE TABLE outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, sent INTEGER DEFAULT 0);
    """)

def place_order(conn, item, crash=False):
    pass

def relay(conn, publish):
    pass
@@tests
import sqlite3

_c = sqlite3.connect(":memory:")
init_db(_c)
_id = place_order(_c, "book")
assert _id == 1, "first order id"
assert _c.execute("SELECT payload, sent FROM outbox").fetchall() == [("order_created:1", 0)], "outbox row written with the order"
try:
    place_order(_c, "lamp", crash=True)
    _raised = False
except RuntimeError:
    _raised = True
assert _raised, "crash raises RuntimeError"
assert _c.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 1, "crashed order rolled back"
assert _c.execute("SELECT COUNT(*) FROM outbox").fetchone()[0] == 1, "no outbox row for the crashed order"
place_order(_c, "pen")
place_order(_c, "cup")
_seen = []
assert relay(_c, _seen.append) == 3, "three messages published"
assert _seen == ["order_created:1", "order_created:2", "order_created:3"], "published in order"
assert relay(_c, _seen.append) == 0, "nothing left"

place_order(_c, "tea")
place_order(_c, "mug")
_n = [0]
def _flaky(payload):
    _n[0] += 1
    if _n[0] == 2:
        raise ConnectionError("broker down")
assert relay(_c, _flaky) == 1, "stops at the first failure"
_left = [r[0] for r in _c.execute("SELECT payload FROM outbox WHERE sent = 0 ORDER BY id")]
assert len(_left) == 1, "failed message stays unsent"
_seen2 = []
assert relay(_c, _seen2.append) == 1 and _seen2 == _left, "retry sends the rest"
@@hint
`with conn:` commits on success and rolls back when an exception leaves the block. Use `cursor.lastrowid` for the order id.
@@solution
import sqlite3

def init_db(conn):
    conn.executescript("""
    CREATE TABLE orders(id INTEGER PRIMARY KEY, item TEXT);
    CREATE TABLE outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, sent INTEGER DEFAULT 0);
    """)

def place_order(conn, item, crash=False):
    with conn:
        cur = conn.execute("INSERT INTO orders(item) VALUES (?)", (item,))
        order_id = cur.lastrowid
        if crash:
            raise RuntimeError("crash before the outbox insert")
        conn.execute("INSERT INTO outbox(payload) VALUES (?)", ("order_created:%d" % order_id,))
    return order_id

def relay(conn, publish):
    rows = conn.execute("SELECT id, payload FROM outbox WHERE sent = 0 ORDER BY id").fetchall()
    done = 0
    for row_id, payload in rows:
        try:
            publish(payload)
        except Exception:
            break
        with conn:
            conn.execute("UPDATE outbox SET sent = 1 WHERE id = ?", (row_id,))
        done += 1
    return done
````

````task
id: partition-assignment
title: Share partitions in a consumer group
kind: code
level: easy
@@statement
In Kafka, consumers in one group share the partitions of a topic: each partition goes to exactly one consumer. Write `assign_partitions(num_partitions, consumers)`.

**Input**
- `num_partitions`: an integer `>= 0`. The partitions are numbered `0 .. num_partitions - 1`.
- `consumers`: a list of distinct consumer names (strings).

**Output**: a dict `{consumer: [partition, ...]}`.
- Round robin: partition `p` goes to `consumers[p % len(consumers)]`.
- Every consumer is a key, even when it gets nothing (empty list). Each list is in increasing order.
- No consumers gives `{}`.

**Example**

```
assign_partitions(6, ["c1", "c2"])  -> {"c1": [0, 2, 4], "c2": [1, 3, 5]}
assign_partitions(1, ["c1", "c2"])  -> {"c1": [0], "c2": []}
```
@@starter
def assign_partitions(num_partitions, consumers):
    pass
@@tests
assert assign_partitions(6, ["c1", "c2"]) == {"c1": [0, 2, 4], "c2": [1, 3, 5]}, "two consumers"
assert assign_partitions(4, ["a", "b", "c"]) == {"a": [0, 3], "b": [1], "c": [2]}, "uneven split"
assert assign_partitions(1, ["c1", "c2"]) == {"c1": [0], "c2": []}, "idle consumer"
assert assign_partitions(5, []) == {}, "no consumers"
assert assign_partitions(0, ["x"]) == {"x": []}, "no partitions"
_r = assign_partitions(10, ["a", "b", "c"])
assert sorted(p for ps in _r.values() for p in ps) == list(range(10)), "every partition assigned exactly once"
@@hint
Start with `{c: [] for c in consumers}` and loop over `range(num_partitions)`.
@@solution
def assign_partitions(num_partitions, consumers):
    result = {c: [] for c in consumers}
    if not consumers:
        return result
    for p in range(num_partitions):
        result[consumers[p % len(consumers)]].append(p)
    return result
````
