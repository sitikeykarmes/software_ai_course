---
id: py-iterators-generators
title: Iterators and generators
minutes: 30
---

A `for` loop does not need a list. It needs something that can hand over one item at a time. Generators let you write such a source as an ordinary function, and they produce items only when asked, so they can describe data that is huge or even endless.

## What a for loop really does

```python run
numbers = [10, 20, 30]

iterator = iter(numbers)        # ask the list for an iterator
print(next(iterator))           # ask the iterator for the next item
print(next(iterator))
print(next(iterator))
try:
    next(iterator)
except StopIteration:
    print("no more items")      # this is how a for loop knows when to stop
```

Anything that works with `iter()` is called iterable: lists, strings, dicts, files, ranges and generators.

## Generator functions

A function that contains `yield` is a generator function. Calling it does not run the body. It returns a generator, and each `next()` runs the body up to the following `yield`, then pauses.

```python run
def countdown(start):
    print("  (starting)")
    while start > 0:
        yield start                 # hand over a value and pause here
        start -= 1
    print("  (finished)")

gen = countdown(3)
print("created, nothing has run yet")
for value in gen:
    print(value)

print(list(countdown(2)))
```

## Laziness in practice

```python run
def naturals():
    n = 1
    while True:                     # endless, and that is fine
        yield n
        n += 1

def take(count, iterable):
    result = []
    for item in iterable:
        if len(result) == count:
            break
        result.append(item)
    return result

squares = (n * n for n in naturals())        # a generator expression: also lazy
print(take(5, squares))

import sys
big_list = [n for n in range(100_000)]
big_gen = (n for n in range(100_000))
print(sys.getsizeof(big_list), "bytes versus", sys.getsizeof(big_gen), "bytes")
print(sum(n for n in range(100_000)))        # no list is ever built
```

> A generator can be consumed only once. After a loop has run through it, it is empty. Create it again or store the results in a list if you need them twice.

## Building pipelines

Generators chain naturally: each stage pulls from the one before it, one item at a time.

```python run
log = """INFO start
ERROR disk full
INFO retry
ERROR timeout
""".splitlines()

def only_errors(lines):
    for line in lines:
        if line.startswith("ERROR"):
            yield line

def messages(lines):
    for line in lines:
        yield line.split(" ", 1)[1]

for message in messages(only_errors(log)):
    print(message)
```

## itertools

The standard library already contains most of the generators you would write yourself.

```python run
from itertools import islice, chain, count, accumulate, groupby, combinations

print(list(islice(count(10, 5), 4)))                 # the first 4 of an endless counter
print(list(chain("ab", [1, 2])))                     # one sequence after another
print(list(accumulate([1, 2, 3, 4])))                # running totals
print(list(combinations("abc", 2)))                  # every pair, without repeats
print([(key, len(list(group))) for key, group in groupby("aaabccdd")])
```

## Check yourself

```quiz
[
  {"q": "When does the body of a generator function start running?", "options": ["When the function is called", "When the first value is requested", "When the generator is created and stored"], "answer": 1, "why": "Calling the function only creates the generator. The body runs on the first `next()`."},
  {"q": "What does `list(gen)` return the second time, for the same generator?", "options": ["The same items again", "An empty list", "It raises `StopIteration`"], "answer": 1, "why": "A generator is used up after one pass."},
  {"q": "Which uses the least memory for `sum` over a million squares?", "options": ["`sum([n*n for n in range(10**6)])`", "`sum(n*n for n in range(10**6))`", "Both are the same"], "answer": 1, "why": "The generator expression produces one value at a time. The list version builds a million items first."}
]
```

## Exercises

````task
id: chunked
title: Split a sequence into chunks
kind: code
level: medium
@@statement
Write a **generator function** `chunked(iterable, size)` that yields lists of `size` consecutive items. The last chunk may be shorter.

It must work on any iterable, including generators, and must not read more items than it needs.

**Input**
- `iterable`: any iterable.
- `size`: a whole number, 1 or greater.

**Output**: a generator of lists.

**Example**

```
list(chunked([1, 2, 3, 4, 5], 2))   -> [[1, 2], [3, 4], [5]]
list(chunked("abcdef", 3))          -> [["a", "b", "c"], ["d", "e", "f"]]
```
@@starter
def chunked(iterable, size):
    pass

print(list(chunked([1, 2, 3, 4, 5], 2)))
@@tests
import itertools as _it
assert list(chunked([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]], "last chunk is shorter"
assert list(chunked("abcdef", 3)) == [["a", "b", "c"], ["d", "e", "f"]], "works on a string"
assert list(chunked([], 3)) == [], "empty input yields nothing"
assert list(chunked([1, 2], 5)) == [[1, 2]], "size larger than the input"
assert list(chunked((n for n in range(4)), 1)) == [[0], [1], [2], [3]], "works on a generator"
assert next(chunked(_it.count(), 3)) == [0, 1, 2], "lazy: works on an endless iterable"
assert hasattr(chunked([1], 1), "__next__"), "chunked returns a generator"
@@hint
Keep a list `chunk`. Append each item, and when `len(chunk) == size`, `yield chunk` and start a new list. After the loop, yield the remaining items if there are any.
@@solution
def chunked(iterable, size):
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk
````

````task
id: fibonacci-gen
title: Endless Fibonacci
kind: code
level: easy
@@statement
Write a **generator function** `fibonacci()` that yields the Fibonacci numbers forever: `0, 1, 1, 2, 3, 5, 8, ...`. Each number is the sum of the two before it.

Then write `first_fib_over(limit)` that uses the generator to return the first Fibonacci number that is **greater than** `limit`.

**Example**

```
gen = fibonacci()
next(gen), next(gen), next(gen), next(gen)   -> 0, 1, 1, 2

first_fib_over(10)    -> 13
first_fib_over(13)    -> 21
```
@@starter
def fibonacci():
    pass

def first_fib_over(limit):
    pass

print(first_fib_over(10))
@@tests
import itertools as _it
assert list(_it.islice(fibonacci(), 10)) == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34], "first ten numbers"
assert first_fib_over(10) == 13, "first number above ten"
assert first_fib_over(13) == 21, "strictly greater than the limit"
assert first_fib_over(-5) == 0, "negative limit"
assert first_fib_over(0) == 1, "limit of zero"
assert first_fib_over(10 ** 18) == 1100087778366101931, "large numbers"
_g1, _g2 = fibonacci(), fibonacci()
next(_g1); next(_g1); next(_g1)
assert next(_g2) == 0, "each generator has its own state"
@@hint
Keep two variables: `a, b = 0, 1`. Inside `while True:`, `yield a`, then update both at once with `a, b = b, a + b`. For the second function, loop over `fibonacci()` and return as soon as a value exceeds the limit.
@@solution
def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

def first_fib_over(limit):
    for value in fibonacci():
        if value > limit:
            return value
````

````task
ref: python-advanced/sliding-windows
````
