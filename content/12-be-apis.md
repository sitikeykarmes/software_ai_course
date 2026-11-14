---
id: be-apis
title: Backend and API design
minutes: 55
---

A backend receives a request, checks who sent it and whether the data is valid, runs business logic, reads or writes storage, and returns a response. Good backends keep those steps in separate layers so each can be tested and changed on its own.

## Build one with no framework first

Frameworks hide the mechanics. This complete JSON API uses only the standard library, so you can see every step. It starts a server on a free port, calls it, and stops.

```python run
import json, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TASKS = {1: {"id": 1, "title": "Calibrate torque tool", "done": False}}

class Api(BaseHTTPRequestHandler):
    def log_message(self, *args): pass

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):                                   # routing by method and path
        if self.path == "/tasks":
            return self.reply(200, list(TASKS.values()))
        self.reply(404, {"error": {"code": "not_found", "message": "no such route"}})

    def do_POST(self):
        if self.path != "/tasks":
            return self.reply(404, {"error": {"code": "not_found", "message": "no such route"}})
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            title = body["title"].strip()
            if not title:
                raise ValueError
        except (KeyError, ValueError, AttributeError, TypeError):
            return self.reply(422, {"error": {"code": "invalid", "message": "title is required"}})   # validation
        task = {"id": max(TASKS) + 1, "title": title, "done": False}
        TASKS[task["id"]] = task
        self.reply(201, task)

server = ThreadingHTTPServer(("127.0.0.1", 0), Api)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_address[1]}"

def call(method, path, payload=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(payload).encode() if payload else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

print(call("POST", "/tasks", {"title": "Replace gasket"}))
print(call("POST", "/tasks", {"title": ""}))
print(call("GET", "/tasks"))
server.shutdown()
```

Everything a framework does is a tidier version of this: route, parse, validate, run logic, serialise, set the status.

## The same thing in FastAPI

FastAPI is the most used modern Python API framework. Type hints drive validation and documentation.

```python
from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI()

class OrderIn(BaseModel):
    item_id: int
    qty: int = Field(gt=0, le=100)

class OrderOut(BaseModel):
    id: int
    status: str

def get_order_service() -> "OrderService":          # dependency injection
    return OrderService(repo=OrderRepo())

@app.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(body: OrderIn, svc: "OrderService" = Depends(get_order_service)):
    try:
        return svc.create(body.item_id, body.qty)
    except OutOfStock:
        raise HTTPException(status_code=409, detail="Item out of stock")
```

Run with `uvicorn main:app --reload`. Bad input returns 422 before your function runs, and interactive docs appear at `/docs`. Flask and Django are the other two major Python frameworks: Flask is minimal, Django includes an ORM, admin panel and authentication.

## Layers inside a service

1. **Middleware**: runs on every request. Logging, CORS, authentication, rate limiting, request IDs.
2. **Router / controller**: maps the request to a handler; thin.
3. **Schema validation**: turns raw JSON into typed objects or rejects it.
4. **Service layer**: business rules. "An order cannot exceed stock." No HTTP, no SQL here.
5. **Repository / data layer**: the only code that talks to the database.
6. **Response serialisation**: objects back to JSON, with the right status code.

Why bother: the service layer can be unit-tested without a web server or database, and you can swap the database or the framework without rewriting the rules.

## REST design rules

REST models the API as **resources** (nouns) acted on with HTTP **methods** (verbs).

| Action | Request | Success status |
| --- | --- | --- |
| List orders | `GET /orders?status=paid&limit=20` | 200 |
| Get one | `GET /orders/981` | 200, or 404 |
| Create | `POST /orders` | 201 with a `Location` header |
| Replace | `PUT /orders/981` | 200 |
| Partial update | `PATCH /orders/981` | 200 |
| Delete | `DELETE /orders/981` | 204 |
| Nested resource | `GET /users/7/orders` | 200 |
| Action that is not CRUD | `POST /orders/981/cancel` | 200 |

- **Plural nouns, no verbs in paths**: `/orders/981`, not `/getOrder?id=981`.
- **Honest status codes** and **one error shape everywhere**: `{"error": {"code": "out_of_stock", "message": "Only 2 left", "field": "qty"}}`.
- **Stateless**: every request carries its credentials; servers keep no per-client memory.
- **Filtering and sorting** with query parameters: `?status=paid&sort=-created_at`.
- **Versioning**: `/v1/orders` or a header. Never break existing clients: add fields, do not rename or remove them.
- **Documentation**: an OpenAPI (Swagger) description that stays in sync with the code.

### Pagination

| Style | Request | Good | Bad |
| --- | --- | --- | --- |
| Offset | `?limit=20&offset=40` | Simple; jump to any page | Slow on deep pages (the database still reads the skipped rows); items shift when data changes |
| Cursor (keyset) | `?limit=20&after=981` | Fast at any depth using an index; stable | No "jump to page 50" |

```sql
-- cursor pagination: the index on id makes this fast at any depth
SELECT * FROM orders WHERE id > 981 ORDER BY id LIMIT 20;
```

### Idempotency

A client's request times out. Did the payment go through? If it retries a plain `POST /payments`, the customer may pay twice. The fix: the client generates a unique `Idempotency-Key` header. The server stores the key with the result; a repeat with the same key returns the stored result without doing the work again.

```python run
import uuid

processed = {}          # in production: a database table or Redis with an expiry

def charge(idempotency_key, amount):
    if idempotency_key in processed:
        return processed[idempotency_key], "replayed"
    result = {"payment_id": str(uuid.uuid4())[:8], "amount": amount, "status": "captured"}
    processed[idempotency_key] = result
    return result, "executed"

key = str(uuid.uuid4())
print(charge(key, 499))
print(charge(key, 499))        # the retry: same payment, no second charge
```

GET, PUT and DELETE are naturally idempotent; POST needs the key. Payment providers such as Stripe and Razorpay work exactly this way.

## API styles compared

| Style | How it works | Best for | Watch out for |
| --- | --- | --- | --- |
| REST | Resources over HTTP with JSON | Public APIs, most CRUD services | Over-fetching; several round trips for one screen |
| GraphQL | One endpoint; the client sends a query naming the fields it wants | Rich frontends with varied data needs | N+1 queries on the server, caching, expensive queries |
| gRPC | Typed contracts in Protocol Buffers, binary over HTTP/2, streaming | Service-to-service calls inside a company | Browsers need a proxy; harder to debug by hand |
| WebSocket | One long-lived two-way connection | Chat, live collaboration, games | Stateful connections complicate scaling |
| Server-Sent Events | The server pushes a one-way stream over plain HTTP | Streaming LLM output, live feeds, notifications | One direction only |
| Webhook | The other system calls your URL when something happens | Payment confirmed, build finished | Verify signatures; handle retries and duplicates |

```
# GraphQL query: ask for exactly these fields in one round trip
query { order(id: 981) { status items { name qty } customer { name } } }
```

```
// gRPC contract in a .proto file; code is generated for both sides
service Orders { rpc GetOrder (OrderRequest) returns (Order); }
message OrderRequest { int64 id = 1; }
```

## Real-time communication

- **Polling**: the client asks every few seconds. Simple and wasteful.
- **Long polling**: the server holds the request open until it has news.
- **Server-Sent Events**: the standard for token-by-token output in chat interfaces.
- **WebSocket**: when both sides send at any time. Each connection lives on one server process, so delivering a message to a user connected elsewhere needs a shared bus such as Redis pub/sub. The chat design in [the system design cases](#sd-cases-2) works through this.

A minimal SSE stream is just lines of text sent slowly:

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"token": "The"}

data: {"token": " weld"}

data: [DONE]
```

## Other things a production API needs

- **Background work**: anything slower than a second or two (emails, reports, model calls) goes to a queue and a worker, and the API returns 202 Accepted with a job ID. See [caching and queues](#be-cache-queues).
- **Timeouts on every outbound call**: a missing timeout is how one slow dependency takes down a whole service.
- **Rate limiting**: protect yourself from abuse and accidents; return 429 with a `Retry-After` header.
- **Configuration from the environment**: never hard-code secrets or hostnames.
- **File uploads**: store files in object storage, keep only the path in the database; large uploads go directly from browser to storage using a presigned URL.
- **Health endpoint**: `/health` returns 200 when the service can do its job; load balancers call it.
- **Request IDs**: generate one per request, include it in every log line and pass it to downstream services.

## Check yourself

```quiz
[
  {"q": "Which request design follows REST conventions?", "options": ["`POST /deleteOrder?id=5`", "`DELETE /orders/5`", "`GET /orders/delete/5`"], "answer": 1, "why": "The resource is the noun in the path; the HTTP method is the verb."},
  {"q": "Why is cursor pagination faster than offset on page 5,000?", "options": ["It compresses the response", "It seeks straight to the position with an index instead of reading and discarding the skipped rows", "It caches every page"], "answer": 1, "why": "`WHERE id > last LIMIT 20` is an index range scan regardless of depth."},
  {"q": "A payment request timed out and the client retries. What prevents a double charge?", "options": ["Using PUT", "An idempotency key stored with the result", "A longer timeout"], "answer": 1, "why": "The server recognises the repeated key and returns the original outcome."},
  {"q": "Where should the rule 'an order cannot exceed stock' live?", "options": ["In the route handler", "In the service layer", "In the frontend only"], "answer": 1, "why": "Business rules belong in a layer that has no HTTP or SQL, so it is testable and reusable."},
  {"q": "You are streaming an LLM's answer to a browser. Simplest fitting transport?", "options": ["Polling every second", "Server-Sent Events", "gRPC"], "answer": 1, "why": "One-way server-to-client streaming over plain HTTP is exactly what SSE provides."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: task-api-crud
title: Task API with correct status codes
kind: code
level: medium
@@statement
Model the no-framework tasks API as a class `TaskAPI` with a method `request(method, path, body=None)` that returns `(status, data)`. No server is started; `data` is a dict, a list, or `None`.

**Routes**
- `POST /tasks` with `body = {"title": "..."}` -> `201` and the new task `{"id": 1, "title": "...", "done": False}`. Ids start at 1, go up by 1 and are never reused. The title is stripped of spaces.
- `GET /tasks` -> `200` and a list of all tasks sorted by id.
- `GET /tasks/{id}` -> `200` and the task.
- `PATCH /tasks/{id}` with a body that may contain `"title"` (non-blank string) and/or `"done"` (bool) -> `200` and the updated task. Other keys are ignored. An invalid body changes nothing.
- `DELETE /tasks/{id}` -> `204` and `None`.

**Errors** (data is `{"error": "<message>"}`)
- `404` for an unknown id (also non-numeric ids) or an unknown path. Check 404 before validating the body.
- `405` for a known path with a method that is not allowed.
- `422` for a missing/blank/non-string title on POST, an invalid `title`/`done` on PATCH, or a body that is not a dict.

**Example**

```
api = TaskAPI()
api.request("POST", "/tasks", {"title": "buy milk"})  ->  (201, {"id": 1, "title": "buy milk", "done": False})
api.request("PATCH", "/tasks/1", {"done": True})      ->  (200, {"id": 1, "title": "buy milk", "done": True})
api.request("DELETE", "/tasks/1")                     ->  (204, None)
api.request("GET", "/tasks/1")                        ->  (404, {"error": "task not found"})
```
@@starter
class TaskAPI:
    def __init__(self):
        self._tasks = {}
        self._next_id = 1

    def request(self, method, path, body=None):
        # TODO: split the path, route on (method, shape), return (status, data)
        pass

_api = TaskAPI()
print(_api.request("POST", "/tasks", {"title": "buy milk"}))
@@tests
_api = TaskAPI()
assert _api.request("POST", "/tasks", {"title": "  buy milk "}) == (201, {"id": 1, "title": "buy milk", "done": False}), "create"
assert _api.request("POST", "/tasks", {"title": "walk"})[1]["id"] == 2, "ids increase"
assert _api.request("GET", "/tasks/1") == (200, {"id": 1, "title": "buy milk", "done": False}), "get one"
assert [t["id"] for t in _api.request("GET", "/tasks")[1]] == [1, 2], "list"
assert _api.request("PATCH", "/tasks/1", {"done": True}) == (200, {"id": 1, "title": "buy milk", "done": True}), "patch done"
assert _api.request("PATCH", "/tasks/1", {"title": "buy oat milk", "extra": 1})[1]["title"] == "buy oat milk", "patch title, ignore extras"
assert _api.request("PATCH", "/tasks/1", {"done": "yes"})[0] == 422, "done must be bool"
assert _api.request("PATCH", "/tasks/1", {"title": "  "})[0] == 422, "blank title"
assert _api.request("GET", "/tasks/1")[1]["done"] is True, "failed patch changed nothing"
assert _api.request("PATCH", "/tasks/99", {"done": "yes"})[0] == 404, "404 before validation"
assert _api.request("POST", "/tasks", {"title": ""})[0] == 422, "blank title on create"
assert _api.request("POST", "/tasks", None)[0] == 422, "missing body"
assert _api.request("DELETE", "/tasks/1") == (204, None), "delete"
_s, _d = _api.request("GET", "/tasks/1")
assert _s == 404 and "error" in _d, "deleted task is gone"
assert _api.request("DELETE", "/tasks/1")[0] == 404, "delete twice"
assert _api.request("GET", "/tasks/abc")[0] == 404, "non-numeric id"
assert _api.request("PUT", "/tasks/2", {})[0] == 405, "method not allowed on item"
assert _api.request("DELETE", "/tasks")[0] == 405, "method not allowed on collection"
assert _api.request("GET", "/other")[0] == 404, "unknown path"
assert _api.request("POST", "/tasks", {"title": "x"})[1]["id"] == 3, "ids are never reused"
@@hint
Split with `path.strip("/").split("/")`. Handle `["tasks"]` and `["tasks", id]` separately, validate the whole PATCH body before changing anything, and return copies (`dict(task)`).
@@solution
class TaskAPI:
    def __init__(self):
        self._tasks = {}
        self._next_id = 1

    @staticmethod
    def _err(status, msg):
        return status, {"error": msg}

    def request(self, method, path, body=None):
        parts = path.strip("/").split("/")
        if parts == ["tasks"]:
            if method == "POST":
                title = body.get("title") if isinstance(body, dict) else None
                if not isinstance(title, str) or not title.strip():
                    return self._err(422, "title is required")
                task = {"id": self._next_id, "title": title.strip(), "done": False}
                self._tasks[task["id"]] = task
                self._next_id += 1
                return 201, dict(task)
            if method == "GET":
                return 200, [dict(self._tasks[i]) for i in sorted(self._tasks)]
            return self._err(405, "method not allowed")
        if len(parts) == 2 and parts[0] == "tasks":
            if not parts[1].isdigit() or int(parts[1]) not in self._tasks:
                return self._err(404, "task not found")
            task_id = int(parts[1])
            task = self._tasks[task_id]
            if method == "GET":
                return 200, dict(task)
            if method == "DELETE":
                del self._tasks[task_id]
                return 204, None
            if method == "PATCH":
                if not isinstance(body, dict):
                    return self._err(422, "body must be an object")
                if "title" in body and (not isinstance(body["title"], str) or not body["title"].strip()):
                    return self._err(422, "invalid title")
                if "done" in body and not isinstance(body["done"], bool):
                    return self._err(422, "done must be a boolean")
                if "title" in body:
                    task["title"] = body["title"].strip()
                if "done" in body:
                    task["done"] = body["done"]
                return 200, dict(task)
            return self._err(405, "method not allowed")
        return self._err(404, "not found")
````

````task
id: cursor-pagination
title: Cursor pagination and a consistent error format
kind: code
level: medium
@@statement
Write two functions.

1. `paginate(items, cursor=None, limit=10)`: cursor pagination over `items`, a list of dicts that each have an integer `"id"`, sorted by `id` ascending.
   - The page contains the items with `id > cursor` (all items when `cursor` is `None`), at most `limit` of them.
   - Return `{"items": page, "next_cursor": c}`. `c` is the `id` of the last item on the page **if more items remain after it**, otherwise `None`.
   - `limit` must be an int from `1` to `100`, else raise `ValueError`. Do not change `items`.
2. `make_error(status, code, message)`: return `(status, {"error": {"code": code, "message": message}})`, the one error shape every endpoint uses.

**Example**

```
items = [{"id": 1}, {"id": 2}, {"id": 3}]
paginate(items, None, 2)  ->  {"items": [{"id": 1}, {"id": 2}], "next_cursor": 2}
paginate(items, 2, 2)     ->  {"items": [{"id": 3}], "next_cursor": None}
make_error(404, "not_found", "task 9 does not exist")
  ->  (404, {"error": {"code": "not_found", "message": "task 9 does not exist"}})
```
@@starter
def paginate(items, cursor=None, limit=10):
    # TODO: validate limit, filter by cursor, slice, compute next_cursor
    pass

def make_error(status, code, message):
    # TODO
    pass

print(paginate([{"id": 1}, {"id": 2}, {"id": 3}], None, 2))
@@tests
_items = [{"id": i} for i in range(1, 26)]
_p1 = paginate(_items, None, 10)
assert [i["id"] for i in _p1["items"]] == list(range(1, 11)) and _p1["next_cursor"] == 10, "first page"
_p2 = paginate(_items, _p1["next_cursor"], 10)
assert [i["id"] for i in _p2["items"]] == list(range(11, 21)) and _p2["next_cursor"] == 20, "second page"
_p3 = paginate(_items, _p2["next_cursor"], 10)
assert [i["id"] for i in _p3["items"]] == list(range(21, 26)) and _p3["next_cursor"] is None, "last page"
assert paginate(_items[:5], None, 5)["next_cursor"] is None, "exactly limit items left means no next page"
assert paginate(_items, 25, 10) == {"items": [], "next_cursor": None}, "cursor past the end"
assert paginate([], None, 3) == {"items": [], "next_cursor": None}, "empty list"
assert len(_items) == 25, "input not changed"

def _raises(f, *a):
    try:
        f(*a)
    except ValueError:
        return True
    return False

assert _raises(paginate, _items, None, 0), "limit 0"
assert _raises(paginate, _items, None, 101), "limit 101"
assert paginate(_items, None, 100)["next_cursor"] is None, "limit 100 is allowed"
assert make_error(404, "not_found", "gone") == (404, {"error": {"code": "not_found", "message": "gone"}}), "error shape"
@@hint
Compute `rest = [i for i in items if cursor is None or i["id"] > cursor]`, then `page = rest[:limit]`. There is a next page only when `len(rest) > limit`.
@@solution
def paginate(items, cursor=None, limit=10):
    if not isinstance(limit, int) or limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    rest = [i for i in items if cursor is None or i["id"] > cursor]
    page = rest[:limit]
    next_cursor = page[-1]["id"] if len(rest) > limit else None
    return {"items": page, "next_cursor": next_cursor}

def make_error(status, code, message):
    return status, {"error": {"code": code, "message": message}}
````

````task
id: idempotency-key
title: Idempotent create endpoint
kind: code
level: hard
@@statement
Network retries can send the same POST twice. Write a class `IdempotentCreator` that makes creation safe to repeat, like an `Idempotency-Key` header.

**API**
- `IdempotentCreator()`: has a public list attribute `tasks` holding every created task.
- `create(key, title)` returns `(status, task)`:
  - A new key (or `key=None`) creates a task `{"id": n, "title": title}` (`n` = 1, 2, 3, ...), appends it to `tasks` and returns `201`. With `key=None` every call creates a new task.
  - A key already used with the **same** title creates nothing and returns `200` with the original task.
  - A key already used with a **different** title returns `409` and `{"error": "idempotency key reused with different request"}`, creating nothing.

**Example**

```
c = IdempotentCreator()
c.create("k1", "buy milk")  ->  (201, {"id": 1, "title": "buy milk"})
c.create("k1", "buy milk")  ->  (200, {"id": 1, "title": "buy milk"})
len(c.tasks)                ->  1
c.create("k1", "other")     ->  (409, {"error": "idempotency key reused with different request"})
```
@@starter
class IdempotentCreator:
    def __init__(self):
        self.tasks = []
        # TODO: remember each key and what it created

    def create(self, key, title):
        # TODO
        pass

_c = IdempotentCreator()
print(_c.create("k1", "buy milk"), _c.create("k1", "buy milk"))
@@tests
_c = IdempotentCreator()
assert _c.create("k1", "buy milk") == (201, {"id": 1, "title": "buy milk"}), "first call creates"
assert _c.create("k1", "buy milk") == (200, {"id": 1, "title": "buy milk"}), "repeat returns the same task"
assert len(_c.tasks) == 1, "no duplicate was created"
assert _c.create("k1", "other")[0] == 409, "same key, different body"
assert len(_c.tasks) == 1, "conflict creates nothing"
assert _c.create("k2", "buy milk") == (201, {"id": 2, "title": "buy milk"}), "new key creates a new task"
assert _c.create(None, "x")[0] == 201 and _c.create(None, "x")[0] == 201, "no key means no protection"
assert [t["id"] for t in _c.tasks] == [1, 2, 3, 4], "ids stay sequential"
for _ in range(5):
    _c.create("k3", "retry me")
assert len([t for t in _c.tasks if t["title"] == "retry me"]) == 1, "five retries, one task"
@@hint
Store `self._seen[key] = (title, task)` the first time. On a repeat compare the saved title with the new one.
@@solution
class IdempotentCreator:
    def __init__(self):
        self.tasks = []
        self._seen = {}

    def create(self, key, title):
        if key is not None and key in self._seen:
            saved_title, task = self._seen[key]
            if saved_title == title:
                return 200, task
            return 409, {"error": "idempotency key reused with different request"}
        task = {"id": len(self.tasks) + 1, "title": title}
        self.tasks.append(task)
        if key is not None:
            self._seen[key] = (title, task)
        return 201, task
````

````task
id: fastapi-rebuild
title: Compare a hand-written API with FastAPI
kind: text
level: medium
@@statement
You have a hand-written task API built on `http.server` that parses the path with `split("/")`, reads the body with `json.loads`, and writes status codes by hand. Without needing to install anything, write down what the same two endpoints look like in FastAPI and compare them.

Deliver **12-20 lines**:

1. FastAPI code (about 10 lines) for `POST /tasks` (body `{"title": str}`, returns `201` and the task) and `GET /tasks/{task_id}` (returns the task or `404`). Use a Pydantic model for the body.
2. A list of **three things** the framework now does for you that you wrote by hand before (for example routing, validation, docs).
3. What would happen with the body `{"title": 5}` in each version (the hand-written one and FastAPI).
4. One real cost or risk of adopting the framework (dependency, hidden behaviour, learning curve).
@@hint
In FastAPI the type hints do the work: `task_id: int` validates the path, and a model parameter validates the body.
@@solution
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel

    app = FastAPI()
    tasks = {}

    class NewTask(BaseModel):
        title: str

    @app.post("/tasks", status_code=201)
    def create(task: NewTask):
        tid = len(tasks) + 1
        tasks[tid] = {"id": tid, "title": task.title, "done": False}
        return tasks[tid]

    @app.get("/tasks/{task_id}")
    def read(task_id: int):
        if task_id not in tasks:
            raise HTTPException(status_code=404, detail="task not found")
        return tasks[task_id]

Framework gives: (1) routing and path parameter parsing/conversion (no split("/")); (2) request validation through the Pydantic model; (3) automatic OpenAPI docs at /docs plus JSON serialization and status codes.

With {"title": 5}: the hand-written version stores the integer unless I wrote an isinstance check, so bad data can slip in; FastAPI rejects it with an automatic 422 response that lists the field and the problem (Pydantic v2 does not coerce int to str by default).

Cost: a dependency tree to install and keep updated, and some behaviour is implicit (dependency injection, validation errors), so debugging needs knowledge of the framework.
@@criteria
- FastAPI code defines a Pydantic model for the body, a POST route with status 201 and a GET route with a typed path parameter.
- The GET route returns 404 (for example via HTTPException) for an unknown id.
- Names three genuine framework benefits such as routing, validation, serialization or automatic docs.
- Correctly states that FastAPI answers {"title": 5} with a 422 validation error while the hand-written version only rejects it if the author wrote a check.
- Mentions at least one real cost of the framework (dependencies, hidden behaviour, learning curve).
````

````task
id: service-layer
title: Service layer tested with a fake repository
kind: code
level: medium
@@statement
Split the API into handler, service and repository layers. Write the **service** class `TaskService(repo)` so it can be unit-tested without a server and without a real database.

**Repository contract** (the service may only use these methods)
- `repo.add(task)`: takes a dict without `id`, stores it, returns the stored dict with an `id` added.
- `repo.get(task_id)`: returns the task dict or `None`.
- `repo.save(task)`: replaces the stored task with the same `id`.
- `repo.all()`: returns a list of all task dicts.

**Service methods**
- `create(title)`: strip the title; raise `ValueError` if it is not a string, is blank, or is longer than 100 characters. Otherwise call `repo.add({"title": title, "done": False})` and return the result.
- `complete(task_id)`: raise `LookupError` if the task does not exist; otherwise save it with `done = True` and return the updated task. Completing twice is fine.
- `list_open()`: return the tasks whose `done` is `False`, sorted by `id` (empty list if none).

**Example**

```
svc = TaskService(repo)
svc.create("  buy milk ")  ->  {"id": 1, "title": "buy milk", "done": False}
svc.complete(1)            ->  {"id": 1, "title": "buy milk", "done": True}
svc.list_open()            ->  []
```
@@starter
class TaskService:
    def __init__(self, repo):
        self.repo = repo

    def create(self, title):
        # TODO: validate, then repo.add(...)
        pass

    def complete(self, task_id):
        # TODO
        pass

    def list_open(self):
        # TODO
        pass
@@tests
class _FakeRepo:
    def __init__(self):
        self.rows = {}
        self.saves = 0

    def add(self, task):
        row = dict(task)
        row["id"] = len(self.rows) + 1
        self.rows[row["id"]] = row
        return dict(row)

    def get(self, task_id):
        row = self.rows.get(task_id)
        return dict(row) if row else None

    def save(self, task):
        self.saves += 1
        self.rows[task["id"]] = dict(task)

    def all(self):
        return [dict(r) for r in self.rows.values()]

_repo = _FakeRepo()
_svc = TaskService(_repo)
assert _svc.create("  buy milk ") == {"id": 1, "title": "buy milk", "done": False}, "create strips the title"
assert _svc.create("walk")["id"] == 2, "second task"

def _raises(exc, f, *a):
    try:
        f(*a)
    except exc:
        return True
    return False

assert _raises(ValueError, _svc.create, "   "), "blank title"
assert _raises(ValueError, _svc.create, None), "non-string title"
assert _raises(ValueError, _svc.create, "x" * 101), "title too long"
assert _svc.create("x" * 100)["id"] == 3, "100 characters is fine"
assert len(_repo.rows) == 3, "invalid titles stored nothing"
assert _svc.complete(1) == {"id": 1, "title": "buy milk", "done": True}, "complete returns the updated task"
assert _repo.rows[1]["done"] is True and _repo.saves == 1, "service saved through the repo"
assert _svc.complete(1)["done"] is True, "completing twice is fine"
assert _raises(LookupError, _svc.complete, 99), "unknown id"
assert [t["id"] for t in _svc.list_open()] == [2, 3], "only open tasks, sorted by id"
assert TaskService(_FakeRepo()).list_open() == [], "empty repo"
@@hint
The service holds the rules; the repo only stores. In `complete`, copy the dict before changing it (`dict(task)`), set `done`, then call `self.repo.save(...)`.
@@solution
class TaskService:
    def __init__(self, repo):
        self.repo = repo

    def create(self, title):
        if not isinstance(title, str) or not title.strip():
            raise ValueError("title is required")
        title = title.strip()
        if len(title) > 100:
            raise ValueError("title too long")
        return self.repo.add({"title": title, "done": False})

    def complete(self, task_id):
        task = self.repo.get(task_id)
        if task is None:
            raise LookupError("task not found")
        task = dict(task)
        task["done"] = True
        self.repo.save(task)
        return task

    def list_open(self):
        return sorted((t for t in self.repo.all() if not t["done"]), key=lambda t: t["id"])
````
