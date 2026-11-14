---
id: py-set-search-recursion
title: Problem set: searching and recursion
minutes: 90
---

Problems on binary search, selection and recursive thinking. They are shared with the main course lessons **Searching and sorting** and **Recursion, dynamic programming and greedy**.

## Binary search

If the data is sorted, you never need to look at every item. Check the middle, throw away the half that cannot contain the answer, and repeat. A million items take about twenty steps.

```python run
def find(sorted_numbers, target):
    low, high = 0, len(sorted_numbers) - 1
    steps = 0
    while low <= high:
        steps += 1
        middle = (low + high) // 2
        if sorted_numbers[middle] == target:
            return middle, steps
        if sorted_numbers[middle] < target:
            low = middle + 1           # the answer can only be to the right
        else:
            high = middle - 1          # the answer can only be to the left
    return -1, steps

data = list(range(0, 2_000_000, 2))
print(find(data, 1_337_000), find(data, 7))
```

The details that go wrong are always the same: is `high` the last valid index or one past it, is the loop condition `<` or `<=`, and do you move to `middle` or `middle + 1`. Pick one convention and check it against a list of one item and a list of two.

## Searching for an answer, not an item

Binary search also works on a range of possible answers, whenever you can ask "is this value enough?" and the answer switches from no to yes exactly once.

```python run
def smallest_square_at_least(target):
    low, high = 0, target
    while low < high:
        middle = (low + high) // 2
        if middle * middle >= target:
            high = middle              # middle works: try smaller
        else:
            low = middle + 1           # middle is too small
    return low

print(smallest_square_at_least(50), smallest_square_at_least(49))
```

## Recursion with remembered results

Many "count the ways" and "find the cheapest" problems have the same shape: the answer for a value is built from the answers for smaller values, and the same smaller values come up again and again. Solve each once and remember it.

```python run
from functools import lru_cache

@lru_cache(maxsize=None)
def ways_to_climb(steps):
    """Ways to climb a staircase taking 1 or 2 steps at a time."""
    if steps <= 1:
        return 1
    return ways_to_climb(steps - 1) + ways_to_climb(steps - 2)

print([ways_to_climb(n) for n in range(1, 11)], ways_to_climb(90))
```

## Problems

````task
ref: dsa-search-sort/binary-search
````

````task
ref: dsa-search-sort/integer-sqrt
````

````task
ref: dsa-search-sort/kth-largest
````

````task
ref: dsa-recursion-dp-greedy/coin-change
````

````task
ref: dsa-recursion-dp-greedy/generate-parentheses
````
