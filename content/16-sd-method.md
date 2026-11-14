---
id: sd-method
title: System design: the method, requirements and estimation
minutes: 55
---

System design is deciding which components a system needs, how they talk, where data lives, and what happens when load grows or something fails. There is no single correct answer, only trade-offs you can justify. This lesson gives you a repeatable method; the lessons after it supply the building blocks and fourteen fully worked designs.

## Start from one server and grow

The clearest way to understand architecture is to watch one system grow and see which problem each component solves.

| Stage | Users | What breaks | What you add |
| --- | --- | --- | --- |
| 1 | Hundreds | Nothing. One machine runs the app and the database | Nothing; keep it simple |
| 2 | Thousands | App and database fight for CPU and memory | Move the database to its own server |
| 3 | Tens of thousands | One app server is a bottleneck and a single point of failure | Several stateless app servers behind a **load balancer** |
| 4 | Hundreds of thousands | The database is overloaded with reads | **Read replicas** and a **cache** (Redis) |
| 5 | Millions | Static files and distant users are slow | A **CDN**; object storage for uploads |
| 6 | Millions | Slow tasks delay responses; spikes cause failures | **Message queue** and background workers |
| 7 | Tens of millions | One database cannot hold the writes or the data | **Partitioning and sharding**; specialised stores (search, analytics) |
| 8 | Hundreds of millions | One team and one codebase cannot move fast; one region is not enough | **Services** owned by teams; **multiple regions** |

At each stage you add only what the current bottleneck demands. Adding stage 7 machinery to a stage 2 product is the most common design mistake; it is called over-engineering.

Two requirements make stage 3 possible:

- **Stateless app servers**. Anything a request needs (session, uploaded file, cart) lives in a shared store, so any server can handle any request and servers can be added or removed freely.
- **Health checks**. The load balancer must know which servers are alive.

## The six-step method

Use the same steps for every design, in interviews and in real work.

### Step 1: requirements (5 minutes)

Never start drawing. Ask questions and write down the answers.

**Functional requirements**: what the system does. List three to five core features and explicitly put the rest out of scope.

**Non-functional requirements**: how well it does it.

| Quality | Question to ask | Example answer |
| --- | --- | --- |
| Scale | How many users? Requests per second? Data volume? | 10 million daily users |
| Latency | How fast must it respond? | p99 under 200 ms for reads |
| Availability | How much downtime is acceptable? | 99.99% |
| Consistency | Must everyone see the latest data immediately? | Likes may lag; payments may not |
| Durability | Can any data ever be lost? | Never lose an uploaded file |
| Read/write ratio | Mostly reading or writing? | 100 reads per write |
| Security and compliance | Personal data? Payments? Regional rules? | Card data must follow PCI rules |

Example for "design a URL shortener":

- Functional: create a short link; redirect to the original; optional custom alias and expiry. Out of scope: user accounts, analytics dashboard.
- Non-functional: 100 million new links a month; 100:1 read-to-write; redirect in under 50 ms; a link must never point to the wrong place; highly available for reads.

### Step 2: estimation (5 minutes)

Rough numbers decide whether you need one database or fifty. Round aggressively; only the order of magnitude matters.

```sim
estimator
```

Numbers to memorise:

| Fact | Value |
| --- | --- |
| Seconds in a day | 86,400, round to 100,000 |
| 1 million requests per day | about 12 per second |
| 1 billion requests per day | about 12,000 per second |
| A character (ASCII) | 1 byte |
| A UUID | 16 bytes (36 as text) |
| A typical JSON API record | 0.5 to 2 KB |
| A compressed photo | 200 KB to 2 MB |
| One minute of 1080p video | about 50 to 100 MB |
| KB, MB, GB, TB, PB | 10³, 10⁶, 10⁹, 10¹², 10¹⁵ bytes |

Approximate latencies, to reason about what is expensive:

| Operation | Time | Scaled up so that 1 ns = 1 second |
| --- | --- | --- |
| Read from CPU cache | about 1 ns | 1 second |
| Read from main memory | about 100 ns | 2 minutes |
| Read 1 MB sequentially from memory | about 10 µs | 3 hours |
| Read from SSD | about 100 µs | 1 day |
| Round trip inside a data centre | about 0.5 ms | 6 days |
| Read from a spinning disk | about 10 ms | 4 months |
| Round trip between continents | about 150 ms | 5 years |

Lessons from that table: memory is far faster than disk, so cache; network calls are expensive, so batch them and avoid chatty designs; cross-region calls are very expensive, so keep data near users.

A worked estimate for the URL shortener:

```python run
new_links_per_month = 100_000_000
read_write_ratio = 100
bytes_per_link = 500
years = 5

writes_per_sec = new_links_per_month / (30 * 86_400)
reads_per_sec = writes_per_sec * read_write_ratio
total_links = new_links_per_month * 12 * years
storage_tb = total_links * bytes_per_link / 1e12
cache_gb = reads_per_sec * 86_400 * 0.2 * bytes_per_link / 1e9      # cache the hottest 20% of a day's reads

print(f"writes/sec  ~ {writes_per_sec:,.0f}")
print(f"reads/sec   ~ {reads_per_sec:,.0f}   (plan for 3-5x at peak)")
print(f"links in {years}y ~ {total_links / 1e9:.0f} billion")
print(f"storage     ~ {storage_tb:.0f} TB")
print(f"cache       ~ {cache_gb:.0f} GB")

import math
print("base62 characters needed:", math.ceil(math.log(total_links, 62)), "-> use 7 (62^7 =", f"{62 ** 7:,})")
```

What the numbers tell you: 40 writes per second is trivial; 4,000 reads per second is easy with a cache; 3 TB fits on one machine but you would replicate it. So this is a read-heavy system where caching matters most.

### Step 3: API (5 minutes)

Define the handful of endpoints. This forces clarity about what the system does.

```
POST /v1/links            {"long_url": "...", "custom_alias": null, "expires_at": null}  ->  201 {"short_code": "aZ3kP9x"}
GET  /{short_code}                                                                        ->  302 Location: <long_url>
DELETE /v1/links/{short_code}                                                             ->  204
```

### Step 4: data model (5 minutes)

Name the entities, their fields, the keys and the access patterns. Then choose the store and say why.

```
links(short_code PK, long_url, user_id, created_at, expires_at)
access pattern: get by short_code (very frequent); insert (rare)
choice: a key-value store or PostgreSQL both fit; access is always by key, so no joins are needed
```

### Step 5: high-level design (10 minutes)

Draw boxes and arrows: client, DNS and CDN, load balancer, service, cache, database, queue, workers. Then walk one request through it aloud, for the write path and the read path.

```
Read:   client -> load balancer -> app server -> Redis (hit? return) -> database -> fill Redis -> 302
Write:  client -> load balancer -> app server -> ID generator -> database -> 201
```

### Step 6: deep dives and trade-offs (15 minutes)

Pick the two or three hardest parts of this particular system and go deep. Then cover:

- **Bottlenecks**: what fails first at 10 times the load?
- **Failure**: what happens when the cache, a database replica, or a whole data centre dies?
- **Trade-offs**: what did you give up, and why was that acceptable?
- **Monitoring**: what would you measure and alert on?

Say trade-offs aloud in this form: "I am choosing X over Y because requirement Z matters more here; the cost is W, which is acceptable because…".

## Trade-offs you will make in every design

| Tension | One side | Other side |
| --- | --- | --- |
| Consistency vs availability | Refuse requests when unsure, never show wrong data | Always answer, possibly with stale data |
| Latency vs consistency | Reply from the nearest copy | Wait for all copies to agree |
| Read speed vs write speed | Precompute and denormalise; writes do more work | Normalise; reads do more work |
| Cost vs performance | More and bigger machines | Accept slower responses |
| Simplicity vs flexibility | One service, one database | Many services, many stores |
| Push vs pull | Precompute results when data changes | Compute when someone asks |

There is no free choice. A good design states which side it chose for each piece of data. A bank transfer and a "like" count sit at opposite ends of the first row, and one product may contain both.

## Availability arithmetic

| Availability | Downtime per year | Per month |
| --- | --- | --- |
| 99% (two nines) | 3.65 days | 7.3 hours |
| 99.9% | 8.8 hours | 44 minutes |
| 99.99% | 53 minutes | 4.4 minutes |
| 99.999% | 5.3 minutes | 26 seconds |

```python run
def series(*parts):          # a request needs ALL of these
    out = 1
    for p in parts:
        out *= p
    return out

def parallel(a, copies):     # the request needs ANY one of the copies
    return 1 - (1 - a) ** copies

print(f"three 99.9% components in series : {series(0.999, 0.999, 0.999):.4%}")
print(f"one 99% server                   : {0.99:.4%}")
print(f"two 99% servers, either works    : {parallel(0.99, 2):.4%}")
print(f"three 99% servers                : {parallel(0.99, 3):.4%}")
```

Components in series multiply their failures; redundancy in parallel multiplies availability. That is the mathematical reason to run at least two of everything and to remove every **single point of failure**.

## Common mistakes in design interviews

- Drawing before asking about requirements and scale.
- Naming technologies without saying why ("we'll use Kafka" is not a reason).
- Designing for a billion users when told there are ten thousand.
- Ignoring failure: every box you draw can die.
- A single database or cache with no replica.
- No numbers at all, or numbers with false precision.
- Going silent. The interviewer is grading your reasoning, so think aloud.

## A template to fill in for every practice design

```
1. Requirements   functional (3-5), non-functional (scale, latency, availability, consistency)
2. Estimates      QPS (avg, peak), storage (5 years), bandwidth, cache size
3. API            endpoints with inputs and outputs
4. Data model     entities, keys, access patterns, store choice + reason
5. Design         diagram; walk the read path and the write path
6. Deep dives     2-3 hard parts; bottlenecks; failures; trade-offs; monitoring
```

## Check yourself

```quiz
[
  {"q": "What is the first thing to do when asked to design a system?", "options": ["Draw the load balancer", "Clarify functional and non-functional requirements", "Choose the database"], "answer": 1, "why": "Scale, latency and consistency needs decide everything else."},
  {"q": "About how many requests per second is 1 billion requests per day?", "options": ["120", "12,000", "1,200,000"], "answer": 1, "why": "10⁹ ÷ 86,400 ≈ 11,600."},
  {"q": "Why must app servers be stateless to scale horizontally?", "options": ["Stateless code runs faster", "Any server can then handle any request, so servers can be added, removed or replaced freely", "It avoids using a database"], "answer": 1, "why": "State kept in one server's memory ties a user to that server and is lost when it dies."},
  {"q": "A request passes through four components, each 99.9% available. Overall availability?", "options": ["99.9%", "About 99.6%", "About 99.99%"], "answer": 1, "why": "0.999⁴ ≈ 0.996. Series dependencies multiply."},
  {"q": "Your product has 5,000 users. Which design is appropriate?", "options": ["Sharded databases across three regions", "A simple app with one database, a replica and backups", "Twelve microservices with Kafka"], "answer": 1, "why": "Add components when a real bottleneck appears, not before."},
  {"q": "The estimate shows 100 reads for every write. What should the design prioritise?", "options": ["Write throughput", "Read path: caching and replicas", "Sharding"], "answer": 1, "why": "Optimise the path that carries the load."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: estimate-qps
title: Average and peak QPS
kind: code
level: easy
@@statement
Write `estimate_qps(dau, actions_per_user, peak_factor=3)` that turns daily usage into requests per second, as you do on the whiteboard.

**Input**
- `dau`: daily active users (integer `>= 0`).
- `actions_per_user`: average number of requests one user makes per day (number `>= 0`).
- `peak_factor`: how much higher the peak is than the average (default 3).

**Output**: a tuple `(avg_qps, peak_qps)` of floats, each rounded to 1 decimal.
- `avg_qps = dau * actions_per_user / 86400` (seconds in a day).
- `peak_qps = avg_qps * peak_factor`, computed from the **unrounded** average and then rounded.

**Example**

```
estimate_qps(86_400_000, 10, 2) -> (10000.0, 20000.0)
estimate_qps(0, 5)              -> (0.0, 0.0)
```
@@starter
def estimate_qps(dau, actions_per_user, peak_factor=3):
    pass
@@tests
assert estimate_qps(86_400_000, 10, 2) == (10000.0, 20000.0), "basic"
assert estimate_qps(86400, 1) == (1.0, 3.0), "default peak factor is 3"
assert estimate_qps(0, 5) == (0.0, 0.0), "no users"
assert estimate_qps(8_640_000, 1, 1.5) == (100.0, 150.0), "float peak factor"
assert estimate_qps(50_000_000, 20) == (11574.1, 34722.2), "rounding from the unrounded average"
assert isinstance(estimate_qps(10, 1)[0], float), "floats"
@@hint
Divide first, multiply by the peak factor, and call `round(x, 1)` only at the end for each value.
@@solution
def estimate_qps(dau, actions_per_user, peak_factor=3):
    avg = dau * actions_per_user / 86400
    return (round(avg, 1), round(avg * peak_factor, 1))
````

````task
id: storage-estimate
title: Storage over the years, in human units
kind: code
level: easy
@@statement
Write two functions for capacity estimates. Use **decimal** units (1 KB = 1000 bytes).

1. `storage_needed(items_per_day, bytes_per_item, years=5, replication=3)` returns the total bytes as an `int`: `items_per_day * bytes_per_item * 365 * years * replication`.
2. `human_bytes(n)` turns a byte count into text. Divide by 1000 until the value is below 1000, using the units `B, KB, MB, GB, TB, PB` (stop at PB). Plain bytes print as an integer, like `"999 B"`. All other units print with one decimal, like `"1.5 KB"`.

**Example**

```
storage_needed(1000, 100, 1, 1) -> 36500000
human_bytes(36500000)           -> "36.5 MB"
human_bytes(999)                -> "999 B"
```
@@starter
def storage_needed(items_per_day, bytes_per_item, years=5, replication=3):
    pass

def human_bytes(n):
    pass
@@tests
assert storage_needed(1000, 100, 1, 1) == 36500000, "one year, no replication"
assert storage_needed(1000, 100) == 1000 * 100 * 365 * 5 * 3, "defaults 5 years x3"
assert storage_needed(0, 100) == 0, "no items"
assert human_bytes(0) == "0 B", "zero"
assert human_bytes(999) == "999 B", "below 1 KB"
assert human_bytes(1000) == "1.0 KB", "exactly 1 KB"
assert human_bytes(1500) == "1.5 KB", "one decimal"
assert human_bytes(36500000) == "36.5 MB", "MB"
assert human_bytes(storage_needed(2_000_000, 1000, 1, 1)) == "730.0 GB", "GB"
assert human_bytes(2 * 1000 ** 4) == "2.0 TB", "TB"
@@hint
Keep a list of unit names and a float `value`. While `value >= 1000` and there is a next unit, divide by 1000 and move to the next unit.
@@solution
def storage_needed(items_per_day, bytes_per_item, years=5, replication=3):
    return items_per_day * bytes_per_item * 365 * years * replication

def human_bytes(n):
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    value = float(n)
    i = 0
    while value >= 1000 and i < len(units) - 1:
        value /= 1000
        i += 1
    if i == 0:
        return "%d B" % n
    return "%.1f %s" % (value, units[i])
````

````task
id: latency-budget
title: Request latency budget
kind: code
level: medium
@@statement
A request goes through several steps. Steps that run one after another add up. Calls that run in parallel cost only as much as the slowest one. Write `total_latency_ms(steps)`.

**Input**: `steps`, a list. Each item is either
- a number: one call, in milliseconds, or
- a list or tuple of numbers: calls made **in parallel** (cost = the maximum; an empty group costs 0).

**Output**: the total latency in ms (the sum over all steps). An empty list gives `0`. The input is not modified.

**Example**

```
# cache check 1 ms, then three parallel DB shards (10, 30, 20), then render 2 ms
total_latency_ms([1, [10, 30, 20], 2]) -> 33
```
@@starter
def total_latency_ms(steps):
    pass
@@tests
assert total_latency_ms([]) == 0, "no steps"
assert total_latency_ms([5, 10]) == 15, "sequential"
assert total_latency_ms([1, [10, 30, 20], 2]) == 33, "parallel group costs its max"
assert total_latency_ms([[]]) == 0, "empty parallel group"
assert total_latency_ms([(4,), 6]) == 10, "tuple group"
assert total_latency_ms([[5, 5], [7, 1]]) == 12, "two groups"
_s = [1, [2, 3]]
total_latency_ms(_s)
assert _s == [1, [2, 3]], "input not modified"
@@hint
Loop over the steps. If a step is a `list` or `tuple`, add `max(step, default=0)`, otherwise add the number.
@@solution
def total_latency_ms(steps):
    total = 0
    for step in steps:
        if isinstance(step, (list, tuple)):
            total += max(step, default=0)
        else:
            total += step
    return total
````

````task
id: food-delivery-requirements
title: Requirements for a food delivery app
kind: text
level: medium
@@statement
You have **10 minutes** in an interview. The prompt is: "Design a food delivery app" for one country with 5 million monthly users, 400,000 orders per day, and 30,000 partner restaurants.

Write the requirements, as four labelled lists:
1. **Functional** (5-7 bullets): what customers, restaurants and couriers can do. Start each with a verb.
2. **Non-functional** (4-6 bullets): each with a number or a target (latency, availability, consistency, scale).
3. **Out of scope** (2-3 bullets): what you will deliberately not design now.
4. **Estimates** (3 lines): average orders per second, peak orders per second (assume peak is 5 times average at dinner time), and the number of location updates per second if 20,000 couriers are active and each sends one GPS ping every 5 seconds.
@@hint
For the estimates, 400,000 / 86,400 is about 4.6. Think about which parts need strong consistency (payment, order state) and which can be eventually consistent (courier map).
@@solution
**Functional**
- Search restaurants by location and cuisine and view menus.
- Place an order and pay online.
- Accept or reject an order and update its status (restaurant: preparing, ready).
- Assign a courier to each ready order.
- Track the courier live on a map and see the order status.
- Rate the order and see order history.

**Non-functional**
- Availability: 99.95 percent for browsing and ordering.
- Latency: restaurant search p99 under 300 ms; order placement p99 under 1 s.
- Consistency: strong for payment and order state (no double charge, no lost order); eventual (a few seconds) for courier location and search results.
- Scale: 400,000 orders per day, dinner peaks of about 5 times the average.
- Durability: no confirmed order is ever lost; data replicated across zones.

**Out of scope**
- Restaurant onboarding and contracts.
- Courier payroll and scheduling.
- Recommendations and promotions.

**Estimates**
- Average orders: 400,000 / 86,400 is about 4.6 per second.
- Peak orders: about 5 x 4.6 = 23 per second. Low, so one relational database handles orders easily.
- Location updates: 20,000 / 5 = 4,000 writes per second. This is the heaviest stream, so it needs a fast in-memory or time-series store, not the main order database.
@@criteria
- Functional list covers customer, restaurant and courier actions, including order placement and tracking.
- Non-functional list gives numbers (availability, latency percentile, scale) and separates strong from eventual consistency.
- States at least two things out of scope.
- Average orders per second is about 4.6 and peak is about 23.
- Location updates are 4,000 per second and the answer notes this is the dominant write load.
````

````task
id: architecture-growth
title: How a chat app's architecture grows
kind: text
level: medium
@@statement
A messaging app starts as a side project and grows. Describe the architecture at three stages:

- **Stage 1**: 1,000 users, 1 developer.
- **Stage 2**: 200,000 users, 5 developers, 2,000 messages per second at peak.
- **Stage 3**: 20 million users, 50 developers, 150,000 messages per second at peak.

For each stage write 3-5 lines containing: the components (client, servers, data stores, queues, caches), the first thing that broke at the previous stage, and the one main change you made to fix it. Finish with one sentence on why you should not build Stage 3 on day one.
@@hint
Think about the order in which things usually break: one server, then the database, then reads, then team size.
@@solution
**Stage 1 (1,000 users).** One small server runs the API and WebSocket connections, with one PostgreSQL database (managed instance). Deployed by a script. Simple, cheap, and enough: 1,000 users send a handful of messages per second.

**Stage 2 (200,000 users, 2,000 msg/s).** What broke: one server could not hold all the WebSocket connections, and database CPU hit 100 percent on message writes and history reads. Changes: a load balancer in front of several stateless app servers, Redis pub/sub so a message reaches the server holding the recipient's connection, a PostgreSQL primary with 2 read replicas, and Redis caching for recent messages and presence. Add monitoring and CI/CD for 5 developers.

**Stage 3 (20 million users, 150,000 msg/s).** What broke: a single primary database could not take the write volume, and one codebase slowed 50 developers down. Changes: shard messages by conversation id (or move to a wide-column store such as Cassandra), put a message log (Kafka) between the chat gateway and storage to absorb spikes, split services (gateway, messages, presence, push notifications, media), store media in object storage behind a CDN, and deploy in several regions.

Do not start with Stage 3: it is expensive and slow to build and operate, and without real traffic you would guess wrongly which parts need scaling. Scale the part that actually breaks.
@@criteria
- Stage 1 is a simple single-server design with one database.
- Stage 2 names what broke (server connections or database load) and fixes it with a load balancer, cache, replicas or pub/sub.
- Stage 3 introduces sharding or a distributed store, a queue or log, and splitting into services, tied to the 150,000 msg/s figure.
- Each stage states the bottleneck of the previous stage, not only a list of technologies.
- Ends with a reasonable argument against over-engineering early.
````
