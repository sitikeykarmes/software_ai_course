---
id: dsa-hashing-stacks-lists
title: Hash tables, stacks, queues and linked lists
minutes: 70
---

These four structures are the working tools of everyday programming. A hash table trades memory for instant lookup; a stack and a queue control the order in which things are processed; a linked list makes insertion and removal cheap when you already hold the position.

## Hash tables

A hash table stores key-value pairs in an array. A **hash function** turns the key into a number, and that number modulo the array size gives the slot. Lookup, insert and delete are O(1) on average because you go straight to the slot.

Two keys can land in the same slot: a **collision**. Two standard fixes:

- **Chaining**: each slot holds a small list of entries.
- **Open addressing**: on a collision, probe the following slots until a free one is found. Python's `dict` does this.

When the table gets too full (the **load factor** passes a threshold) it allocates a bigger array and re-inserts everything. That single resize is O(n), but averaged over many inserts the cost per insert stays O(1).

Build one to see there is no magic:

```python run
class HashMap:
    def __init__(self, capacity=8):
        self.buckets = [[] for _ in range(capacity)]
        self.size = 0

    def _bucket(self, key):
        return self.buckets[hash(key) % len(self.buckets)]

    def put(self, key, value):
        bucket = self._bucket(key)
        for pair in bucket:
            if pair[0] == key:
                pair[1] = value                    # update existing key
                return
        bucket.append([key, value])
        self.size += 1
        if self.size > 0.75 * len(self.buckets):   # load factor exceeded
            self._resize()

    def get(self, key, default=None):
        for k, v in self._bucket(key):
            if k == key:
                return v
        return default

    def _resize(self):
        old = [pair for bucket in self.buckets for pair in bucket]
        self.buckets = [[] for _ in range(2 * len(self.buckets))]
        self.size = 0
        for k, v in old:
            self.put(k, v)

m = HashMap()
for i in range(20):
    m.put(f"part-{i}", i * i)
print(m.get("part-7"), m.get("missing", "n/a"), len(m.buckets), "buckets")
```

Keys must be **hashable**: their hash must never change, which is why lists cannot be dict keys and tuples can.

Real use: Python dicts and sets, database hash indexes and hash joins, caches such as Redis, routing tables, de-duplication, counting anything.

### Hash map problem patterns

**Complement lookup.** Two Sum on an unsorted array: for each number, ask whether the number that completes the target was already seen.

```python run
def two_sum(nums, target):
    index_of = {}
    for i, x in enumerate(nums):
        if target - x in index_of:
            return index_of[target - x], i
        index_of[x] = i
    return None

print(two_sum([8, 2, 11, 7, 15], 9))     # O(n) instead of O(n^2)
```

**Grouping by a computed key.** Group anagrams: words with the same sorted letters share a key.

```python run
from collections import defaultdict

def group_anagrams(words):
    groups = defaultdict(list)
    for w in words:
        groups["".join(sorted(w))].append(w)
    return list(groups.values())

print(group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"]))
```

**Counting.** First character that appears once; top k frequent items.

```python run
from collections import Counter

def first_unique(s):
    counts = Counter(s)
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            return i
    return -1

print(first_unique("swiss"), Counter("mississippi").most_common(2))
```

**Set for existence.** Longest run of consecutive numbers in O(n): only start counting from numbers that have no predecessor.

```python run
def longest_consecutive(nums):
    present = set(nums)
    best = 0
    for x in present:
        if x - 1 not in present:               # x starts a run
            length = 1
            while x + length in present:
                length += 1
            best = max(best, length)
    return best

print(longest_consecutive([100, 4, 200, 1, 3, 2]))
```

## Stacks

A stack is last in, first out (LIFO): you add and remove at the same end. In Python use a list: `append` to push, `pop` to pop, `stack[-1]` to peek. All O(1).

Real use: the call stack that tracks function calls, undo in editors, the browser back button, expression parsing, depth-first search.

### Matching brackets

```python run
def is_balanced(text):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in text:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack

print(is_balanced("{[()()]}"), is_balanced("([)]"), is_balanced("(("))
```

### Evaluating an expression in postfix notation

Compilers and calculators convert `3 + 4 * 2` to postfix `3 4 2 * +` and evaluate it with a stack.

```python run
def eval_postfix(tokens):
    stack = []
    ops = {"+": lambda a, b: a + b, "-": lambda a, b: a - b,
           "*": lambda a, b: a * b, "/": lambda a, b: a / b}
    for t in tokens:
        if t in ops:
            b, a = stack.pop(), stack.pop()
            stack.append(ops[t](a, b))
        else:
            stack.append(float(t))
    return stack[0]

print(eval_postfix("3 4 2 * +".split()))
```

### Monotonic stack: next greater element

Keep a stack of indexes whose answer is still unknown, with their values decreasing. When a bigger value arrives it is the answer for everything smaller on the stack. Each index is pushed and popped once: O(n).

```python run
def days_until_warmer(temps):
    answer = [0] * len(temps)
    stack = []                                 # indexes waiting for a warmer day
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            answer[j] = i - j
        stack.append(i)
    return answer

print(days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73]))
```

The same idea solves stock span, largest rectangle in a histogram, and "next higher price" questions.

### A stack that reports its minimum in O(1)

Store, alongside each value, the minimum of everything at or below it.

```python run
class MinStack:
    def __init__(self):
        self.items = []                        # (value, min_so_far)
    def push(self, x):
        low = min(x, self.items[-1][1]) if self.items else x
        self.items.append((x, low))
    def pop(self):
        return self.items.pop()[0]
    def minimum(self):
        return self.items[-1][1]

s = MinStack()
for x in [5, 3, 7, 2]:
    s.push(x)
print(s.minimum(), s.pop(), s.minimum())
```

## Queues and deques

A queue is first in, first out (FIFO). Never use `list.pop(0)`, which is O(n). Use `collections.deque`, which is O(1) at both ends.

Real use: task queues, print spoolers, breadth-first search, message brokers such as RabbitMQ and Kafka, request buffers in web servers.

```python run
from collections import deque

jobs = deque()
for name in ["scan", "weld", "paint"]:
    jobs.append(name)                          # enqueue at the back
while jobs:
    print("processing", jobs.popleft())        # dequeue from the front
```

### Sliding window maximum with a monotonic deque

Keep indexes in the deque with decreasing values. The front is always the maximum of the current window.

```python run
from collections import deque

def window_max(nums, k):
    dq, out = deque(), []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:        # smaller values can never be the max again
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:                     # front fell out of the window
            dq.popleft()
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out

print(window_max([1, 3, -1, -3, 5, 3, 6, 7], 3))
```

A **priority queue** serves the smallest or largest item first; it is built on a heap, covered in [the trees lesson](#dsa-trees-heaps-tries).

## Linked lists

A linked list is a chain of nodes; each node holds a value and a reference to the next node. There is no index arithmetic, so reaching item i is O(n). In exchange, inserting or removing a node is O(1) once you hold the node before it, with no shifting.

| | Array | Linked list |
| --- | --- | --- |
| Access by index | O(1) | O(n) |
| Insert or delete at the front | O(n) | O(1) |
| Insert or delete in the middle, position known | O(n) | O(1) |
| Memory | Compact, cache-friendly | Extra reference per node, scattered |

Real use: LRU caches, hash table chains, the free lists in memory allocators, undo history, blockchains (each block points to the previous one).

```python run
class Node:
    def __init__(self, val, next=None):
        self.val, self.next = val, next

def build(values):
    head = None
    for v in reversed(values):
        head = Node(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

def reverse(head):
    prev = None
    while head:
        nxt = head.next       # remember the rest
        head.next = prev      # point this node backwards
        prev, head = head, nxt
    return prev

print(to_list(reverse(build([1, 2, 3, 4, 5]))))
```

Reversing a list is the most asked linked-list question. Trace it on paper with three nodes until the three assignments feel obvious.

### Fast and slow pointers

Move one pointer one step and another two steps. When the fast one reaches the end, the slow one is at the middle. If the list has a cycle, the fast one eventually laps the slow one and they meet.

```python run
class Node:
    def __init__(self, val, next=None):
        self.val, self.next = val, next

def middle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    return slow.val

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

a = Node(1, Node(2, Node(3, Node(4, Node(5)))))
print(middle(a), has_cycle(a))
a.next.next.next.next.next = a.next            # tail now points back to node 2
print(has_cycle(a))
```

### Merging two sorted lists and the dummy node trick

A **dummy head** removes the special case of an empty result.

```python run
class Node:
    def __init__(self, val, next=None):
        self.val, self.next = val, next

def merge(a, b):
    dummy = tail = Node(None)
    while a and b:
        if a.val <= b.val:
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b
    return dummy.next

def show(n):
    out = []
    while n:
        out.append(n.val); n = n.next
    return out

print(show(merge(Node(1, Node(4, Node(9))), Node(2, Node(3, Node(10))))))
```

## LRU cache: hash map plus doubly linked list

An LRU (least recently used) cache holds a fixed number of items and evicts the one unused for longest. `get` and `put` must both be O(1). The classic design: a dict finds the node instantly; a doubly linked list keeps usage order so a node can be moved to the front or removed from the back in O(1).

```sim
lru-cache
```

```python run
class Node:
    def __init__(self, key=None, val=None):
        self.key, self.val, self.prev, self.next = key, val, None, None

class LRUCache:
    def __init__(self, capacity):
        self.capacity, self.map = capacity, {}
        self.head, self.tail = Node(), Node()          # sentinels: head.next is most recent
        self.head.next, self.tail.prev = self.tail, self.head

    def _remove(self, node):
        node.prev.next, node.next.prev = node.next, node.prev

    def _add_front(self, node):
        node.next, node.prev = self.head.next, self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        if key not in self.map:
            return None
        node = self.map[key]
        self._remove(node); self._add_front(node)      # mark as most recently used
        return node.val

    def put(self, key, val):
        if key in self.map:
            self._remove(self.map[key])
        node = Node(key, val)
        self.map[key] = node
        self._add_front(node)
        if len(self.map) > self.capacity:
            oldest = self.tail.prev
            self._remove(oldest)
            del self.map[oldest.key]

cache = LRUCache(2)
cache.put("a", 1); cache.put("b", 2)
print(cache.get("a"))        # 1, and "a" becomes most recent
cache.put("c", 3)            # evicts "b"
print(cache.get("b"), cache.get("c"))
```

In everyday Python, `functools.lru_cache` and `collections.OrderedDict` give you this ready-made. Redis offers LRU eviction for the same reason. Interviewers ask you to build it because it combines two structures to get a guarantee neither has alone.

## Check yourself

```quiz
[
  {"q": "Why can a tuple be a dict key but a list cannot?", "options": ["Tuples are shorter", "Tuples are immutable, so their hash never changes", "Lists are slower"], "answer": 1, "why": "If a key's hash changed after insertion, the table could never find it again."},
  {"q": "Which structure do you use to check balanced brackets?", "options": ["Queue", "Stack", "Hash set"], "answer": 1, "why": "The most recently opened bracket must close first: last in, first out."},
  {"q": "What is the average time of a dict lookup, and the worst case?", "options": ["O(1) and O(n)", "O(log n) and O(n)", "O(1) and O(1)"], "answer": 0, "why": "Collisions can degrade one lookup to scanning many entries, though good hashing makes this rare."},
  {"q": "In the fast and slow pointer method, what does the slow pointer reach when the fast one hits the end?", "options": ["The start", "The middle", "The end"], "answer": 1, "why": "It moves at half the speed, so it has covered half the distance."},
  {"q": "An LRU cache needs O(1) get and put. Which combination gives that?", "options": ["Array plus binary search", "Hash map plus doubly linked list", "Two stacks"], "answer": 1, "why": "The map finds a node instantly; the list moves or evicts it instantly."},
  {"q": "You need a FIFO queue in Python. Which is right?", "options": ["`list` with `pop(0)`", "`collections.deque` with `popleft()`", "`set`"], "answer": 1, "why": "`deque.popleft()` is O(1); `list.pop(0)` shifts every item."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: group-anagrams
title: Group anagrams
kind: code
level: easy
@@statement
Write `group_anagrams(words)`.

**Input**: a list of lowercase strings (may be empty, may contain duplicates and the empty string).

**Output**: a list of groups (each a list of words that are anagrams of each other). Inside a group keep the input order. Sort the groups by their first word, ascending. Empty input gives `[]`.

**Example**

```
group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"])
-> [["bat"], ["eat", "tea", "ate"], ["tan", "nat"]]
```
@@starter
def group_anagrams(words):
    pass
@@tests
assert group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"]) == [["bat"], ["eat", "tea", "ate"], ["tan", "nat"]], "classic"
assert group_anagrams([]) == [], "empty"
assert group_anagrams([""]) == [[""]], "empty string"
assert group_anagrams(["a", "a"]) == [["a", "a"]], "duplicates"
assert group_anagrams(["ab", "ba", "abc"]) == [["ab", "ba"], ["abc"]], "different lengths"
@@hint
Words that are anagrams share the same sorted letters. Use `"".join(sorted(word))` as the dict key.
@@solution
def group_anagrams(words):
    groups = {}
    for w in words:
        groups.setdefault("".join(sorted(w)), []).append(w)
    return sorted(groups.values(), key=lambda g: g[0])
````

````task
id: top-k-frequent
title: Top K frequent elements
kind: code
level: medium
@@statement
Write `top_k(nums, k)`.

**Input**: `nums`, a list of integers; `k`, an integer with `0 <= k`.

**Output**: a list of the `k` most frequent values, most frequent first. Break ties by the smaller value first. If there are fewer than `k` distinct values return all of them. `k = 0` gives `[]`.

**Example**

```
top_k([1, 1, 1, 2, 2, 3], 2) -> [1, 2]
top_k([4, 4, 5, 5, 6], 2)    -> [4, 5]
```
@@starter
from collections import Counter

def top_k(nums, k):
    pass
@@tests
assert top_k([1, 1, 1, 2, 2, 3], 2) == [1, 2], "classic"
assert top_k([4, 4, 5, 5, 6], 2) == [4, 5], "tie broken by value"
assert top_k([], 3) == [], "empty"
assert top_k([1], 5) == [1], "k bigger than distinct count"
assert top_k([1, 2, 3], 0) == [], "k = 0"
assert top_k([-1, -1, 2, 2, 2], 1) == [2], "negatives"
@@hint
`Counter(nums)` gives counts; sort items by the key `(-count, value)` and slice `[:k]`.
@@solution
from collections import Counter

def top_k(nums, k):
    counts = Counter(nums)
    ranked = sorted(counts, key=lambda v: (-counts[v], v))
    return ranked[:k]
````

````task
id: longest-consecutive
title: Longest consecutive sequence
kind: code
level: medium
@@statement
Write `longest_consecutive(nums)` that runs in O(n) using a set (no sorting).

**Input**: a list of integers, unsorted, possibly with duplicates.

**Output**: the length of the longest run of values that follow each other (`5, 6, 7, ...`). Empty input gives `0`.

**Example**

```
longest_consecutive([100, 4, 200, 1, 3, 2]) -> 4     (1, 2, 3, 4)
longest_consecutive([1, 2, 2, 3])           -> 3
```
@@starter
def longest_consecutive(nums):
    pass
@@tests
assert longest_consecutive([100, 4, 200, 1, 3, 2]) == 4, "classic"
assert longest_consecutive([]) == 0, "empty"
assert longest_consecutive([1, 2, 2, 3]) == 3, "duplicates"
assert longest_consecutive([5]) == 1, "single"
assert longest_consecutive([-2, -1, 0, 10]) == 3, "negatives"
assert longest_consecutive(list(range(0, 20000, 2))) == 1, "large input stays fast"
@@hint
Only start counting at a number `x` where `x - 1` is not in the set; then walk upward while `x + 1` is in the set.
@@solution
def longest_consecutive(nums):
    s = set(nums)
    best = 0
    for x in s:
        if x - 1 not in s:
            y = x
            while y + 1 in s:
                y += 1
            best = max(best, y - x + 1)
    return best
````

````task
id: valid-parentheses
title: Valid parentheses
kind: code
level: easy
@@statement
Write `is_valid(s)` using a stack.

**Input**: a string made only of the characters `()[]{}` (may be empty).

**Output**: `True` if every opening bracket is closed by the same kind of bracket in the correct order, otherwise `False`. The empty string is valid.

**Example**

```
is_valid("()[]{}") -> True
is_valid("(]")     -> False
is_valid("([)]")   -> False
```
@@starter
def is_valid(s):
    pass
@@tests
assert is_valid("()[]{}") is True, "simple pairs"
assert is_valid("(]") is False, "wrong kind"
assert is_valid("([)]") is False, "wrong order"
assert is_valid("{[]}") is True, "nested"
assert is_valid("") is True, "empty"
assert is_valid("(") is False, "unclosed"
assert is_valid(")") is False, "closing with empty stack"
@@hint
Push openers; on a closer, the stack must be non-empty and its top must be the matching opener.
@@solution
def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack
````

````task
id: min-stack
title: Min stack
kind: code
level: medium
@@statement
Write `class MinStack` with these methods, each O(1):

- `push(x)`: put `x` on top.
- `pop()`: remove and return the top item. Raise `IndexError` if empty.
- `top()`: return the top item without removing it. Raise `IndexError` if empty.
- `get_min()`: return the smallest item currently in the stack. Raise `IndexError` if empty.

**Example**

```
s = MinStack()
s.push(3); s.push(1); s.push(2)
s.get_min() -> 1
s.pop()     -> 2
s.pop()     -> 1
s.get_min() -> 3
```
@@starter
class MinStack:
    pass
@@tests
_s = MinStack()
_s.push(3)
_s.push(1)
_s.push(2)
assert _s.get_min() == 1, "min after three pushes"
assert _s.top() == 2, "top"
assert _s.pop() == 2, "pop returns top"
assert _s.pop() == 1, "pop the minimum"
assert _s.get_min() == 3, "min is restored after popping the minimum"
_s.push(3)
_s.pop()
assert _s.get_min() == 3, "duplicate minimums"
_e = MinStack()
for _m in ("pop", "top", "get_min"):
    try:
        getattr(_e, _m)()
        assert False, _m + " on empty must raise IndexError"
    except IndexError:
        pass
@@hint
Store pairs `(value, min_so_far)` on the stack, so the minimum at every depth is remembered.
@@solution
class MinStack:
    def __init__(self):
        self._items = []

    def push(self, x):
        low = x if not self._items else min(x, self._items[-1][1])
        self._items.append((x, low))

    def pop(self):
        if not self._items:
            raise IndexError("pop from empty stack")
        return self._items.pop()[0]

    def top(self):
        if not self._items:
            raise IndexError("empty stack")
        return self._items[-1][0]

    def get_min(self):
        if not self._items:
            raise IndexError("empty stack")
        return self._items[-1][1]
````

````task
id: daily-temperatures
title: Daily temperatures
kind: code
level: medium
@@statement
Write `days_until_warmer(temps)` using a monotonic stack (O(n)).

**Input**: a list of integer temperatures, one per day.

**Output**: a list of the same length where `out[i]` is the number of days after day `i` until a **strictly warmer** day. If there is none, `out[i]` is `0`.

**Example**

```
days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73]) -> [1, 1, 4, 2, 1, 1, 0, 0]
```
@@starter
def days_until_warmer(temps):
    pass
@@tests
assert days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73]) == [1, 1, 4, 2, 1, 1, 0, 0], "classic"
assert days_until_warmer([]) == [], "empty"
assert days_until_warmer([50]) == [0], "single"
assert days_until_warmer([30, 30, 30]) == [0, 0, 0], "equal is not warmer"
assert days_until_warmer([60, 50, 40]) == [0, 0, 0], "falling"
assert days_until_warmer([1, 2, 3]) == [1, 1, 0], "rising"
@@hint
Keep a stack of indices whose answer is still unknown. When today is warmer than the temperature at the top index, pop it and set its answer to the index difference.
@@solution
def days_until_warmer(temps):
    out = [0] * len(temps)
    stack = []
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            out[j] = i - j
        stack.append(i)
    return out
````

````task
id: eval-rpn
title: Evaluate reverse Polish notation
kind: code
level: medium
@@statement
Write `eval_rpn(tokens)`.

**Input**: a list of strings: integers (possibly negative, like `"-3"`) and the operators `+`, `-`, `*`, `/`. The expression is always valid.

**Output**: the integer result. Division truncates toward zero (so `7 / -2` is `-3`, and `-7 / 2` is `-3`).

**Example**

```
eval_rpn(["2", "1", "+", "3", "*"])            -> 9     ((2 + 1) * 3)
eval_rpn(["4", "13", "5", "/", "+"])           -> 6
```
@@starter
def eval_rpn(tokens):
    pass
@@tests
assert eval_rpn(["2", "1", "+", "3", "*"]) == 9, "classic"
assert eval_rpn(["4", "13", "5", "/", "+"]) == 6, "division"
assert eval_rpn(["5"]) == 5, "single number"
assert eval_rpn(["3", "4", "-"]) == -1, "operand order for minus"
assert eval_rpn(["7", "-2", "/"]) == -3, "truncate toward zero"
assert eval_rpn(["-7", "2", "/"]) == -3, "truncate toward zero, negative numerator"
assert eval_rpn(["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]) == 22, "long expression"
@@hint
Push numbers on a stack. On an operator pop `b` then `a` (the second pop is the left operand), compute `a op b`, push it. Use `int(a / b)` for truncating division.
@@solution
def eval_rpn(tokens):
    stack = []
    for t in tokens:
        if t in "+-*/" and len(t) == 1:
            b = stack.pop()
            a = stack.pop()
            if t == "+":
                stack.append(a + b)
            elif t == "-":
                stack.append(a - b)
            elif t == "*":
                stack.append(a * b)
            else:
                stack.append(int(a / b))
        else:
            stack.append(int(t))
    return stack[0]
````

````task
id: queue-two-stacks
title: Queue from two stacks
kind: code
level: medium
@@statement
Write `class StackQueue` that behaves like a FIFO queue but uses only two Python lists as stacks (use `append` and `pop()` at the end only; never `pop(0)`).

- `enqueue(x)`: add `x` at the back.
- `dequeue()`: remove and return the front item. Raise `IndexError` if empty.
- `peek()`: return the front item without removing it. Raise `IndexError` if empty.
- `__len__()`: the number of items.

**Example**

```
q = StackQueue()
q.enqueue(1); q.enqueue(2); q.enqueue(3)
q.dequeue() -> 1
q.enqueue(4)
q.dequeue() -> 2
len(q)      -> 2
```
@@starter
class StackQueue:
    pass
@@tests
_q = StackQueue()
for _x in (1, 2, 3):
    _q.enqueue(_x)
assert len(_q) == 3, "length"
assert _q.peek() == 1, "peek shows front"
assert _q.dequeue() == 1, "first in, first out"
_q.enqueue(4)
assert _q.dequeue() == 2, "order kept after interleaving"
assert _q.dequeue() == 3 and _q.dequeue() == 4, "drain"
assert len(_q) == 0, "empty again"
try:
    _q.dequeue()
    assert False, "dequeue on empty must raise IndexError"
except IndexError:
    pass
try:
    _q.peek()
    assert False, "peek on empty must raise IndexError"
except IndexError:
    pass
@@hint
Push into an `inbox` list. Only when the `outbox` list is empty, move everything from `inbox` to `outbox` (popping one by one) which reverses the order.
@@solution
class StackQueue:
    def __init__(self):
        self._in = []
        self._out = []

    def _shift(self):
        if not self._out:
            while self._in:
                self._out.append(self._in.pop())
        if not self._out:
            raise IndexError("queue is empty")

    def enqueue(self, x):
        self._in.append(x)

    def dequeue(self):
        self._shift()
        return self._out.pop()

    def peek(self):
        self._shift()
        return self._out[-1]

    def __len__(self):
        return len(self._in) + len(self._out)
````

````task
id: amortised-queue
title: Why two-stack queue is O(1) amortised
kind: text
level: medium
@@statement
Take the `StackQueue` from the previous task. Suppose you perform **n = 1,000 enqueues followed by 1,000 dequeues**.

Write 6 to 10 lines that:
1. Say how many individual stack operations (push or pop) happen in total.
2. Explain why a single `dequeue` can cost up to about 1,000 operations, yet the average cost per operation is constant.
3. State the amortised cost per operation and name the argument you used (for example the "each item moves at most once" or accounting argument).
@@criteria
- Counts operations concretely: each item is pushed to the inbox once, popped from it once, pushed to the outbox once and popped once, so about 4 stack operations per item, about 4,000 in total.
- Admits the worst case: the first dequeue moves all 1,000 items (about 2,000 operations).
- Explains that items move from inbox to outbox at most once, so expensive transfers are paid for by the many cheap calls.
- States the amortised cost is O(1) per operation.
- Names the technique (aggregate or accounting argument).
@@solution
Each item is pushed on the inbox once, popped from it once, pushed on the outbox once and popped from the outbox once: 4 stack operations per item, so about 4,000 for 1,000 items (2,000 enqueue/dequeue calls). The first dequeue is expensive, because it moves all 1,000 items, around 2,000 operations. But after that the outbox holds the items and the next 999 dequeues cost one pop each.

Because an item is moved from inbox to outbox at most once in its life, the total work is bounded by 4 per item, so the average per operation is at most a constant (about 2). By the aggregate argument (or by giving each enqueue 3 credits that pay for its future move), the amortised cost per operation is O(1), even though a single dequeue is O(n) in the worst case.
````

````task
id: reverse-linked-list
title: Reverse a linked list
kind: code
level: easy
@@statement
Use this node class (already in the starter): `ListNode(val, next=None)`. Write:

1. `reverse_list(head)`: reverse the singly linked list in place and return the new head. `None` (empty list) returns `None`.
2. `merge_sorted(a, b)`: merge two sorted lists into one sorted list by relinking nodes, and return the head. If values are equal take from `a` first.
3. `has_cycle(head)`: return `True` if following `next` ever loops back (use two pointers, O(1) space), else `False`.

Helper functions `build(values)` and `to_list(head)` are given to convert between Python lists and linked lists.

**Example**

```
to_list(reverse_list(build([1, 2, 3])))            -> [3, 2, 1]
to_list(merge_sorted(build([1, 4]), build([2, 3]))) -> [1, 2, 3, 4]
```
@@starter
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def build(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

def reverse_list(head):
    pass

def merge_sorted(a, b):
    pass

def has_cycle(head):
    pass
@@tests
assert to_list(reverse_list(build([1, 2, 3]))) == [3, 2, 1], "reverse"
assert reverse_list(None) is None, "reverse empty"
assert to_list(reverse_list(build([7]))) == [7], "reverse single"
assert to_list(merge_sorted(build([1, 4]), build([2, 3]))) == [1, 2, 3, 4], "merge interleaved"
assert to_list(merge_sorted(None, build([1, 2]))) == [1, 2], "merge with empty"
assert merge_sorted(None, None) is None, "merge both empty"
assert to_list(merge_sorted(build([1, 1]), build([1]))) == [1, 1, 1], "merge equal values"
_h = build([1, 2, 3, 4])
assert has_cycle(_h) is False, "no cycle"
_tail = _h
while _tail.next:
    _tail = _tail.next
_tail.next = _h.next
assert has_cycle(_h) is True, "cycle back to second node"
assert has_cycle(None) is False, "empty list has no cycle"
@@hint
Reverse: keep `prev` and `cur`, and for each node save `cur.next`, point it to `prev`, advance. Cycle: `slow` moves one step and `fast` moves two; if they meet there is a loop. Merge: use a dummy head node.
@@solution
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def build(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

def reverse_list(head):
    prev = None
    cur = head
    while cur:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    return prev

def merge_sorted(a, b):
    dummy = tail = ListNode()
    while a and b:
        if a.val <= b.val:
            tail.next, a = a, a.next
        else:
            tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b
    return dummy.next

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False
````

````task
id: lru-ttl-cache
title: LRU cache with expiry
kind: code
level: hard
@@statement
Write `class LRUCache(capacity, ttl=None, clock=time.monotonic)`.

- `get(key)`: return the value, or `None` if the key is missing or expired. A successful get makes the key the most recently used.
- `put(key, value)`: store the value (this also makes it most recently used and resets its age). If the cache would exceed `capacity`, evict the **least recently used** key.
- `ttl`: if not `None`, an entry older than `ttl` time units (`clock() - stored_at >= ttl`) counts as expired: `get` returns `None` and removes it.
- `__len__()`: number of stored entries (expired entries that have not been looked at yet may still be counted).

`get` and `put` must be O(1): use `collections.OrderedDict`.

**Example**

```
c = LRUCache(2)
c.put("a", 1); c.put("b", 2)
c.get("a")      -> 1
c.put("c", 3)   # evicts "b"
c.get("b")      -> None
```
@@starter
import time
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity, ttl=None, clock=time.monotonic):
        pass
@@tests
_c = LRUCache(2)
_c.put("a", 1)
_c.put("b", 2)
assert _c.get("a") == 1, "hit"
_c.put("c", 3)
assert _c.get("b") is None, "least recently used is evicted"
assert _c.get("a") == 1 and _c.get("c") == 3, "others remain"
assert len(_c) == 2, "length"
_c.put("a", 10)
_c.put("d", 4)
assert _c.get("a") == 10 and _c.get("c") is None, "put refreshes recency"
assert _c.get("missing") is None, "miss"
_t = [0]
_k = LRUCache(3, ttl=10, clock=lambda: _t[0])
_k.put("x", 1)
_t[0] = 9
assert _k.get("x") == 1, "not yet expired"
_t[0] = 10
assert _k.get("x") is None, "expired at ttl"
assert len(_k) == 0, "expired entry removed on get"
_t[0] = 20
_k.put("y", 2)
_t[0] = 25
_k.put("y", 3)
_t[0] = 33
assert _k.get("y") == 3, "put resets the age"
@@hint
Store `key -> (value, stored_at)` in an `OrderedDict`. `move_to_end(key)` marks it most recent; `popitem(last=False)` removes the oldest.
@@solution
import time
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity, ttl=None, clock=time.monotonic):
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self._data = OrderedDict()

    def get(self, key):
        if key not in self._data:
            return None
        value, stored_at = self._data[key]
        if self.ttl is not None and self.clock() - stored_at >= self.ttl:
            del self._data[key]
            return None
        self._data.move_to_end(key)
        return value

    def put(self, key, value):
        self._data[key] = (value, self.clock())
        self._data.move_to_end(key)
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def __len__(self):
        return len(self._data)
````
