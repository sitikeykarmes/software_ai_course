---
id: dsa-complexity-arrays
title: Complexity, arrays and strings: two pointers, sliding window, prefix sums
minutes: 75
---

Data structures and algorithms is the study of how to store data so that the operations you need are fast. This lesson gives you the measuring tool, Big-O, and then the three array techniques that solve a large share of interview problems.

## Big-O: measuring growth

Big-O describes how the number of steps grows as the input size n grows. It ignores constants and small terms because at large n only the growth rate matters.

| Big-O | Name | Steps for n = 1,000 | Steps for n = 1,000,000 | Typical cause |
| --- | --- | --- | --- | --- |
| O(1) | Constant | 1 | 1 | Index into an array, dict lookup |
| O(log n) | Logarithmic | about 10 | about 20 | Halving the search range each step |
| O(n) | Linear | 1,000 | 1,000,000 | One pass over the data |
| O(n log n) | Linearithmic | about 10,000 | about 20,000,000 | Good sorting; divide and conquer |
| O(n²) | Quadratic | 1,000,000 | 1,000,000,000,000 | A loop inside a loop over the same data |
| O(2ⁿ) | Exponential | impossible | impossible | Trying every subset |
| O(n!) | Factorial | impossible | impossible | Trying every ordering |

A modern machine does very roughly 10⁸ simple operations per second in a compiled language and about 10⁷ in pure Python. So for n = 10⁵, an O(n²) solution needs 10¹⁰ steps and will time out, while O(n log n) is instant. Read the input limits in a problem; they tell you which complexity is expected.

### How to work it out

```python
def a(nums):                 # O(n): one loop
    total = 0
    for x in nums:
        total += x
    return total

def b(nums):                 # O(n^2): for each item, loop over all items
    count = 0
    for x in nums:
        for y in nums:
            if x + y == 0:
                count += 1
    return count

def c(n):                    # O(log n): n is halved each time
    steps = 0
    while n > 1:
        n //= 2
        steps += 1
    return steps

def d(nums):                 # O(n log n): sorting dominates the single pass after it
    nums = sorted(nums)
    return [nums[i + 1] - nums[i] for i in range(len(nums) - 1)]
```

Rules: sequential steps add, and you keep the largest term (O(n) + O(n²) = O(n²)). Nested steps multiply. Drop constants (O(3n) = O(n)).

**Space complexity** counts extra memory the same way. A function that builds a copy of the input uses O(n) space; one that uses a few variables uses O(1). Recursion uses stack space equal to its depth.

**Best, average, worst**: quicksort is O(n log n) on average and O(n²) in the worst case. Dict lookup is O(1) on average. Interviews usually ask for worst case unless stated.

**Amortised**: `list.append` occasionally copies the whole list to a bigger block, yet over many appends the average cost per append is O(1).

### Python operation costs worth memorising

| Operation | Cost |
| --- | --- |
| `lst[i]`, `lst.append(x)`, `lst.pop()` | O(1) |
| `lst.insert(0, x)`, `lst.pop(0)`, `x in lst`, `lst.remove(x)` | O(n) |
| `lst[a:b]` (slicing copies) | O(b - a) |
| `sorted(lst)`, `lst.sort()` | O(n log n) |
| `d[k]`, `d[k] = v`, `k in d`, `s.add(x)`, `x in s` | O(1) average |
| `deque.appendleft(x)`, `deque.popleft()` | O(1) |
| `heapq.heappush`, `heapq.heappop` | O(log n) |
| `"".join(parts)` | O(total length) |

## Arrays

An array stores items in one continuous block of memory. Item i lives at `start + i × item_size`, which is why indexing is O(1). Inserting in the middle is O(n) because everything after it must shift. A Python `list` is a dynamic array: it keeps spare capacity and grows by reallocating when full.

Real use: arrays are underneath almost everything, from image pixels and embedding vectors to database pages.

## Pattern 1: two pointers

Use two indexes that move through the array instead of a nested loop. It applies when the array is sorted, or when you compare items from both ends, or when a slow pointer writes and a fast pointer reads.

### Example: pair with a given sum in a sorted array

Brute force checks every pair, O(n²). With a sorted array, start at both ends: if the sum is too small move the left pointer right to increase it; if too big move the right pointer left.

```python run
def pair_with_sum(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        s = nums[left] + nums[right]
        print(f"  left={left}({nums[left]}) right={right}({nums[right]}) sum={s}")
        if s == target:
            return left, right
        if s < target:
            left += 1
        else:
            right -= 1
    return None

print(pair_with_sum([1, 3, 4, 6, 8, 11, 15], 14))
```

Each step discards one element forever, so it is O(n) time and O(1) space.

### Example: remove duplicates from a sorted array in place

A slow pointer marks where the next unique value goes; a fast pointer scans.

```python run
def dedupe_sorted(nums):
    if not nums:
        return 0
    write = 1
    for read in range(1, len(nums)):
        if nums[read] != nums[write - 1]:
            nums[write] = nums[read]
            write += 1
    return write

data = [1, 1, 2, 2, 2, 3, 5, 5]
k = dedupe_sorted(data)
print(data[:k])
```

### Example: is it a palindrome, ignoring punctuation?

```python run
def is_palindrome(s):
    i, j = 0, len(s) - 1
    while i < j:
        if not s[i].isalnum():
            i += 1
        elif not s[j].isalnum():
            j -= 1
        elif s[i].lower() != s[j].lower():
            return False
        else:
            i += 1; j -= 1
    return True

print(is_palindrome("A man, a plan, a canal: Panama"), is_palindrome("race a car"))
```

### Example: three numbers that sum to zero

Sort, fix one number, then run the two-pointer pair search on the rest. O(n²) instead of the O(n³) brute force.

```python run
def three_sum(nums):
    nums.sort()
    result = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue                          # skip duplicate first numbers
        left, right = i + 1, len(nums) - 1
        while left < right:
            s = nums[i] + nums[left] + nums[right]
            if s == 0:
                result.append([nums[i], nums[left], nums[right]])
                left += 1; right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1                 # skip duplicate second numbers
            elif s < 0:
                left += 1
            else:
                right -= 1
    return result

print(three_sum([-1, 0, 1, 2, -1, -4]))
```

## Pattern 2: sliding window

For questions about a contiguous run (subarray or substring): "longest", "shortest", "maximum sum of size k". Keep a window `[left, right]`, extend the right edge one step at a time, and shrink from the left when the window breaks a rule. Each element enters and leaves once, so the total is O(n).

### Fixed-size window: maximum sum of k consecutive readings

```python run
def max_window_sum(nums, k):
    window = sum(nums[:k])
    best = window
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]     # add the new item, drop the oldest
        best = max(best, window)
    return best

print(max_window_sum([2, 1, 5, 1, 3, 2, 9, 1], 3))
```

Real use: moving averages on sensor data, requests in the last 60 seconds for a rate limiter.

### Variable window: longest substring without repeating characters

```python run
def longest_unique(s):
    last_seen = {}                 # char -> last index
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last_seen and last_seen[ch] >= left:
            left = last_seen[ch] + 1          # jump past the earlier copy
        last_seen[ch] = right
        best = max(best, right - left + 1)
        print(f"  right={right} '{ch}' window='{s[left:right + 1]}' best={best}")
    return best

print(longest_unique("abcabcbb"))
```

### Variable window: shortest subarray with sum at least target

```python run
def min_subarray_len(target, nums):
    left = total = 0
    best = float("inf")
    for right, x in enumerate(nums):
        total += x
        while total >= target:                # shrink while the rule still holds
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if best == float("inf") else best

print(min_subarray_len(7, [2, 3, 1, 2, 4, 3]))
```

The template: grow right; while the window is invalid (or valid, for "shortest" problems) shrink left; update the answer.

## Pattern 3: prefix sums

Precompute running totals so that any range sum becomes one subtraction. `prefix[i]` holds the sum of the first i items, so `sum(nums[a:b]) = prefix[b] - prefix[a]`.

```python run
def build_prefix(nums):
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    return prefix

daily_output = [120, 98, 130, 110, 140, 125, 90]
p = build_prefix(daily_output)
print(p)
print("days 2..4 total:", p[5] - p[2])       # 130 + 110 + 140
```

O(n) to build, O(1) per query. Real use: analytics dashboards answering "total between two dates" instantly; image processing uses the 2D version.

### Example: count subarrays whose sum equals k

Combine prefix sums with a hash map. If the running sum is `s` now and it was `s - k` at some earlier point, the items in between sum to k.

```python run
from collections import defaultdict

def count_subarrays_with_sum(nums, k):
    seen = defaultdict(int)
    seen[0] = 1                                # an empty prefix
    running = count = 0
    for x in nums:
        running += x
        count += seen[running - k]
        seen[running] += 1
    return count

print(count_subarrays_with_sum([1, 2, 3, -2, 2, 1], 3))
```

This works with negative numbers, where a sliding window would not.

### Kadane's algorithm: maximum subarray sum

At each position, either extend the best subarray ending at the previous item or start fresh here.

```python run
def max_subarray(nums):
    best = current = nums[0]
    for x in nums[1:]:
        current = max(x, current + x)
        best = max(best, current)
    return best

print(max_subarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]))   # 4 + -1 + 2 + 1 = 6
```

Real use: the best consecutive period of profit, or the worst run of loss.

## Other array and string techniques

```python run
from collections import Counter

# Anagram check: same letters, same counts
print(Counter("listen") == Counter("silent"))

# Rotate a matrix 90 degrees clockwise: reverse the rows, then transpose
m = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
print([list(row) for row in zip(*m[::-1])])

# Merge two sorted lists in O(n + m): the heart of merge sort
def merge(a, b):
    i = j = 0
    out = []
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            out.append(a[i]); i += 1
        else:
            out.append(b[j]); j += 1
    return out + a[i:] + b[j:]
print(merge([1, 4, 9], [2, 3, 10, 12]))

# Intervals: sort by start, then merge overlaps
def merge_intervals(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
print(merge_intervals([[1, 3], [8, 10], [2, 6], [15, 18], [9, 11]]))
```

Interval merging appears in calendar apps (free and busy slots), machine downtime reports, and memory allocators.

## How to approach any problem

1. **Restate** the problem and ask about limits: size of n, value ranges, empty input, duplicates, negative numbers.
2. **Work an example by hand** and a tricky edge case.
3. **State the brute force** and its complexity. This is your baseline.
4. **Look for the pattern**: sorted input suggests two pointers or binary search; "contiguous" suggests a window or prefix sums; "seen before" suggests a hash map.
5. **Write the code**, talking through it.
6. **Trace** it on your example, then state time and space complexity.

## Check yourself

```quiz
[
  {"q": "A function sorts the list, then loops over it once. What is its time complexity?", "options": ["O(n)", "O(n log n)", "O(n²)"], "answer": 1, "why": "Sequential steps add and the larger term wins: O(n log n) + O(n)."},
  {"q": "n is up to 100,000. Which solution will pass a one-second limit?", "options": ["O(n²)", "O(n log n)", "O(2ⁿ)"], "answer": 1, "why": "n² is 10¹⁰ steps, far too slow. n log n is under 2 million."},
  {"q": "The problem asks for the longest contiguous subarray satisfying a rule, all numbers positive. Which pattern fits first?", "options": ["Sliding window", "Sorting", "Backtracking"], "answer": 0, "why": "Contiguous plus a rule that breaks as the window grows is the sliding-window signal."},
  {"q": "Why does the two-pointer pair-sum method need a sorted array?", "options": ["So that moving a pointer changes the sum in a known direction", "Because Python requires it", "To remove duplicates"], "answer": 0, "why": "Moving left up always increases the sum and moving right down decreases it, so each step can discard an element."},
  {"q": "You must answer 100,000 range-sum queries on a fixed array. Best preparation?", "options": ["Sort the array", "Build a prefix-sum array", "Use a set"], "answer": 1, "why": "Prefix sums make each query O(1) after O(n) setup."},
  {"q": "What is the cost of `lst.pop(0)` on a Python list of n items?", "options": ["O(1)", "O(log n)", "O(n)"], "answer": 2, "why": "Every remaining item shifts one place. Use `collections.deque` for queue behaviour."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**. Solve each by hand first, then code it, then state the complexity.

````task
id: two-sum-sorted
title: Two Sum on a sorted list
kind: code
level: easy
@@statement
Write `two_sum_sorted(nums, target)` using the two-pointer technique.

**Input**
- `nums`: a list of integers sorted in ascending order (may contain duplicates).
- `target`: an integer.

**Output**: a tuple `(i, j)` of **0-based** indices with `i < j` and `nums[i] + nums[j] == target`. If several pairs exist, return the one with the smallest `i`. If no pair exists (or the list has fewer than 2 items), return `None`. Target: O(n) time, O(1) extra space.

**Example**

```
two_sum_sorted([1, 2, 4, 7, 11], 9)  -> (1, 3)
two_sum_sorted([1, 2, 3], 100)       -> None
```
@@starter
def two_sum_sorted(nums, target):
    pass
@@tests
assert two_sum_sorted([1, 2, 4, 7, 11], 9) == (1, 3), "basic case"
assert two_sum_sorted([1, 2, 3], 100) is None, "no pair"
assert two_sum_sorted([], 1) is None, "empty list"
assert two_sum_sorted([5], 10) is None, "single item"
assert two_sum_sorted([3, 3], 6) == (0, 1), "duplicates"
assert two_sum_sorted([-4, -1, 0, 3, 10], 6) == (0, 4), "negative numbers"
assert two_sum_sorted([1, 2, 3, 4], 5) == (0, 3), "smallest i wins"
@@hint
Put one pointer at each end. If the sum is too small move the left one right; if too big move the right one left. With a sorted list the first pair found this way has the smallest `i`.
@@solution
def two_sum_sorted(nums, target):
    i, j = 0, len(nums) - 1
    while i < j:
        s = nums[i] + nums[j]
        if s == target:
            return (i, j)
        if s < target:
            i += 1
        else:
            j -= 1
    return None
````

````task
id: valid-palindrome
title: Valid palindrome
kind: code
level: easy
@@statement
Write `is_palindrome(s)` that checks whether a string reads the same forwards and backwards, looking only at letters and digits and ignoring case.

**Input**: a string `s` of any length.

**Output**: `True` or `False`. An empty string, or a string with no letters or digits, is a palindrome (`True`). Use two pointers, O(1) extra space (do not build a reversed copy).

**Example**

```
is_palindrome("A man, a plan, a canal: Panama") -> True
is_palindrome("race a car")                      -> False
is_palindrome("  ")                              -> True
```
@@starter
def is_palindrome(s):
    pass
@@tests
assert is_palindrome("A man, a plan, a canal: Panama") is True, "classic"
assert is_palindrome("race a car") is False, "not a palindrome"
assert is_palindrome("") is True, "empty"
assert is_palindrome(" .,! ") is True, "no alphanumerics"
assert is_palindrome("a") is True, "single char"
assert is_palindrome("0P") is False, "digit vs letter"
assert is_palindrome("No 'x' in Nixon") is True, "punctuation ignored"
@@hint
Move `i` forward while `s[i]` is not alphanumeric (`str.isalnum()`), move `j` backward likewise, then compare the lowercase characters.
@@solution
def is_palindrome(s):
    i, j = 0, len(s) - 1
    while i < j:
        while i < j and not s[i].isalnum():
            i += 1
        while i < j and not s[j].isalnum():
            j -= 1
        if s[i].lower() != s[j].lower():
            return False
        i += 1
        j -= 1
    return True
````

````task
id: container-water
title: Container with most water
kind: code
level: medium
@@statement
Write `max_area(heights)`. Each item `heights[i]` is a vertical line at x position `i`. Pick two lines; together with the x axis they form a container whose area is `min(heights[i], heights[j]) * (j - i)`.

**Input**: a list of non-negative integers.

**Output**: the largest area of any container, as an integer. Fewer than 2 lines gives `0`. Aim for O(n) with two pointers (the brute force is O(n^2)).

**Example**

```
max_area([1, 8, 6, 2, 5, 4, 8, 3, 7]) -> 49
max_area([1, 1])                      -> 1
```
@@starter
def max_area(heights):
    pass
@@tests
assert max_area([1, 8, 6, 2, 5, 4, 8, 3, 7]) == 49, "classic example"
assert max_area([1, 1]) == 1, "two lines"
assert max_area([]) == 0, "empty"
assert max_area([5]) == 0, "single line"
assert max_area([0, 0, 0]) == 0, "zero heights"
assert max_area([4, 3, 2, 1, 4]) == 16, "wide beats tall"
assert max_area(list(range(1, 2001))) == 1000000, "large input is fast enough"
@@hint
Start with the widest container (both ends). Only moving the shorter line can possibly increase the area, so always move the pointer at the shorter line inward.
@@solution
def max_area(heights):
    i, j = 0, len(heights) - 1
    best = 0
    while i < j:
        best = max(best, min(heights[i], heights[j]) * (j - i))
        if heights[i] < heights[j]:
            i += 1
        else:
            j -= 1
    return best
````

````task
id: three-sum
title: 3Sum
kind: code
level: medium
@@statement
Write `three_sum(nums)` that finds all unique triplets that add up to zero.

**Input**: a list of integers (may be empty, may have duplicates).

**Output**: a list of triplets, each a list `[a, b, c]` sorted ascending. The list of triplets itself is sorted ascending too, and contains no duplicate triplet. The input must not be modified. Aim for O(n^2).

**Example**

```
three_sum([-1, 0, 1, 2, -1, -4]) -> [[-1, -1, 2], [-1, 0, 1]]
three_sum([0, 0, 0, 0])          -> [[0, 0, 0]]
three_sum([1, 2])                -> []
```
@@starter
def three_sum(nums):
    pass
@@tests
assert three_sum([-1, 0, 1, 2, -1, -4]) == [[-1, -1, 2], [-1, 0, 1]], "classic"
assert three_sum([0, 0, 0, 0]) == [[0, 0, 0]], "duplicates collapse"
assert three_sum([1, 2]) == [], "too short"
assert three_sum([]) == [], "empty"
assert three_sum([1, 2, 3]) == [], "no zero sum"
_d = [3, -1, -2, 0]
three_sum(_d)
assert _d == [3, -1, -2, 0], "input not modified"
assert three_sum([-2, 0, 1, 1, 2]) == [[-2, 0, 2], [-2, 1, 1]], "two answers"
@@hint
Sort a copy. For each index `i` (skipping repeated values) run a two-pointer search on the rest for `-nums[i]`, skipping repeated values after each hit.
@@solution
def three_sum(nums):
    a = sorted(nums)
    out = []
    n = len(a)
    for i in range(n - 2):
        if i > 0 and a[i] == a[i - 1]:
            continue
        lo, hi = i + 1, n - 1
        while lo < hi:
            s = a[i] + a[lo] + a[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                out.append([a[i], a[lo], a[hi]])
                lo += 1
                hi -= 1
                while lo < hi and a[lo] == a[lo - 1]:
                    lo += 1
                while lo < hi and a[hi] == a[hi + 1]:
                    hi -= 1
    return out
````

````task
id: best-stock-profit
title: Best time to buy and sell once
kind: code
level: easy
@@statement
Write `max_profit(prices)`. `prices[i]` is the price on day `i`. You may buy once and sell once on a later day.

**Input**: a list of non-negative numbers.

**Output**: the maximum profit. If no profitable trade exists (or fewer than 2 days), return `0`. One pass, O(n) time, O(1) space.

**Example**

```
max_profit([7, 1, 5, 3, 6, 4]) -> 5     (buy at 1, sell at 6)
max_profit([7, 6, 4, 3, 1])    -> 0
```
@@starter
def max_profit(prices):
    pass
@@tests
assert max_profit([7, 1, 5, 3, 6, 4]) == 5, "classic"
assert max_profit([7, 6, 4, 3, 1]) == 0, "always falling"
assert max_profit([]) == 0, "empty"
assert max_profit([5]) == 0, "one day"
assert max_profit([2, 4, 1]) == 2, "low comes after the peak"
assert max_profit([3, 3, 3]) == 0, "flat"
@@hint
Track the lowest price seen so far; at each day the best profit ending today is `price - lowest_so_far`.
@@solution
def max_profit(prices):
    best = 0
    low = None
    for p in prices:
        if low is None or p < low:
            low = p
        elif p - low > best:
            best = p - low
    return best
````

````task
id: longest-unique-substring
title: Longest substring without repeats
kind: code
level: medium
@@statement
Write `longest_unique(s)` using a sliding window.

**Input**: a string `s` (may be empty).

**Output**: the **length** (int) of the longest substring that has no repeated character. Empty string gives `0`. O(n) time.

**Example**

```
longest_unique("abcabcbb") -> 3     ("abc")
longest_unique("bbbbb")    -> 1
longest_unique("pwwkew")   -> 3     ("wke")
```
@@starter
def longest_unique(s):
    pass
@@tests
assert longest_unique("abcabcbb") == 3, "classic"
assert longest_unique("bbbbb") == 1, "all same"
assert longest_unique("pwwkew") == 3, "window moves"
assert longest_unique("") == 0, "empty"
assert longest_unique("abcdef") == 6, "all unique"
assert longest_unique("abba") == 2, "stale index must not move the window back"
assert longest_unique("dvdf") == 3, "vdf"
@@hint
Keep a dict `char -> last index`. When you see a char whose last index is inside the window, move the window start to `last + 1` (never backwards).
@@solution
def longest_unique(s):
    last = {}
    start = 0
    best = 0
    for i, ch in enumerate(s):
        if ch in last and last[ch] >= start:
            start = last[ch] + 1
        last[ch] = i
        best = max(best, i - start + 1)
    return best
````

````task
id: subarray-sum-k
title: Subarray sum equals K
kind: code
level: medium
@@statement
Write `count_subarrays(nums, k)` using prefix sums and a hash map.

**Input**: `nums`, a list of integers (negatives allowed, may be empty); `k`, an integer.

**Output**: the number of **contiguous, non-empty** subarrays whose sum equals `k`. O(n) time.

**Example**

```
count_subarrays([1, 1, 1], 2)        -> 2
count_subarrays([1, 2, 3], 3)        -> 2     ([1, 2] and [3])
count_subarrays([1, -1, 0], 0)       -> 3
```
@@starter
def count_subarrays(nums, k):
    pass
@@tests
assert count_subarrays([1, 1, 1], 2) == 2, "classic"
assert count_subarrays([1, 2, 3], 3) == 2, "two ways"
assert count_subarrays([1, -1, 0], 0) == 3, "negatives and zero"
assert count_subarrays([], 0) == 0, "empty"
assert count_subarrays([5], 5) == 1, "single item"
assert count_subarrays([0, 0, 0], 0) == 6, "all zeros"
assert count_subarrays([1, 2], 10) == 0, "none"
@@hint
Keep a `Counter` of prefix sums seen so far, starting with `{0: 1}`. At each step add `counts[prefix - k]` to the answer.
@@solution
from collections import defaultdict

def count_subarrays(nums, k):
    seen = defaultdict(int)
    seen[0] = 1
    prefix = 0
    total = 0
    for x in nums:
        prefix += x
        total += seen[prefix - k]
        seen[prefix] += 1
    return total
````

````task
id: product-except-self
title: Product of array except self
kind: code
level: medium
@@statement
Write `product_except_self(nums)` **without using division**.

**Input**: a list of integers (may contain zeros).

**Output**: a new list `out` where `out[i]` is the product of every item except `nums[i]`. Empty input gives `[]`; a single item gives `[1]`. The input must not be modified. O(n) time.

**Example**

```
product_except_self([1, 2, 3, 4]) -> [24, 12, 8, 6]
product_except_self([0, 2, 3])    -> [6, 0, 0]
```
@@starter
def product_except_self(nums):
    pass
@@tests
assert product_except_self([1, 2, 3, 4]) == [24, 12, 8, 6], "classic"
assert product_except_self([0, 2, 3]) == [6, 0, 0], "one zero"
assert product_except_self([0, 0, 3]) == [0, 0, 0], "two zeros"
assert product_except_self([]) == [], "empty"
assert product_except_self([7]) == [1], "single"
_d = [2, 3]
product_except_self(_d)
assert _d == [2, 3], "input not modified"
assert product_except_self([-1, 2]) == [2, -1], "negatives"
@@hint
Make one pass left to right storing the product of everything to the left of `i`, then a second pass right to left multiplying by the product of everything to the right.
@@solution
def product_except_self(nums):
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    return out
````

````task
id: merge-intervals
title: Merge intervals
kind: code
level: medium
@@statement
Write `merge_intervals(intervals)`.

**Input**: a list of `[start, end]` pairs with `start <= end`, in any order.

**Output**: a new sorted list of `[start, end]` lists where all overlapping intervals are merged. Intervals that only **touch** (`[1, 2]` and `[2, 3]`) count as overlapping. Empty input gives `[]`. The input must not be modified.

**Example**

```
merge_intervals([[1, 3], [8, 10], [2, 6]]) -> [[1, 6], [8, 10]]
merge_intervals([[1, 4], [4, 5]])          -> [[1, 5]]
```
@@starter
def merge_intervals(intervals):
    pass
@@tests
assert merge_intervals([[1, 3], [8, 10], [2, 6]]) == [[1, 6], [8, 10]], "classic"
assert merge_intervals([[1, 4], [4, 5]]) == [[1, 5]], "touching merges"
assert merge_intervals([]) == [], "empty"
assert merge_intervals([[5, 6]]) == [[5, 6]], "single"
assert merge_intervals([[1, 10], [2, 3], [4, 5]]) == [[1, 10]], "contained intervals"
_d = [[3, 4], [1, 2]]
merge_intervals(_d)
assert _d == [[3, 4], [1, 2]], "input not modified"
assert merge_intervals([[1, 2], [3, 4]]) == [[1, 2], [3, 4]], "disjoint"
@@hint
Sort by start. Compare each interval's start with the end of the last merged one; extend that end with `max` or append a new interval.
@@solution
def merge_intervals(intervals):
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out
````

````task
id: brute-vs-optimal
title: Compare brute force and optimal
kind: text
level: medium
@@statement
Take **Two Sum** (find two indices whose values add up to a target) on an unsorted list of **n = 5,000** integers.

Write 8 to 12 lines that contain:
1. The brute-force approach in two sentences, with its time and space complexity.
2. The hash-map approach in two sentences, with its time and space complexity.
3. A small table with rows "brute force" and "hash map", and columns for the approximate number of basic steps at n = 5,000 (use real arithmetic, for example n squared) and the trade-off paid.
4. One sentence on which you would choose when memory is very tight, and why.
@@criteria
- Brute force: checks every pair, O(n^2) time and O(1) extra space.
- Hash map: one pass storing value to index and looking up `target - x`, O(n) time and O(n) space.
- Table uses real numbers: about 25,000,000 (or 12.5 million pairs) steps versus about 5,000 steps.
- Names the trade-off: the hash map spends memory to save time.
- Gives a reasoned choice for tight memory, such as sorting plus two pointers or brute force for tiny n.
@@solution
Brute force tries every pair (i, j) and checks whether the sum equals the target: O(n^2) time and O(1) extra space. The hash-map version scans once, storing each value's index in a dict and looking up `target - x` before inserting: O(n) time and O(n) space.

| approach | steps at n = 5,000 | trade-off |
|---|---|---|
| brute force | about 12.5 million pairs (n^2 / 2) | no extra memory, very slow as n grows |
| hash map | about 5,000 lookups | uses O(n) extra memory |

When memory is very tight I would sort a copy (or the data, if allowed to reorder it) and use two pointers, giving O(n log n) time with O(1) extra space; for tiny n, brute force is fine.
````
