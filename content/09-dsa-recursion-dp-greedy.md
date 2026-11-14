---
id: dsa-recursion-dp-greedy
title: Recursion, backtracking, dynamic programming, greedy and bit tricks
minutes: 80
---

These techniques handle problems where you must explore choices: every subset, every arrangement, the best way to make change. Recursion tries choices; backtracking undoes them; dynamic programming remembers answers so no subproblem is solved twice; greedy skips the exploration when the locally best choice is provably enough.

## Recursion

A recursive function solves a problem by calling itself on a smaller version. It needs a **base case** that stops, and a **recursive case** that moves toward the base case.

```python run
def factorial(n):
    if n <= 1:                      # base case
        return 1
    return n * factorial(n - 1)     # smaller problem

def power(base, exp):               # fast exponentiation: O(log exp)
    if exp == 0:
        return 1
    half = power(base, exp // 2)
    return half * half * (base if exp % 2 else 1)

def flatten(nested):                # recursion fits nested data
    out = []
    for item in nested:
        out.extend(flatten(item) if isinstance(item, list) else [item])
    return out

print(factorial(5), power(2, 30), flatten([1, [2, [3, 4]], [[5]]]))
```

Each call adds a frame to the call stack, so recursion depth costs memory, and Python stops at about 1,000 frames by default. Deep recursion can be rewritten as a loop with an explicit stack.

Think of recursion as trust: assume the function already works for smaller input, then use it.

## Backtracking

Backtracking builds a solution one choice at a time. If a partial solution cannot lead anywhere, it undoes the last choice and tries the next. The template never changes:

```python
def backtrack(state):
    if is_complete(state):
        record(state)
        return
    for choice in choices(state):
        if valid(choice, state):
            apply(choice, state)
            backtrack(state)
            undo(choice, state)       # the backtrack step
```

### Subsets, permutations, combinations

```python run
def subsets(nums):
    out, path = [], []
    def go(i):
        if i == len(nums):
            out.append(path[:])              # copy: path keeps changing
            return
        path.append(nums[i]); go(i + 1)      # include nums[i]
        path.pop();           go(i + 1)      # exclude nums[i]
    go(0)
    return out

def permutations(nums):
    out, path, used = [], [], [False] * len(nums)
    def go():
        if len(path) == len(nums):
            out.append(path[:]); return
        for i, x in enumerate(nums):
            if not used[i]:
                used[i] = True; path.append(x)
                go()
                path.pop(); used[i] = False
    go()
    return out

def combinations_summing_to(candidates, target):
    out, path = [], []
    def go(start, remaining):
        if remaining == 0:
            out.append(path[:]); return
        for i in range(start, len(candidates)):
            if candidates[i] <= remaining:           # prune: skip choices that overshoot
                path.append(candidates[i])
                go(i, remaining - candidates[i])     # i, not i + 1: reuse allowed
                path.pop()
    go(0, target)
    return out

print(subsets([1, 2, 3]))
print(permutations([1, 2, 3]))
print(combinations_summing_to([2, 3, 5], 8))
```

n items have 2ⁿ subsets and n! permutations, so backtracking is only practical for small n, roughly up to 20 for subsets and 10 for permutations. **Pruning**, cutting branches early, is what makes it usable.

### N-Queens

Place n queens on an n × n board so none attacks another. Go row by row; track which columns and diagonals are taken.

```python run
def solve_queens(n):
    cols, diag1, diag2, placed, solutions = set(), set(), set(), [], []
    def place(row):
        if row == n:
            solutions.append(placed[:]); return
        for c in range(n):
            if c in cols or (row - c) in diag1 or (row + c) in diag2:
                continue
            cols.add(c); diag1.add(row - c); diag2.add(row + c); placed.append(c)
            place(row + 1)
            cols.remove(c); diag1.remove(row - c); diag2.remove(row + c); placed.pop()
    place(0)
    return solutions

sols = solve_queens(6)
print(len(sols), "solutions; first:", sols[0])
for c in sols[0]:
    print(". " * c + "Q " + ". " * (6 - c - 1))
```

Real use: Sudoku solvers, timetable and shift scheduling, configuration search, puzzle games, constraint solvers.

## Dynamic programming

Dynamic programming (DP) applies when a problem has two properties:

- **Overlapping subproblems**: the same smaller question is asked many times.
- **Optimal substructure**: the best answer is built from best answers to smaller questions.

The method is to solve each subproblem once and store the result.

### From slow recursion to DP

```python run
import time
from functools import lru_cache

def fib_slow(n):                       # O(2^n): recomputes the same values endlessly
    return n if n < 2 else fib_slow(n - 1) + fib_slow(n - 2)

@lru_cache(maxsize=None)
def fib_memo(n):                       # top-down: recursion + cache, O(n)
    return n if n < 2 else fib_memo(n - 1) + fib_memo(n - 2)

def fib_table(n):                      # bottom-up: fill a table from small to large, O(n)
    if n < 2:
        return n
    prev, cur = 0, 1
    for _ in range(n - 1):
        prev, cur = cur, prev + cur    # only the last two values are needed: O(1) space
    return cur

t = time.perf_counter(); fib_slow(27); print(f"slow:  {time.perf_counter() - t:.2f}s")
t = time.perf_counter(); fib_memo(300); print(f"memo:  {time.perf_counter() - t:.5f}s")
print(fib_table(90))
```

### The five-step recipe

1. **Define the state**: what does `dp[i]` (or `dp[i][j]`) mean, in one sentence?
2. **Write the recurrence**: how does a state depend on smaller states?
3. **Set the base cases.**
4. **Choose the order** so that every state is computed after the ones it needs.
5. **Read off the answer**, then see whether you can reduce memory.

### One-dimensional DP

**Climbing stairs.** You climb 1 or 2 steps at a time. `ways[i] = ways[i-1] + ways[i-2]`.

**House robber.** Maximum money without robbing two adjacent houses. At each house: skip it, or rob it and add the best up to two houses back.

**Coin change.** Fewest coins to make an amount. `dp[a]` = fewest coins for amount a = 1 + the smallest `dp[a - coin]`.

```python run
def climb(n):
    a, b = 1, 1
    for _ in range(n):
        a, b = b, a + b
    return a

def rob(houses):
    prev2 = prev1 = 0                       # best up to two back, best up to one back
    for money in houses:
        prev2, prev1 = prev1, max(prev1, prev2 + money)
    return prev1

def coin_change(coins, amount):
    INF = float("inf")
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return dp[amount] if dp[amount] != INF else -1

print(climb(10), rob([2, 7, 9, 3, 1]), coin_change([1, 5, 10, 25], 63), coin_change([2], 3))
print("greedy fails here:", coin_change([1, 3, 4], 6), "coins (3+3), greedy would take 4+1+1")
```

**Longest increasing subsequence.** `dp[i]` = length of the longest increasing subsequence ending at index i. O(n²) simply; O(n log n) with binary search.

```python run
import bisect

def lis_quadratic(nums):
    dp = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp, default=0)

def lis_fast(nums):
    tails = []                         # tails[k] = smallest tail of an increasing run of length k + 1
    for x in nums:
        i = bisect.bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return len(tails)

data = [10, 9, 2, 5, 3, 7, 101, 18]
print(lis_quadratic(data), lis_fast(data))
```

**Word break.** Can a string be split into dictionary words? `dp[i]` is true if the first i characters can be split.

```python run
def word_break(s, words):
    words = set(words)
    dp = [True] + [False] * len(s)
    for i in range(1, len(s) + 1):
        dp[i] = any(dp[j] and s[j:i] in words for j in range(i))
    return dp[len(s)]

print(word_break("pineapplepen", ["apple", "pen", "pine", "pineapple"]), word_break("catsandog", ["cats", "dog", "sand", "and", "cat"]))
```

### Two-dimensional DP

**Unique paths in a grid**, moving only right or down: `paths[r][c] = paths[r-1][c] + paths[r][c-1]`.

**0/1 knapsack.** Items have weight and value; maximise value within a weight limit, each item used at most once. `dp[w]` = best value with capacity w. Loop capacity downward so each item is used once.

**Longest common subsequence (LCS).** `dp[i][j]` = LCS length of the first i characters of a and first j of b. If the characters match, extend the diagonal; otherwise take the better of dropping one character from either string.

**Edit distance.** Fewest inserts, deletes and replacements to turn one string into another.

```python run
def unique_paths(rows, cols):
    row = [1] * cols
    for _ in range(rows - 1):
        for c in range(1, cols):
            row[c] += row[c - 1]
    return row[-1]

def knapsack(items, capacity):
    dp = [0] * (capacity + 1)
    for weight, value in items:
        for w in range(capacity, weight - 1, -1):      # downward: each item at most once
            dp[w] = max(dp[w], dp[w - weight] + value)
    return dp[capacity]

def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[-1][-1]

def edit_distance(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        dp[i][0] = i
    for j in range(len(b) + 1):
        dp[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])   # delete, insert, replace
    return dp[-1][-1]

print(unique_paths(3, 7), knapsack([(1, 1), (3, 4), (4, 5), (5, 7)], 7), lcs("ABCBDAB", "BDCABA"), edit_distance("kitten", "sitting"))
```

Real use of these: `diff` and Git compare files with LCS; spell checkers and DNA alignment use edit distance; knapsack models budget allocation and cargo loading; cutting stock and production planning are DP problems.

### DP families

| Family | State | Examples |
| --- | --- | --- |
| Linear | `dp[i]` over a sequence | Climbing stairs, house robber, max subarray, decode ways |
| Knapsack | `dp[capacity]` or `dp[i][capacity]` | Coin change, subset sum, partition equal subset sum |
| Two sequences | `dp[i][j]` over two strings | LCS, edit distance, regex matching |
| Grid | `dp[r][c]` | Unique paths, minimum path sum |
| Interval | `dp[i][j]` over a range | Palindrome partitioning, burst balloons |
| Subsequence | `dp[i]` ending at i | Longest increasing subsequence |
| State machine | `dp[i][state]` | Buy and sell stock with cooldown |

## Greedy algorithms

A greedy algorithm makes the best-looking choice at each step and never reconsiders. It is fast and simple, and correct only when the problem has the right structure. Always check with a counter-example: coin change with coins 1, 3, 4 and amount 6 breaks greedy, as shown above.

### Interval scheduling: most meetings in one room

Always take the meeting that ends earliest; it leaves the most room for the rest.

```python run
def max_meetings(meetings):
    count, free_at = 0, float("-inf")
    for start, end in sorted(meetings, key=lambda m: m[1]):    # sort by end time
        if start >= free_at:
            count += 1
            free_at = end
    return count

print(max_meetings([(1, 4), (3, 5), (0, 6), (5, 7), (3, 9), (5, 9), (6, 10), (8, 11)]))
```

### Jump game: can you reach the end?

Track the farthest index reachable so far.

```python run
def can_reach_end(jumps):
    farthest = 0
    for i, j in enumerate(jumps):
        if i > farthest:
            return False
        farthest = max(farthest, i + j)
    return True

print(can_reach_end([2, 3, 1, 1, 4]), can_reach_end([3, 2, 1, 0, 4]))
```

Other greedy algorithms you have already met: Dijkstra, Kruskal, and Huffman coding (the compression inside ZIP and JPEG, which repeatedly merges the two least frequent symbols).

## Bit manipulation

Integers are stored in binary, and bit operations are single CPU instructions.

| Operation | Meaning | Example |
| --- | --- | --- |
| `a & b` | AND: bit set in both | `6 & 3 = 2` |
| `a \| b` | OR: bit set in either | `6 \| 3 = 7` |
| `a ^ b` | XOR: bit set in exactly one | `6 ^ 3 = 5` |
| `a << k`, `a >> k` | Shift left (multiply by 2ᵏ), shift right (divide) | `1 << 4 = 16` |
| `x & (x - 1)` | Clears the lowest set bit | Count bits, test power of two |

```python run
def single_number(nums):               # every number appears twice except one
    result = 0
    for x in nums:
        result ^= x                    # pairs cancel: x ^ x = 0
    return result

def is_power_of_two(x):
    return x > 0 and x & (x - 1) == 0

def count_bits(x):
    n = 0
    while x:
        x &= x - 1
        n += 1
    return n

READ, WRITE, ADMIN = 1, 2, 4           # permissions packed into one integer
perms = READ | WRITE
print(single_number([4, 1, 2, 1, 2]), is_power_of_two(64), count_bits(255))
print(bool(perms & WRITE), bool(perms & ADMIN), bin(perms | ADMIN))
```

Real use: permission flags (Unix file modes), feature flags, Bloom filters, network subnet masks, compact sets of small integers.

## Recognising which technique applies

| Signal in the problem | Technique |
| --- | --- |
| "All subsets", "all permutations", "all valid arrangements", small n | Backtracking |
| "How many ways", "minimum cost", "maximum value", choices that overlap | Dynamic programming |
| "Maximum number of non-overlapping…", sort then pick | Greedy (prove it or find a counter-example) |
| "Can it be split or partitioned" | DP, sometimes backtracking with memoisation |
| "Appears twice except one", flags, powers of two | Bit manipulation |

## Check yourself

```quiz
[
  {"q": "What two properties make a problem suitable for dynamic programming?", "options": ["Sorted input and small n", "Overlapping subproblems and optimal substructure", "A graph and weights"], "answer": 1, "why": "Overlap makes caching pay off; optimal substructure lets you build answers from sub-answers."},
  {"q": "Memoised Fibonacci is O(n). Why is the naive recursion O(2ⁿ)?", "options": ["It uses more memory", "It recomputes the same subproblems an exponential number of times", "Python is slow"], "answer": 1, "why": "fib(n-2) is computed inside both fib(n) and fib(n-1), and so on down."},
  {"q": "In backtracking, what is the purpose of `path.pop()` after the recursive call?", "options": ["To save memory", "To undo the choice so the next option starts from a clean state", "To sort the result"], "answer": 1, "why": "The same `path` list is shared across the whole search."},
  {"q": "Coins are 1, 3, 4 and the amount is 6. What goes wrong with greedy (always take the largest coin)?", "options": ["It loops forever", "It uses 3 coins (4+1+1) when 2 coins (3+3) suffice", "Nothing"], "answer": 1, "why": "Greedy is only optimal for certain coin systems; DP is safe for any."},
  {"q": "In the 0/1 knapsack with a 1D array, why loop capacity from high to low?", "options": ["It is faster", "So each item is counted at most once", "To avoid negative indexes"], "answer": 1, "why": "Looping upward would let `dp[w - weight]` already include the current item."},
  {"q": "What does `x & (x - 1) == 0` test for a positive x?", "options": ["x is even", "x is a power of two", "x is prime"], "answer": 1, "why": "A power of two has one set bit; clearing it leaves zero."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: subsets
title: All subsets (backtracking)
kind: code
level: easy
@@statement
Write a function `subsets(nums)` that returns every subset of `nums` using backtracking (choose / explore / un-choose).

**Input**: `nums`, a list of distinct ints (0 to 10 items).

**Output**: a list of lists. It contains every subset exactly once, including the empty subset `[]` and `nums` itself. Inside each subset keep the order of `nums`. The order of the subsets does not matter. Do not change `nums`.

**Example**

```
subsets([1, 2])  ->  [[], [1], [2], [1, 2]]   (any order)
subsets([])      ->  [[]]
```
@@starter
def subsets(nums):
    # TODO: for each element decide "skip it" or "take it", recurse, then undo the choice
    pass

print(subsets([1, 2]))
@@tests
assert sorted(subsets([])) == [[]], "empty input has one subset"
assert sorted(subsets([1])) == [[], [1]], "single item"
assert sorted(subsets([1, 2, 3])) == [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]], "three items"
assert len(subsets(list(range(10)))) == 1024, "2**10 subsets"
_n = [3, 1, 2]
_r = subsets(_n)
assert _n == [3, 1, 2], "input not changed"
assert [3, 1] in _r and [1, 3] not in _r, "order of nums is kept inside a subset"
@@hint
Use a helper `go(i, current)`. At `i == len(nums)` save a COPY of `current` (`current[:]`). Otherwise call `go(i + 1, current)` without the item, then append, recurse, and `pop()`.
@@solution
def subsets(nums):
    result = []

    def go(i, current):
        if i == len(nums):
            result.append(current[:])
            return
        go(i + 1, current)
        current.append(nums[i])
        go(i + 1, current)
        current.pop()

    go(0, [])
    return result
````

````task
id: generate-parentheses
title: Generate parentheses
kind: code
level: medium
@@statement
Write a function `generate_parentheses(n)` that returns all well-formed strings made of `n` pairs of parentheses.

**Input**: `n`, an int from `0` to `8`.

**Output**: a list of strings, **sorted alphabetically** (`(` sorts before `)`). A string is well-formed if every `)` closes an earlier `(`. `n = 0` gives `[""]`.

**Example**

```
generate_parentheses(1)  ->  ["()"]
generate_parentheses(2)  ->  ["(())", "()()"]
```
@@starter
def generate_parentheses(n):
    # TODO: backtrack; add "(" while opens < n, add ")" while closes < opens
    pass

print(generate_parentheses(2))
@@tests
assert generate_parentheses(0) == [""], "n = 0"
assert generate_parentheses(1) == ["()"], "n = 1"
assert generate_parentheses(2) == ["(())", "()()"], "n = 2"
assert generate_parentheses(3) == ["((()))", "(()())", "(())()", "()(())", "()()()"], "n = 3"
assert len(generate_parentheses(4)) == 14 and len(generate_parentheses(6)) == 132, "Catalan counts"
assert generate_parentheses(5) == sorted(generate_parentheses(5)), "result is sorted"
@@hint
Track how many `(` and `)` you have used. You may add `(` if fewer than `n` are used, and `)` only if it would not exceed the number of `(`.
@@solution
def generate_parentheses(n):
    result = []

    def go(current, opens, closes):
        if len(current) == 2 * n:
            result.append("".join(current))
            return
        if opens < n:
            current.append("(")
            go(current, opens + 1, closes)
            current.pop()
        if closes < opens:
            current.append(")")
            go(current, opens, closes + 1)
            current.pop()

    go([], 0, 0)
    return sorted(result)
````

````task
id: coin-change
title: Coin change (DP)
kind: code
level: medium
@@statement
Write a function `coin_change(coins, amount)` that returns the fewest coins needed to make `amount`.

**Input**
- `coins`: a list of distinct positive ints (each coin can be used any number of times). May be empty.
- `amount`: an int `>= 0`, at most 10000.

**Output**: an `int`, the minimum number of coins. Return `0` if `amount` is `0`, and `-1` if the amount cannot be made.

**Example**

```
coin_change([1, 2, 5], 11)  ->  3     (5 + 5 + 1)
coin_change([2], 3)         ->  -1
```
@@starter
def coin_change(coins, amount):
    # TODO: best[a] = fewest coins for amount a; best[a] = 1 + min(best[a - c]) over coins c
    pass

print(coin_change([1, 2, 5], 11))
@@tests
assert coin_change([1, 2, 5], 11) == 3, "basic"
assert coin_change([2], 3) == -1, "impossible"
assert coin_change([1], 0) == 0, "amount zero"
assert coin_change([1, 3, 4], 6) == 2, "greedy would fail (4+1+1)"
assert coin_change([186, 419, 83, 408], 6249) == 20, "larger input"
assert coin_change([], 5) == -1, "no coins"
assert coin_change([5], 5) == 1, "single coin"
@@hint
State: `best[a]` for every amount `a` from 0 to `amount`. Base case: `best[0] = 0`. Start the other cells at infinity and skip coins bigger than `a`.
@@solution
def coin_change(coins, amount):
    inf = amount + 1
    best = [0] + [inf] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    return best[amount] if best[amount] != inf else -1
````

````task
id: edit-distance
title: Edit distance
kind: code
level: hard
@@statement
Write a function `edit_distance(a, b)` that returns the minimum number of single-character edits needed to turn `a` into `b`.

**Input**: two strings `a` and `b` (length up to 200, may be empty).

**Output**: an `int`. One edit is an insert, a delete or a replace of one character.

**Example**

```
edit_distance("horse", "ros")  ->  3     (horse -> rorse -> rose -> ros)
edit_distance("", "abc")        ->  3
```
@@starter
def edit_distance(a, b):
    # TODO: dp[i][j] = edit distance between a[:i] and b[:j]
    pass

print(edit_distance("horse", "ros"))
@@tests
assert edit_distance("horse", "ros") == 3, "horse -> ros"
assert edit_distance("intention", "execution") == 5, "intention -> execution"
assert edit_distance("", "abc") == 3, "empty to word"
assert edit_distance("abc", "") == 3, "word to empty"
assert edit_distance("", "") == 0, "both empty"
assert edit_distance("abc", "abc") == 0, "same string"
assert edit_distance("kitten", "sitting") == 3, "kitten -> sitting"
assert edit_distance("a" * 100, "b" * 100) == 100, "all replaces"
@@hint
Base cases: `dp[i][0] = i` and `dp[0][j] = j`. If `a[i-1] == b[j-1]` copy `dp[i-1][j-1]`, otherwise it is `1 + min(` insert, delete, replace `)`.
@@solution
def edit_distance(a, b):
    m, n = len(a), len(b)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]
````

````task
id: jump-game
title: Jump game (greedy)
kind: code
level: medium
@@statement
You stand at index 0 of a list. `nums[i]` is the maximum number of steps you can jump forward from index `i`. Write two functions.

1. `can_jump(nums)`: return `True` if you can reach the last index, otherwise `False`.
2. `min_jumps(nums)`: return the minimum number of jumps needed to reach the last index, or `-1` if it is impossible.

**Input**: `nums`, a non-empty list of ints `>= 0`.

**Output**: `bool` for `can_jump`, `int` for `min_jumps`. A list with one item needs `0` jumps. Do not change `nums`. Aim for a single pass, no DP table.

**Example**

```
can_jump([2, 3, 1, 1, 4])   ->  True
can_jump([3, 2, 1, 0, 4])   ->  False
min_jumps([2, 3, 1, 1, 4])  ->  2      (0 -> 1 -> 4)
```
@@starter
def can_jump(nums):
    # TODO: track the farthest index you can reach so far
    pass

def min_jumps(nums):
    # TODO: track the end of the current jump and the farthest reach; count a jump when you pass the end
    pass

print(can_jump([2, 3, 1, 1, 4]), min_jumps([2, 3, 1, 1, 4]))
@@tests
assert can_jump([2, 3, 1, 1, 4]) is True, "reachable"
assert can_jump([3, 2, 1, 0, 4]) is False, "stuck at the zero"
assert can_jump([0]) is True, "already at the end"
assert can_jump([0, 1]) is False, "cannot move"
assert min_jumps([2, 3, 1, 1, 4]) == 2, "two jumps"
assert min_jumps([2, 3, 0, 1, 4]) == 2, "zero in the middle"
assert min_jumps([0]) == 0, "single item"
assert min_jumps([1, 1, 1, 1]) == 3, "one step at a time"
assert min_jumps([1, 0, 1]) == -1, "impossible"
_n = [2, 3, 1, 1, 4]
can_jump(_n)
min_jumps(_n)
assert _n == [2, 3, 1, 1, 4], "input not changed"
@@hint
For `can_jump`, if the index `i` you are looking at is greater than the farthest reach, you are stuck. For `min_jumps`, think of jumps as BFS levels: every index up to `end` costs the same number of jumps.
@@solution
def can_jump(nums):
    reach = 0
    for i, step in enumerate(nums):
        if i > reach:
            return False
        reach = max(reach, i + step)
    return True

def min_jumps(nums):
    n = len(nums)
    if n <= 1:
        return 0
    jumps = 0
    end = 0
    far = 0
    for i in range(n - 1):
        far = max(far, i + nums[i])
        if i == end:
            if far <= i:
                return -1
            jumps += 1
            end = far
            if end >= n - 1:
                break
    return jumps if end >= n - 1 else -1
````

````task
id: bit-tricks
title: Bit manipulation warm-up
kind: code
level: easy
@@statement
Write two functions using bit operations.

1. `single_number(nums)`: every number in `nums` appears twice except one. Return the one that appears once. Use `O(1)` extra memory (hint: XOR).
2. `count_bits(n)`: return a list `ans` of length `n + 1` where `ans[i]` is the number of `1` bits in the binary form of `i`. Build it with the recurrence `ans[i] = ans[i >> 1] + (i & 1)`.

**Input**: `nums` is a non-empty list of ints (may be negative); `n` is an int `>= 0`.

**Output**: an `int` for `single_number`, a list of ints for `count_bits`.

**Example**

```
single_number([4, 1, 2, 1, 2])  ->  4
count_bits(5)                   ->  [0, 1, 1, 2, 1, 2]
```
@@starter
def single_number(nums):
    pass

def count_bits(n):
    pass

print(single_number([4, 1, 2, 1, 2]), count_bits(5))
@@tests
assert single_number([2, 2, 1]) == 1, "basic"
assert single_number([4, 1, 2, 1, 2]) == 4, "single at the front"
assert single_number([7]) == 7, "one element"
assert single_number([-1, -1, -3]) == -3, "negative numbers"
assert count_bits(0) == [0], "n = 0"
assert count_bits(5) == [0, 1, 1, 2, 1, 2], "n = 5"
assert count_bits(8)[-1] == 1 and count_bits(7)[-1] == 3, "powers of two"
assert count_bits(100) == [bin(i).count("1") for i in range(101)], "matches bin().count"
@@hint
`x ^ x == 0` and `x ^ 0 == x`, so XOR-ing the whole list cancels the pairs. For `count_bits`, `i >> 1` is `i` without its last bit, which you already computed.
@@solution
def single_number(nums):
    result = 0
    for x in nums:
        result ^= x
    return result

def count_bits(n):
    ans = [0] * (n + 1)
    for i in range(1, n + 1):
        ans[i] = ans[i >> 1] + (i & 1)
    return ans
````

````task
id: dp-explain-house-robber
title: Explain a DP problem two ways
kind: text
level: medium
@@statement
**Problem (House Robber).** A street has houses with cash amounts `nums`. You may not rob two neighbouring houses. Example: `nums = [2, 7, 9, 3, 1]` has best total `12` (houses with 2, 9 and 1).

Write an answer of **10-20 lines** that contains:

1. The **state** in one sentence (what does `dp[i]` or `f(i)` mean?).
2. The **recurrence** in words and as a formula.
3. The **base cases** (empty list, one house).
4. The **top-down** version: pseudocode or Python of about 6 lines with memoization.
5. The **bottom-up** version: about 6 lines, then say how to reduce memory to `O(1)`.
6. A small table that traces your method on `[2, 7, 9, 3, 1]` and ends with `12`.
7. Time and space complexity of each version.
@@hint
For house `i` decide only two things: skip it (keep the best of `i-1`) or rob it (its cash plus the best of `i-2`).
@@solution
State: f(i) is the best total using only houses 0..i. Recurrence: f(i) = max(f(i-1), nums[i] + f(i-2)): either skip house i, or rob it and add the best from houses up to i-2. Base: f(-1) = 0 (no houses), f(0) = nums[0].

Top-down:
    from functools import lru_cache
    def rob(nums):
        @lru_cache(None)
        def f(i):
            if i < 0: return 0
            return max(f(i - 1), nums[i] + f(i - 2))
        return f(len(nums) - 1)

Bottom-up with two variables (O(1) memory):
    prev2, prev1 = 0, 0
    for x in nums:
        prev2, prev1 = prev1, max(prev1, x + prev2)
    return prev1

Trace for [2, 7, 9, 3, 1]: f(0)=2, f(1)=max(2,7)=7, f(2)=max(7,9+2)=11, f(3)=max(11,3+7)=11, f(4)=max(11,1+11)=12.

Both versions run in O(n) time because each state is computed once. Top-down uses O(n) memory (memo plus recursion depth); bottom-up with two variables uses O(1).
@@criteria
- Defines the state clearly (best total using houses up to index i).
- Gives the recurrence max(skip, nums[i] + best two houses back) and explains both choices.
- Lists the base cases for no house and one house.
- Shows a memoized top-down version and a bottom-up loop, and mentions the O(1) memory reduction.
- Trace table reaches 12 with correct intermediate values (2, 7, 11, 11, 12).
- States O(n) time and the space cost of each version.
````
