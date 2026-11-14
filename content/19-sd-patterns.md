---
id: sd-patterns
title: Architecture patterns: services, events, sagas and resilience
minutes: 60
---

Building blocks are the parts; patterns are the proven ways to arrange them. This lesson covers how to split a system into services, how services talk, how to keep data correct across them, and how to stop one failure from becoming an outage.

## Monolith, modular monolith, microservices

| | Monolith | Modular monolith | Microservices |
| --- | --- | --- | --- |
| Deployment | One unit | One unit with strict internal module boundaries | Many independently deployed services |
| Data | One database | One database; each module owns its tables | A database per service |
| Calls between parts | Function calls | Function calls through module interfaces | Network calls: REST, gRPC, events |
| Strength | Simple to build, test, debug and deploy | Simplicity plus clean boundaries | Teams ship independently; parts scale and fail separately |
| Cost | Tangles as it grows | Needs discipline | Network failures, data consistency, tracing, operational overhead |
| Fits | Small teams, new products | Most growing products | Large organisations with many teams |

Start with a well-structured monolith. Microservices solve an **organisational** problem (many teams stepping on each other in one codebase) and create **distributed-systems** problems. A network call can be slow, fail, or succeed without you hearing back; a function call cannot.

Signs it is time to extract a service: one part needs to scale very differently; one part changes far more often; a team needs to deploy without coordinating; one part needs a different technology (a Python ML service beside a Java core).

### How to split: bounded contexts

Split along business capabilities, not technical layers. In an e-commerce company: catalogue, ordering, payments, shipping, notifications. Each has its own model of the world and its own language. "Product" means a description and photos to the catalogue and a weight and dimensions to shipping. These are **bounded contexts**, from domain-driven design. A service boundary that follows one rarely needs to change with every feature.

The rule that makes services independent: **each service owns its data**. No other service reads its tables directly. Sharing a database couples services as tightly as sharing code.

### What a microservice system needs around it

- **API gateway**: one entry point for clients.
- **Service discovery**: services find each other by name because addresses change (Kubernetes DNS, Consul).
- **Backend for frontend (BFF)**: a thin API tailored to one client, such as the mobile app.
- **Service mesh** (Istio, Linkerd): sidecar proxies add mutual TLS, retries and metrics between services without code changes.
- **Distributed tracing**: one trace ID follows a request through every service.
- **Centralised logging and configuration**.

## Synchronous and asynchronous communication

| | Synchronous (REST, gRPC) | Asynchronous (events, queues) |
| --- | --- | --- |
| Caller | Waits for the answer | Publishes and moves on |
| Coupling | Caller must know the callee and it must be up | Producer does not know its consumers |
| Failure | Spreads: a slow callee makes the caller slow | Contained: messages wait in the queue |
| Consistency | Immediate | Eventual |
| Debugging | Easy to follow | Harder; needs tracing and correlation IDs |
| Use for | Queries that need an answer now | Notifications, updates to other services, long work |

A chain of synchronous calls multiplies failure: if checkout calls pricing, which calls inventory, which calls the warehouse, the availability of checkout is the product of all four.

## Event-driven architecture

Services publish **events**, facts about something that happened, such as `OrderPlaced`. Other services subscribe and react.

```python run
from collections import defaultdict

class EventBus:                                 # stands in for Kafka or RabbitMQ
    def __init__(self):
        self.subscribers = defaultdict(list)
    def subscribe(self, event_type, handler):
        self.subscribers[event_type].append(handler)
    def publish(self, event_type, payload):
        for handler in self.subscribers[event_type]:
            handler(payload)

bus = EventBus()
stock = {"gearbox": 5}
log = []

def reserve_stock(e):
    stock[e["item"]] -= e["qty"]
    log.append(f"inventory: reserved {e['qty']} {e['item']}, {stock[e['item']]} left")
def send_confirmation(e):
    log.append(f"email: order {e['order_id']} confirmed to {e['customer']}")
def record_metric(e):
    log.append(f"analytics: revenue +{e['total']}")

bus.subscribe("OrderPlaced", reserve_stock)
bus.subscribe("OrderPlaced", send_confirmation)
bus.subscribe("OrderPlaced", record_metric)

# The order service knows nothing about inventory, email or analytics.
bus.publish("OrderPlaced", {"order_id": 981, "customer": "asha@x.in", "item": "gearbox", "qty": 2, "total": 37000})
print("\n".join(log))

bus.subscribe("OrderPlaced", lambda e: log.append("loyalty: points added"))     # a new feature, no change to the publisher
bus.publish("OrderPlaced", {"order_id": 982, "customer": "ravi@x.in", "item": "gearbox", "qty": 1, "total": 18500})
print(log[-1])
```

Design notes for events:

- An event is a past-tense fact (`PaymentCaptured`), not a command (`CapturePayment`).
- Include an event ID, a timestamp and a schema version.
- Consumers must be **idempotent**, since the broker may deliver twice.
- Keep schemas backward compatible; a schema registry enforces it.

## Keeping data consistent across services

### The saga pattern

A saga replaces one distributed transaction with a sequence of local transactions. Each step has a **compensating action**. If a step fails, the completed steps are compensated in reverse order.

```python run
class StepFailed(Exception):
    pass

def run_saga(steps, context):
    done = []
    try:
        for name, action, compensate in steps:
            action(context)
            print(f"  ok        {name}")
            done.append((name, compensate))
    except StepFailed as exc:
        print(f"  FAILED    {exc}")
        for name, compensate in reversed(done):          # undo in reverse order
            compensate(context)
            print(f"  undo      {name}")
        return "order cancelled"
    return "order confirmed"

def create_order(c):      c["order"] = "PENDING"
def cancel_order(c):      c["order"] = "CANCELLED"
def charge_card(c):
    if c["amount"] > c["card_limit"]:
        raise StepFailed("payment declined")
    c["charged"] = c["amount"]
def refund_card(c):       c["charged"] = 0
def reserve_stock(c):
    if c["stock"] < c["qty"]:
        raise StepFailed("out of stock")
    c["stock"] -= c["qty"]
def release_stock(c):     c["stock"] += c["qty"]

steps = [("create order", create_order, cancel_order),
         ("charge card", charge_card, refund_card),
         ("reserve stock", reserve_stock, release_stock)]

print(run_saga(steps, {"amount": 500, "card_limit": 1000, "stock": 3, "qty": 1}))
print(run_saga(steps, {"amount": 500, "card_limit": 1000, "stock": 0, "qty": 1}))    # payment is refunded
```

- **Orchestration**: a central coordinator, as above, tells each service what to do. Easy to follow and to monitor. Workflow engines such as Temporal and AWS Step Functions do this durably.
- **Choreography**: no coordinator; each service reacts to the previous service's event. Loosely coupled, and harder to see the whole flow.

A saga is not isolated: other requests can see the intermediate state (an order that is paid but not yet reserved). Design states such as `PENDING` so that this is safe.

### Outbox pattern

A service must update its database and publish an event. If it does both separately, a crash between them leaves them disagreeing. Instead: in **one local transaction**, write the business row and an `outbox` row. A relay process reads the outbox and publishes to the broker, marking rows as sent. The event is published at least once if and only if the business change committed.

### CQRS

Command Query Responsibility Segregation uses different models for writing and reading. Writes go to a normalised store built for correctness. Events update one or more **read models**, each denormalised for a specific screen or query. Use it when reads vastly outnumber writes or need very different shapes. The cost is eventual consistency between the two and more moving parts.

### Event sourcing

Instead of storing the current state, store every change as an immutable event and derive the state by replaying.

```python run
events = [("Deposited", 1000), ("Withdrew", 300), ("Deposited", 150), ("Withdrew", 50)]

def balance(event_list):
    total = 0
    for kind, amount in event_list:
        total += amount if kind == "Deposited" else -amount
    return total

print("current balance      :", balance(events))
print("balance after 2 events:", balance(events[:2]), "(any past state can be rebuilt)")
print("full audit trail      :", events)
```

Benefits: a complete audit trail, the ability to rebuild any past state or new read models, and natural integration with event-driven systems. Costs: more complexity, changing event schemas over years, and slow replays that need periodic **snapshots**. Banking ledgers, order histories and version control are naturally event-sourced.

## Resilience patterns

In a distributed system failure is normal, so each call must be prepared for it.

### Timeouts

Every network call needs a timeout. Without one, a hung dependency holds your threads and connections until your service is as dead as the dependency. Set them shorter than you think, based on the p99 of a healthy call.

### Retries with exponential backoff and jitter

Retry transient failures, waiting longer each time, with randomness so that thousands of clients do not retry in the same instant (a **retry storm**).

```python run
import random

class Transient(Exception):
    pass

def call_with_retry(fn, attempts=5, base=0.2, cap=5.0):
    for attempt in range(attempts):
        try:
            return fn()
        except Transient as exc:
            if attempt == attempts - 1:
                raise
            delay = random.uniform(0, min(cap, base * 2 ** attempt))      # "full jitter"
            print(f"  attempt {attempt + 1} failed ({exc}); would wait {delay:.2f}s before retrying")

calls = {"n": 0}
def flaky():
    calls["n"] += 1
    if calls["n"] < 4:
        raise Transient("503 from inventory service")
    return "stock = 12"

print(call_with_retry(flaky))
```

Rules: retry only **idempotent** operations; never retry client errors (4xx); cap the number of attempts; and remember that retries at several layers multiply (three layers of three retries is 27 calls).

### Circuit breaker

When a dependency keeps failing, stop calling it for a while. That lets it recover and lets your service fail fast instead of piling up waiting requests.

- **Closed**: calls pass. Count failures.
- **Open**: after too many failures, reject calls immediately for a cooling period.
- **Half-open**: allow one trial call. Success closes the circuit; failure reopens it.

```python run
import time

class CircuitBreaker:
    def __init__(self, threshold=3, cooldown=0.5):
        self.threshold, self.cooldown = threshold, cooldown
        self.failures, self.opened_at, self.state = 0, 0.0, "closed"

    def call(self, fn):
        if self.state == "open":
            if time.monotonic() - self.opened_at < self.cooldown:
                return "fast-fail (circuit open)"
            self.state = "half-open"                       # cooling period over: try once
        try:
            result = fn()
        except Exception:
            self.failures += 1
            if self.state == "half-open" or self.failures >= self.threshold:
                self.state, self.opened_at = "open", time.monotonic()
            return f"error (failures={self.failures}, state={self.state})"
        self.failures, self.state = 0, "closed"
        return result

healthy = {"up": False}
def dependency():
    if not healthy["up"]:
        raise ConnectionError("timeout")
    return "ok"

cb = CircuitBreaker()
for _ in range(5):
    print(cb.call(dependency))
time.sleep(0.6)
healthy["up"] = True                                       # the dependency recovers
print(cb.call(dependency), "| state:", cb.state)
```

### More resilience tools

| Pattern | What it does | Example |
| --- | --- | --- |
| Bulkhead | Separate resource pools per dependency | 20 connections for payments, 20 for search; a slow search cannot starve payments |
| Graceful degradation | Serve a reduced experience | Recommendations are down, so show bestsellers |
| Fallback | Use a cached or default answer | Show the last known price |
| Load shedding | Reject excess requests early | Return 503 at 90% capacity instead of timing out for everyone |
| Backpressure | Tell upstream to slow down | A bounded queue that blocks or rejects when full |
| Idempotency | Make repeats harmless | Idempotency keys on payments |
| Health checks and auto-restart | Replace broken instances | Kubernetes liveness probes |
| Chaos testing | Break things on purpose to verify recovery | Kill a random instance in staging |

**Cascading failure** is what these prevent: service A slows, callers' threads fill up waiting, they slow, their callers slow, and the outage spreads far from its origin.

## Serverless

Functions (AWS Lambda, Azure Functions, Google Cloud Functions) run on demand, scale to zero, and bill per invocation.

- **Suits**: event handlers (a file was uploaded, so make a thumbnail), scheduled jobs, webhooks, spiky or low-traffic APIs.
- **Limits**: cold starts add latency; execution time is capped; no long-lived connections; local state does not persist; high steady traffic can cost more than servers; debugging is harder.

## The twelve-factor app

A checklist for services that deploy cleanly in the cloud.

| Factor | Meaning |
| --- | --- |
| Codebase | One repository per service, many deploys |
| Dependencies | Declared explicitly and isolated |
| Config | In environment variables, never in code |
| Backing services | Databases and queues are attached resources, addressed by URL |
| Build, release, run | Strictly separate stages |
| Processes | Stateless; state lives in backing services |
| Port binding | The service exposes itself on a port |
| Concurrency | Scale by running more processes |
| Disposability | Fast startup and graceful shutdown |
| Dev/prod parity | Keep environments as alike as possible |
| Logs | Write to standard output as an event stream |
| Admin processes | Run one-off tasks in the same environment |

## Layered and hexagonal architecture inside a service

Within one service, keep business logic independent of frameworks and databases.

- **Layered**: presentation → application/service → domain → data access. Each layer calls only the one below.
- **Hexagonal (ports and adapters)**: the domain sits in the centre and defines interfaces (ports). The web framework, the database and external APIs are adapters plugged into those ports. You can test the domain with fakes and replace an adapter without touching the rules.

## Check yourself

```quiz
[
  {"q": "A five-person startup is building its first product. Best starting architecture?", "options": ["Ten microservices", "A well-structured monolith", "Serverless functions for every feature"], "answer": 1, "why": "Microservices solve team-scaling problems the startup does not yet have and add distributed-system costs."},
  {"q": "Why should each microservice own its database?", "options": ["Databases are cheap", "A shared database couples services: a schema change in one breaks the others", "It makes joins faster"], "answer": 1, "why": "Independence of deployment requires independence of data."},
  {"q": "In a saga, step 3 of 4 fails. What happens?", "options": ["Nothing; the system stays inconsistent", "Compensating actions undo steps 2 and 1", "The database rolls everything back automatically"], "answer": 1, "why": "There is no global transaction, so each completed step is explicitly reversed."},
  {"q": "What does a circuit breaker do when open?", "options": ["Retries faster", "Fails calls immediately without contacting the dependency", "Scales up the dependency"], "answer": 1, "why": "Failing fast frees resources and gives the dependency time to recover."},
  {"q": "Why add jitter to retry delays?", "options": ["To look random", "So many clients do not retry at the same moment and overload the recovering service", "To save memory"], "answer": 1, "why": "Synchronised retries create a retry storm."},
  {"q": "Which operation is safe to retry automatically?", "options": ["`POST /payments` without an idempotency key", "`GET /orders/5`", "Sending an SMS"], "answer": 1, "why": "Reads are idempotent. The other two could happen twice."},
  {"q": "What problem does the outbox pattern solve?", "options": ["Slow queries", "Updating the database and publishing an event atomically", "Cache invalidation"], "answer": 1, "why": "Both writes go in one local transaction; a relay publishes afterwards."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: bounded-contexts
title: Split a monolith into bounded contexts
kind: text
level: medium
@@statement
A monolith for an online pharmacy has one codebase and one PostgreSQL database with 60 tables. Numbers: 400,000 users, 3,000 orders per day (peak 15 orders per minute), 1,200 catalog searches per minute at peak, 12 developers in 3 teams. Modules today: `users`, `catalog` (drugs, prices, stock), `search`, `cart`, `orders`, `payments`, `prescriptions` (upload and pharmacist approval), `delivery`, `notifications`.

(If you built your own monolith in the backend module, you may use it instead, but keep the same deliverable and give its numbers.)

**Deliverable** (about 15-20 lines):

1. Group the modules into 4-6 bounded contexts and name each one with the main entities it owns.
2. Write the dependencies as arrows, for example `Orders -> Payments (sync call)` or `Orders -> Notifications (event)`. Mark each arrow sync or async.
3. Choose the **one** context you would extract first into a separate service. Give two reasons using the numbers above (load, rate of change, team, risk).
4. Say what you would keep in the monolith for now, and the first concrete migration step (for example how the data leaves the shared database).
@@criteria
- Gives 4-6 bounded contexts with clear ownership of entities (for example Identity, Catalog and Search, Ordering, Payments, Prescriptions, Fulfilment), and no table is owned by two contexts.
- Shows the dependency arrows with sync versus async marked, and uses events for notifications and delivery updates.
- Picks one context to extract first and justifies it with at least two concrete reasons from the numbers (for example search at 1,200 per minute is the heaviest read load and scales differently from 15 orders per minute, or it has a clean boundary and few writes).
- Does not split everything at once; explains that 12 developers in 3 teams do not need many services and keeps the rest in the monolith.
- Names a concrete first migration step (own schema or database for the context, a read model fed by events or CDC, strangler routing of traffic) and one risk, such as stale data or distributed transactions between orders and payments.
@@solution
Contexts: 1) Identity (users, addresses). 2) Catalog and Search (drugs, prices, stock, search index). 3) Ordering (cart, orders). 4) Payments (payments, refunds, ledger). 5) Prescriptions (uploads, pharmacist approvals; regulated, needs a strict audit trail). 6) Fulfilment (delivery, notifications).

Arrows: Ordering -> Catalog (sync: price and stock check). Ordering -> Payments (sync: charge at checkout, the result is needed). Ordering -> Prescriptions (sync: is the prescription approved?). Ordering -> Fulfilment (async event OrderPaid). Fulfilment -> user notifications (async event). Catalog -> search index (async event on each price or stock change). Everything -> Identity for tokens (sync, cached).

First extraction: Catalog and Search. Reasons: (1) it has the heaviest and most different load, 1,200 searches per minute versus 15 orders per minute, so it needs its own scaling and a search engine instead of SQL LIKE queries; (2) it is mostly reads with few writers, so its boundary is clean and a failed extraction hurts less than if Payments came first. Payments are risky to split early because of money and transactions.

Keep Identity, Ordering, Payments, Prescriptions and Fulfilment in the monolith for now; 12 developers in 3 teams cannot run six services well.

First step: give Catalog its own schema, publish `PriceChanged` and `StockChanged` events from the monolith through an outbox table, build the search index from those events, and route only the search endpoint to the new service (strangler pattern). Risk: the stock number in the index is a few seconds stale, so Ordering must still check stock against the source of truth at checkout.
````

````task
id: saga-steps
title: Saga with a failing fourth step
kind: code
level: medium
@@statement
Implement `run_saga(steps)`, an orchestrated saga. Each step has an action and an undo (compensation). If an action fails, undo all earlier completed steps in reverse order.

**Input**: `steps`, a list of `(name, action, compensate)` tuples. `action` and `compensate` are functions with no arguments. An action fails by raising any `Exception`.

**Output**: a tuple `(status, log)`.
- `status` is `"completed"` if every action succeeded, otherwise `"compensated"`.
- `log` is a list of strings in the order things happened: `"do:<name>"` after an action succeeds, `"fail:<name>"` when it raises, and `"undo:<name>"` for each compensation.
- The failed step itself is **not** compensated (its action did not complete). Steps after it are never run. Empty `steps` gives `("completed", [])`.

**Example** (a fourth step, schedule shipping, fails)

```
steps = [("reserve", a1, u1), ("charge", a2, u2), ("email", a3, u3), ("ship", a4_fails, u4)]
run_saga(steps)
-> ("compensated", ["do:reserve", "do:charge", "do:email", "fail:ship",
                    "undo:email", "undo:charge", "undo:reserve"])
```
@@starter
def run_saga(steps):
    # your code here
    pass

def _ok():
    pass

print(run_saga([("a", _ok, _ok)]))
@@tests
def _boom():
    raise RuntimeError("down")

_calls = []
_steps = [(n, (lambda n=n: _calls.append("a" + n)), (lambda n=n: _calls.append("u" + n))) for n in ["1", "2", "3"]]
assert run_saga(_steps) == ("completed", ["do:1", "do:2", "do:3"]), "happy path"
assert _calls == ["a1", "a2", "a3"], "actions ran in order"
_calls.clear()
_steps4 = _steps + [("ship", _boom, lambda: _calls.append("uship"))]
assert run_saga(_steps4) == ("compensated", ["do:1", "do:2", "do:3", "fail:ship", "undo:3", "undo:2", "undo:1"]), "failure in the fourth step"
assert _calls[-3:] == ["u3", "u2", "u1"], "compensations really ran, in reverse"
assert "uship" not in _calls, "the failed step is not compensated"
_calls.clear()
_res = run_saga([("a", lambda: None, lambda: _calls.append("ua")), ("b", _boom, lambda: _calls.append("ub")), ("c", lambda: _calls.append("ac"), lambda: None)])
assert _res == ("compensated", ["do:a", "fail:b", "undo:a"]), "first failure stops the saga"
assert "ac" not in _calls, "later steps must not run"
assert run_saga([]) == ("completed", []), "empty saga"
assert run_saga([("x", _boom, lambda: None)]) == ("compensated", ["fail:x"]), "first step fails"
@@hint
Keep a list of completed steps. On an exception, append `fail:<name>`, then walk the completed list backwards calling each `compensate`, and return early.
@@solution
def run_saga(steps):
    log = []
    done = []
    for name, action, compensate in steps:
        try:
            action()
        except Exception:
            log.append("fail:" + name)
            for done_name, undo in reversed(done):
                undo()
                log.append("undo:" + done_name)
            return "compensated", log
        log.append("do:" + name)
        done.append((name, compensate))
    return "completed", log
````

````task
id: backoff-delays
title: Retry backoff schedule
kind: code
level: easy
@@statement
Write `backoff_delays(retries, base=1.0, factor=2.0, cap=30.0, rand=None)` that returns the waiting time before each retry.

**Input**
- `retries`: number of retries (integer `>= 0`).
- `base`: delay before the first retry, in seconds.
- `factor`: each delay is `factor` times the previous one.
- `cap`: no delay may exceed this value.
- `rand`: optional function with no arguments that returns a float in `[0, 1)`. If given, each delay is multiplied by `rand()` ("full jitter"), called once per delay, in order. If `None`, there is no jitter.

**Output**: a list of `retries` numbers. Delay `i` (starting at 0) is `min(cap, base * factor ** i)`, then jittered. `retries = 0` gives `[]`.

**Example**

```
backoff_delays(6, base=1, factor=2, cap=10)  -> [1, 2, 4, 8, 10, 10]
backoff_delays(3, base=1, factor=2, cap=10, rand=lambda: 0.5) -> [0.5, 1.0, 2.0]
```
@@starter
def backoff_delays(retries, base=1.0, factor=2.0, cap=30.0, rand=None):
    pass

print(backoff_delays(6, 1, 2, 10))
@@tests
assert backoff_delays(6, base=1, factor=2, cap=10) == [1, 2, 4, 8, 10, 10], "exponential with a cap"
assert backoff_delays(0) == [], "no retries"
assert backoff_delays(3, base=1, factor=2, cap=10, rand=lambda: 0.5) == [0.5, 1.0, 2.0], "jitter multiplies each delay"
assert backoff_delays(4, base=0.1, factor=3, cap=100) == [0.1, 0.1 * 3, 0.1 * 9, 0.1 * 27], "non-integer base"
_vals = iter([0.0, 0.25, 0.5])
assert backoff_delays(3, base=4, factor=2, cap=100, rand=lambda: next(_vals)) == [0.0, 2.0, 8.0], "rand called once per delay, in order"
assert len(backoff_delays(10)) == 10, "defaults"
assert max(backoff_delays(10)) == 30.0, "default cap is 30"
@@hint
Loop over `range(retries)` and compute `min(cap, base * factor ** i)`. Multiply by `rand()` only when `rand` is not `None`.
@@solution
def backoff_delays(retries, base=1.0, factor=2.0, cap=30.0, rand=None):
    delays = []
    for i in range(retries):
        d = min(cap, base * factor ** i)
        if rand is not None:
            d = d * rand()
        delays.append(d)
    return delays
````

````task
id: circuit-breaker
title: Circuit breaker
kind: code
level: hard
@@statement
Implement a circuit breaker with an injected clock so that it can be tested.

`CircuitBreaker(failure_threshold, reset_timeout, clock)`:
- `clock` is a function with no arguments that returns the current time in seconds.
- `call(fn)` runs `fn()` (no arguments) and returns its result.
- `state` is a property returning `"closed"`, `"open"` or `"half_open"`.
- `CircuitOpenError` is an exception class you also define.

**Rules**
- **closed**: calls run. If `fn` raises, count one failure and re-raise the same exception. A success resets the failure count to 0. When consecutive failures reach `failure_threshold`, the circuit opens and remembers the time.
- **open**: `call` raises `CircuitOpenError` without running `fn`, until `reset_timeout` seconds have passed since it opened.
- **half_open** (open and `clock() - opened_at >= reset_timeout`): the next call runs `fn`. On success the circuit closes (failure count 0). On failure it opens again with a new opening time, and the exception is re-raised.

**Example**

```
t = [0]
cb = CircuitBreaker(2, 10, lambda: t[0])
# two failing calls -> state "open"
# t[0] = 10 -> state "half_open"; one successful call -> state "closed"
```
@@starter
class CircuitOpenError(Exception):
    pass

class CircuitBreaker:
    def __init__(self, failure_threshold, reset_timeout, clock):
        pass

    @property
    def state(self):
        pass

    def call(self, fn):
        pass
@@tests
_now = [0]
def _bad():
    raise ValueError("x")
_cb = CircuitBreaker(2, 10, lambda: _now[0])
assert _cb.state == "closed", "starts closed"
assert _cb.call(lambda: 5) == 5, "returns the result"
try:
    _cb.call(_bad)
    assert False, "exception must propagate"
except ValueError:
    pass
assert _cb.state == "closed", "one failure is below the threshold"
assert _cb.call(lambda: 1) == 1 and _cb.state == "closed", "success resets the count"
for _ in range(2):
    try:
        _cb.call(_bad)
    except ValueError:
        pass
assert _cb.state == "open", "two consecutive failures open the circuit"
_ran = []
try:
    _cb.call(lambda: _ran.append(1))
    assert False, "must raise CircuitOpenError"
except CircuitOpenError:
    pass
assert _ran == [], "fn is not run while open"
_now[0] = 9
assert _cb.state == "open", "still open before the timeout"
_now[0] = 10
assert _cb.state == "half_open", "half open at the timeout"
try:
    _cb.call(_bad)
except ValueError:
    pass
assert _cb.state == "open", "failed trial opens again"
_now[0] = 19
assert _cb.state == "open", "timeout restarts from the new opening time"
_now[0] = 20
assert _cb.call(lambda: "ok") == "ok" and _cb.state == "closed", "successful trial closes"
@@hint
Store `opened_at` (None while closed). `state` can be computed from `opened_at` and the clock, so inside `call` you only update `opened_at` and the failure count.
@@solution
class CircuitOpenError(Exception):
    pass

class CircuitBreaker:
    def __init__(self, failure_threshold, reset_timeout, clock):
        self.threshold = failure_threshold
        self.timeout = reset_timeout
        self.clock = clock
        self.failures = 0
        self.opened_at = None

    @property
    def state(self):
        if self.opened_at is None:
            return "closed"
        if self.clock() - self.opened_at >= self.timeout:
            return "half_open"
        return "open"

    def call(self, fn):
        st = self.state
        if st == "open":
            raise CircuitOpenError("circuit is open")
        try:
            result = fn()
        except Exception:
            self.failures += 1
            if st == "half_open" or self.failures >= self.threshold:
                self.opened_at = self.clock()
            raise
        self.failures = 0
        self.opened_at = None
        return result
````

````task
id: retry-with-breaker
title: How retries and a circuit breaker interact
kind: text
level: medium
@@statement
Service A calls service B. A wraps each call in a retry (3 attempts, exponential backoff 100 ms, then 200 ms) and has a circuit breaker (opens after 5 consecutive failures, half-open after 30 s). A handles 200 requests per second and B normally answers in 50 ms. At 12:00 B starts returning errors for every call.

**Deliverable** (about 12-18 lines):

1. Compare the two nestings: **retry around breaker** (retry outside) and **breaker around retry** (breaker outside). For each, say what the breaker counts as one failure and what happens to the load on B in the first seconds.
2. Compute how many calls per second reach B during the outage before the breaker opens (show the arithmetic), and how many reach B once the breaker is open.
3. State which nesting you recommend, which errors must NOT be retried (two examples), and why retries need jitter.
@@criteria
- Describes retry around breaker correctly: every attempt goes through the breaker, so each retry counts as a failure and the breaker opens sooner; once open, attempts fail fast with CircuitOpenError, which should not be retried.
- Describes breaker around retry correctly: one whole retried operation counts as one failure, so the breaker opens later, and meanwhile each request costs B up to 3 calls.
- Gives the retry amplification arithmetic: up to 3 attempts x 200 requests per second = up to 600 calls per second to a service that is already failing, versus about one probe call per 30 s once the circuit is open.
- Recommends a nesting with a reason (retry outside, breaker inside, with the open-circuit error excluded from retries, is the common answer).
- Lists non-retryable errors (4xx client errors, validation errors, non-idempotent writes without an idempotency key) and explains that jitter stops all clients from retrying at the same moment (retry storm or thundering herd).
@@solution
Retry outside, breaker inside: each of the 3 attempts passes through the breaker, so one request produces up to 3 failures in the breaker's count. With a threshold of 5 consecutive failures the circuit opens after about 2 requests. After that, attempts fail immediately with CircuitOpenError. This only works if the retry code treats CircuitOpenError as not retryable; otherwise it wastes its attempts and backoff on a call that cannot succeed.

Breaker outside, retry inside: one failed request (3 attempts) counts as one failure, so the breaker needs 5 failed requests, which is 15 calls to B, before it opens. During that time every request multiplies the load on B by 3.

Arithmetic: before the breaker opens, 200 requests per second x 3 attempts = up to 600 calls per second to B, three times the normal load, on a service that is already failing. Retries can turn a small problem into a full outage. Once the circuit is open, B receives almost nothing: about one probe call every 30 s in the half-open state, and A's 200 requests per second get a fast error or a fallback.

Recommendation: retry outside, breaker inside, with CircuitOpenError excluded from retries. The breaker protects B quickly, and retries still help with single transient errors while B is healthy.

Do not retry 4xx client errors (400 bad request, 404 not found) or validation failures, because the same request will fail again. Do not retry non-idempotent writes (create a payment) without an idempotency key. Add jitter (a random part in each delay), because without it all callers that failed at the same moment retry at the same moment again and create a retry storm.
````

````task
id: bulkhead
title: Bulkhead with a semaphore
kind: code
level: medium
@@statement
Implement a bulkhead that allows at most `max_concurrent` calls to a slow dependency at the same time. Extra calls are rejected immediately; they do not wait.

Write:
- `class BulkheadFull(Exception)`.
- `class Bulkhead` with `Bulkhead(max_concurrent=3)` and `call(fn, *args)`.

**Rules**
- `call` runs `fn(*args)` and returns its result.
- It uses a `threading.Semaphore`. If no permit is free (`acquire(blocking=False)` returns False) it raises `BulkheadFull` without running `fn`.
- The permit is always released afterwards, also when `fn` raises (the exception is passed on).

**Example** (nested calls stand in for concurrent ones, so the test needs no threads or timing)

```
b = Bulkhead(3)
def nested(depth):
    return "ok" if depth == 0 else b.call(nested, depth - 1)

b.call(nested, 2)   -> "ok"                  # 3 calls in flight
b.call(nested, 3)   -> raises BulkheadFull   # the 4th does not fit
```
@@starter
import threading

class BulkheadFull(Exception):
    pass

class Bulkhead:
    def __init__(self, max_concurrent=3):
        pass

    def call(self, fn, *args):
        pass
@@tests
_b = Bulkhead(3)
def _nested(depth):
    return "ok" if depth == 0 else _b.call(_nested, depth - 1)
assert _b.call(lambda x: x * 2, 21) == 42, "arguments are passed and the result is returned"
assert _b.call(_nested, 2) == "ok", "three concurrent calls fit"
try:
    _b.call(_nested, 3)
    assert False, "the fourth concurrent call must be rejected"
except BulkheadFull:
    pass
assert _b.call(_nested, 2) == "ok", "permits were released after the rejection"
def _bad():
    raise KeyError("boom")
for _ in range(5):
    try:
        _b.call(_bad)
    except KeyError:
        pass
assert _b.call(_nested, 2) == "ok", "permits are released when fn raises"
_one = Bulkhead(1)
_ran = []
try:
    _one.call(lambda: _one.call(lambda: _ran.append(1)))
    assert False, "nested call with a limit of 1 must be rejected"
except BulkheadFull:
    pass
assert _ran == [], "rejected fn never runs"
@@hint
After a successful non-blocking acquire, use `try: ... finally: self._sem.release()`. Do not release if the acquire failed.
@@solution
import threading

class BulkheadFull(Exception):
    pass

class Bulkhead:
    def __init__(self, max_concurrent=3):
        self._sem = threading.Semaphore(max_concurrent)

    def call(self, fn, *args):
        if not self._sem.acquire(blocking=False):
            raise BulkheadFull("too many concurrent calls")
        try:
            return fn(*args)
        finally:
            self._sem.release()
````

````task
id: event-bus-queue
title: Queued event bus with an idempotent handler
kind: code
level: medium
@@statement
Rewrite a simple event bus so that `publish` only puts events in a queue, and a separate `drain` call (which a worker thread would run in a loop) delivers them. Then make a handler safe against duplicate delivery.

Write:

1. `class EventBus`
   - `subscribe(event_type, handler)`: `handler(event_id, payload)` is called for each matching event. Many handlers per type are allowed; they are called in subscription order.
   - `publish(event_type, event_id, payload)`: appends to a FIFO queue (use `collections.deque` or `queue.Queue`). It calls no handler.
   - `drain()`: delivers all queued events in FIFO order and returns the **number of handler calls made**. If a handler raises, swallow the exception and continue with the next handler (the call still counts). Events with no handlers count 0.
2. `idempotent(handler)`: returns a new handler that calls `handler(event_id, payload)` only the first time it sees a given `event_id`, and ignores later events with the same id.

**Example**

```
bus = EventBus(); seen = []
bus.subscribe("paid", idempotent(lambda i, p: seen.append(i)))
bus.publish("paid", "e1", {}); bus.publish("paid", "e1", {})   # duplicate delivery
bus.drain()   -> 2     # two handler calls, but seen == ["e1"]
```
@@starter
from collections import deque

class EventBus:
    def __init__(self):
        pass

    def subscribe(self, event_type, handler):
        pass

    def publish(self, event_type, event_id, payload):
        pass

    def drain(self):
        pass

def idempotent(handler):
    pass
@@tests
_bus = EventBus()
_seen, _plain = [], []
_bus.subscribe("paid", idempotent(lambda i, p: _seen.append(i)))
_bus.subscribe("paid", lambda i, p: _plain.append(i))
_bus.publish("paid", "e1", {"amount": 5})
assert _seen == [] and _plain == [], "publish must not call handlers"
_bus.publish("paid", "e1", {"amount": 5})
_bus.publish("paid", "e2", {"amount": 7})
assert _bus.drain() == 6, "3 events x 2 handlers"
assert _seen == ["e1", "e2"], "idempotent handler ignores the duplicate"
assert _plain == ["e1", "e1", "e2"], "plain handler sees duplicates, in FIFO order"
assert _bus.drain() == 0, "queue is empty after drain"
def _bad(i, p):
    raise RuntimeError("x")
_good = []
_bus2 = EventBus()
_bus2.subscribe("a", _bad)
_bus2.subscribe("a", lambda i, p: _good.append(i))
_bus2.publish("a", "z1", None)
assert _bus2.drain() == 2, "failing handler still counts"
assert _good == ["z1"], "later handlers still run after a failure"
_bus2.publish("other", "q", None)
assert _bus2.drain() == 0, "no handlers for this type"
@@hint
`idempotent` can keep a `set` of seen ids in a closure. In `drain`, loop with `while queue:` and `popleft()`.
@@solution
from collections import deque

class EventBus:
    def __init__(self):
        self._handlers = {}
        self._queue = deque()

    def subscribe(self, event_type, handler):
        self._handlers.setdefault(event_type, []).append(handler)

    def publish(self, event_type, event_id, payload):
        self._queue.append((event_type, event_id, payload))

    def drain(self):
        calls = 0
        while self._queue:
            event_type, event_id, payload = self._queue.popleft()
            for handler in self._handlers.get(event_type, []):
                calls += 1
                try:
                    handler(event_id, payload)
                except Exception:
                    pass
        return calls

def idempotent(handler):
    seen = set()
    def wrapper(event_id, payload):
        if event_id in seen:
            return
        seen.add(event_id)
        handler(event_id, payload)
    return wrapper
````
