---
id: py-decorators-context
title: Decorators and context managers
minutes: 35
---

Both features wrap extra behaviour around code you already have. A decorator wraps a function: run something before and after every call. A context manager wraps a block: set something up, and guarantee it is cleaned up.

## A decorator is a function that returns a function

```python run
def announce(func):
    def wrapper(*args, **kwargs):
        print(f"-> calling {func.__name__}{args}")
        result = func(*args, **kwargs)
        print(f"<- {func.__name__} returned {result!r}")
        return result
    return wrapper

@announce                       # the same as: add = announce(add)
def add(a, b):
    return a + b

add(2, 3)
```

`wrapper` accepts `*args, **kwargs` so that it can wrap a function with any signature, and it must return the result of the original call. Forgetting that `return` is the most common decorator bug: the wrapped function suddenly returns `None`.

## Keeping the function's identity

```python run
import functools

def announce(func):
    @functools.wraps(func)              # copy the name and docstring onto the wrapper
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@announce
def area(width, height):
    """Return the area of a rectangle."""
    return width * height

print(area.__name__, "-", area.__doc__)
```

Without `functools.wraps` the name would be `wrapper` and the docstring would be lost, which confuses debuggers, logs and documentation tools. Use it in every decorator.

## Decorators with arguments

A decorator that takes settings needs one more level: a function that receives the settings and returns the actual decorator.

```python run
import functools

def retry(times):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except ValueError as error:
                    print(f"  attempt {attempt} failed: {error}")
            raise RuntimeError(f"{func.__name__} failed {times} times")
        return wrapper
    return decorator

attempts = {"count": 0}

@retry(times=3)
def flaky():
    attempts["count"] += 1
    if attempts["count"] < 3:
        raise ValueError("not ready")
    return "ok"

print(flaky())
```

Decorators you will meet in the standard library: `@functools.lru_cache` (remember results), `@property`, `@classmethod`, `@staticmethod` and `@dataclass`.

## Context managers

`with` guarantees that cleanup code runs, whatever happens inside the block. The simplest way to write your own is a generator with one `yield`.

```python run
from contextlib import contextmanager

@contextmanager
def section(title):
    print(f"== {title} ==")             # runs when the block starts
    try:
        yield                           # the body of the with block runs here
    finally:
        print(f"== end of {title} ==")  # always runs, even after an error

with section("report"):
    print("line one")
    print("line two")

try:
    with section("broken"):
        raise KeyError("missing")
except KeyError:
    print("the error still reached us, after the cleanup")
```

## The class form

A class becomes a context manager by defining `__enter__` and `__exit__`.

```python run
class Recorder:
    def __init__(self):
        self.events = []

    def __enter__(self):
        self.events.append("enter")
        return self                         # the value after `as`

    def __exit__(self, exc_type, exc, traceback):
        self.events.append("exit" if exc_type is None else f"exit after {exc_type.__name__}")
        return False                        # False: do not hide the exception

with Recorder() as rec:
    rec.events.append("working")
print(rec.events)
```

Typical uses: files, database transactions, locks, temporary settings and timers.

## Check yourself

```quiz
[
  {"q": "What is `@decorator` above `def f` short for?", "options": ["`f = decorator(f)`", "`decorator = f(decorator)`", "`f = f(decorator)`"], "answer": 0, "why": "The function is passed to the decorator and the name is rebound to the result."},
  {"q": "A wrapper calls `func(*args, **kwargs)` but does not return its result. What does the decorated function return?", "options": ["The original result", "`None`", "The wrapper function"], "answer": 1, "why": "The wrapper is what callers run, and it has no return value."},
  {"q": "In a `@contextmanager` generator, where does the body of the `with` block run?", "options": ["Before the generator starts", "At the `yield`", "After the generator finishes"], "answer": 1, "why": "Code before `yield` is setup, code after it is cleanup."}
]
```

## Exercises

````task
id: call-counter
title: Count the calls
kind: code
level: medium
@@statement
Write a decorator `count_calls` that records how many times a function has been called.

**Requirements**
- The decorated function behaves exactly like the original: same arguments, same return value.
- It has an attribute `calls` that starts at `0` and goes up by one on every call.
- The original name and docstring are preserved.
- Every decorated function has its own counter.

**Example**

```
@count_calls
def greet(name):
    return "Hello " + name

greet("Ana")     -> "Hello Ana"
greet("Ben")     -> "Hello Ben"
greet.calls      -> 2
```
@@starter
import functools

def count_calls(func):
    pass

@count_calls
def greet(name):
    return "Hello " + name

print(greet("Ana"), greet.calls)
@@tests
@count_calls
def _square(n):
    """Return n squared."""
    return n * n

@count_calls
def _join(*parts, sep="-"):
    return sep.join(parts)

assert _square.calls == 0, "the counter starts at zero"
assert _square(4) == 16, "the result is passed through"
assert _square(5) == 25, "second call"
assert _square.calls == 2, "two calls counted"
assert _join("a", "b", sep="+") == "a+b", "positional and keyword arguments are passed through"
assert _join.calls == 1, "each function has its own counter"
assert _square.__name__ == "_square" and _square.__doc__ == "Return n squared.", "name and docstring are preserved"
@@hint
Inside `wrapper`, do `wrapper.calls += 1` before calling `func`. After defining `wrapper`, set `wrapper.calls = 0` and return it. Decorate `wrapper` with `@functools.wraps(func)`.
@@solution
import functools

def count_calls(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        wrapper.calls += 1
        return func(*args, **kwargs)
    wrapper.calls = 0
    return wrapper
````

````task
id: suppress-errors
title: A context manager that collects errors
kind: code
level: medium
@@statement
Write a class `Collect` that is used with `with`. It catches exceptions of the given types raised inside the block, stores them, and lets the program continue.

**Requirements**
- `Collect(*types)` takes one or more exception classes.
- `with Collect(ValueError) as c:` gives the `Collect` object as `c`.
- If the block raises an exception that is an instance of one of the types, the exception is stored in the list `c.errors` and is **not** raised further.
- Any other exception passes through unchanged.
- `c.errors` is an empty list when nothing was raised. The same object can be used for several `with` blocks and keeps collecting.

**Example**

```
c = Collect(ValueError, KeyError)
with c:
    int("abc")          # ValueError: caught and stored
with c:
    {}["missing"]       # KeyError: caught and stored
len(c.errors)           -> 2
```
@@starter
class Collect:
    def __init__(self, *types):
        pass

    def __enter__(self):
        pass

    def __exit__(self, exc_type, exc, traceback):
        pass
@@tests
_c = Collect(ValueError, KeyError)
with _c as _same:
    int("abc")
assert _same is _c, "the with statement gives back the Collect object"
assert len(_c.errors) == 1 and isinstance(_c.errors[0], ValueError), "the ValueError is stored"
with _c:
    {}["missing"]
assert [type(e).__name__ for e in _c.errors] == ["ValueError", "KeyError"], "errors are collected in order"
with _c:
    pass
assert len(_c.errors) == 2, "a block without an error adds nothing"

def _passes_through():
    try:
        with Collect(ValueError):
            1 / 0
    except ZeroDivisionError:
        return True
    return False

assert _passes_through(), "other exception types are not swallowed"
assert Collect(ValueError).errors == [], "a new collector starts empty"
with Collect(LookupError) as _c2:
    [][5]
assert len(_c2.errors) == 1, "subclasses of the given types are caught too"
@@hint
`__enter__` returns `self`. In `__exit__`, when `exc_type` is not `None` and `issubclass(exc_type, self.types)`, append `exc` and return `True` to stop the exception. Return `False` in every other case.
@@solution
class Collect:
    def __init__(self, *types):
        self.types = types
        self.errors = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc_type is not None and issubclass(exc_type, self.types):
            self.errors.append(exc)
            return True
        return False
````

````task
ref: python-advanced/cache-for
````

````task
ref: python-advanced/timer-context
````
