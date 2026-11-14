---
id: sd-cases-3
title: Worked designs 3: video streaming, ride hailing, file sync, payments, ticket booking, LLM product
minutes: 85
---

The last six designs add media pipelines, geospatial search, money, and AI workloads. By the end you will have seen sixteen systems, and nearly any new question will be a recombination of parts you already know.

## 11. Video streaming (YouTube, Netflix)

### Requirements

- **Functional**: upload a video; watch it smoothly on any device and connection; search and recommendations out of scope.
- **Non-functional**: hundreds of millions of daily viewers; playback starts in under two seconds; no buffering; uploads are never lost; watching is far more frequent than uploading.

### Estimates

One hour of 1080p video is roughly 3 to 5 GB before re-encoding. Each upload is stored in about six resolutions. Bandwidth, not request count, dominates the cost, which is why a CDN is the centre of the design.

### High-level design

```
UPLOAD
client -> presigned URL -> object storage (raw) -> event -> transcoding pipeline (queue + workers)
                                                           |-> split into segments
                                                           |-> encode each at 240p ... 4K
                                                           |-> thumbnails, captions
                                                           -> object storage (encoded) -> CDN
                                                           -> metadata DB: video ready

WATCH
client -> API: metadata + manifest URL -> CDN edge: manifest, then segments at the chosen bitrate
```

### Deep dive: adaptive bitrate streaming

A video is cut into segments of a few seconds. Each segment is encoded at several bitrates. A **manifest** file (HLS `.m3u8` or DASH `.mpd`) lists every version. The player measures its download speed and picks the best quality it can sustain for the next segment, switching up or down as the network changes.

```python run
BITRATES = {"240p": 0.4, "480p": 1.0, "720p": 2.5, "1080p": 5.0, "4K": 16.0}     # Mbps needed

def choose_quality(measured_mbps, safety=0.8):
    usable = measured_mbps * safety                      # leave headroom
    best = "240p"
    for quality, need in BITRATES.items():
        if need <= usable:
            best = quality
    return best

network = [1.2, 3.5, 7.0, 25.0, 6.0, 0.9, 0.5, 4.0]       # Mbps while a phone moves around
for i, speed in enumerate(network):
    print(f"segment {i + 1}: {speed:5.1f} Mbps -> play {choose_quality(speed)}")
```

### More deep dives

- **Transcoding is a pipeline of jobs**: split the file into chunks, encode chunks in parallel on many workers, then stitch. A workflow engine tracks progress and retries failed chunks.
- **Resumable uploads**: the client uploads in parts and can resume after a dropped connection.
- **CDN**: popular videos are cached at the edge near viewers. The long tail is served from regional caches or origin.
- **Storage tiers**: rarely watched videos move to cheaper storage and may keep fewer resolutions.
- **Metadata** (titles, owners, counts) lives in a relational or wide-column store with heavy caching.
- **View counts**: events to Kafka, aggregated in batches; approximate in real time.
- **Deduplication and copyright**: fingerprint uploads and compare.

## 12. Ride hailing (Uber, Ola)

### Requirements

- **Functional**: a rider requests a ride; nearby drivers are matched; both see live location; trip and fare are recorded.
- **Non-functional**: millions of active drivers sending location every few seconds; matching within seconds; a trip must never be lost or double-assigned.

### Estimates

One million active drivers reporting every 4 seconds is 250,000 location writes per second. These are short-lived: only the latest position matters for matching.

### High-level design

```
driver app --(location every 4s, WebSocket)--> location service --> in-memory geo index (Redis GEO / cell -> drivers)
rider app  --(request ride)--> ride service --> matching service: nearby drivers -> offer -> accept
                                    |                                   |
                               trips DB (strong consistency)      notification/push
                                    |
                              Kafka: trip events -> pricing, ETA, analytics, billing
```

### Deep dive: finding nearby drivers

"Which drivers are within 2 km?" cannot scan a million rows. Divide the map into cells and index drivers by cell. Three common schemes: **geohash** (a string where a longer shared prefix means closer together), **quadtree** (split a square into four until each holds few points), and hexagonal grids such as **H3**.

```python run
import math
from collections import defaultdict

CELL = 0.01                                   # degrees; roughly 1 km

def cell_of(lat, lon):
    return (int(lat // CELL), int(lon // CELL))

index = defaultdict(set)                      # cell -> driver ids
position = {}

def update_location(driver, lat, lon):
    old = position.get(driver)
    if old:
        index[cell_of(*old)].discard(driver)
    position[driver] = (lat, lon)
    index[cell_of(lat, lon)].add(driver)

def distance_km(a, b):
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))

def nearby(lat, lon, limit=3):
    cx, cy = cell_of(lat, lon)
    candidates = set()
    for dx in (-1, 0, 1):                     # this cell and its 8 neighbours
        for dy in (-1, 0, 1):
            candidates |= index[(cx + dx, cy + dy)]
    ranked = sorted(candidates, key=lambda d: distance_km((lat, lon), position[d]))
    return [(d, round(distance_km((lat, lon), position[d]), 2)) for d in ranked[:limit]]

for d, lat, lon in [("d1", 18.5204, 73.8567), ("d2", 18.5250, 73.8600), ("d3", 18.5300, 73.8700), ("d4", 18.6500, 73.9500), ("d5", 18.5180, 73.8540)]:
    update_location(d, lat, lon)
print("drivers near the rider:", nearby(18.5210, 73.8570))
update_location("d5", 18.7000, 73.9000)        # d5 drives away
print("after d5 moves        :", nearby(18.5210, 73.8570))
```

### More deep dives

- **Location writes** go to an in-memory store, not the main database. They are sharded by region and expire quickly.
- **Matching**: rank candidates by estimated time of arrival, not straight-line distance. Offer to one driver at a time with a short timeout, or to a few and take the first acceptance.
- **No double assignment**: accepting a ride is an atomic conditional update on the trip row (`WHERE status = 'REQUESTED'`). Exactly one driver's update succeeds.
- **Trip state machine**: REQUESTED → MATCHED → ARRIVING → IN_PROGRESS → COMPLETED or CANCELLED, stored durably with every transition recorded.
- **Surge pricing**: compare demand and supply per cell over a sliding window.
- **Live tracking**: the driver's location stream is published to the rider's connection.
- **Regional isolation**: a city's data and services are largely independent, which makes sharding by region natural.

## 13. File storage and sync (Dropbox, Google Drive)

### Requirements

- **Functional**: upload and download files; sync across devices; share; keep versions.
- **Non-functional**: files up to several GB; never lose data; efficient on slow networks; changes appear on other devices within seconds.

### High-level design

```
client (watcher, chunker, local index)
   |-- metadata --> metadata service -> metadata DB (files, versions, chunk lists; strongly consistent)
   |-- chunks  --> block service    -> object storage (content-addressed chunks)
   <-- change notifications (long poll / WebSocket) <-- notification service <- Kafka
```

### Deep dive: chunking and deduplication

Split each file into chunks of about 4 MB and name each chunk by the hash of its content. A file is then a list of chunk hashes.

- Editing one part of a large file uploads only the changed chunks.
- Identical chunks are stored once, across files and across users.
- An interrupted upload resumes at the missing chunk.

```python run
import hashlib

CHUNK = 8                                           # bytes here; megabytes in a real system
block_store = {}                                    # hash -> bytes

def upload(data):
    manifest, sent = [], 0
    for i in range(0, len(data), CHUNK):
        chunk = data[i:i + CHUNK]
        digest = hashlib.sha256(chunk).hexdigest()[:10]
        if digest not in block_store:               # only new content travels over the network
            block_store[digest] = chunk
            sent += len(chunk)
        manifest.append(digest)
    return manifest, sent

def download(manifest):
    return b"".join(block_store[d] for d in manifest)

v1 = b"Torque spec for station four is 45 Nm. Check daily."
m1, sent1 = upload(v1)
v2 = b"Torque spec for station four is 48 Nm. Check daily."      # one small edit
m2, sent2 = upload(v2)
print(f"version 1: {len(m1)} chunks, uploaded {sent1} bytes")
print(f"version 2: {len(m2)} chunks, uploaded {sent2} bytes (only the changed chunk)")
print("chunks stored in total:", len(block_store), "| v1 restores correctly:", download(m1) == v1)
```

### More deep dives

- **Metadata and blocks are separate services**. Metadata needs transactions and strong consistency (a relational database). Blocks need cheap durable bulk storage (object storage).
- **Sync protocol**: each device tracks the last change cursor it has seen and asks for everything after it.
- **Conflicts**: two devices edit offline. Keep both as "conflicted copy" files, or merge for formats that allow it.
- **Versioning**: old manifests are kept, which costs little because unchanged chunks are shared.
- **Garbage collection**: delete chunks no manifest references, using reference counts.
- **Security**: encrypt chunks at rest and in transit; sharing is an access-control list in metadata.
- **Fixed-size chunks shift when a byte is inserted** at the start of a file; content-defined chunking with a rolling hash picks boundaries from the content so that only neighbouring chunks change.

## 14. Payment system

### Requirements

- **Functional**: charge a customer through an external payment provider; refund; keep an exact record of every movement of money.
- **Non-functional**: correctness above everything. Never charge twice, never lose a payment, every rupee accounted for. Moderate throughput. Fully auditable.

### High-level design

```
client -> payment API (idempotency key) -> payment service -> payments DB (state machine)
                                               |-> ledger service (double-entry, append-only)
                                               |-> payment provider (card network / UPI) ... webhooks back
                                               |-> outbox -> Kafka -> notifications, order service
reconciliation job (daily): our ledger  vs  provider settlement files
```

### Deep dive: idempotency and the state machine

Network timeouts are certain. The client must be able to retry safely, and the service must be able to resume after a crash.

```python run
import uuid

payments = {}                 # idempotency_key -> payment record
ledger = []                   # append-only double-entry lines: (account, debit, credit, payment_id)
provider_calls = []

def provider_charge(payment_id, amount):
    provider_calls.append(payment_id)         # the provider also dedupes on our payment_id
    return "captured"

def post_ledger(payment_id, amount):
    ledger.append(("customer_receivable", amount, 0, payment_id))    # debit
    ledger.append(("merchant_payable", 0, amount, payment_id))       # credit

def pay(idempotency_key, order_id, amount):
    record = payments.get(idempotency_key)
    if record and record["status"] in ("SUCCEEDED", "FAILED"):
        return record, "replayed"                                    # same key: same answer, no second charge
    if not record:
        record = {"id": str(uuid.uuid4())[:8], "order": order_id, "amount": amount, "status": "CREATED"}
        payments[idempotency_key] = record                           # persisted before calling the provider
    record["status"] = "PROCESSING"
    result = provider_charge(record["id"], amount)
    if result == "captured":
        post_ledger(record["id"], amount)
        record["status"] = "SUCCEEDED"
    else:
        record["status"] = "FAILED"
    return record, "executed"

key = "order-981-attempt-1"
print(pay(key, 981, 49900))
print(pay(key, 981, 49900))                                          # the client retried after a timeout
print("provider charged", len(provider_calls), "time(s)")
print("ledger balanced:", sum(l[1] for l in ledger) == sum(l[2] for l in ledger), ledger)
```

### More deep dives

- **Double-entry ledger**: every movement is recorded as equal debits and credits across accounts. The ledger is append-only; mistakes are fixed with reversing entries, never edits. The sum of all debits always equals the sum of all credits.
- **Money as integers** in the smallest unit (paise, cents). Never floats.
- **Unknown outcomes**: the provider call timed out. Do not guess. Mark the payment PENDING and query the provider or wait for its webhook.
- **Webhooks**: verify the signature, process idempotently by event ID, and acknowledge quickly.
- **Reconciliation**: compare your ledger with the provider's settlement report every day and investigate every difference. This catches what code cannot.
- **Strong consistency**: a relational database with serializable or carefully locked transactions. This is a CP system.
- **Card data**: do not store card numbers. The provider returns a token; this keeps most compliance scope out of your system.
- **Sagas** connect payment to order and inventory, with refunds as compensation.

## 15. Ticket booking (BookMyShow, airline seats)

### Requirements

- **Functional**: browse shows; view the seat map; select seats; pay; receive tickets.
- **Non-functional**: a seat is never sold twice; popular shows create bursts; a held seat is released if payment does not complete.

### The core problem

Two users click the same seat at the same moment. Exactly one must get it.

```
seats(show_id, seat_id, status: AVAILABLE | HELD | BOOKED, held_by, held_until, version)
```

Three ways to guarantee it:

```sql
-- 1. Atomic conditional update: the database decides the winner.
UPDATE seats SET status = 'HELD', held_by = :user, held_until = now() + interval '8 minutes'
WHERE show_id = :show AND seat_id = :seat
  AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < now()));
-- one row updated = you hold it; zero rows = someone else was first

-- 2. Pessimistic lock inside a transaction.
SELECT * FROM seats WHERE show_id = :show AND seat_id IN (:a, :b) FOR UPDATE;

-- 3. A unique constraint on bookings(show_id, seat_id): the second insert fails.
```

```python run
import sqlite3, threading, time

db = sqlite3.connect(":memory:", check_same_thread=False)
db.execute("CREATE TABLE seats (seat TEXT PRIMARY KEY, status TEXT, held_by TEXT, held_until REAL)")
db.executemany("INSERT INTO seats VALUES (?, 'AVAILABLE', NULL, 0)", [("A1",), ("A2",)])
db.commit()
lock = threading.Lock()                       # sqlite3 connections are not thread-safe; a real database handles this itself
winners = []

def hold(user, seat, minutes=8):
    with lock:
        cur = db.execute("""UPDATE seats SET status = 'HELD', held_by = ?, held_until = ?
                            WHERE seat = ? AND (status = 'AVAILABLE' OR (status = 'HELD' AND held_until < ?))""",
                         (user, time.time() + minutes * 60, seat, time.time()))
        db.commit()
        if cur.rowcount == 1:
            winners.append(user)

threads = [threading.Thread(target=hold, args=(f"user{i}", "A1")) for i in range(50)]
for t in threads: t.start()
for t in threads: t.join()
print("50 users tried seat A1 -> winners:", winners)
print(db.execute("SELECT seat, status, held_by FROM seats").fetchall())
```

### The booking flow

1. The seat map is read from a cache or replica; slightly stale is fine because the hold step is authoritative.
2. Selecting seats runs the atomic hold for all chosen seats in one transaction. All succeed or none do.
3. The user has eight minutes to pay. The hold carries `held_until`.
4. Payment success converts HELD to BOOKED and issues the ticket.
5. Payment failure or timeout leaves the hold to expire; the same conditional update lets the next user take it.

### More deep dives

- **Hot shows**: a virtual waiting room limits how many users reach seat selection at once.
- **Holds in Redis** with a TTL are a faster alternative for the hold step, with the database as the final authority at booking.
- **Idempotent booking confirmation** on the payment ID.
- **Read scaling**: show listings and seat maps are heavily cached; only the hold and book steps need the primary.

## 16. LLM chat product (a RAG assistant at scale)

### Requirements

- **Functional**: users chat with an assistant that answers from the company's documents; responses stream; conversations are saved; sources are cited.
- **Non-functional**: first token within about a second; thousands of concurrent conversations; cost per answer controlled; users see only documents they are allowed to see; quality measured.

### High-level design

```
INGEST (offline)
documents -> parse -> chunk -> embed -> vector index (+ keyword index) with metadata and permissions

ANSWER (online)
client <== SSE stream == API gateway (auth, rate limit by tokens) -> chat service
   chat service: load history -> rewrite query -> retrieve (hybrid, permission filter) -> rerank
               -> build prompt -> LLM gateway (routing, caching, retries, fallback) -> model
               -> stream tokens to client; save messages; emit trace (tokens, cost, latency)
```

### Deep dives

- **Streaming**: the model call can take many seconds. Server-Sent Events deliver tokens as they are generated. App servers must be asynchronous so that thousands of slow streams do not exhaust threads.
- **Rate limiting by tokens**, not only requests, because one request can cost a thousand times more than another. Per-user and per-tenant budgets.
- **LLM gateway**: one internal service in front of all model providers. It handles keys, retries with backoff, timeouts, fallback to a second model, prompt caching and usage accounting.
- **Cost control**: route simple questions to a small model; cache answers to identical questions; trim history by summarising old turns; cap output length.
- **Conversation storage**: messages in a database partitioned by conversation; recent turns cached.
- **Permissions**: enforce at retrieval with metadata filters so that restricted text never reaches the prompt.
- **Long jobs** (ingesting a large document set) run on a queue with workers, with progress reported to the user.
- **Reliability**: the model provider will have outages and rate limits. Queue or shed load gracefully, and show a clear message.
- **Evaluation and observability**: trace every step; sample conversations for automated quality scoring; alert on cost per answer, latency and failure rate.
- **Safety**: treat retrieved documents and user input as untrusted; limit what tools the assistant may call.

The retrieval and model sides of this design are covered in depth in [RAG](#ai-rag), [agents](#ai-agents) and [evals](#ai-evals-ops).

## The sixteen designs at a glance

| System | The hard part | Key technique |
| --- | --- | --- |
| URL shortener | Unique short codes; read-heavy | Counter ranges + base62; cache |
| Rate limiter | Correct counts across servers | Atomic token bucket in Redis |
| Key-value store | Always writable at scale | Consistent hashing, quorums, LSM |
| Notifications | Many channels, unreliable providers | Queue per channel, idempotency, retries |
| Job scheduler | Run once despite crashes | Atomic claim, leases, idempotent jobs |
| Chat | Routing across stateful servers | Registry + pub/sub; persist first |
| News feed | Fan-out | Hybrid push and pull |
| Autocomplete | Milliseconds per keystroke | Trie with precomputed top-k |
| Web crawler | Scale and politeness | Frontier queues, Bloom filter |
| Flash sale | Extreme contention | Early rejection, atomic decrement |
| Video streaming | Bandwidth and devices | Transcoding pipeline, adaptive bitrate, CDN |
| Ride hailing | Moving points on a map | Geo cells, in-memory index, atomic match |
| File sync | Large files, small edits | Chunking, content hashes, dedupe |
| Payments | Never double-charge | Idempotency, ledger, reconciliation |
| Ticket booking | One seat, many buyers | Conditional update with expiring holds |
| LLM product | Slow, costly, non-deterministic calls | Streaming, token budgets, gateway, evals |

## Check yourself

```quiz
[
  {"q": "What does adaptive bitrate streaming adapt to?", "options": ["The video's age", "The viewer's current network speed, segment by segment", "The server's CPU"], "answer": 1, "why": "The player picks the best encoded version it can download in time for each segment."},
  {"q": "Why index drivers by map cell?", "options": ["To draw the map", "So a nearby search checks only a few cells instead of every driver", "To compress coordinates"], "answer": 1, "why": "It turns a scan of millions into a lookup of nine cells."},
  {"q": "A 2 GB file has one paragraph changed. With content-hashed chunks, what is uploaded?", "options": ["The whole file", "Only the chunk or chunks that changed", "Nothing"], "answer": 1, "why": "Unchanged chunks already exist under the same hash."},
  {"q": "A payment request times out with no response. What should the system do?", "options": ["Assume it failed and charge again", "Mark it pending and check with the provider; retries reuse the same idempotency key", "Assume it succeeded"], "answer": 1, "why": "The outcome is unknown; guessing either way loses money or trust."},
  {"q": "Fifty users click the same seat. What guarantees one winner?", "options": ["Checking availability in the app before writing", "An atomic conditional update or lock in the database", "A faster server"], "answer": 1, "why": "Check-then-write in application code races; the database must decide."},
  {"q": "Why rate-limit an LLM product by tokens and not only by requests?", "options": ["Tokens are easier to count", "Cost and load vary enormously between requests", "Requests cannot be counted"], "answer": 1, "why": "One long prompt can cost as much as thousands of short ones."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: video-streaming-design
title: Design a video streaming service from memory
kind: text
level: hard
@@statement
Redraw the video streaming design from memory, then write it down. (Over the next two weeks, do the same for all sixteen case studies of the course, one or two a day.)

Scenario: 100 million daily active users watch 1 hour per day on average; 500,000 new videos are uploaded per day, each 5 minutes long and 300 MB as uploaded; each video is stored in 4 renditions (240p, 480p, 720p, 1080p) with average bitrates of 0.4, 1, 2.5 and 5 Mbps; start-up time under 2 seconds at p95; availability 99.95%. Functional requirements: upload, transcode, play with adaptive bitrate, search, and resume where you stopped.

**Deliverable** (about 20-25 lines), in this order:
1. Requirements.
2. APIs (3-4 endpoints).
3. Back-of-envelope: storage per day for the originals, storage per day for the four renditions, and peak egress bandwidth (assume 10% of the 100M users watch at the same time at 2.5 Mbps on average).
4. The upload and transcode pipeline and the playback path, with a CDN.
5. Three deep dives with a fix each: chunked adaptive streaming (what a segment is, how the player picks a bitrate), how the CDN handles hot versus long-tail videos, and failed or slow transcodes.
@@criteria
- Numbers are right within rounding: originals 500,000 x 300 MB = 150 TB per day; renditions 300 s x (0.4 + 1 + 2.5 + 5) Mbps / 8 = about 334 MB per video, so about 167 TB per day; peak egress 10M viewers x 2.5 Mbps = 25 Tbps.
- The playback path serves video segments from CDN edges backed by object storage; the API servers only serve metadata and manifests, never the video bytes.
- Explains adaptive bitrate streaming: the video is cut into segments of a few seconds in several renditions, a manifest (HLS or DASH) lists them, and the player measures throughput and picks the rendition of the next segment, with some hysteresis so quality does not flip constantly.
- Upload and transcode: resumable chunked upload to object storage, a job queue, parallel transcoding workers per segment or rendition, and the video is published only after its renditions are ready; retries and a dead-letter queue handle failures.
- CDN deep dive: popular videos are cached at the edge, the long tail comes from a regional cache or the origin, and because egress is the main cost a multi-tier cache (and pre-warming the first segments) is justified.
@@solution
1. Requirements. Functional: upload, transcode into 4 renditions, adaptive playback, search by title, resume position. Non-functional: start-up under 2 s at p95, 99.95% availability, durable originals.

2. APIs: `POST /videos` (starts a resumable upload, returns an upload URL and the video id); `POST /videos/{id}/complete`; `GET /videos/{id}` returns metadata and the manifest URL; `GET /search?q=`; `PUT /videos/{id}/position {seconds}`.

3. Numbers. Originals: 500,000 x 300 MB = 150 TB per day. Renditions: the bitrates add up to 8.9 Mbps; 300 s x 8.9 Mbps = 2,670 Mb = about 334 MB per video, x 500,000 = about 167 TB per day. Together about 320 TB per day, more than 100 PB per year before replication, so rarely watched renditions move to cheaper storage. Peak egress: 10M concurrent viewers x 2.5 Mbps = 25 Tbps, which only a CDN can carry.

4. Upload: the client uploads 5-20 MB chunks, resumable, straight to object storage. A completion event goes on a job queue. A splitter cuts the video into 4-second segments, transcoding workers process the segments in parallel into the four renditions, and a packager writes the manifest. Only when all renditions are ready does the metadata row switch to `PUBLISHED`. Playback: the app gets the manifest from the API (cached), then the player fetches segments from the nearest CDN edge, which falls back to a regional cache and then to object storage.

5. Deep dives. (a) Adaptive streaming: each rendition is cut into segments of about 4 seconds listed in the manifest. The player measures how fast recent segments downloaded and picks the highest rendition below about 80% of that speed for the next one; it moves up only after several good segments (hysteresis), so quality does not flip all the time. (b) CDN: the top 1% of videos get most of the views and stay at the edge; the long tail is read from a regional cache or the origin, which is slower, so the first segments of new videos are pre-warmed to keep start-up under 2 s. Egress is the largest cost, which justifies several cache tiers. (c) Transcoding failures: each job (segment, rendition) is idempotent; a failed job is retried 3 times with backoff, then goes to a dead-letter queue with an alert; the video stays unpublished, or is published with fewer renditions (at least 480p) while the others catch up.
````

````task
id: bitrate-hysteresis
title: Bitrate chooser with hysteresis
kind: code
level: medium
@@statement
A video player picks a rendition (bitrate) for each segment from the measured bandwidth. Without hysteresis it flips quality all the time. Write `choose_bitrates(bandwidths, ladder, up_streak=3, safety=0.8)`.

**Input**
- `bandwidths`: list of measured bandwidths in kbps, one per segment.
- `ladder`: list of available bitrates in kbps, sorted ascending (not empty).
- `up_streak`: how many consecutive segments must support a higher quality before the player moves up.
- `safety`: only `bandwidth * safety` may be used.

**Rules**
- For each segment the **target** is the highest ladder value `<= bandwidth * safety`, or `ladder[0]` if there is none.
- The player starts at `ladder[0]`.
- If `target < current`: move down to the target immediately and reset the streak.
- If `target > current`: add 1 to the streak and remember the target. When the streak reaches `up_streak`, move up to the **lowest** of the remembered targets and reset the streak.
- If `target == current`: reset the streak.
- Resetting the streak also forgets the remembered targets.

**Output**: a list with the bitrate used for each segment, after applying the rules for that segment. Empty input gives `[]`.

**Example** (`ladder = [400, 800, 1600]`)

```
choose_bitrates([3000, 3000, 3000, 1000, 3000, 1000], [400, 800, 1600])
-> [400, 400, 1600, 800, 800, 800]
```
@@starter
def choose_bitrates(bandwidths, ladder, up_streak=3, safety=0.8):
    pass

print(choose_bitrates([3000, 3000, 3000, 1000, 3000, 1000], [400, 800, 1600]))
@@tests
_l = [400, 800, 1600]
assert choose_bitrates([3000, 3000, 3000, 1000, 3000, 1000], _l) == [400, 400, 1600, 800, 800, 800], "example"
assert choose_bitrates([3000, 3000, 3000, 3000], _l) == [400, 400, 1600, 1600], "moves up after 3 good segments"
assert choose_bitrates([3000, 1000, 3000], _l) == [400, 400, 800], "moves up to the lowest remembered target"
assert choose_bitrates([3000, 1000, 3000], _l, up_streak=1) == [1600, 800, 1600], "a streak of 1 reacts at once"
assert choose_bitrates([100, 50], _l) == [400, 400], "below the ladder stays at the lowest rung"
assert choose_bitrates([], _l) == [], "empty input"
assert choose_bitrates([3000, 3000, 1000, 3000, 3000], _l) == [400, 400, 800, 800, 800], "after moving up the streak starts again"
assert _l == [400, 800, 1600], "ladder not changed"
@@hint
Keep `current`, `streak` and a list `pending` of the targets seen during the streak. The target is the last ladder value that is `<= bandwidth * safety`.
@@solution
def choose_bitrates(bandwidths, ladder, up_streak=3, safety=0.8):
    current = ladder[0]
    streak = 0
    pending = []
    result = []
    for bw in bandwidths:
        usable = bw * safety
        target = ladder[0]
        for rung in ladder:
            if rung <= usable:
                target = rung
        if target < current:
            current = target
            streak = 0
            pending = []
        elif target > current:
            streak += 1
            pending.append(target)
            if streak >= up_streak:
                current = min(pending)
                streak = 0
                pending = []
        else:
            streak = 0
            pending = []
        result.append(current)
    return result
````

````task
id: geohash-cells
title: Geohash and the cell-boundary problem
kind: code
level: hard
@@statement
Replace the grid with a geohash and handle the edge case at cell boundaries: two points a few meters apart can be in different cells, so a search must also look at the neighbouring cells.

Write:

1. `geohash_encode(lat, lon, precision)`: the standard geohash. Start with `lat` in `[-90, 90]` and `lon` in `[-180, 180]`. Produce bits alternately, **longitude first**: for each bit, split the current range at its middle; a value `>=` the middle gives bit 1 (keep the upper half), otherwise bit 0 (keep the lower half). Group every 5 bits into one character of the alphabet `"0123456789bcdefghjkmnpqrstuvwxyz"`. Return `precision` characters.
2. `nearby_cells(lat, lon, precision)`: returns a sorted list of the distinct geohashes of the point's cell and its neighbouring cells, found by encoding `(lat + dy * cell_height, lon + dx * cell_width)` for `dy, dx` in `-1, 0, 1`. Cell size: with `bits = 5 * precision`, longitude gets `(bits + 1) // 2` bits and latitude `bits // 2` bits, so `cell_width = 360 / 2 ** lon_bits` and `cell_height = 180 / 2 ** lat_bits`. Skip points whose latitude is outside `[-90, 90)`; wrap the longitude into `[-180, 180)` with `((lon + 180) % 360) - 180`.

**Example**

```
geohash_encode(42.605, -5.603, 5)  -> "ezs42"
a = geohash_encode(10.0, -0.0001, 5)
b = geohash_encode(10.0,  0.0001, 5)   # about 20 m apart, but a != b
b in nearby_cells(10.0, -0.0001, 5)    -> True
```
@@starter
BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

def geohash_encode(lat, lon, precision):
    pass

def nearby_cells(lat, lon, precision):
    pass
@@tests
assert geohash_encode(42.605, -5.603, 5) == "ezs42", "known value"
assert geohash_encode(57.64911, 10.40744, 11) == "u4pruydqqvj", "known value, 11 characters"
assert geohash_encode(57.64911, 10.40744, 5) == "u4pru", "a shorter hash is a prefix"
assert geohash_encode(0.0, 0.0, 1) == "s", "origin"
_a = geohash_encode(10.0, -0.0001, 5)
_b = geohash_encode(10.0, 0.0001, 5)
assert _a != _b, "two close points can be in different cells"
_cells = nearby_cells(10.0, -0.0001, 5)
assert _a in _cells and _b in _cells, "neighbour search finds the point across the boundary"
assert _cells == sorted(set(_cells)) and len(_cells) <= 9, "sorted, distinct, at most 9"
assert len(nearby_cells(10.0, 20.0, 5)) == 9, "nine cells in the middle of the map"
assert len(nearby_cells(89.9999, 0.0, 5)) == 6, "no cells beyond the pole"
@@hint
Alternate with a boolean `even` that starts as `True` (longitude). Collect 5 bits into a number `ch` with the masks `[16, 8, 4, 2, 1]`, then look up `BASE32[ch]`.
@@solution
BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

def geohash_encode(lat, lon, precision):
    lat_rng = [-90.0, 90.0]
    lon_rng = [-180.0, 180.0]
    masks = [16, 8, 4, 2, 1]
    out = []
    bit = 0
    ch = 0
    even = True
    while len(out) < precision:
        if even:
            mid = (lon_rng[0] + lon_rng[1]) / 2
            if lon >= mid:
                ch |= masks[bit]
                lon_rng[0] = mid
            else:
                lon_rng[1] = mid
        else:
            mid = (lat_rng[0] + lat_rng[1]) / 2
            if lat >= mid:
                ch |= masks[bit]
                lat_rng[0] = mid
            else:
                lat_rng[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            out.append(BASE32[ch])
            bit = 0
            ch = 0
    return "".join(out)

def nearby_cells(lat, lon, precision):
    bits = 5 * precision
    lon_bits = (bits + 1) // 2
    lat_bits = bits // 2
    width = 360 / 2 ** lon_bits
    height = 180 / 2 ** lat_bits
    cells = set()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            la = lat + dy * height
            lo = lon + dx * width
            if not -90 <= la < 90:
                continue
            lo = ((lo + 180) % 360) - 180
            cells.add(geohash_encode(la, lo, precision))
    return sorted(cells)
````

````task
id: chunk-versions-gc
title: Chunk store with versions and garbage collection
kind: code
level: hard
@@statement
Write a file store like a cloud drive: files are cut into fixed-size chunks, chunks are stored by content hash (identical chunks are stored only once), and every upload creates a new version.

`class ChunkStore` with `ChunkStore(chunk_size=4)`:

- `put(name, data)`: `data` is `bytes`. Cut it into chunks of `chunk_size` bytes (the last one may be shorter; empty data has no chunks), store each chunk under `hashlib.sha256(chunk).hexdigest()`, and record a new version of the file. Returns the version number: 1 for the first upload of `name`, then 2, 3, and so on. Version numbers are never reused, also after pruning.
- `get(name, version=None)`: returns the bytes of that version, or of the latest version if `version` is `None`. Raises `KeyError` for an unknown file or version.
- `prune(name, keep)`: forget all but the newest `keep` versions of the file (`keep >= 1`, otherwise `ValueError`). Chunks are **not** deleted here.
- `gc()`: delete every stored chunk that no remaining version of any file uses. Returns the number of chunks deleted.
- `chunk_count()`: the number of distinct chunks stored now.

**Example**

```
s = ChunkStore(4)
s.put("f", b"aaaabbbb")     -> 1     # chunks: aaaa, bbbb
s.put("f", b"aaaacccc")     -> 2     # aaaa is shared; chunk_count() == 3
s.prune("f", 1); s.gc()     -> 1     # bbbb is no longer used
```
@@starter
import hashlib

class ChunkStore:
    def __init__(self, chunk_size=4):
        pass

    def put(self, name, data):
        pass

    def get(self, name, version=None):
        pass

    def prune(self, name, keep):
        pass

    def gc(self):
        pass

    def chunk_count(self):
        pass
@@tests
_s = ChunkStore(4)
assert _s.put("f", b"aaaabbbb") == 1 and _s.chunk_count() == 2, "first version, two chunks"
assert _s.put("f", b"aaaacccc") == 2 and _s.chunk_count() == 3, "shared chunk stored once"
assert _s.get("f") == b"aaaacccc" and _s.get("f", 1) == b"aaaabbbb", "latest and old versions"
_s.prune("f", 1)
assert _s.chunk_count() == 3, "prune alone does not delete chunks"
assert _s.gc() == 1 and _s.chunk_count() == 2, "gc removes the unused chunk bbbb"
try:
    _s.get("f", 1)
    assert False, "pruned version must be gone"
except KeyError:
    pass
assert _s.put("f", b"dd") == 3, "version numbers are not reused"
_s.put("g", b"aaaa")
assert _s.chunk_count() == 3, "g shares aaaa with f"
assert _s.gc() == 0, "nothing unused"
assert _s.put("h", b"abcdef") == 1 and _s.get("h") == b"abcdef", "the last chunk may be short"
try:
    _s.get("nope")
    assert False, "unknown file"
except KeyError:
    pass
try:
    _s.prune("f", 0)
    assert False, "keep must be at least 1"
except ValueError:
    pass
@@hint
Keep `self.chunks` (hash to bytes), `self.files` (name to a dict from version to list of hashes) and a per-file counter for the last version number. `gc` first collects the set of hashes that are still referenced.
@@solution
import hashlib

class ChunkStore:
    def __init__(self, chunk_size=4):
        self.chunk_size = chunk_size
        self.chunks = {}
        self.files = {}
        self.last_version = {}

    def put(self, name, data):
        hashes = []
        for i in range(0, len(data), self.chunk_size):
            chunk = data[i:i + self.chunk_size]
            h = hashlib.sha256(chunk).hexdigest()
            self.chunks[h] = chunk
            hashes.append(h)
        version = self.last_version.get(name, 0) + 1
        self.last_version[name] = version
        self.files.setdefault(name, {})[version] = hashes
        return version

    def get(self, name, version=None):
        versions = self.files[name]
        if version is None:
            version = max(versions)
        return b"".join(self.chunks[h] for h in versions[version])

    def prune(self, name, keep):
        if keep < 1:
            raise ValueError("keep must be >= 1")
        versions = self.files[name]
        for v in sorted(versions)[:-keep]:
            del versions[v]

    def gc(self):
        used = set()
        for versions in self.files.values():
            for hashes in versions.values():
                used.update(hashes)
        unused = [h for h in self.chunks if h not in used]
        for h in unused:
            del self.chunks[h]
        return len(unused)

    def chunk_count(self):
        return len(self.chunks)
````

````task
id: ledger-refund-reconcile
title: Refunds and reconciliation in a ledger
kind: code
level: hard
@@statement
Extend a double-entry payment ledger with refunds that post reversing entries, and a reconciliation check. All amounts are integers (cents).

`class PaymentLedger`:

- `pay(txn_id, payer, merchant, amount)`: posts two entries tagged with `txn_id`: `-amount` on `payer` and `+amount` on `merchant`. A second `pay` with the same `txn_id` does nothing (idempotent).
- `refund(txn_id, refund_id, amount=None)`: posts **reversing** entries tagged with `refund_id`: `-amount` on the merchant and `+amount` on the payer. `amount=None` refunds everything not yet refunded. Rules: an unknown `txn_id` raises `KeyError`; an `amount` that is `<= 0` or more than what is still refundable raises `ValueError` and posts nothing; a `refund_id` that already succeeded does nothing (idempotent).
- `balance(account)`: the sum of all entries of that account (0 for an unknown account).
- `total()`: the sum of all entries of all accounts. It must always be 0.
- `reconcile(statement)`: `statement` is a dict `{txn_id: net_amount}` reported by the payment provider. A transaction's net amount in the ledger is its payment minus its refunds. Return a **sorted list** of the txn ids where the ledger and the statement disagree, including ids that exist on only one side.

**Example**

```
L = PaymentLedger()
L.pay("t1", "ann", "shop", 100); L.pay("t2", "ann", "shop", 50)
L.refund("t1", "r1", 30)
L.balance("ann") -> -120;  L.balance("shop") -> 120;  L.total() -> 0
L.reconcile({"t1": 70, "t2": 50})   -> []
L.reconcile({"t1": 100, "t2": 50})  -> ["t1"]
```
@@starter
class PaymentLedger:
    def __init__(self):
        pass

    def pay(self, txn_id, payer, merchant, amount):
        pass

    def refund(self, txn_id, refund_id, amount=None):
        pass

    def balance(self, account):
        pass

    def total(self):
        pass

    def reconcile(self, statement):
        pass
@@tests
_L = PaymentLedger()
_L.pay("t1", "ann", "shop", 100)
_L.pay("t2", "ann", "shop", 50)
_L.pay("t2", "ann", "shop", 50)
assert _L.balance("ann") == -150 and _L.balance("shop") == 150, "duplicate pay is ignored"
_L.refund("t1", "r1", 30)
assert _L.balance("ann") == -120 and _L.balance("shop") == 120, "partial refund reverses entries"
_L.refund("t1", "r1", 30)
assert _L.balance("ann") == -120, "same refund_id is idempotent"
assert _L.total() == 0 and _L.balance("nobody") == 0, "ledger always sums to zero"
assert _L.reconcile({"t1": 70, "t2": 50}) == [], "ledger and statement agree"
assert _L.reconcile({"t1": 100, "t2": 50}) == ["t1"], "provider missed the refund"
assert _L.reconcile({"t1": 70}) == ["t2"], "missing on the statement side"
assert _L.reconcile({"t1": 70, "t2": 50, "t9": 5}) == ["t9"], "unknown on the ledger side"
try:
    _L.refund("t1", "r2", 80)
    assert False, "over-refund must fail"
except ValueError:
    pass
assert _L.balance("ann") == -120, "failed refund posts nothing"
_L.refund("t1", "r3")
assert _L.balance("ann") == -50 and _L.reconcile({"t1": 0, "t2": 50}) == [], "refund the rest"
try:
    _L.refund("t1", "r4")
    assert False, "nothing left to refund"
except ValueError:
    pass
try:
    _L.refund("zzz", "r5", 1)
    assert False, "unknown transaction"
except KeyError:
    pass
assert _L.total() == 0, "still balanced"
@@hint
Store entries as `(ref, account, signed_amount)` tuples, plus a dict of payments and a dict of refunded totals per transaction. Add a `refund_id` to the used set only after the refund succeeded.
@@solution
class PaymentLedger:
    def __init__(self):
        self.entries = []
        self.payments = {}
        self.refunded = {}
        self.refund_ids = set()

    def pay(self, txn_id, payer, merchant, amount):
        if txn_id in self.payments:
            return
        self.payments[txn_id] = (payer, merchant, amount)
        self.entries.append((txn_id, payer, -amount))
        self.entries.append((txn_id, merchant, amount))

    def refund(self, txn_id, refund_id, amount=None):
        if refund_id in self.refund_ids:
            return
        if txn_id not in self.payments:
            raise KeyError(txn_id)
        payer, merchant, total = self.payments[txn_id]
        remaining = total - self.refunded.get(txn_id, 0)
        if amount is None:
            amount = remaining
        if amount <= 0 or amount > remaining:
            raise ValueError("invalid refund amount")
        self.entries.append((refund_id, merchant, -amount))
        self.entries.append((refund_id, payer, amount))
        self.refunded[txn_id] = self.refunded.get(txn_id, 0) + amount
        self.refund_ids.add(refund_id)

    def balance(self, account):
        return sum(a for _, acc, a in self.entries if acc == account)

    def total(self):
        return sum(a for _, _, a in self.entries)

    def reconcile(self, statement):
        net = {t: p[2] - self.refunded.get(t, 0) for t, p in self.payments.items()}
        bad = [t for t in set(net) | set(statement) if net.get(t) != statement.get(t)]
        return sorted(bad)
````

````task
id: seat-hold-book
title: Seat holds that expire, then booking
kind: code
level: medium
@@statement
Write the seat logic of a ticket booking system: a user first **holds** a seat for a limited time, then **books** it. An expired hold can be taken by someone else.

`class SeatMap` with `SeatMap(hold_seconds)`:

- `hold(seat, user, now)`: returns `True` and holds the seat for `user` until `now + hold_seconds` if the seat is not booked and has no **active** hold by a different user. If `user` already holds it, the hold is renewed (new expiry) and the result is `True`. Otherwise `False`.
- `book(seat, user, now)`: returns `True` and books the seat permanently if `user` has an active hold on it. Otherwise `False`.
- `status(seat, now)`: returns `"booked"`, `"held"` (active hold) or `"free"`. Seats never seen before are `"free"`.

A hold is active while `now < expires_at`; at `now == expires_at` it has expired. Time never goes backwards.

**Example**

```
m = SeatMap(10)
m.hold("A1", "u1", 0)    -> True
m.hold("A1", "u2", 5)    -> False
m.hold("A1", "u2", 10)   -> True     # u1's hold expired
m.book("A1", "u1", 11)   -> False
m.book("A1", "u2", 12)   -> True
```
@@starter
class SeatMap:
    def __init__(self, hold_seconds):
        pass

    def hold(self, seat, user, now):
        pass

    def book(self, seat, user, now):
        pass

    def status(self, seat, now):
        pass
@@tests
_m = SeatMap(10)
assert _m.status("A1", 0) == "free", "unknown seat is free"
assert _m.hold("A1", "u1", 0) is True, "first hold"
assert _m.hold("A1", "u2", 5) is False, "active hold blocks others"
assert _m.status("A1", 5) == "held" and _m.status("A1", 10) == "free", "expiry at exactly expires_at"
assert _m.hold("A1", "u2", 10) is True, "expired hold can be taken by another user"
assert _m.book("A1", "u1", 11) is False, "the first user lost the seat"
assert _m.book("A1", "u2", 12) is True and _m.status("A1", 12) == "booked", "second user books"
assert _m.hold("A1", "u3", 100) is False and _m.hold("A1", "u2", 100) is False, "booked seat cannot be held"
assert _m.hold("A2", "u1", 0) is True and _m.hold("A2", "u1", 8) is True, "same user renews the hold"
assert _m.status("A2", 15) == "held", "renewed until 18"
assert _m.book("A2", "u1", 17) is True, "book within the renewed hold"
assert _m.hold("A3", "u1", 0) and _m.book("A3", "u2", 1) is False, "only the holder can book"
assert _m.book("A9", "u1", 0) is False, "no hold, no booking"
@@hint
Use two dicts: `holds` (seat to `(user, expires_at)`) and `booked` (seat to user). A small helper `_active_holder(seat, now)` keeps `hold`, `book` and `status` consistent.
@@solution
class SeatMap:
    def __init__(self, hold_seconds):
        self.hold_seconds = hold_seconds
        self.holds = {}
        self.booked = {}

    def _active_holder(self, seat, now):
        h = self.holds.get(seat)
        if h is not None and now < h[1]:
            return h[0]
        return None

    def hold(self, seat, user, now):
        if seat in self.booked:
            return False
        holder = self._active_holder(seat, now)
        if holder is not None and holder != user:
            return False
        self.holds[seat] = (user, now + self.hold_seconds)
        return True

    def book(self, seat, user, now):
        if seat in self.booked or self._active_holder(seat, now) != user:
            return False
        self.booked[seat] = user
        del self.holds[seat]
        return True

    def status(self, seat, now):
        if seat in self.booked:
            return "booked"
        if self._active_holder(seat, now) is not None:
            return "held"
        return "free"
````

````task
id: food-delivery-design
title: Design food delivery and map it to earlier designs
kind: text
level: hard
@@statement
Design a food delivery app with the case-study template, and say for each part which earlier design it resembles. Then sketch two more systems the same way.

Scenario: 10 million orders per day (the busiest hour carries 15% of them), 500,000 restaurants, 300,000 couriers online at peak, each sending a GPS position every 5 seconds; a customer sees the courier move on a map with at most 5 seconds of delay; order placement p99 under 1 second; availability 99.95%; a payment must never be charged twice. Functional requirements: search nearby restaurants, place and pay an order, match a courier, live tracking, order status notifications.

**Deliverable** (about 20-30 lines):
1. Requirements and the key APIs (4-5 endpoints).
2. Back-of-envelope: orders per second in the peak hour, courier location updates per second, and the inbound bandwidth of the location stream (100 bytes per update).
3. Components with their data stores. For each of these parts name the earlier design it resembles and what you reuse: nearby search, courier location tracking, payment, order status and notifications, courier assignment.
4. Two deep dives with fixes: (a) charging exactly once when the client retries, (b) matching a courier without giving the same courier two orders.
5. In 2-3 lines each: which earlier designs a **hotel booking site** and a **stock trading platform** would reuse, and the one requirement that makes each of them different.
@@criteria
- Numbers are right within rounding: peak orders 10M x 15% / 3,600 = about 420 per second; courier updates 300,000 / 5 = 60,000 per second; inbound bandwidth 60,000 x 100 B = 6 MB/s (about 50 Mbps).
- Maps nearby search and courier lookup to the proximity (geohash or grid) design, and notes that restaurants change rarely (static index) while couriers move every 5 s (in-memory geo index with a TTL, only the latest position kept).
- Maps payment to the payment/ledger design with an idempotency key: a retry with the same key returns the first result and never charges again.
- Maps courier assignment to the seat or inventory reservation design: the courier is a limited resource that is held with an expiry and then confirmed, using an atomic check-and-set so one courier cannot get two orders.
- Maps live tracking and status updates to the chat/push design (persistent connection or server-sent events, push notification when the app is closed).
- Covers hotel booking (inventory holds per room and night, like seat booking, plus search) and stock trading (an order book with strict ordering and very low latency, plus a ledger), each with its distinguishing requirement.
@@solution
1. Requirements. Functional: nearby restaurant search, place and pay, courier matching, live tracking, status notifications. Non-functional: placement under 1 s p99, tracking delay at most 5 s, 99.95% availability, no double charge. APIs: `GET /restaurants?lat&lon&q`; `POST /orders` (header `Idempotency-Key`); `GET /orders/{id}`; `POST /couriers/location`; `GET /orders/{id}/track` (stream).

2. Numbers. Orders: 10M x 15% = 1.5M in the peak hour, 1.5M / 3,600 = about 420 orders per second. Courier GPS: 300,000 / 5 s = 60,000 updates per second, x 100 B = 6 MB/s inbound (about 50 Mbps). The bandwidth is small; the write rate is the challenge, and only the latest position must be kept.

3. Components and earlier designs. Nearby restaurant search is the proximity design: a geohash index of restaurants, rebuilt when restaurants change, queried with the user's cell plus the 8 neighbours to avoid the boundary problem. Courier locations are the same design at a much higher write rate: an in-memory geo index (Redis GEO or a sharded grid) with a 30 s TTL per courier, sharded by geohash prefix. Payment is the payment design: a payment service with a double-entry ledger and idempotency keys. Order status and tracking are the chat design: a WebSocket or SSE stream while the app is open, push notifications otherwise, one event per status change on a queue. Courier assignment is the seat booking design, with the courier as the seat.

4. Deep dives. (a) Exactly-once charge: the client creates the idempotency key with the cart; the server stores `(key, request hash, result)` before calling the provider and passes the same key to the provider. A retry with the same key returns the stored result, so a lost response cannot lead to a second charge. (b) Matching: find the 10 closest free couriers, offer the order to the best one, and hold that courier with an atomic compare-and-set (`free -> held(order, expires in 20 s)`). On accept the hold becomes `assigned`; on decline or expiry the courier is free again and the next candidate is tried. Because the state change is atomic, a courier can never hold two orders.

5. Hotel booking reuses the seat booking design (a hold per room type and night with an expiry, then confirm) and the payment design, plus a search index like the proximity design. What differs: inventory is counted per night over a date range, so a booking must reserve every night atomically. Stock trading reuses the ledger from payments and the ordered log from chat (one sequence per instrument). What differs: a matching engine keeps an in-memory order book per symbol with strict price-time priority and microsecond latency, so each symbol runs on a single thread with replication, not on a sharded database.
````
