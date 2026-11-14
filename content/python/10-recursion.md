---
id: py-recursion
title: Recursion
minutes: 30
---

A recursive function solves a problem by calling itself on a smaller version of the same problem. It fits data that is nested to an unknown depth: folders inside folders, lists inside lists, the parts of a tree.

## The two parts of every recursive function

1. A **base case**: an input small enough to answer directly.
2. A **recursive case**: reduce the problem, call yourself, and combine the result.

```python run
def countdown(n):
    if n == 0:                 # base case
        return ["liftoff"]
    return [n] + countdown(n - 1)      # recursive case: a smaller n

print(countdown(3))

def factorial(n):
    return 1 if n <= 1 else n * factorial(n - 1)

print(factorial(5))            # 5 * 4 * 3 * 2 * 1
```

Each call waits for the call it made. `factorial(3)` waits for `factorial(2)`, which waits for `factorial(1)`, which answers `1`. Then the waiting calls finish in reverse order: `2 * 1`, then `3 * 2`.

> Without a base case that is always reached, the calls never stop and Python raises `RecursionError` after about 1000 levels. When you write a recursive function, write the base case first.

## Nested data

This is where recursion is clearly simpler than a loop.

```python run
def total(items):
    """Add every number in a list that may contain more lists."""
    result = 0
    for item in items:
        if isinstance(item, list):
            result += total(item)      # the same problem, one level down
        else:
            result += item
    return result

print(total([1, [2, 3], [4, [5, [6]]]]))

def depth(value):
    if not isinstance(value, list):
        return 0
    return 1 + max((depth(v) for v in value), default=0)

print(depth([1, [2, [3]], []]))
```

## Avoiding repeated work

A naive recursive Fibonacci computes the same values again and again. Remembering results fixes it.

```python run
from functools import lru_cache

calls = 0

def fib_slow(n):
    global calls
    calls += 1
    return n if n < 2 else fib_slow(n - 1) + fib_slow(n - 2)

print(fib_slow(20), "took", calls, "calls")

@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

print(fib(80))        # instant: each value is computed once
```

`@lru_cache` stores the result for each argument, so the second request for `fib(30)` is a lookup.

## Recursion or a loop?

Use a loop for a simple sequence of steps. Use recursion when the data is nested or when the problem splits into smaller copies of itself (searching a tree, generating combinations, divide and conquer).

## Check yourself

```quiz
[
  {"q": "What happens if a recursive function has no base case?", "options": ["It returns `None`", "It raises `RecursionError`", "It runs forever without an error"], "answer": 1, "why": "Python limits the depth of nested calls to about 1000 and then raises `RecursionError`."},
  {"q": "For `def f(n): return 0 if n == 0 else n + f(n - 1)`, what is `f(4)`?", "options": ["`4`", "`10`", "`24`"], "answer": 1, "why": "4 + 3 + 2 + 1 + 0 = 10."},
  {"q": "What does `@lru_cache` change about a recursive function?", "options": ["It removes the need for a base case", "It remembers results so repeated calls are lookups", "It turns recursion into a loop"], "answer": 1, "why": "Memoisation stores each computed result by its arguments."}
]
```

## Exercises

````task
id: flatten
title: Flatten a nested list
kind: code
level: medium
@@statement
Write `flatten(nested)` that turns a list containing values and further lists, nested to any depth, into one flat list.

**Input**: `nested`, a list. Its items are either lists (which follow the same rule) or other values. Strings are values and must **not** be split into characters.

**Output**: a new flat list with the values in their original left-to-right order.

**Example**

```
flatten([1, [2, [3, 4]], [], [[5]]])  -> [1, 2, 3, 4, 5]
flatten(["ab", ["cd"]])               -> ["ab", "cd"]
```
@@starter
def flatten(nested):
    pass

print(flatten([1, [2, [3, 4]], [], [[5]]]))
@@tests
assert flatten([1, [2, [3, 4]], [], [[5]]]) == [1, 2, 3, 4, 5], "several levels"
assert flatten([]) == [], "empty list"
assert flatten([1, 2, 3]) == [1, 2, 3], "already flat"
assert flatten(["ab", ["cd"]]) == ["ab", "cd"], "strings are not split"
assert flatten([[[[]]]]) == [], "only empty lists"
assert flatten([[1], [[2]], [[[3]]]]) == [1, 2, 3], "increasing depth"
assert flatten([None, [0, [False]]]) == [None, 0, False], "falsy values are kept"
@@hint
Loop over the items. If `isinstance(item, list)`, extend the result with `flatten(item)`. Otherwise append the item.
@@solution
def flatten(nested):
    result = []
    for item in nested:
        if isinstance(item, list):
            result.extend(flatten(item))
        else:
            result.append(item)
    return result
````

````task
id: count-paths
title: Count the paths through a grid
kind: code
level: medium
@@statement
A robot stands in the top-left cell of a grid with `rows` rows and `cols` columns. It can only move **right** or **down**. Write `count_paths(rows, cols)` that returns the number of different routes to the bottom-right cell.

**Input**: `rows` and `cols`, whole numbers from 1 to 16.

**Output**: an `int`.

**Example**

```
count_paths(1, 5) -> 1     (only straight to the right)
count_paths(2, 2) -> 2     (right-down, or down-right)
count_paths(3, 3) -> 6
```

Solve it recursively. The larger tests need the results to be remembered, otherwise the function is too slow.
@@starter
from functools import lru_cache

def count_paths(rows, cols):
    pass

print(count_paths(3, 3))
@@tests
assert count_paths(1, 5) == 1, "a single row has one route"
assert count_paths(5, 1) == 1, "a single column has one route"
assert count_paths(2, 2) == 2, "smallest square"
assert count_paths(3, 3) == 6, "three by three"
assert count_paths(3, 7) == 28, "rectangle"
assert count_paths(16, 16) == 155117520, "large grid needs memoisation"
@@hint
The last move into a cell came from above or from the left, so `count_paths(r, c) = count_paths(r - 1, c) + count_paths(r, c - 1)`. The base case is a grid with one row or one column. Add `@lru_cache(maxsize=None)`.
@@solution
from functools import lru_cache

@lru_cache(maxsize=None)
def count_paths(rows, cols):
    if rows == 1 or cols == 1:
        return 1
    return count_paths(rows - 1, cols) + count_paths(rows, cols - 1)
````

````task
ref: dsa-recursion-dp-greedy/subsets
````
