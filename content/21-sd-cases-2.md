---
id: sd-cases-2
title: Worked designs 2: chat, news feed, autocomplete, web crawler, flash sale
minutes: 80
---

Five more designs. These involve real-time connections, fan-out to many users, and heavy contention, which are the themes interviewers return to most.

## 6. Real-time chat (WhatsApp, Slack)

### Requirements

- **Functional**: one-to-one and group messages (groups up to a few hundred); delivery when the recipient is offline; message history; sent, delivered and read receipts; online presence.
- **Non-functional**: 50 million daily users; messages must never be lost; ordered within a conversation; delivery under a second when online.

### Estimates

50 million users × 40 messages a day = 2 billion messages a day ≈ 23,000 per second on average, perhaps 100,000 at peak. At 200 bytes each that is 400 GB a day, about 150 TB a year. Tens of millions of open connections at once.

### High-level design

```
clients <== WebSocket ==> gateway servers (hold connections; stateful)
                              |    ^
                              v    |  push to the right gateway
                         chat service ---- Redis: user -> gateway registry; presence
                              |
              message store (Cassandra, partitioned by conversation)
                              |
                         Kafka --> push notification workers (offline users), search indexing
```

### Deep dive: reaching a user on another server

Asha is connected to gateway 1 and Ravi to gateway 7. Each gateway holds its sockets in its own memory, so gateway 1 cannot write to Ravi's socket.

- On connect, a gateway records `user:ravi → gateway-7` in Redis with a TTL refreshed by heartbeats.
- Each gateway subscribes to its own channel on a message bus.
- The chat service looks up Ravi's gateway and publishes the message to `gateway-7`'s channel, and gateway 7 pushes it down his socket.

```python run
from collections import defaultdict

registry = {}                                   # Redis: user -> gateway
bus = defaultdict(list)                         # pub/sub: channel -> subscriber callbacks
store = defaultdict(list)                       # message store: conversation -> messages
offline_push = []

class Gateway:
    def __init__(self, name):
        self.name, self.sockets = name, {}
        bus[name].append(self.deliver)          # subscribe to my own channel
    def connect(self, user):
        self.sockets[user] = []                 # the user's "socket"
        registry[user] = self.name
    def deliver(self, user, message):
        self.sockets[user].append(message)

def send(conversation, sender, recipient, text):
    message = {"seq": len(store[conversation]) + 1, "from": sender, "text": text}
    store[conversation].append(message)                         # 1. persist first: never lose a message
    gateway = registry.get(recipient)
    if gateway:
        for callback in bus[gateway]:                           # 2. route to the recipient's gateway
            callback(recipient, message)
    else:
        offline_push.append((recipient, text))                  # 3. offline: push notification

g1, g7 = Gateway("gateway-1"), Gateway("gateway-7")
g1.connect("asha"); g7.connect("ravi")
send("asha:ravi", "asha", "ravi", "Line 3 is back up")
send("asha:meena", "asha", "meena", "Can you check station 4?")
print("ravi's socket on gateway-7:", g7.sockets["ravi"])
print("offline push queue        :", offline_push)
print("stored for meena to fetch on reconnect:", store["asha:meena"])
```

### The message path, step by step

1. The client sends the message over its WebSocket with a client-generated ID.
2. The chat service assigns a per-conversation sequence number and writes to the message store.
3. It acknowledges the sender (one tick: sent).
4. It routes to each recipient's gateway, or queues a push notification if offline.
5. The recipient's client acknowledges receipt (delivered) and later reading (read); these travel back the same way.
6. On reconnect a client asks for "everything in each conversation after sequence N", which covers anything missed.

### More deep dives

- **Storage**: messages are append-heavy and read by conversation in time order. Cassandra with partition key `conversation_id` and clustering key `message_id` fits. Very long conversations are bucketed by month to keep partitions bounded.
- **Ordering**: a per-conversation sequence number assigned by the server. Client timestamps cannot be trusted.
- **Duplicates**: the client-generated ID makes retries idempotent.
- **Groups**: fan out on write to each member's gateway for small groups. For very large channels, members pull when they open the channel.
- **Presence**: heartbeat every few seconds updates a Redis key with a short TTL; expiry means offline. Publish presence changes only to users who have that contact on screen.
- **End-to-end encryption**: clients encrypt with keys the server never sees; the server stores and routes ciphertext.
- **Media**: upload to object storage through a presigned URL; the message carries only the object key.
- **Scaling gateways**: connections are long-lived, so a deploy must drain them gradually and clients must reconnect with backoff.

## 7. News feed (Twitter, Instagram)

### Requirements

- **Functional**: post; follow users; view a home feed of posts from the people you follow, newest or ranked.
- **Non-functional**: 300 million daily users; feed loads in under 200 ms; a post may take a few seconds to appear for followers (eventual consistency is fine); read-heavy.

### The core decision: fan-out on write or on read

| | Fan-out on write (push) | Fan-out on read (pull) |
| --- | --- | --- |
| On post | Insert the post ID into every follower's precomputed feed | Just store the post |
| On feed open | Read one precomputed list: very fast | Fetch recent posts from everyone you follow and merge: slow |
| Cost | Heavy for accounts with millions of followers | Heavy for users who follow thousands |
| Fits | Most users | Celebrity accounts |

The production answer is a **hybrid**: push for ordinary accounts; for accounts above a follower threshold, do not fan out, and merge their recent posts in at read time.

```python run
import heapq
from collections import defaultdict

followers = {"asha": ["ravi", "meena"], "ravi": ["meena"], "star": ["ravi", "meena", "asha"] + [f"fan{i}" for i in range(5)]}
following = defaultdict(list)
for author, fans in followers.items():
    for f in fans:
        following[f].append(author)

CELEBRITY_THRESHOLD = 5
posts_by_author = defaultdict(list)          # post store
feed_cache = defaultdict(list)               # Redis list per user: (timestamp, post)
clock = 0

def publish(author, text):
    global clock
    clock += 1
    post = (clock, f"{author}: {text}")
    posts_by_author[author].append(post)
    if len(followers.get(author, [])) < CELEBRITY_THRESHOLD:        # ordinary account: push to followers
        for f in followers.get(author, []):
            feed_cache[f].append(post)

def home_feed(user, limit=5):
    celebrity_posts = [p for a in following[user] if len(followers.get(a, [])) >= CELEBRITY_THRESHOLD
                       for p in posts_by_author[a][-limit:]]          # pull celebrities at read time
    return [text for _, text in heapq.nlargest(limit, feed_cache[user] + celebrity_posts)]

publish("asha", "shift handover done")
publish("star", "new video out")
publish("ravi", "audit passed")
publish("star", "thank you all")
print("meena:", home_feed("meena"))
print("ravi :", home_feed("ravi"))
print("fan-out writes avoided for 'star':", len(followers["star"]) * 2)
```

### High-level design

```
post -> post service -> posts DB + media to object storage/CDN
            |
          Kafka -> fan-out workers -> feed cache (Redis: list of post IDs per user)
read -> feed service -> feed cache IDs + celebrity merge -> hydrate posts (cache) -> rank -> response
```

### More deep dives

- **Store IDs, not posts**, in the feed cache; hydrate from a post cache. Keep only the newest few hundred IDs per user.
- **Inactive users**: do not maintain feeds for users who have not opened the app in weeks; rebuild on return.
- **Ranking**: a candidate set from the cache is scored by a model using recency, affinity and engagement.
- **Pagination**: cursor-based on post ID or score, never offset.
- **Counters** (likes, views): buffered and updated asynchronously; approximate is acceptable.
- **Graph storage**: the follow graph is a table of `(follower, followee)` with indexes both ways, or a graph store.
- **Media**: images and video are served from a CDN in several sizes.

## 8. Search autocomplete (typeahead)

### Requirements

- **Functional**: as the user types, return the top 5 to 10 completions for the prefix, ranked by popularity.
- **Non-functional**: under 100 ms end to end, since it fires on every keystroke; billions of queries a day; suggestions may be hours stale.

### Design

```
keystroke -> CDN/edge cache -> suggestion service (trie shards in memory) -> top-k for prefix
search logs -> Kafka -> aggregation job (hourly/daily counts) -> build new trie -> swap in
```

### Deep dive: a trie with precomputed top-k

Walking a subtree to rank all completions at query time is too slow. Store the top k completions at every node when the trie is built, so a lookup is one walk down the prefix.

```python run
import heapq

class Node:
    __slots__ = ("children", "top")
    def __init__(self):
        self.children, self.top = {}, []          # top: best (count, phrase) pairs under this prefix

def build(query_counts, k=3):
    root = Node()
    for phrase, count in query_counts.items():
        node = root
        for ch in phrase:
            node = node.children.setdefault(ch, Node())
            node.top.append((count, phrase))
    def trim(node):
        node.top = heapq.nlargest(k, node.top)
        for child in node.children.values():
            trim(child)
    trim(root)
    return root

def suggest(root, prefix):
    node = root
    for ch in prefix:
        node = node.children.get(ch)
        if node is None:
            return []
    return [phrase for _, phrase in node.top]

counts = {"gear": 900, "gearbox": 4200, "gearbox oil": 1500, "gear ratio": 2600, "gasket": 800, "gauge": 300, "gear pump": 700}
trie = build(counts)
for prefix in ("g", "gea", "gear ", "ga"):
    print(f"{prefix!r:8} -> {suggest(trie, prefix)}")
```

### More deep dives

- **Updates**: query counts come from logs aggregated offline. Rebuild the trie periodically and swap it in atomically. Real-time trending terms can be merged from a small, frequently updated structure.
- **Sharding**: by the first one or two characters, with uneven shards rebalanced by traffic.
- **Client side**: debounce keystrokes (wait about 150 ms), cache results per prefix, cancel stale requests.
- **Edge caching**: popular prefixes are identical for everyone, so a CDN can serve them.
- **Filtering**: remove offensive or unsafe suggestions before they are indexed.
- **Personalisation**: blend the global list with the user's own recent searches.
- **Typos**: fuzzy matching with edit distance, usually limited to one or two edits.

## 9. Web crawler

### Requirements

- **Functional**: starting from seed URLs, download pages, extract links, and continue; store content for indexing.
- **Non-functional**: a billion pages a month (about 400 pages per second); polite to websites; no duplicate work; resilient to bad pages and crawler traps.

### High-level design

```
seed URLs -> URL frontier (priority + politeness queues)
                 |
            fetcher workers -> DNS cache -> download (respect robots.txt)
                 |
            content dedupe (hash) -> content store (object storage)
                 |
            link extractor -> URL filter + "seen?" check (Bloom filter) -> back to frontier
```

This is a breadth-first traversal of the web graph at scale.

### Deep dives

- **Politeness**: never hammer one site. The frontier keeps one queue per host and enforces a delay between requests to the same host; a hash of the hostname assigns each host to one worker.
- **Priority**: important and frequently changing pages are crawled first and more often.
- **URL seen check**: billions of URLs. A Bloom filter gives a memory-cheap "definitely not seen"; a persistent store confirms.
- **Content duplicates**: many URLs serve the same page. Compare a hash of the content; near-duplicates are found with SimHash.
- **robots.txt**: fetch and cache per host; obey it.
- **Crawler traps**: infinite calendars and generated links. Limit depth and URL length per host.
- **Normalisation**: lower-case the host, remove fragments and tracking parameters, resolve relative links.
- **Failures**: timeouts, retries with backoff, and a checkpointed frontier so a crash does not restart the crawl.
- **Freshness**: schedule recrawls based on how often each page has changed before.

```python run
from collections import deque
from urllib.parse import urljoin, urldefrag

WEB = {   # a tiny fake web: url -> links on that page
    "https://a.example/": ["/about", "https://b.example/", "/products#top"],
    "https://a.example/about": ["/", "/team"],
    "https://a.example/products": ["/about", "https://b.example/x"],
    "https://a.example/team": [],
    "https://b.example/": ["https://a.example/", "/x"],
    "https://b.example/x": ["/x?page=2"],
}

def crawl(seed, max_pages=20):
    frontier, seen, order = deque([seed]), {seed}, []
    while frontier and len(order) < max_pages:
        url = frontier.popleft()
        order.append(url)
        for link in WEB.get(url, []):
            absolute = urldefrag(urljoin(url, link))[0]     # resolve relative links, drop #fragment
            if absolute not in seen:
                seen.add(absolute)
                frontier.append(absolute)
    return order

for page in crawl("https://a.example/"):
    print(page)
```

## 10. Flash sale (limited stock, huge demand)

### Requirements

- **Functional**: 10,000 units go on sale at noon; each user may buy one; show whether the purchase succeeded.
- **Non-functional**: several million users arrive in the same second; never oversell; stay up; be fair.

This is a contention problem: almost every request competes for the same small resource.

### Design principles

1. **Stop traffic as early as possible.** Only a few thousand requests can succeed, so most should be turned away before they reach the database.
2. **Make the stock decrement atomic.**
3. **Do the slow work afterwards**, asynchronously.

```
users -> CDN (static sale page) -> gateway (rate limit, bot checks, one request per user)
            -> sale service -> Redis: atomic decrement of stock  --(sold out)--> fast "sold out" reply
                                   |
                              (won a unit) -> queue -> order workers -> database, payment window
```

```python run
import threading

class Inventory:                                   # stands in for a Redis DECR/Lua script
    def __init__(self, units):
        self.units, self.buyers, self.lock = units, set(), threading.Lock()
    def try_buy(self, user):
        with self.lock:                            # atomic: check stock, check one-per-user, decrement
            if self.units <= 0 or user in self.buyers:
                return False
            self.units -= 1
            self.buyers.add(user)
            return True

stock = Inventory(units=100)
wins = []
def shopper(user):
    if stock.try_buy(user):
        wins.append(user)

threads = [threading.Thread(target=shopper, args=(f"user{i % 3000}",)) for i in range(5000)]   # some users click twice
for t in threads: t.start()
for t in threads: t.join()
print("units sold:", len(wins), "| units left:", stock.units, "| oversold:", len(wins) > 100, "| duplicate buyers:", len(wins) != len(set(wins)))
```

### Deep dives

- **Pre-warm**: load stock counts into Redis before the sale; serve the product page from a CDN.
- **Reservation with expiry**: winning a unit starts a 10-minute payment window. If payment does not complete, a timer returns the unit to stock.
- **Queueing users**: a virtual waiting room admits users at the rate the system can handle and shows their place in line.
- **Bots**: CAPTCHA, per-account and per-device limits, and a token issued just before the sale so that crafted early requests are rejected.
- **Database protection**: the database sees only the winners, through a queue, at a rate it can absorb.
- **Idempotency**: the buy button retried must not buy twice; key on `(user_id, sale_id)`.
- **Consistency**: stock is CP. Better to tell a few users "sold out" incorrectly than to oversell.

## Check yourself

```quiz
[
  {"q": "In a chat system with many gateway servers, how does a message reach a user connected to a different gateway?", "options": ["Every gateway holds every socket", "A registry maps user to gateway and a pub/sub bus routes the message there", "The client polls all gateways"], "answer": 1, "why": "Sockets live in one process, so routing needs a shared lookup and a bus."},
  {"q": "Why does the chat service write to the message store before delivering?", "options": ["To slow senders down", "So a message is never lost if delivery fails or the recipient is offline", "To sort messages"], "answer": 1, "why": "Durability first; delivery can be retried from the store."},
  {"q": "A user has 80 million followers. Fan-out on write for their post means:", "options": ["One cheap write", "80 million feed inserts per post, which is why celebrities are merged at read time", "Nothing; it is fine"], "answer": 1, "why": "The hybrid approach pushes for normal accounts and pulls for very large ones."},
  {"q": "Why store the top-k completions at each trie node?", "options": ["To save memory", "So a lookup needs only a walk down the prefix, with no subtree search", "To support typos"], "answer": 1, "why": "Autocomplete must answer in milliseconds on every keystroke."},
  {"q": "What does a crawler's politeness policy do?", "options": ["Sorts URLs alphabetically", "Limits request rate per host so sites are not overloaded", "Skips images"], "answer": 1, "why": "Per-host queues with delays are a core part of the frontier."},
  {"q": "In a flash sale, where should most requests be rejected?", "options": ["At the database", "As early as possible: gateway and an in-memory atomic counter", "At the payment provider"], "answer": 1, "why": "Only a few thousand requests can win; the rest must not reach slow components."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: chat-design
title: Design a chat system from memory
kind: text
level: medium
@@statement
Without notes, redraw the chat design with requirements, numbers and three deep dives. (Then do the same for the other designs of this lesson.)

Scenario: 50 million daily active users, each sends 40 messages per day, average message 100 bytes, groups of up to 500 members, 1-to-1 and group chat, history kept for 1 year, delivery under 500 ms at p99 for online users, availability 99.95%. Functional requirements: send and receive text in real time, offline users get their messages when they come back, delivery and read receipts, and the order of messages in one conversation is the same for everybody.

**Deliverable** (about 20-25 lines), in this order:
1. Requirements (functional, non-functional).
2. Connection type and API (protocol and 3-4 operations).
3. Back-of-envelope: messages per second (average and peak), storage per year, and the number of gateway servers if all users are connected and one server holds 100,000 connections.
4. Data model and the main components, with the path of one message to an online receiver and to an offline receiver.
5. Three deep dives with a concrete fix each: message ordering, the delivery guarantee (at least once plus deduplication), and group fan-out.
@@criteria
- Chooses a persistent connection (WebSocket or similar) for real-time delivery and a store-and-forward path (stored messages plus a push notification) for offline users.
- Numbers are correct within rounding: 50M x 40 = 2 billion messages per day = about 23,000 per second (peak about 3x, 70,000), storage 2B x 100 B = 200 GB per day = about 73 TB per year before replication, and 50M / 100k = 500 gateway servers (a lower number is fine if a lower concurrency is assumed and stated).
- Data model has a conversation id and a per-conversation sequence number (or time-ordered id), partitioned by conversation, so messages are ordered and can be fetched "after sequence N".
- Explains delivery: the message is persisted before the sender gets an ack, the receiver acks, the server retries until acked, and the client drops duplicates by message id.
- Group deep dive covers fan-out (store once in the conversation and push to online members, or copy to per-user inboxes for small groups) and gives a reason for the choice.
@@solution
1. Requirements. Functional: 1-to-1 and group chat (up to 500), real-time delivery, offline delivery, delivery and read receipts, 1 year of history, one order per conversation. Non-functional: p99 under 500 ms for online users, 99.95% availability, no message lost after the sender got an ack.

2. Protocol: one WebSocket per connected client to a gateway server; HTTP for login and history. Operations: `send(conv_id, client_msg_id, text)`, `ack(conv_id, seq)`, `fetch(conv_id, after_seq)`, `presence/typing`.

3. Numbers. 50M x 40 = 2B messages per day; 2B / 86,400 = about 23,000 per second, about 70,000 at peak. Storage: 2B x 100 B = 200 GB per day = about 73 TB per year (x3 with replicas, plus metadata). Connections: 50M online / 100,000 per gateway = 500 gateway servers (about 100 if only 20% are online at once).

4. Components: clients -> gateway servers (WebSocket) -> chat service -> message store (wide-column, partitioned by conversation id) and a queue. A session registry (Redis) maps user id to gateway. Online path: the chat service assigns the next sequence number for the conversation, persists the message, acks the sender, looks up the receiver's gateway and pushes the message. Offline path: there is no session, so the message waits in the store; a push notification wakes the app, which calls `fetch(conv, after_seq=last_seen)`.

5. Deep dives. (a) Ordering: one conversation maps to one partition and one writer, which assigns sequence numbers 1, 2, 3...; clients sort by that number, not by their own clocks. (b) Delivery: persist first, then ack the sender; the server keeps resending until the receiver acks; retries create duplicates, so every message carries a client-generated id and the receiver drops repeats. (c) Groups: for at most 500 members, store the message once in the conversation log and push it to each online member's gateway (fan-out of at most 500); offline members catch up with `fetch(after_seq)`. Copying into per-user inboxes would cost up to 500x the storage.
````

````task
id: chat-receipts
title: Chat receipts and "fetch after sequence N"
kind: code
level: medium
@@statement
Extend a chat room with delivery receipts and a catch-up call for missed messages.

Write `class ChatRoom` with `ChatRoom(members)`, where `members` is a list of user names:

- `send(sender, text)`: appends a message and returns its sequence number. Sequence numbers start at 1 and go up by 1. Raises `ValueError` if `sender` is not a member.
- `fetch_after(seq)`: returns a list of `(seq, sender, text)` tuples for all messages with a sequence number greater than `seq`, in order. `fetch_after(0)` returns everything.
- `mark_delivered(user, seq)`: records that `user` has received all messages up to and including `seq`. The stored value never goes down (a smaller `seq` than before is ignored). Raises `ValueError` for a non-member.
- `status(seq)`: returns `"sent"` if some member **other than the sender** has not yet delivered up to `seq`, otherwise `"delivered"`. Raises `KeyError` for an unknown sequence number. In a room where the sender is the only member, a message is `"delivered"` at once.

**Example**

```
r = ChatRoom(["ann", "bob", "cy"])
r.send("ann", "hi")          -> 1
r.status(1)                  -> "sent"
r.mark_delivered("bob", 1); r.mark_delivered("cy", 1)
r.status(1)                  -> "delivered"
r.fetch_after(0)             -> [(1, "ann", "hi")]
```
@@starter
class ChatRoom:
    def __init__(self, members):
        pass

    def send(self, sender, text):
        pass

    def fetch_after(self, seq):
        pass

    def mark_delivered(self, user, seq):
        pass

    def status(self, seq):
        pass
@@tests
_r = ChatRoom(["ann", "bob", "cy"])
assert _r.send("ann", "hi") == 1 and _r.send("bob", "yo") == 2, "sequence numbers"
assert _r.fetch_after(0) == [(1, "ann", "hi"), (2, "bob", "yo")], "fetch everything"
assert _r.fetch_after(1) == [(2, "bob", "yo")], "fetch after 1"
assert _r.fetch_after(2) == [], "nothing newer"
assert _r.status(1) == "sent", "nobody delivered yet"
_r.mark_delivered("bob", 2)
assert _r.status(1) == "sent", "cy has not delivered"
_r.mark_delivered("cy", 1)
assert _r.status(1) == "delivered", "all others delivered message 1"
assert _r.status(2) == "sent", "ann and cy have not delivered message 2"
_r.mark_delivered("bob", 1)
_r.mark_delivered("ann", 2)
_r.mark_delivered("cy", 2)
assert _r.status(2) == "delivered", "bob's progress did not go back to 1"
try:
    _r.send("zed", "x")
    assert False, "non-member cannot send"
except ValueError:
    pass
try:
    _r.status(99)
    assert False, "unknown seq"
except KeyError:
    pass
_solo = ChatRoom(["me"])
_solo.send("me", "note")
assert _solo.status(1) == "delivered", "only the sender is in the room"
@@hint
Keep `self.messages` (a list; seq = index + 1) and `self.delivered` (a dict from user to the highest delivered seq, starting at 0). `status` checks every member except the sender.
@@solution
class ChatRoom:
    def __init__(self, members):
        self.members = list(members)
        self.messages = []
        self.delivered = {m: 0 for m in self.members}

    def send(self, sender, text):
        if sender not in self.delivered:
            raise ValueError("not a member")
        self.messages.append((len(self.messages) + 1, sender, text))
        return len(self.messages)

    def fetch_after(self, seq):
        return [m for m in self.messages if m[0] > seq]

    def mark_delivered(self, user, seq):
        if user not in self.delivered:
            raise ValueError("not a member")
        self.delivered[user] = max(self.delivered[user], seq)

    def status(self, seq):
        if not 1 <= seq <= len(self.messages):
            raise KeyError(seq)
        sender = self.messages[seq - 1][1]
        for user, got in self.delivered.items():
            if user != sender and got < seq:
                return "sent"
        return "delivered"
````

````task
id: feed-fanout-threshold
title: Celebrity threshold for feed fan-out
kind: code
level: easy
@@statement
A feed uses fan-out on write for normal authors and a read-time merge for celebrities. Write `fanout_report(authors, threshold, reads_per_follower)` to see what a threshold buys you, then try several thresholds.

**Input**
- `authors`: a list of `(followers, posts_per_day)` tuples (non-negative integers).
- `threshold`: an author with `followers >= threshold` is a celebrity and is not fanned out on write.
- `reads_per_follower`: how many times per day each follower opens their feed.

**Output**: a dict with two integers:
- `"writes_saved"`: fan-out writes per day that are **not** done because of celebrities, the sum of `followers * posts_per_day` over celebrities.
- `"merges_added"`: extra read-time merges per day; every feed read by a celebrity's follower must merge that celebrity's posts, so it is the sum of `followers * reads_per_follower` over celebrities.

Empty `authors` gives both values 0.

**Example**

```
fanout_report([(100, 2), (5000000, 3)], 1000000, 10)
-> {"writes_saved": 15000000, "merges_added": 50000000}
```
@@starter
def fanout_report(authors, threshold, reads_per_follower):
    pass

print(fanout_report([(100, 2), (5000000, 3)], 1000000, 10))
@@tests
assert fanout_report([(100, 2), (5000000, 3)], 1000000, 10) == {"writes_saved": 15000000, "merges_added": 50000000}, "example"
assert fanout_report([], 10, 5) == {"writes_saved": 0, "merges_added": 0}, "empty"
assert fanout_report([(50, 1)], 1000, 5) == {"writes_saved": 0, "merges_added": 0}, "no celebrities"
assert fanout_report([(1000, 2)], 1000, 1) == {"writes_saved": 2000, "merges_added": 1000}, "threshold is inclusive"
_a = [(10, 1), (20, 1), (30, 1)]
assert fanout_report(_a, 20, 2) == {"writes_saved": 50, "merges_added": 100}, "two celebrities"
assert fanout_report(_a, 1, 0)["merges_added"] == 0, "nobody reads"
assert _a == [(10, 1), (20, 1), (30, 1)], "input not changed"
@@hint
One loop is enough: if `followers >= threshold`, add to both totals.
@@solution
def fanout_report(authors, threshold, reads_per_follower):
    saved = 0
    merges = 0
    for followers, posts in authors:
        if followers >= threshold:
            saved += followers * posts
            merges += followers * reads_per_follower
    return {"writes_saved": saved, "merges_added": merges}
````

````task
id: fuzzy-autocomplete
title: Autocomplete with edit-distance-1 matching
kind: code
level: hard
@@statement
Add typo tolerance to prefix autocomplete.

Write:

1. `within_one_edit(a, b)`: returns `True` if the strings `a` and `b` are equal or differ by exactly one insertion, deletion or substitution of a single character; otherwise `False`.
2. `suggest(words, prefix, limit=3, fuzzy=False)`.

**`suggest` rules**
- `words` is a list of lowercase strings, `prefix` a lowercase string. Do not change `words`.
- **Exact matches**: words that start with `prefix`, in alphabetical order.
- If `fuzzy` is `True`, add **fuzzy matches** after the exact ones, also alphabetical. A word that is not an exact match is a fuzzy match if at least one of `word[:len(prefix)-1]`, `word[:len(prefix)]`, `word[:len(prefix)+1]` is within one edit of `prefix` (use `max(0, ...)` so no negative slice is used).
- Return at most `limit` words, without duplicates. With `fuzzy=False` only exact matches are returned.
- An empty `prefix` matches every word exactly.

**Example**

```
words = ["apple", "apply", "ample", "maple", "april"]
suggest(words, "appl")                -> ["apple", "apply"]
suggest(words, "appl", 5, fuzzy=True) -> ["apple", "apply", "ample"]
suggest(["apple", "ample", "zebra"], "aple", 5, fuzzy=True) -> ["ample", "apple"]
```
@@starter
def within_one_edit(a, b):
    pass

def suggest(words, prefix, limit=3, fuzzy=False):
    pass
@@tests
assert within_one_edit("abc", "abc") is True, "equal"
assert within_one_edit("abc", "abd") is True, "substitution"
assert within_one_edit("abc", "abcd") is True and within_one_edit("abcd", "abc") is True, "insertion and deletion"
assert within_one_edit("abc", "bca") is False, "two or more edits"
assert within_one_edit("", "a") is True and within_one_edit("", "ab") is False, "empty string"
_w = ["apple", "apply", "ample", "maple", "april"]
assert suggest(_w, "appl") == ["apple", "apply"], "exact only"
assert suggest(_w, "appl", 5, fuzzy=True) == ["apple", "apply", "ample"], "exact first, then fuzzy"
assert suggest(_w, "appl", 1, fuzzy=True) == ["apple"], "limit applies"
assert suggest(["apple", "ample", "zebra"], "aple", 5, fuzzy=True) == ["ample", "apple"], "typo in the prefix"
assert suggest(["b", "a"], "") == ["a", "b"], "empty prefix"
assert suggest(["zebra"], "xyz", 5, fuzzy=True) == [], "no match"
assert _w == ["apple", "apply", "ample", "maple", "april"], "input list not changed"
@@hint
For `within_one_edit` compare lengths: if equal, count the mismatching positions; if they differ by one, check whether deleting one character from the longer string gives the shorter. For `suggest`, build two sorted lists (exact and fuzzy) and join them.
@@solution
def within_one_edit(a, b):
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(1 for x, y in zip(a, b) if x != y) == 1
    if len(a) > len(b):
        a, b = b, a
    for i in range(len(b)):
        if b[:i] + b[i + 1:] == a:
            return True
    return False

def suggest(words, prefix, limit=3, fuzzy=False):
    exact = sorted(set(w for w in words if w.startswith(prefix)))
    result = list(exact)
    if fuzzy:
        n = len(prefix)
        for w in sorted(set(words)):
            if w in exact:
                continue
            for k in (n - 1, n, n + 1):
                if within_one_edit(w[:max(0, k)], prefix):
                    result.append(w)
                    break
    return result[:limit]
````

````task
id: crawler-politeness
title: Polite, depth-limited crawler schedule
kind: code
level: hard
@@statement
Simulate a single-worker crawler that respects a per-host delay and a depth limit.

Write `crawl_schedule(graph, seed, max_depth, delay)`.

**Input**
- `graph`: a dict from a URL string to the list of URLs it links to. URLs look like `"host/path"`; the host is the part before the first `/`. A URL missing from `graph` has no links.
- `seed`: the start URL (depth 0).
- `max_depth`: URLs deeper than this are never fetched.
- `delay`: minimum seconds between two fetches of the same host.

**Output**: a list of `(time, url)` tuples in fetch order. Fetching takes no time. The worker clock starts at 0.

**Rules**
1. Keep a queue of URLs in discovery order (links in the order they are listed). A URL is enqueued at most once.
2. At every step, each queued URL has an earliest start of `max(clock, next_allowed[host])` (`next_allowed` is 0 for a host not fetched yet). Fetch the URL with the smallest earliest start; on a tie take the one queued first.
3. After a fetch at time `t`, set the clock to `t` and `next_allowed[host] = t + delay`, then enqueue its not-yet-seen links if `depth + 1 <= max_depth`.

**Example**

```
graph = {"a.com/": ["a.com/x", "b.com/"], "b.com/": ["a.com/y"]}
crawl_schedule(graph, "a.com/", 1, 2)
-> [(0, "a.com/"), (0, "b.com/"), (2, "a.com/x")]
```
`a.com/y` is at depth 2, so it is skipped. `b.com/` goes before `a.com/x` because a.com must rest for 2 seconds.
@@starter
def crawl_schedule(graph, seed, max_depth, delay):
    pass

print(crawl_schedule({"a.com/": ["a.com/x", "b.com/"], "b.com/": ["a.com/y"]}, "a.com/", 1, 2))
@@tests
_g = {"a.com/": ["a.com/x", "b.com/"], "b.com/": ["a.com/y"]}
assert crawl_schedule(_g, "a.com/", 1, 2) == [(0, "a.com/"), (0, "b.com/"), (2, "a.com/x")], "example"
assert crawl_schedule(_g, "a.com/", 0, 2) == [(0, "a.com/")], "depth 0 fetches only the seed"
assert crawl_schedule(_g, "a.com/", 5, 2) == [(0, "a.com/"), (0, "b.com/"), (2, "a.com/x"), (4, "a.com/y")], "deeper crawl, a.com rests 2 s after each fetch"
_cycle = {"a.com/": ["a.com/b"], "a.com/b": ["a.com/"]}
assert crawl_schedule(_cycle, "a.com/", 9, 1) == [(0, "a.com/"), (1, "a.com/b")], "cycles are fetched once"
_same = {"h.com/": ["h.com/1", "h.com/2", "h.com/3"]}
assert [t for t, _ in crawl_schedule(_same, "h.com/", 1, 3)] == [0, 3, 6, 9], "same host spacing"
assert crawl_schedule({}, "z.com/", 3, 1) == [(0, "z.com/")], "seed without links"
assert crawl_schedule({"a.com/": ["a.com/x", "a.com/x"]}, "a.com/", 1, 1) == [(0, "a.com/"), (1, "a.com/x")], "duplicate links enqueued once"
@@hint
Keep a list of `(url, depth)` entries. Each step, compute every entry's earliest start with `max(clock, next_allowed.get(host, 0))` and pick the minimum of `(start, index)`.
@@solution
def crawl_schedule(graph, seed, max_depth, delay):
    queue = [(seed, 0)]
    seen = {seed}
    next_allowed = {}
    clock = 0
    result = []
    while queue:
        starts = [max(clock, next_allowed.get(u.split("/")[0], 0)) for u, _ in queue]
        best = min(range(len(queue)), key=lambda i: (starts[i], i))
        t = starts[best]
        url, depth = queue.pop(best)
        clock = t
        next_allowed[url.split("/")[0]] = t + delay
        result.append((t, url))
        if depth + 1 <= max_depth:
            for link in graph.get(url, []):
                if link not in seen:
                    seen.add(link)
                    queue.append((link, depth + 1))
    return result
````

````task
id: flash-sale-expiry
title: Flash sale with reservation expiry
kind: code
level: medium
@@statement
Write the inventory for a flash sale where a buyer reserves a unit and then has a limited time to pay. Unpaid units return to stock.

`class FlashSale` with `FlashSale(stock, hold_seconds)`:

- `reserve(user, now)`: returns `True` and creates a hold that expires at `now + hold_seconds` if (a) a unit is available, (b) this user has no active hold and (c) this user has not bought already. Otherwise returns `False`.
- `pay(user, now)`: returns `True` if the user has an active hold; the unit is then sold for good and the hold is used up. Otherwise `False`.
- `available(now)`: returns the number of units that could be reserved right now: `stock - sold - active holds`.

A hold is **active** while `now < expires_at`. At `now == expires_at` it has expired and its unit is free again. Times never go backwards between calls.

**Example**

```
s = FlashSale(1, 10)
s.reserve("u1", 0)   -> True
s.reserve("u2", 5)   -> False     # the only unit is held
s.reserve("u2", 10)  -> True      # u1's hold expired
s.pay("u1", 11)      -> False
s.pay("u2", 12)      -> True
```
@@starter
class FlashSale:
    def __init__(self, stock, hold_seconds):
        pass

    def reserve(self, user, now):
        pass

    def pay(self, user, now):
        pass

    def available(self, now):
        pass
@@tests
_s = FlashSale(1, 10)
assert _s.reserve("u1", 0) is True, "first reservation"
assert _s.reserve("u2", 5) is False, "unit is held"
assert _s.available(5) == 0, "no stock available while held"
assert _s.available(10) == 1, "hold expires exactly at expires_at"
assert _s.reserve("u2", 10) is True, "expired hold is released"
assert _s.pay("u1", 11) is False, "expired hold cannot be paid"
assert _s.pay("u2", 12) is True, "valid hold can be paid"
assert _s.available(100) == 0, "sold unit stays gone"
assert _s.reserve("u3", 100) is False, "sold out"
_t = FlashSale(3, 5)
assert _t.reserve("a", 0) and _t.reserve("b", 0), "two holds"
assert _t.reserve("a", 1) is False, "one active hold per user"
assert _t.available(1) == 1, "3 - 2 holds"
assert _t.pay("a", 2) is True and _t.pay("a", 3) is False, "pay only once"
assert _t.reserve("a", 4) is False, "a user who paid cannot buy again"
assert _t.available(6) == 2, "b's hold expired at 5, a's unit is sold"
assert _t.pay("nobody", 6) is False, "no hold at all"
@@hint
Keep `holds` (user to expiry time) and a set `buyers`. Start every method by dropping holds with `expires_at <= now`.
@@solution
class FlashSale:
    def __init__(self, stock, hold_seconds):
        self.stock = stock
        self.hold_seconds = hold_seconds
        self.holds = {}
        self.buyers = set()

    def _expire(self, now):
        self.holds = {u: e for u, e in self.holds.items() if now < e}

    def reserve(self, user, now):
        self._expire(now)
        if user in self.holds or user in self.buyers:
            return False
        if self.stock - len(self.buyers) - len(self.holds) <= 0:
            return False
        self.holds[user] = now + self.hold_seconds
        return True

    def pay(self, user, now):
        self._expire(now)
        if user not in self.holds:
            return False
        del self.holds[user]
        self.buyers.add(user)
        return True

    def available(self, now):
        self._expire(now)
        return self.stock - len(self.buyers) - len(self.holds)
````

````task
id: news-feed-design
title: Design a news feed
kind: text
level: hard
@@statement
Design the home timeline of a social network with the template: requirements, numbers, API, data, diagram and three deep dives.

Scenario: 300 million daily active users; each opens the feed 10 times a day and posts 0.5 times a day; the average user follows 200 accounts and has 200 followers; the top 0.01% of accounts have more than 5 million followers each; the feed must load in under 300 ms at p99 and show posts at most 1 minute old; availability 99.95%. Functional requirements: post, follow and unfollow, read the home feed (newest first, paginated), and see your own post immediately.

**Deliverable** (about 20-25 lines), in this order:
1. Requirements.
2. APIs (3-4 endpoints, including pagination).
3. Back-of-envelope: feed reads per second, posts per second, fan-out writes per second if every post is pushed to all followers, and the size of the feed cache at 800 entries per user and 8 bytes per entry.
4. Components and the read path.
5. Deep dives: (a) push versus pull and the hybrid for celebrities, with a threshold number; (b) pagination; (c) one of your choice (ranking, cache loss, deleting a post).
@@criteria
- Numbers are right within rounding: reads 300M x 10 / 86,400 = about 35,000 per second, posts 300M x 0.5 / 86,400 = about 1,700 per second, push fan-out about 1,700 x 200 = about 350,000 writes per second, feed cache 300M x 800 x 8 B = about 1.9 TB.
- Explains fan-out on write (push) for normal accounts, which turns a feed read into a cheap cache lookup, and why it breaks for celebrities (one post to 5M followers means 5M writes).
- Gives a hybrid: pull and merge at read time for accounts above a stated threshold (for example 100,000 or 1 million followers), push for everyone else, and says what the read path merges.
- Uses cursor pagination (an opaque cursor or the last post id, not an offset) and explains why (new posts keep arriving, so offsets shift and items are duplicated or skipped).
- Names a data model (post store, social graph, per-user feed list in a cache) and handles the third deep dive with a concrete fix (for example rebuilding a lost feed from the graph and recent posts, or filtering deleted posts at read time).
@@solution
1. Requirements. Functional: create a post, follow and unfollow, home feed (newest first, paginated), read-your-own-post. Non-functional: feed p99 under 300 ms, freshness under 1 minute, 99.95% availability; eventual consistency is fine for other people's posts.

2. APIs: `POST /posts {text, media_id?}`; `POST /follow/{user_id}` and `DELETE /follow/{user_id}`; `GET /feed?cursor=<opaque>&limit=20` returns `{posts[], next_cursor}`; `GET /users/{id}/posts`.

3. Numbers. Feed reads: 300M x 10 = 3B per day = about 35,000 per second. Posts: 300M x 0.5 = 150M per day = about 1,700 per second. Pushing every post to 200 followers: 1,700 x 200 = about 350,000 writes per second (peak near 1M). Feed cache: 300M x 800 x 8 B = about 1.9 TB, a Redis cluster of about 30 nodes with 64 GB each.

4. Components: client -> API gateway -> feed service -> feed cache (per-user list of post ids) -> post store (bodies by id, also cached) and the social graph service. Write path: store the post, put an event on a queue; fan-out workers read the author's followers and prepend the post id to each follower's list (capped at 800). Read path: read the id list, merge in recent posts of the celebrities the user follows, fetch bodies in bulk, return 20. The author's own post is merged in from their own post list so they see it immediately.

5. Deep dives. (a) Push vs pull: pure push makes reads trivial, but one post by an account with 5M followers causes 5M writes and minutes of lag. Hybrid: accounts above 1 million followers are not pushed; at read time the feed service merges the pushed list with the latest posts of the few celebrities the user follows, sorted by time. That costs a few extra reads per feed open but saves millions of writes per celebrity post. (b) Pagination: a cursor that encodes the (timestamp, post_id) of the last item shown; an offset would show duplicates or skip posts when new ones arrive at the top. (c) Cache loss and deletes: a lost feed list is rebuilt lazily from the follow graph and the recent posts of followed accounts (slower first load, acceptable); deleted post ids go into a set that the read path filters, so no follower's list needs rewriting.
````
