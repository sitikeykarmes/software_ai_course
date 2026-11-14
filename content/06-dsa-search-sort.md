---
id: dsa-search-sort
title: Binary search and sorting
minutes: 60
---

Sorting puts data in order; binary search exploits that order to find things in O(log n). Together they are the most reused pair of ideas in computing, from database indexes to version control.

## Binary search

To find a value in a sorted array, look at the middle. If the middle is too small, the answer can only be in the right half; if too big, the left half. Each step halves the remaining range, so a million items need about 20 steps.

```sim
binary-search
```

```python run
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1          # discard the left half including mid
        else:
            hi = mid - 1          # discard the right half including mid
    return -1

data = [2, 5, 8, 12, 16, 23, 38, 42, 56, 61, 72]
print(binary_search(data, 23), binary_search(data, 7))
```

The details that cause bugs: the loop condition is `lo <= hi` for this form; `mid` is always excluded from the next range, or the loop never ends.

### Leftmost and rightmost position

With duplicates you often need the first position where a value could go. This form never returns early; it shrinks to a boundary.

```python run
def lower_bound(nums, target):
    """First index i where nums[i] >= target."""
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo

def upper_bound(nums, target):
    """First index i where nums[i] > target."""
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] <= target:
            lo = mid + 1
        else:
            hi = mid
    return lo

nums = [1, 3, 3, 3, 5, 8]
first, after_last = lower_bound(nums, 3), upper_bound(nums, 3)
print(first, after_last, "count of 3s:", after_last - first)

import bisect                       # the standard library versions
print(bisect.bisect_left(nums, 3), bisect.bisect_right(nums, 3))
```

Real use: a database B-tree index is a binary-search-like descent; `git bisect` binary-searches commits to find the one that introduced a bug; finding the log entry for a timestamp.

### Search in a rotated sorted array

`[4, 5, 6, 7, 0, 1, 2]` is a sorted array rotated. At every step one half is still properly sorted. Check whether the target lies inside the sorted half; if so go there, otherwise go to the other half.

```python run
def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:                     # left half is sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:                                         # right half is sorted
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1

print(search_rotated([4, 5, 6, 7, 0, 1, 2], 0), search_rotated([4, 5, 6, 7, 0, 1, 2], 3))
```

### Binary search on the answer

This is the form that surprises people. When the question is "what is the smallest value X for which something is possible?", and possible stays possible for every larger X, you can binary-search over X itself.

Example: a conveyor must ship all packages within `days` days, in order. What is the smallest daily weight capacity that works? If capacity C works, any larger capacity works, so search capacities.

```python run
def days_needed(weights, capacity):
    days, load = 1, 0
    for w in weights:
        if load + w > capacity:
            days += 1
            load = 0
        load += w
    return days

def min_capacity(weights, days):
    lo, hi = max(weights), sum(weights)     # smallest and largest sensible capacity
    while lo < hi:
        mid = (lo + hi) // 2
        if days_needed(weights, mid) <= days:
            hi = mid                          # works: try smaller
        else:
            lo = mid + 1                      # too small
    return lo

print(min_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5))
```

The same template solves: minimum eating speed to finish in h hours, splitting an array to minimise the largest part, placing machines to maximise the smallest gap, and the integer square root.

```python run
def isqrt(n):
    lo, hi = 0, n
    while lo < hi:
        mid = (lo + hi + 1) // 2        # round up so the loop makes progress
        if mid * mid <= n:
            lo = mid
        else:
            hi = mid - 1
    return lo

print(isqrt(17), isqrt(144), isqrt(10 ** 12))
```

## Sorting

In real code you call `sorted()` or `.sort()`. You study the algorithms because each one teaches a technique, and because interviewers ask how they work and when each is appropriate.

```sim
sorting
```

| Algorithm | Average | Worst | Extra space | Stable | Idea |
| --- | --- | --- | --- | --- | --- |
| Bubble | O(n²) | O(n²) | O(1) | Yes | Swap adjacent items that are out of order, repeat |
| Selection | O(n²) | O(n²) | O(1) | No | Repeatedly pick the minimum of the rest |
| Insertion | O(n²) | O(n²) | O(1) | Yes | Insert each item into the sorted part on its left; fast on nearly sorted data |
| Merge | O(n log n) | O(n log n) | O(n) | Yes | Split in half, sort each half, merge |
| Quick | O(n log n) | O(n²) | O(log n) | No | Pick a pivot, put smaller items left and larger right, recurse |
| Heap | O(n log n) | O(n log n) | O(1) | No | Build a heap, repeatedly remove the maximum |
| Counting / radix | O(n + k) | O(n + k) | O(n + k) | Yes | Count occurrences of small integer keys; no comparisons |

**Stable** means items that compare equal keep their original order. That matters when you sort by one field after another: sort by name, then stable-sort by department, and names stay ordered inside each department.

### Insertion sort

```python run
def insertion_sort(a):
    for i in range(1, len(a)):
        item, j = a[i], i - 1
        while j >= 0 and a[j] > item:
            a[j + 1] = a[j]           # shift larger items right
            j -= 1
        a[j + 1] = item
    return a

print(insertion_sort([7, 3, 5, 1, 9, 2]))
```

### Merge sort: divide and conquer

```python run
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left, right = merge_sort(a[:mid]), merge_sort(a[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    return out + left[i:] + right[j:]

print(merge_sort([38, 27, 43, 3, 9, 82, 10]))
```

Why O(n log n): the array is halved log n times, and each level does O(n) work merging. Merge sort is the basis of external sorting, where data larger than memory is sorted in chunks on disk and merged, which is how databases sort huge tables.

### Quick sort

```python run
import random

def quick_sort(a, lo=0, hi=None):
    if hi is None:
        hi = len(a) - 1
    if lo >= hi:
        return a
    p = random.randint(lo, hi)            # random pivot avoids the O(n^2) case on sorted input
    a[p], a[hi] = a[hi], a[p]
    pivot, i = a[hi], lo
    for j in range(lo, hi):
        if a[j] < pivot:
            a[i], a[j] = a[j], a[i]
            i += 1
    a[i], a[hi] = a[hi], a[i]             # pivot is now in its final place
    quick_sort(a, lo, i - 1)
    quick_sort(a, i + 1, hi)
    return a

print(quick_sort([9, 4, 7, 1, 8, 2, 6]))
```

The partition step also gives **quickselect**: to find the k-th smallest item you only recurse into the side that contains position k, which is O(n) on average.

```python run
import random

def kth_smallest(nums, k):
    nums = list(nums)
    lo, hi = 0, len(nums) - 1
    while True:
        p = random.randint(lo, hi)
        nums[p], nums[hi] = nums[hi], nums[p]
        i = lo
        for j in range(lo, hi):
            if nums[j] < nums[hi]:
                nums[i], nums[j] = nums[j], nums[i]; i += 1
        nums[i], nums[hi] = nums[hi], nums[i]
        if i == k - 1:
            return nums[i]
        if i < k - 1:
            lo = i + 1
        else:
            hi = i - 1

print(kth_smallest([7, 10, 4, 3, 20, 15], 3))
```

### Counting sort: beating n log n

Comparison sorts cannot do better than O(n log n). When keys are small integers you can skip comparisons entirely.

```python run
def counting_sort(nums, max_value):
    counts = [0] * (max_value + 1)
    for x in nums:
        counts[x] += 1
    out = []
    for value, c in enumerate(counts):
        out.extend([value] * c)
    return out

print(counting_sort([3, 1, 4, 1, 5, 2, 0, 5, 3], 5))
```

### What Python actually does

`sorted()` and `list.sort()` use **Timsort**, a hybrid of merge sort and insertion sort that detects runs already in order. It is O(n log n) in the worst case, O(n) on sorted input, and stable.

```python run
people = [("Asha", "weld", 31), ("Ravi", "paint", 27), ("Meena", "weld", 27), ("Karan", "paint", 35)]

print(sorted(people, key=lambda p: p[2]))                      # by age
print(sorted(people, key=lambda p: (p[1], -p[2])))             # by department, then age descending
print(sorted(people, key=lambda p: p[0], reverse=True)[:2])    # last two names

from functools import cmp_to_key
def biggest_number(nums):                                      # custom ordering: which concatenation is larger
    strs = sorted(map(str, nums), key=cmp_to_key(lambda a, b: -1 if a + b > b + a else 1))
    return "".join(strs)
print(biggest_number([3, 30, 34, 5, 9]))
```

## Sorting as a first step

Many problems become simple once the data is sorted, at a cost of O(n log n):

- **Duplicates and grouping**: equal items become neighbours.
- **Intervals**: sort by start time, then sweep (meeting rooms, merge intervals).
- **Greedy choices**: sort by deadline, weight or ratio, then take items in order.
- **Two pointers**: needs sorted input.

```python run
def min_meeting_rooms(meetings):
    starts = sorted(s for s, e in meetings)
    ends = sorted(e for s, e in meetings)
    rooms = best = j = 0
    for s in starts:
        while ends[j] <= s:        # a meeting ended before this one starts: free its room
            rooms -= 1; j += 1
        rooms += 1
        best = max(best, rooms)
    return best

print(min_meeting_rooms([(0, 30), (5, 10), (15, 20), (10, 25)]))
```

This sweep is how you would compute the peak number of concurrent users from session logs, or the peak number of machines running at once.

## Check yourself

```quiz
[
  {"q": "How many steps does binary search need for one billion sorted items, at most?", "options": ["About 30", "About 1,000", "About 31,000"], "answer": 0, "why": "log₂ of 10⁹ is about 30."},
  {"q": "Binary search on an unsorted list:", "options": ["Works but slower", "Gives wrong results because halves cannot be safely discarded", "Raises an error"], "answer": 1, "why": "The method relies on everything left of mid being smaller."},
  {"q": "When can you binary-search on the answer?", "options": ["When the input is small", "When feasibility is monotonic: if X works, every larger X works", "Only on strings"], "answer": 1, "why": "Monotonic yes/no lets you discard half the candidate answers each step."},
  {"q": "Which sort is the best default for a linked list or for data too big for memory?", "options": ["Quick sort", "Merge sort", "Selection sort"], "answer": 1, "why": "Merging needs only sequential access, which suits lists and disk files."},
  {"q": "Why pick a random pivot in quick sort?", "options": ["To make it stable", "To avoid O(n²) behaviour on already sorted input", "To use less memory"], "answer": 1, "why": "A fixed first or last pivot splits sorted data into sizes 0 and n-1 every time."},
  {"q": "You sort employees by name, then by department with a stable sort. Result?", "options": ["Names are in random order within a department", "Names stay alphabetical within each department", "Sorting twice is an error"], "answer": 1, "why": "A stable sort preserves the earlier order among equal keys."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: binary-search
title: Binary search and insert position
kind: code
level: easy
@@statement
Write two functions, both O(log n), **without** using `bisect`.

1. `binary_search(nums, target)`: return the index of `target` in the ascending list `nums`, or `-1` if absent.
2. `search_insert(nums, target)`: return the index where `target` is, or the index where it would be inserted to keep `nums` sorted. If `target` is already present (even several times) return the leftmost such index.

**Input**: `nums` is a sorted list of integers (no duplicates for `binary_search`; duplicates allowed for `search_insert`), possibly empty.

**Example**

```
binary_search([1, 3, 5, 7], 5)   -> 2
binary_search([1, 3, 5, 7], 4)   -> -1
search_insert([1, 3, 5, 7], 4)   -> 2
search_insert([1, 3, 5, 7], 10)  -> 4
```
@@starter
def binary_search(nums, target):
    pass

def search_insert(nums, target):
    pass
@@tests
assert binary_search([1, 3, 5, 7], 5) == 2, "found"
assert binary_search([1, 3, 5, 7], 4) == -1, "missing"
assert binary_search([], 1) == -1, "empty"
assert binary_search([4], 4) == 0, "single found"
assert binary_search([1, 3, 5, 7], 7) == 3 and binary_search([1, 3, 5, 7], 1) == 0, "ends"
assert search_insert([1, 3, 5, 7], 4) == 2, "middle insert"
assert search_insert([1, 3, 5, 7], 10) == 4, "append"
assert search_insert([1, 3, 5, 7], 0) == 0, "front"
assert search_insert([], 5) == 0, "empty insert"
assert search_insert([1, 2, 2, 2, 3], 2) == 1, "leftmost duplicate"
@@hint
Keep `lo, hi = 0, len(nums)`. While `lo < hi`, look at `mid`; if `nums[mid] < target` set `lo = mid + 1`, else `hi = mid`. After the loop `lo` is the insert position.
@@solution
def search_insert(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo

def binary_search(nums, target):
    i = search_insert(nums, target)
    if i < len(nums) and nums[i] == target:
        return i
    return -1
````

````task
id: first-last-position
title: First and last position
kind: code
level: medium
@@statement
Write `search_range(nums, target)` in O(log n).

**Input**: `nums`, a sorted (ascending) list of integers that may contain duplicates; `target`, an integer.

**Output**: a list `[first_index, last_index]` of the first and last occurrence of `target`. If `target` is absent return `[-1, -1]`.

**Example**

```
search_range([5, 7, 7, 8, 8, 10], 8) -> [3, 4]
search_range([5, 7, 7, 8, 8, 10], 6) -> [-1, -1]
```
@@starter
def search_range(nums, target):
    pass
@@tests
assert search_range([5, 7, 7, 8, 8, 10], 8) == [3, 4], "classic"
assert search_range([5, 7, 7, 8, 8, 10], 6) == [-1, -1], "absent"
assert search_range([], 0) == [-1, -1], "empty"
assert search_range([1], 1) == [0, 0], "single"
assert search_range([2, 2, 2, 2], 2) == [0, 3], "all equal"
assert search_range([1, 2, 3], 3) == [2, 2], "last element"
assert search_range([1, 2, 3], 4) == [-1, -1], "beyond the end"
@@hint
Write a helper `lower_bound(x)` (first index with `nums[i] >= x`). The first position is `lower_bound(target)`, the last is `lower_bound(target + 1) - 1`.
@@solution
def search_range(nums, target):
    def lower_bound(x):
        lo, hi = 0, len(nums)
        while lo < hi:
            mid = (lo + hi) // 2
            if nums[mid] < x:
                lo = mid + 1
            else:
                hi = mid
        return lo

    first = lower_bound(target)
    if first == len(nums) or nums[first] != target:
        return [-1, -1]
    return [first, lower_bound(target + 1) - 1]
````

````task
id: rotated-search
title: Search in a rotated sorted array
kind: code
level: hard
@@statement
A sorted list of **distinct** integers was rotated at some pivot, for example `[0, 1, 2, 4, 5, 6, 7]` became `[4, 5, 6, 7, 0, 1, 2]`. Write two O(log n) functions:

1. `find_min(nums)`: return the smallest value. Empty list raises `ValueError`.
2. `search_rotated(nums, target)`: return the index of `target`, or `-1`.

A list that was rotated by 0 (still fully sorted) is allowed.

**Example**

```
find_min([4, 5, 6, 7, 0, 1, 2])          -> 0
search_rotated([4, 5, 6, 7, 0, 1, 2], 0) -> 4
search_rotated([4, 5, 6, 7, 0, 1, 2], 3) -> -1
```
@@starter
def find_min(nums):
    pass

def search_rotated(nums, target):
    pass
@@tests
assert find_min([4, 5, 6, 7, 0, 1, 2]) == 0, "min in right half"
assert find_min([1, 2, 3]) == 1, "not rotated"
assert find_min([5]) == 5, "single"
assert find_min([2, 1]) == 1, "two items"
try:
    find_min([])
    assert False, "empty must raise ValueError"
except ValueError:
    pass
_r = [4, 5, 6, 7, 0, 1, 2]
assert [search_rotated(_r, x) for x in _r] == list(range(7)), "every element found at its index"
assert search_rotated(_r, 3) == -1, "missing"
assert search_rotated([], 1) == -1, "empty"
assert search_rotated([1, 3], 3) == 1, "two items rotated none"
assert search_rotated([3, 1], 1) == 1, "two items rotated"
@@hint
At each `mid` one half is always sorted. For `find_min` compare `nums[mid]` with `nums[hi]`. For search, check whether `target` lies inside the sorted half, and keep that half or discard it.
@@solution
def find_min(nums):
    if not nums:
        raise ValueError("empty")
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1
        else:
            hi = mid
    return nums[lo]

def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1
````

````task
id: koko-bananas
title: Koko eating bananas
kind: code
level: medium
@@statement
Write `min_eating_speed(piles, hours)` using binary search on the answer.

There are piles of bananas. Each hour Koko picks one pile and eats up to `k` bananas from it (if the pile has fewer, she finishes it and wastes the rest of that hour).

**Input**: `piles`, a non-empty list of positive integers; `hours`, an integer `>= len(piles)`.

**Output**: the smallest integer speed `k >= 1` so that all piles are eaten within `hours` hours.

**Example**

```
min_eating_speed([3, 6, 7, 11], 8)       -> 4
min_eating_speed([30, 11, 23, 4, 20], 5) -> 30
```
@@starter
def min_eating_speed(piles, hours):
    pass
@@tests
assert min_eating_speed([3, 6, 7, 11], 8) == 4, "classic"
assert min_eating_speed([30, 11, 23, 4, 20], 5) == 30, "one hour per pile"
assert min_eating_speed([30, 11, 23, 4, 20], 6) == 23, "one spare hour"
assert min_eating_speed([5], 5) == 1, "single pile, many hours"
assert min_eating_speed([1000000000], 2) == 500000000, "huge numbers"
assert min_eating_speed([1, 1, 1], 3) == 1, "tiny piles"
@@hint
The speed lies between 1 and `max(piles)`. For a given `k` the hours needed are `sum(ceil(p / k))`; that is monotone in `k`, so binary search the smallest `k` that fits.
@@solution
def min_eating_speed(piles, hours):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        needed = sum((p + mid - 1) // mid for p in piles)
        if needed <= hours:
            hi = mid
        else:
            lo = mid + 1
    return lo
````

````task
id: ship-capacity
title: Capacity to ship packages
kind: code
level: medium
@@statement
Write `ship_capacity(weights, days)`. Packages must be shipped **in the given order**, each day loading consecutive packages without exceeding the ship's capacity.

**Input**: `weights`, a non-empty list of positive integers; `days`, a positive integer.

**Output**: the minimum ship capacity that ships all packages within `days` days. (This is also the "split array largest sum" problem.)

**Example**

```
ship_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5) -> 15
ship_capacity([3, 2, 2, 4, 1, 4], 3)               -> 6
```
@@starter
def ship_capacity(weights, days):
    pass
@@tests
assert ship_capacity([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5) == 15, "classic"
assert ship_capacity([3, 2, 2, 4, 1, 4], 3) == 6, "second example"
assert ship_capacity([1, 2, 3, 1, 1], 4) == 3, "many days"
assert ship_capacity([7], 1) == 7, "single"
assert ship_capacity([5, 5, 5], 1) == 15, "one day takes everything"
assert ship_capacity([5, 5, 5], 3) == 5, "one package per day"
@@hint
The capacity is between `max(weights)` and `sum(weights)`. Write a helper that greedily counts the days needed for a capacity, then binary search the smallest capacity that needs `<= days`.
@@solution
def ship_capacity(weights, days):
    def days_needed(cap):
        d, load = 1, 0
        for w in weights:
            if load + w > cap:
                d += 1
                load = 0
            load += w
        return d

    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = (lo + hi) // 2
        if days_needed(mid) <= days:
            hi = mid
        else:
            lo = mid + 1
    return lo
````

````task
id: integer-sqrt
title: Integer square root
kind: code
level: easy
@@statement
Write `my_sqrt(x)` using binary search. Do **not** use `math.sqrt`, `**0.5` or `math.isqrt`.

**Input**: an integer `x >= 0` (up to `10**18`). A negative value raises `ValueError`.

**Output**: the integer part of the square root: the largest integer `r` with `r * r <= x`.

**Example**

```
my_sqrt(8)  -> 2
my_sqrt(16) -> 4
my_sqrt(0)  -> 0
```
@@starter
def my_sqrt(x):
    pass
@@tests
assert my_sqrt(8) == 2, "rounds down"
assert my_sqrt(16) == 4, "perfect square"
assert my_sqrt(0) == 0 and my_sqrt(1) == 1, "small values"
assert my_sqrt(2) == 1 and my_sqrt(3) == 1, "between 1 and 4"
assert my_sqrt(10 ** 18) == 10 ** 9, "large perfect square"
assert my_sqrt(10 ** 18 - 1) == 10 ** 9 - 1, "just below a large square"
try:
    my_sqrt(-1)
    assert False, "negative must raise ValueError"
except ValueError:
    pass
@@hint
Binary search `r` in `[0, x]` for the largest value with `r * r <= x`.
@@solution
def my_sqrt(x):
    if x < 0:
        raise ValueError("negative")
    lo, hi = 0, x
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if mid * mid <= x:
            lo = mid
        else:
            hi = mid - 1
    return lo
````

````task
id: merge-quick-sort
title: Merge sort and quick sort
kind: code
level: medium
@@statement
Write two sorting functions **without** using `sorted()`, `list.sort()` or `heapq`.

1. `merge_sort(items)`: stable merge sort, O(n log n).
2. `quick_sort(items)`: quick sort with any pivot rule you like (take care that a list of all-equal items does not recurse forever or too deep).

**Input**: a list of integers (may be empty, may have duplicates and negatives).

**Output**: a **new** ascending list. The input list must not be modified.

**Example**

```
merge_sort([5, 2, 9, 1, 2]) -> [1, 2, 2, 5, 9]
quick_sort([3, -1, 0])      -> [-1, 0, 3]
```
@@starter
def merge_sort(items):
    pass

def quick_sort(items):
    pass
@@tests
import random as _random
_rng = _random.Random(7)
_data = [_rng.randint(-50, 50) for _ in range(2000)]
_expected = sorted(_data)
_copy = list(_data)
assert merge_sort(_data) == _expected, "merge sort random data"
assert quick_sort(_data) == _expected, "quick sort random data"
assert _data == _copy, "input must not be modified"
for _f in (merge_sort, quick_sort):
    assert _f([]) == [], "empty"
    assert _f([1]) == [1], "single"
    assert _f([2, 1]) == [1, 2], "two items"
    assert _f([5, 5, 5, 5]) == [5, 5, 5, 5], "all equal"
    assert _f(list(range(1000, 0, -1))) == list(range(1, 1001)), "reversed input"
    assert _f(list(range(1, 1001))) == list(range(1, 1001)), "already sorted"
@@hint
Merge sort: split in half, sort each half recursively, then merge with two indices. Quick sort: choose the middle item as pivot, partition into `less`, `equal`, `greater` lists and recurse on `less` and `greater` only.
@@solution
def merge_sort(items):
    if len(items) <= 1:
        return list(items)
    mid = len(items) // 2
    left = merge_sort(items[:mid])
    right = merge_sort(items[mid:])
    out = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    out.extend(left[i:])
    out.extend(right[j:])
    return out

def quick_sort(items):
    if len(items) <= 1:
        return list(items)
    pivot = items[len(items) // 2]
    less = [x for x in items if x < pivot]
    equal = [x for x in items if x == pivot]
    greater = [x for x in items if x > pivot]
    return quick_sort(less) + equal + quick_sort(greater)
````

````task
id: sort-colors
title: Sort colors in one pass
kind: code
level: medium
@@statement
Write `sort_colors(nums)` that sorts a list containing only `0`, `1` and `2` **in place** with a single pass and three pointers (Dutch national flag). Do not use `sort()`.

**Input**: a list of integers, each 0, 1 or 2 (may be empty).

**Output**: returns `None`; the list passed in is modified so that all 0s come first, then 1s, then 2s.

**Example**

```
a = [2, 0, 2, 1, 1, 0]
sort_colors(a)
a -> [0, 0, 1, 1, 2, 2]
```
@@starter
def sort_colors(nums):
    pass
@@tests
_a = [2, 0, 2, 1, 1, 0]
assert sort_colors(_a) is None, "returns None"
assert _a == [0, 0, 1, 1, 2, 2], "classic"
_b = []
sort_colors(_b)
assert _b == [], "empty"
_c = [1]
sort_colors(_c)
assert _c == [1], "single"
_d = [2, 2, 1, 1, 0, 0]
sort_colors(_d)
assert _d == [0, 0, 1, 1, 2, 2], "reversed"
_e = [1, 1, 1]
sort_colors(_e)
assert _e == [1, 1, 1], "all the same"
_f = [2, 0, 1]
_id = id(_f)
sort_colors(_f)
assert _f == [0, 1, 2] and id(_f) == _id, "in place"
@@hint
Keep `lo` (next slot for 0), `hi` (next slot for 2) and `i`. On 0 swap with `lo` and advance both; on 2 swap with `hi`, shrink `hi` but do **not** advance `i`; on 1 just advance `i`.
@@solution
def sort_colors(nums):
    lo, i, hi = 0, 0, len(nums) - 1
    while i <= hi:
        if nums[i] == 0:
            nums[lo], nums[i] = nums[i], nums[lo]
            lo += 1
            i += 1
        elif nums[i] == 2:
            nums[hi], nums[i] = nums[i], nums[hi]
            hi -= 1
        else:
            i += 1
````

````task
id: kth-largest
title: Kth largest element
kind: code
level: medium
@@statement
Write `kth_largest(nums, k)` using a min-heap of size `k` (`heapq`), O(n log k).

**Input**: `nums`, a list of integers (duplicates count separately); `k`, with `1 <= k <= len(nums)`. Otherwise raise `ValueError`.

**Output**: the k-th largest value in sorted order (not the k-th distinct value). The input must not be modified.

**Example**

```
kth_largest([3, 2, 1, 5, 6, 4], 2)       -> 5
kth_largest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4) -> 4
```
@@starter
import heapq

def kth_largest(nums, k):
    pass
@@tests
assert kth_largest([3, 2, 1, 5, 6, 4], 2) == 5, "classic"
assert kth_largest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4) == 4, "duplicates count"
assert kth_largest([7], 1) == 7, "single"
assert kth_largest([1, 2, 3], 3) == 1, "k equals length"
assert kth_largest([-1, -5, -3], 1) == -1, "negatives"
_d = [2, 1, 3]
kth_largest(_d, 2)
assert _d == [2, 1, 3], "input not modified"
for _bad in (0, 4):
    try:
        kth_largest([1, 2, 3], _bad)
        assert False, "invalid k must raise ValueError"
    except ValueError:
        pass
@@hint
Push each number on a heap; whenever the heap grows beyond `k` pop the smallest. The root is then the k-th largest.
@@solution
import heapq

def kth_largest(nums, k):
    if k < 1 or k > len(nums):
        raise ValueError("k out of range")
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]
````

````task
id: meeting-rooms
title: Meeting rooms II
kind: code
level: medium
@@statement
Write `min_rooms(meetings)`.

**Input**: a list of `(start, end)` tuples with `start < end`, in any order.

**Output**: the minimum number of rooms needed so no two overlapping meetings share a room. A meeting that ends at time `t` does **not** overlap with one that starts at `t`. Empty input gives `0`.

**Example**

```
min_rooms([(0, 30), (5, 10), (15, 20)]) -> 2
min_rooms([(7, 10), (2, 4)])            -> 1
```
@@starter
def min_rooms(meetings):
    pass
@@tests
assert min_rooms([(0, 30), (5, 10), (15, 20)]) == 2, "classic"
assert min_rooms([(7, 10), (2, 4)]) == 1, "no overlap"
assert min_rooms([]) == 0, "empty"
assert min_rooms([(1, 5)]) == 1, "single"
assert min_rooms([(1, 3), (3, 5)]) == 1, "touching does not overlap"
assert min_rooms([(1, 4), (2, 5), (3, 6)]) == 3, "all overlap"
_d = [(5, 6), (1, 2)]
min_rooms(_d)
assert _d == [(5, 6), (1, 2)], "input not modified"
@@hint
Sort the starts and the ends separately. Sweep through the starts; if the earliest unfinished end is `<=` the current start, reuse that room, else open a new one.
@@solution
def min_rooms(meetings):
    starts = sorted(s for s, _ in meetings)
    ends = sorted(e for _, e in meetings)
    rooms = 0
    j = 0
    for s in starts:
        if ends[j] <= s:
            j += 1
        else:
            rooms += 1
    return rooms
````

````task
id: largest-number
title: Largest number from a list
kind: code
level: hard
@@statement
Write `largest_number(nums)` that arranges the numbers so the concatenation is as large as possible. (A custom sort order: `a` goes before `b` when `str(a) + str(b) > str(b) + str(a)`. Use `functools.cmp_to_key`.)

**Input**: a list of non-negative integers.

**Output**: the result as a **string**. If all numbers are zero return `"0"`. Empty input gives `""`.

**Example**

```
largest_number([10, 2])            -> "210"
largest_number([3, 30, 34, 5, 9])  -> "9534330"
```
@@starter
from functools import cmp_to_key

def largest_number(nums):
    pass
@@tests
assert largest_number([10, 2]) == "210", "basic"
assert largest_number([3, 30, 34, 5, 9]) == "9534330", "classic"
assert largest_number([0, 0]) == "0", "all zeros"
assert largest_number([]) == "", "empty"
assert largest_number([7]) == "7", "single"
assert largest_number([121, 12]) == "12121", "prefix case"
assert largest_number([824, 8247]) == "8248247", "prefix case 2"
@@hint
Compare two strings by `(b + a) > (a + b)`: return a negative number from the comparator when `a + b` should come first.
@@solution
from functools import cmp_to_key

def largest_number(nums):
    strs = [str(n) for n in nums]
    strs.sort(key=cmp_to_key(lambda a, b: -1 if a + b > b + a else (1 if a + b < b + a else 0)))
    result = "".join(strs)
    if result and result[0] == "0":
        return "0"
    return result
````

````task
id: sort-lower-bound
title: Why comparison sorts need n log n
kind: text
level: hard
@@statement
Explain, as if to a classmate, why **no comparison-based sorting algorithm can beat O(n log n)**, and why **counting sort** (which sorts in O(n + k)) does not contradict this.

Write 8 to 12 lines. Use a concrete case: sorting **n = 3** items, and then n = 1,000 (use the fact that `log2(1000!)` is about 8,530). Include the decision-tree idea.
@@criteria
- Says a comparison sort can be seen as a binary decision tree where each comparison has two outcomes.
- States that n items have n! possible orderings, so the tree needs at least n! leaves (6 for n = 3).
- Concludes the tree height, i.e. the worst-case number of comparisons, is at least log2(n!), which is Theta(n log n); for n = 1,000 this is about 8,530 comparisons.
- Explains counting sort never compares items against each other; it uses values as array indexes.
- Mentions counting sort's limits: it needs integer keys in a small known range k, uses O(k) extra memory, so it is outside the comparison model.
@@solution
Any comparison sort only learns about the input through questions of the form "is a < b?", each with two answers. So the algorithm is a binary decision tree. With 3 items there are 3! = 6 possible orderings, and each must be a different leaf, so the tree needs at least 6 leaves and therefore height at least ceil(log2 6) = 3 comparisons in the worst case.

For n items there are n! orderings, so the worst case needs at least log2(n!) comparisons. Since log2(n!) is Theta(n log n) (Stirling), a list of 1,000 items needs at least about 8,530 comparisons, and no cleverness can go lower.

Counting sort is not a counter-example because it never compares two items. It uses each value as an index into an array of counters, which relies on the keys being integers in a small known range k. That costs O(k) extra memory and only works for such keys, so it lies outside the comparison model that the lower bound talks about.
````
