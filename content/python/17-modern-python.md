---
id: py-modern-python
title: Type hints, testing and concurrency
minutes: 35
---

Three practices that turn working code into professional code: saying what types you expect, proving the code works with tests, and doing several slow things at once.

## Type hints

Type hints document what a function takes and returns. Python does not check them when the program runs. Editors and tools such as `mypy` read them and warn you before you run anything.

```python run
from __future__ import annotations      # lets older Python versions accept list[float]
from typing import Optional

def average(values: list[float]) -> float:
    return sum(values) / len(values)

def find_user(users: dict[int, str], user_id: int) -> Optional[str]:
    """Return the name, or None when the id is unknown."""
    return users.get(user_id)

print(average([1.5, 2.5]))
print(find_user({1: "Ana"}, 2))
print(average.__annotations__)

print(find_user({1: "Ana"}, "1"))   # a str where an int is expected: Python runs it anyway
```

| Hint | Meaning |
| --- | --- |
| `int`, `str`, `float`, `bool` | A single value of that type |
| `list[int]`, `set[str]` | A collection of one item type |
| `dict[str, float]` | Keys of one type, values of another |
| `tuple[int, str]` | A fixed-size record |
| `Optional[str]` | A `str` or `None` |
| `Callable[[int], str]` | A function taking an `int` and returning a `str` |

## Testing with assert

A test calls your code with known input and checks the result. The exercises in this portal are checked exactly this way.

```python run
def slugify(title: str) -> str:
    """Turn a title into a URL-friendly slug."""
    return "-".join(title.lower().split())

def test_slugify():
    assert slugify("Hello World") == "hello-world"
    assert slugify("  Many   Spaces ") == "many-spaces"
    assert slugify("") == ""

test_slugify()
print("all tests passed")
```

Good tests cover the normal case, the edges (empty input, one item, the largest allowed value) and the failures you expect. In a real project you would put functions named `test_...` in files named `test_....py` and run them all with `pytest`.

## unittest from the standard library

```python run
import unittest

def split_bill(total: float, people: int) -> float:
    if people <= 0:
        raise ValueError("people must be positive")
    return round(total / people, 2)

class SplitBillTests(unittest.TestCase):
    def test_even_split(self):
        self.assertEqual(split_bill(100, 4), 25.0)

    def test_rounding(self):
        self.assertEqual(split_bill(100, 3), 33.33)

    def test_rejects_zero_people(self):
        with self.assertRaises(ValueError):
            split_bill(100, 0)

suite = unittest.defaultTestLoader.loadTestsFromTestCase(SplitBillTests)
result = unittest.TextTestRunner(verbosity=0).run(suite)
print("passed:", result.wasSuccessful(), "tests run:", result.testsRun)
```

## Concurrency: waiting for several things at once

Much of a program's time is spent waiting: for a web server, a database, a disk. Threads let those waits overlap.

```python run
import time
from concurrent.futures import ThreadPoolExecutor

def fetch(name):
    time.sleep(0.3)                    # stands in for a slow network call
    return f"{name}: done"

names = ["users", "orders", "stock", "prices"]

start = time.perf_counter()
one_by_one = [fetch(n) for n in names]
print(f"sequential: {time.perf_counter() - start:.2f}s")

start = time.perf_counter()
with ThreadPoolExecutor(max_workers=4) as pool:
    together = list(pool.map(fetch, names))      # results come back in input order
print(f"threads:    {time.perf_counter() - start:.2f}s")
print(together)
```

> Threads speed up waiting, not calculating. In standard Python only one thread runs Python code at a time, so number crunching gets no faster with threads. For that, use `ProcessPoolExecutor`, which runs separate processes.

## asyncio

`asyncio` handles many waits in a single thread. An `async def` function can pause at every `await` and let other tasks run meanwhile.

```python run
import asyncio

async def fetch(name, delay):
    await asyncio.sleep(delay)             # pauses this task only
    return f"{name} after {delay}s"

async def main():
    results = await asyncio.gather(fetch("a", 0.3), fetch("b", 0.1), fetch("c", 0.2))
    for line in results:
        print(line)

asyncio.run(main())
```

Use threads when you call ordinary blocking libraries. Use `asyncio` when the libraries you call are written for it and you need thousands of connections at once.

## Check yourself

```quiz
[
  {"q": "What happens when a function annotated `-> int` returns a string?", "options": ["Python raises `TypeError`", "Nothing at run time; a type checker would report it", "The value is converted to `int`"], "answer": 1, "why": "Hints are not enforced when the program runs."},
  {"q": "Which workload do threads speed up in standard Python?", "options": ["Ten slow network requests", "Summing a billion numbers", "Both equally"], "answer": 0, "why": "Threads overlap waiting time. CPU-bound work is limited to one thread at a time."},
  {"q": "What does `await` do inside an `async def` function?", "options": ["Blocks the whole program", "Pauses this task and lets others run until the result is ready", "Starts a new thread"], "answer": 1, "why": "It hands control back to the event loop."}
]
```

## Exercises

````task
id: validate-record
title: Validate a record against a schema
kind: code
level: medium
@@statement
Write `validate(record, schema)` that checks whether a dictionary has the right fields with the right types.

**Input**
- `record`: a dict of field names to values.
- `schema`: a dict of field names to types, for example `{"name": str, "age": int}`.

**Output**: a **sorted** list of problem messages, empty when the record is valid.
- For a field in the schema that is missing from the record: `"missing: <field>"`.
- For a field whose value is not an instance of the expected type: `"wrong type: <field>"`.
- For a field in the record that is not in the schema: `"unexpected: <field>"`.
- `True` and `False` must **not** be accepted where an `int` is expected.

**Example**

```
schema = {"name": str, "age": int}
validate({"name": "Ana", "age": 30}, schema)             -> []
validate({"name": "Ana", "age": "30", "x": 1}, schema)   -> ["unexpected: x", "wrong type: age"]
validate({}, schema)                                     -> ["missing: age", "missing: name"]
```
@@starter
def validate(record: dict, schema: dict) -> list:
    pass

print(validate({"name": "Ana", "age": "30", "x": 1}, {"name": str, "age": int}))
@@tests
_schema = {"name": str, "age": int}
assert validate({"name": "Ana", "age": 30}, _schema) == [], "a valid record"
assert validate({"name": "Ana", "age": "30", "x": 1}, _schema) == ["unexpected: x", "wrong type: age"], "wrong type and an extra field"
assert validate({}, _schema) == ["missing: age", "missing: name"], "everything missing, sorted"
assert validate({"name": "Ana", "age": True}, _schema) == ["wrong type: age"], "a bool is not accepted as an int"
assert validate({}, {}) == [], "empty schema and record"
assert validate({"price": 9.5}, {"price": float}) == [], "float field"
assert validate({"tags": ["a"]}, {"tags": list}) == [], "list field"
assert validate({"ok": True}, {"ok": bool}) == [], "a bool is fine where a bool is expected"
@@hint
`isinstance(True, int)` is `True` in Python, so add a special case: when the expected type is `int` and `type(value) is bool`, report a wrong type. Collect all messages in a list and return `sorted(problems)`.
@@solution
def validate(record: dict, schema: dict) -> list:
    problems = []
    for name, expected in schema.items():
        if name not in record:
            problems.append(f"missing: {name}")
            continue
        value = record[name]
        if not isinstance(value, expected) or (expected is int and type(value) is bool):
            problems.append(f"wrong type: {name}")
    for name in record:
        if name not in schema:
            problems.append(f"unexpected: {name}")
    return sorted(problems)
````

````task
id: parallel-map
title: Run tasks in parallel, keep the order
kind: code
level: medium
@@statement
Write `parallel_map(func, items, workers=4)` that calls `func` on every item using a thread pool and returns the results **in the order of the input**.

If a call raises an exception, the result for that item is the string `"error: <message>"`, where `<message>` is `str(exception)`. The other items are still processed.

**Input**
- `func`: a function of one argument.
- `items`: a list. It may be empty.
- `workers`: the number of threads, 1 or more.

**Output**: a list with one entry per item.

**Example**

```
def half(n):
    if n % 2:
        raise ValueError(f"{n} is odd")
    return n // 2

parallel_map(half, [8, 4, 3, 10])
-> [4, 2, "error: 3 is odd", 5]
```
@@starter
from concurrent.futures import ThreadPoolExecutor

def parallel_map(func, items, workers=4):
    pass

def half(n):
    if n % 2:
        raise ValueError(f"{n} is odd")
    return n // 2

print(parallel_map(half, [8, 4, 3, 10]))
@@tests
import threading as _threading
def _half(n):
    if n % 2:
        raise ValueError(f"{n} is odd")
    return n // 2
assert parallel_map(lambda n: n * n, [1, 2, 3, 4]) == [1, 4, 9, 16], "results keep the input order"
assert parallel_map(lambda n: n, []) == [], "no items"
assert parallel_map(_half, [8, 4, 3, 10]) == [4, 2, "error: 3 is odd", 5], "an error becomes a message"
assert parallel_map(str.upper, ["a", "b"], workers=1) == ["A", "B"], "a single worker"
_names = set()
def _record(n):
    _names.add(_threading.current_thread().name)
    return n
assert parallel_map(_record, list(range(20)), workers=3) == list(range(20)), "many items"
assert _threading.main_thread().name not in _names, "the work runs in pool threads, not the main thread"
@@hint
Write an inner function `safe(item)` that wraps `func(item)` in `try / except Exception as error` and returns `f"error: {error}"` on failure. Then `list(pool.map(safe, items))` keeps the order for you.
@@solution
from concurrent.futures import ThreadPoolExecutor

def parallel_map(func, items, workers=4):
    def safe(item):
        try:
            return func(item)
        except Exception as error:
            return f"error: {error}"

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(safe, items))
````

````task
ref: python-advanced/concurrent-fetch
````
