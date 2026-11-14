---
id: py-set-arrays-strings
title: Problem set: arrays and strings
minutes: 90
---

These are classic interview problems on lists and strings. They are the same exercises as in the main course lesson **Complexity, arrays and strings**: solve one here and it is marked solved there, and the other way round.

## How to approach an interview problem

1. **Restate it.** Say the input, the output and one example in your own words.
2. **Start with the obvious solution.** Usually two nested loops. Say its cost: for a list of `n` items, a loop inside a loop takes about `n * n` steps.
3. **Look for the repeated work.** Most improvements come from one of three ideas below.
4. **Test the edges.** Empty input, one item, duplicates, everything equal.

## Three ideas that solve most of these

**Two pointers.** Keep one position at each end of a sorted list and move them toward each other. One pass replaces a nested loop.

```python run
def has_pair_with_sum(sorted_numbers, target):
    left, right = 0, len(sorted_numbers) - 1
    while left < right:
        total = sorted_numbers[left] + sorted_numbers[right]
        if total == target:
            return True
        if total < target:
            left += 1          # need a bigger sum
        else:
            right -= 1         # need a smaller sum
    return False

print(has_pair_with_sum([1, 3, 4, 6, 9], 10), has_pair_with_sum([1, 3, 4, 6, 9], 2))
```

**Sliding window.** Keep a window `[start, end]` over the data, grow it on the right and shrink it on the left, updating a running answer instead of recomputing it.

```python run
def longest_run_of_ones(bits):
    best = start = 0
    for end, bit in enumerate(bits):
        if bit == 0:
            start = end + 1            # the window cannot contain a zero
        best = max(best, end - start + 1 if bit else 0)
    return best

print(longest_run_of_ones([1, 1, 0, 1, 1, 1, 0, 1]))
```

**Remember what you have seen.** A set or dict answers "have I met this before?" immediately, which often removes the inner loop.

```python run
def first_repeated(items):
    seen = set()
    for item in items:
        if item in seen:
            return item
        seen.add(item)
    return None

print(first_repeated([3, 8, 5, 8, 3]))
```

## Problems

````task
ref: dsa-complexity-arrays/two-sum-sorted
````

````task
ref: dsa-complexity-arrays/valid-palindrome
````

````task
ref: dsa-complexity-arrays/best-stock-profit
````

````task
ref: dsa-complexity-arrays/longest-unique-substring
````

````task
ref: dsa-complexity-arrays/merge-intervals
````
