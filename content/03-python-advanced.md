---
id: python-advanced
title: Python advanced: classes, iterators, decorators, typing, async, testing
minutes: 70
---

The features in this lesson are the ones frameworks are built from. FastAPI routes are decorators, database sessions are context managers, LLM streaming is generators, and every library exposes classes. Knowing how they work lets you read any Python codebase.

## Classes and objects

A class bundles data with the functions that work on it.

```python run
class Account:
    interest_rate = 0.04                 # class attribute: shared by all instances

    def __init__(self, owner, balance=0):
        self.owner = owner               # instance attributes
        self._balance = balance          # leading underscore: "internal, do not touch"

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self._balance += amount

    @property
    def balance(self):                   # read like an attribute, computed by a method
        return self._balance

    def __repr__(self):                  # what print() and the debugger show
        return f"Account({self.owner!r}, balance={self._balance})"

acct = Account("Meera", 1000)
acct.deposit(500)
print(acct, acct.balance)
```

- `self` is the instance the method was called on. `acct.deposit(500)` is `Account.deposit(acct, 500)`.
- `__init__` initialises a new object. Methods with double underscores are how Python operators reach your class.

### Special methods

```python run
class Vector:
    def __init__(self, x, y):
        self.x, self.y = x, y
    def __add__(self, other):  return Vector(self.x + other.x, self.y + other.y)   # v + w
    def __eq__(self, other):   return (self.x, self.y) == (other.x, other.y)       # v == w
    def __hash__(self):        return hash((self.x, self.y))                       # usable in sets, dict keys
    def __len__(self):         return 2                                            # len(v)
    def __iter__(self):        return iter((self.x, self.y))                       # for c in v, unpacking
    def __repr__(self):        return f"Vector({self.x}, {self.y})"

v = Vector(1, 2) + Vector(3, 4)
print(v, v == Vector(4, 6), list(v), {v, Vector(4, 6)})
```

If you define `__eq__`, define `__hash__` consistently, or the object cannot be a dict key.

### Inheritance, polymorphism and composition

```python run
from abc import ABC, abstractmethod

class Notifier(ABC):                     # an interface: subclasses must implement send
    @abstractmethod
    def send(self, to, message): ...

class EmailNotifier(Notifier):
    def send(self, to, message):
        return f"EMAIL to {to}: {message}"

class SmsNotifier(Notifier):
    def send(self, to, message):
        return f"SMS to {to}: {message[:20]}"

class AlertService:                      # composition: it HAS a notifier
    def __init__(self, notifier):
        self.notifier = notifier
    def alert(self, user, text):
        return self.notifier.send(user, text)

for n in (EmailNotifier(), SmsNotifier()):
    print(AlertService(n).alert("line-lead", "Station 4 stopped for 6 minutes"))
```

`AlertService` works with any notifier without knowing which one: that is polymorphism. Passing the notifier in is **dependency injection**; tests pass a fake. Prefer composition ("has a") to inheritance ("is a") unless the subclass truly is a kind of the parent.

### Dataclasses

For classes that mostly hold data, `dataclass` writes `__init__`, `__repr__` and `__eq__` for you.

```python run
from dataclasses import dataclass, field

@dataclass(frozen=True)                  # frozen: immutable and hashable
class Part:
    number: str
    weight_kg: float
    tags: tuple = ()

@dataclass
class Order:
    id: int
    parts: list = field(default_factory=list)   # the safe way to default to a new list
    def total_weight(self):
        return sum(p.weight_kg for p in self.parts)

o = Order(1, [Part("A12", 2.5), Part("B07", 0.4)])
print(o, o.total_weight())
```

## Iterators and generators

A `for` loop calls `iter()` on the object, then `next()` repeatedly until `StopIteration`. A **generator** is the easy way to write an iterator: a function with `yield`. It pauses at each `yield` and resumes on the next request, so it produces values one at a time without holding them all in memory.

```python run
def read_in_batches(items, size):
    batch = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch                  # hand one batch out, pause here
            batch = []
    if batch:
        yield batch

for b in read_in_batches(range(7), 3):
    print(b)

def fibonacci():
    a, b = 0, 1
    while True:                          # infinite, but lazy: only computes what is asked
        yield a
        a, b = b, a + b

from itertools import islice
print(list(islice(fibonacci(), 10)))

total = sum(x * x for x in range(1_000_000))    # generator expression: no million-item list
print(total)
```

Where this appears: reading a 10 GB file line by line, paging through database rows, and streaming LLM tokens to a browser are all generators.

Useful `itertools`: `chain` (join iterables), `islice` (slice lazily), `groupby`, `product`, `permutations`, `combinations`, `accumulate`.

## Decorators

A decorator takes a function and returns a new function that wraps it. `@name` above a `def` applies it.

```python run
import time
from functools import wraps

def timed(fn):
    @wraps(fn)                           # keep the original name and docstring
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return fn(*args, **kwargs)
        finally:
            print(f"{fn.__name__} took {(time.perf_counter() - start) * 1000:.1f} ms")
    return wrapper

def retry(times):                        # a decorator that takes an argument
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except ConnectionError as exc:
                    print(f"attempt {attempt} failed: {exc}")
            raise RuntimeError(f"{fn.__name__} failed after {times} attempts")
        return wrapper
    return decorator

calls = {"n": 0}

@timed
@retry(times=3)
def flaky_fetch():
    calls["n"] += 1
    if calls["n"] < 3:
        raise ConnectionError("timeout")
    return "payload"

print(flaky_fetch())
```

Decorators you will meet constantly: `@property`, `@staticmethod`, `@classmethod`, `@dataclass`, `@functools.lru_cache` (memoise a function), `@app.get("/path")` in FastAPI, `@pytest.fixture`, `@tool` in agent frameworks.

```python run
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(80))                           # instant; without the cache this would take years
```

## Context managers

`with` guarantees cleanup, even when an exception is raised.

```python run
from contextlib import contextmanager

@contextmanager
def transaction(name):
    print(f"BEGIN {name}")
    try:
        yield                            # the body of the with-block runs here
        print("COMMIT")
    except Exception:
        print("ROLLBACK")
        raise

with transaction("transfer"):
    print("  move money")

try:
    with transaction("bad transfer"):
        raise ValueError("insufficient funds")
except ValueError:
    print("handled")
```

Files, database transactions, locks, temporary directories and HTTP clients all use this pattern. A class can be a context manager by defining `__enter__` and `__exit__`.

## Type hints

Hints say what types a function expects and returns. Python does not enforce them at run time; tools such as `mypy` and `pyright` and your editor check them, and libraries such as Pydantic and FastAPI use them to validate data.

```python
from typing import Optional, Protocol

def top_scores(scores: dict[str, float], n: int = 3) -> list[tuple[str, float]]:
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:n]

def find_user(user_id: int) -> Optional[dict]:      # may return None
    ...

class Sender(Protocol):                             # structural typing: anything with this method fits
    def send(self, to: str, message: str) -> str: ...
```

Hint every function signature in real projects. It is documentation that cannot go stale, and it catches bugs before the code runs.

## Concurrency: threads, processes, asyncio

Full background is in [the operating systems lesson](#cs-os-concurrency). The short rule:

| Work | Tool | Why |
| --- | --- | --- |
| Many network or disk waits | `asyncio` or threads | The program is mostly waiting, so it can interleave tasks |
| Heavy computation in pure Python | `multiprocessing` / `ProcessPoolExecutor` | One interpreter runs one thread of Python at a time, so use several processes |
| Heavy computation in NumPy or PyTorch | Just call it | Those libraries do their work outside the interpreter lock |

```python run
import asyncio, time

async def fetch(name, seconds):
    await asyncio.sleep(seconds)         # stands in for a network call; yields to other tasks
    return f"{name} done"

async def main():
    start = time.perf_counter()
    results = await asyncio.gather(fetch("orders", 1.0), fetch("stock", 1.0), fetch("prices", 1.0))
    print(results, f"in {time.perf_counter() - start:.1f}s")   # about 1 second, not 3

asyncio.run(main())
```

```python run
from concurrent.futures import ThreadPoolExecutor
import time

def slow_io(n):
    time.sleep(0.5)
    return n * n

start = time.perf_counter()
with ThreadPoolExecutor(max_workers=8) as pool:
    print(list(pool.map(slow_io, range(8))), f"{time.perf_counter() - start:.1f}s")
```

One blocking call inside async code, such as `time.sleep` or a synchronous database driver, freezes every other task. Async code must use async libraries all the way down.

## Testing with pytest

A test calls your code and asserts on the result. `pytest` finds functions named `test_*` in files named `test_*.py`.

```python
# pricing.py
def price_with_tax(amount: float, rate: float = 0.18) -> float:
    if amount < 0:
        raise ValueError("amount cannot be negative")
    return round(amount * (1 + rate), 2)

# test_pricing.py
import pytest
from pricing import price_with_tax

def test_adds_default_tax():
    assert price_with_tax(100) == 118.0

@pytest.mark.parametrize("amount, rate, expected", [(100, 0.05, 105.0), (0, 0.18, 0.0), (19.99, 0.18, 23.59)])
def test_rates(amount, rate, expected):
    assert price_with_tax(amount, rate) == expected

def test_rejects_negative():
    with pytest.raises(ValueError):
        price_with_tax(-1)
```

The standard library has `unittest` if `pytest` is not installed; the ideas are the same. Test the normal case, the edges (zero, empty, maximum), and the failure cases.

## Project habits

- **Layout**: `src/yourpackage/`, `tests/`, `pyproject.toml`, `README.md`.
- **Formatting and linting**: `ruff format` and `ruff check` on every save or commit.
- **Logging**: `logging.getLogger(__name__)` with levels (`debug`, `info`, `warning`, `error`) instead of `print`.
- **Configuration**: read settings and secrets from environment variables, never hard-code them.
- **Dependencies**: pin versions so the project builds the same next year.

## Check yourself

```quiz
[
  {"q": "What does a function containing `yield` return when called?", "options": ["The first yielded value", "A generator object that produces values on demand", "A list of all yielded values"], "answer": 1, "why": "Calling it runs nothing yet; iteration drives the body one `yield` at a time."},
  {"q": "What does `@timed` above `def f()` mean?", "options": ["`f = timed(f)`", "`timed` is called every time `f` is imported", "`f` runs in a new thread"], "answer": 0, "why": "Decoration replaces the name with whatever the decorator returns."},
  {"q": "Why does `with open(path) as f:` beat `f = open(path)`?", "options": ["It reads faster", "The file is closed even if an exception happens inside the block", "It locks the file"], "answer": 1, "why": "The context manager's exit step always runs."},
  {"q": "You must resize 10,000 images using pure-Python loops. Which helps most?", "options": ["Threads", "asyncio", "A process pool"], "answer": 2, "why": "CPU-bound pure Python needs separate processes to use several cores."},
  {"q": "An `AlertService` receives its notifier as a constructor argument. What is that called?", "options": ["Inheritance", "Dependency injection", "Monkey patching"], "answer": 1, "why": "The dependency is supplied from outside, so tests can pass a fake."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: cache-for
title: Time-limited cache decorator
kind: code
level: medium
@@statement
Write a decorator factory `cache_for(seconds, clock=time.monotonic)`. A function decorated with `@cache_for(10)` remembers its result for each distinct positional-argument tuple for `seconds` seconds. After that the function is called again and the new result is stored.

**Input**
- `seconds`: a number, how long a result stays valid.
- `clock`: a zero-argument function returning the current time as a number (injectable so tests do not need to sleep).
- The decorated function is called with positional arguments only (all hashable).

**Output**: the decorated function returns the cached value while it is still fresh (`now - stored_at < seconds`), otherwise it calls the original function, stores the result with the current time and returns it. Use `functools.wraps`. A result of `None` is cached like any other value.

**Example**

```
calls = []
@cache_for(10, clock=fake_clock)   # fake_clock() returns 0 at first
def square(x):
    calls.append(x); return x * x

square(3) -> 9     (calls == [3])
square(3) -> 9     (still fresh, calls == [3])
# the clock moves to 10
square(3) -> 9     (expired, calls == [3, 3])
```
@@starter
import time
import functools

def cache_for(seconds, clock=time.monotonic):
    # return a decorator
    pass
@@tests
_t = [0]
_calls = []

@cache_for(10, clock=lambda: _t[0])
def _square(x):
    """doc"""
    _calls.append(x)
    return x * x

assert _square(3) == 9, "first call computes"
assert _square(3) == 9 and _calls == [3], "second call is cached"
assert _square(4) == 16 and _calls == [3, 4], "different args are cached separately"
_t[0] = 9
_square(3)
assert _calls == [3, 4], "still fresh at 9 seconds"
_t[0] = 10
_square(3)
assert _calls == [3, 4, 3], "expired at 10 seconds"
assert _square.__name__ == "_square" and _square.__doc__ == "doc", "use functools.wraps"
_n = []

@cache_for(5, clock=lambda: 0)
def _none(x):
    _n.append(x)

_none(1)
_none(1)
assert _n == [1], "None results are cached too"
@@hint
Keep a dict `args -> (value, stored_at)`. Check `key in store` and the age before returning; do not use `store.get(key)` truthiness because a cached value can be falsy.
@@solution
import time
import functools

def cache_for(seconds, clock=time.monotonic):
    def decorator(func):
        store = {}

        @functools.wraps(func)
        def wrapper(*args):
            now = clock()
            if args in store:
                value, stored_at = store[args]
                if now - stored_at < seconds:
                    return value
            value = func(*args)
            store[args] = (value, now)
            return value

        return wrapper
    return decorator
````

````task
id: sliding-windows
title: Sliding window generator
kind: code
level: easy
@@statement
Write a **generator function** `sliding(iterable, n)` that yields overlapping windows of size `n`.

**Input**
- `iterable`: any iterable (list, string, another generator). It may be consumed only once, so do not call `len()` or index it.
- `n`: window size, an integer. If `n < 1`, raise `ValueError`.

**Output**: yields tuples of `n` consecutive items, moving one step at a time. If the iterable has fewer than `n` items, it yields nothing.

**Example**

```
list(sliding([1, 2, 3, 4], 2)) -> [(1, 2), (2, 3), (3, 4)]
list(sliding("abc", 3))        -> [("a", "b", "c")]
list(sliding([1, 2], 3))       -> []
```
@@starter
from collections import deque

def sliding(iterable, n):
    # use yield
    pass
@@tests
assert list(sliding([1, 2, 3, 4], 2)) == [(1, 2), (2, 3), (3, 4)], "basic windows"
assert list(sliding("abc", 3)) == [("a", "b", "c")], "window equals length"
assert list(sliding([1, 2], 3)) == [], "too short"
assert list(sliding([], 1)) == [], "empty input"
assert list(sliding(iter(range(5)), 1)) == [(0,), (1,), (2,), (3,), (4,)], "works on one-shot iterators"
import types as _types
assert isinstance(sliding([1], 1), _types.GeneratorType), "must be a generator"
try:
    list(sliding([1, 2], 0))
    assert False, "n=0 must raise ValueError"
except ValueError:
    pass
@@hint
Keep a `deque(maxlen=n)`. Append each item; once the deque holds `n` items, `yield tuple(window)`.
@@solution
from collections import deque

def sliding(iterable, n):
    if n < 1:
        raise ValueError("n must be at least 1")
    window = deque(maxlen=n)
    for item in iterable:
        window.append(item)
        if len(window) == n:
            yield tuple(window)
````

````task
id: library-loans
title: Library with dataclasses and a custom error
kind: code
level: medium
@@statement
Model a tiny library. Build these pieces:

- `class BookUnavailableError(Exception)`: raised when lending a book that is already out.
- `@dataclass class Book`: fields `isbn: str`, `title: str`.
- `@dataclass class Member`: fields `name: str`, `loans: list` (default empty list, use `field(default_factory=list)`), holding ISBNs.
- `class Library` with methods:
  - `add_book(book)`: register a book.
  - `add_member(member)`: register a member.
  - `lend(isbn, member_name)`: lend the book to the member. If the book is already out, raise `BookUnavailableError`. If the isbn or member is unknown, raise `KeyError`.
  - `give_back(isbn)`: return the book; it becomes available and is removed from the member's `loans`. Returning a book that is not out raises `ValueError`.
  - `available()`: sorted list of ISBNs of books that are not out.

**Example**

```
lib = Library()
lib.add_book(Book("1", "Dune")); lib.add_member(Member("ann"))
lib.lend("1", "ann")
lib.lend("1", "ann")   # raises BookUnavailableError
lib.available()        # []
```
@@starter
from dataclasses import dataclass, field

class BookUnavailableError(Exception):
    pass

@dataclass
class Book:
    pass

@dataclass
class Member:
    pass

class Library:
    pass
@@tests
_lib = Library()
_lib.add_book(Book("1", "Dune"))
_lib.add_book(Book("2", "Emma"))
_lib.add_member(Member("ann"))
_lib.add_member(Member("bob"))
assert _lib.available() == ["1", "2"], "all books available at start"
_lib.lend("1", "ann")
assert _lib.available() == ["2"], "lent book is not available"
assert Member("x").loans == [] and Member("a").loans is not Member("b").loans, "loans must be a fresh list per member"
try:
    _lib.lend("1", "bob")
    assert False, "double lending must fail"
except BookUnavailableError:
    pass
try:
    _lib.lend("99", "bob")
    assert False, "unknown book"
except KeyError:
    pass
try:
    _lib.lend("2", "zed")
    assert False, "unknown member"
except KeyError:
    pass
assert issubclass(BookUnavailableError, Exception), "custom exception"
_lib.give_back("1")
assert _lib.available() == ["1", "2"], "returned book is available again"
_lib.lend("1", "bob")
assert _lib.available() == ["2"], "can lend after return"
try:
    _lib.give_back("2")
    assert False, "returning a book that is not out"
except ValueError:
    pass
@@hint
Store books and members in dicts keyed by isbn and name. Keep a dict `loans: isbn -> member name` to know who has what.
@@solution
from dataclasses import dataclass, field

class BookUnavailableError(Exception):
    pass

@dataclass
class Book:
    isbn: str
    title: str

@dataclass
class Member:
    name: str
    loans: list = field(default_factory=list)

class Library:
    def __init__(self):
        self.books = {}
        self.members = {}
        self.out = {}

    def add_book(self, book):
        self.books[book.isbn] = book

    def add_member(self, member):
        self.members[member.name] = member

    def lend(self, isbn, member_name):
        if isbn not in self.books:
            raise KeyError(isbn)
        if member_name not in self.members:
            raise KeyError(member_name)
        if isbn in self.out:
            raise BookUnavailableError(isbn)
        self.out[isbn] = member_name
        self.members[member_name].loans.append(isbn)

    def give_back(self, isbn):
        if isbn not in self.out:
            raise ValueError("book is not lent out")
        name = self.out.pop(isbn)
        self.members[name].loans.remove(isbn)

    def available(self):
        return sorted(i for i in self.books if i not in self.out)
````

````task
id: timer-context
title: Timer context manager
kind: code
level: easy
@@statement
Write a context manager `timer(label, log, clock=time.perf_counter)` that measures how long its `with` block takes and records it.

**Input**
- `label`: a string.
- `log`: a list the timer appends to.
- `clock`: a zero-argument function returning the current time (injectable so tests are deterministic).

**Output**: after the block finishes, append the tuple `(label, elapsed)` to `log`, where `elapsed = clock_at_end - clock_at_start`. This must happen **even if the block raises**, and the exception must still propagate. Use `contextlib.contextmanager` or a class with `__enter__`/`__exit__`.

**Example**

```
log = []
with timer("load", log):
    do_work()
log  -> [("load", 0.0123)]
```
@@starter
import time
from contextlib import contextmanager

def timer(label, log, clock=time.perf_counter):
    pass
@@tests
_ticks = iter([10.0, 12.5, 20.0, 21.0])
_log = []
with timer("a", _log, clock=lambda: next(_ticks)):
    pass
assert _log == [("a", 2.5)], "records label and elapsed"
with timer("b", _log, clock=lambda: next(_ticks)):
    pass
assert _log == [("a", 2.5), ("b", 1.0)], "appends, does not overwrite"
_ticks2 = iter([0, 4])
_log2 = []
try:
    with timer("boom", _log2, clock=lambda: next(_ticks2)):
        raise RuntimeError("x")
    assert False, "exception must propagate"
except RuntimeError:
    pass
assert _log2 == [("boom", 4)], "logs even when the block fails"
_log3 = []
with timer("real", _log3):
    pass
assert len(_log3) == 1 and _log3[0][1] >= 0, "works with the default clock"
@@hint
With `@contextmanager`, read the clock, `yield` inside `try:`, and append to the log in `finally:`.
@@solution
import time
from contextlib import contextmanager

@contextmanager
def timer(label, log, clock=time.perf_counter):
    start = clock()
    try:
        yield
    finally:
        log.append((label, clock() - start))
````

````task
id: concurrent-fetch
title: Fetch many in parallel: threads and asyncio
kind: code
level: medium
@@statement
Simulated network calls are plain functions, so no real network is needed. Write two functions that run many calls concurrently and return results **in the same order as the inputs**:

1. `fetch_all_threads(fetch, urls, workers=4)`: `fetch(url)` is a normal function. Use `concurrent.futures.ThreadPoolExecutor`.
2. `fetch_all_async(fetch, urls)`: `fetch(url)` is an `async def` coroutine function. Use `asyncio.gather` and run it with `asyncio.run`. It is a normal (non-async) function from the caller's point of view.

**Input**: a callable and a list of strings.

**Output**: a list of results, `results[i]` belongs to `urls[i]`. Empty `urls` gives `[]`. If `fetch` raises for one url, the exception propagates to the caller.

**Example**

```
fetch_all_threads(lambda u: len(u), ["a", "bbb", "cc"]) -> [1, 3, 2]
```
@@starter
import asyncio
from concurrent.futures import ThreadPoolExecutor

def fetch_all_threads(fetch, urls, workers=4):
    pass

def fetch_all_async(fetch, urls):
    pass
@@tests
import asyncio as _asyncio

def _slow_len(u):
    return len(u)

async def _async_len(u):
    await _asyncio.sleep(0)
    return len(u)

_urls = ["a", "bbb", "cc", "dddd", "e"]
assert fetch_all_threads(_slow_len, _urls) == [1, 3, 2, 4, 1], "threads keep input order"
assert fetch_all_threads(_slow_len, []) == [], "threads: empty input"
assert fetch_all_async(_async_len, _urls) == [1, 3, 2, 4, 1], "async keeps input order"
assert fetch_all_async(_async_len, []) == [], "async: empty input"

def _bad(u):
    if u == "x":
        raise ValueError("bad url")
    return u

try:
    fetch_all_threads(_bad, ["a", "x"])
    assert False, "threads: error must propagate"
except ValueError:
    pass

async def _abad(u):
    if u == "x":
        raise ValueError("bad url")
    return u

try:
    fetch_all_async(_abad, ["a", "x"])
    assert False, "async: error must propagate"
except ValueError:
    pass
@@hint
`executor.map(fetch, urls)` already yields results in input order. For asyncio: `async def main(): return await asyncio.gather(*(fetch(u) for u in urls))` and `asyncio.run(main())`.
@@solution
import asyncio
from concurrent.futures import ThreadPoolExecutor

def fetch_all_threads(fetch, urls, workers=4):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(fetch, urls))

def fetch_all_async(fetch, urls):
    async def main():
        return list(await asyncio.gather(*(fetch(u) for u in urls)))
    return asyncio.run(main())
````

````task
id: design-tests
title: Design a test suite for slugify
kind: text
level: medium
@@statement
You wrote `slugify(title)`, which turns a blog title into a URL slug: lowercase, words joined with `-`, punctuation removed, no leading or trailing `-`. For example `slugify("Hello, World!")` returns `"hello-world"`.

Write **ten test cases** for it, as a list of lines in the form `input -> expected output`. Then add 2 to 3 sentences saying how you would run them with `pytest` (for example with `@pytest.mark.parametrize`) and which one test should use `pytest.raises`, and for what input.

Your ten cases must include normal cases, edge cases (empty string, only punctuation, extra spaces, repeated separators, unicode or digits) and at least one failure case (such as `None` or a non-string input).
@@criteria
- Lists about ten distinct cases with a concrete input and an exact expected output for each.
- Covers a normal case and mixed case or punctuation removal.
- Covers edge cases: empty string, only punctuation or spaces, repeated spaces or dashes, leading and trailing separators.
- Includes at least one failure case and states which exception is expected (for example `TypeError` for `None`) using `pytest.raises`.
- Explains how to run the tests with pytest, ideally with parametrize, and that each case should test one behaviour.
@@solution
Cases: "Hello, World!" -> "hello-world"; "  spaced   out  " -> "spaced-out"; "Already-slug" -> "already-slug"; "" -> ""; "!!!" -> ""; "a--b" -> "a-b"; "Python 3.12" -> "python-312"; "---x---" -> "x"; "UPPER" -> "upper"; "tab\tsep" -> "tab-sep".

I would put the normal and edge cases into one test function decorated with `@pytest.mark.parametrize("title, expected", [...])`, so each case is reported separately. The failure case, `slugify(None)`, goes in its own test that uses `with pytest.raises(TypeError):`. Run everything with `pytest -q`.
````
