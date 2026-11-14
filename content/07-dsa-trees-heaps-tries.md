---
id: dsa-trees-heaps-tries
title: Trees, binary search trees, heaps and tries
minutes: 70
---

A tree stores data in a hierarchy: one root, each node with children, no cycles. Trees give O(log n) search, insert and delete when balanced, which is why file systems, databases, compilers and the HTML page you are reading are all trees.

## Vocabulary

- **Root**: the top node. **Leaf**: a node with no children.
- **Depth** of a node: edges from the root down to it. **Height** of a tree: the longest path from root to a leaf.
- **Binary tree**: each node has at most two children, left and right.
- **Balanced**: height is about log₂ n. A tree of a million nodes then has height 20. An unbalanced tree can degrade into a linked list of height n.

```python
class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right
```

## Traversals

There are two families. **Depth-first (DFS)** goes down one branch fully before the next and is naturally recursive. **Breadth-first (BFS)** visits level by level using a queue.

| Order | Visit sequence | Typical use |
| --- | --- | --- |
| Preorder | Node, left, right | Copy or serialise a tree |
| Inorder | Left, node, right | Gives sorted order in a binary search tree |
| Postorder | Left, right, node | Delete a tree, compute sizes, evaluate expressions |
| Level order | Level 0, level 1, … | Shortest path in levels, printing by row |

```python run
from collections import deque

class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right

#         8
#       /   \
#      3     10
#     / \      \
#    1   6      14
root = TreeNode(8, TreeNode(3, TreeNode(1), TreeNode(6)), TreeNode(10, None, TreeNode(14)))

def preorder(n):  return [n.val] + preorder(n.left) + preorder(n.right) if n else []
def inorder(n):   return inorder(n.left) + [n.val] + inorder(n.right) if n else []
def postorder(n): return postorder(n.left) + postorder(n.right) + [n.val] if n else []

def level_order(root):
    levels, queue = [], deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):          # everything in the queue now is one level
            node = queue.popleft()
            level.append(node.val)
            if node.left:  queue.append(node.left)
            if node.right: queue.append(node.right)
        levels.append(level)
    return levels

print(preorder(root)); print(inorder(root)); print(postorder(root)); print(level_order(root))
```

## The recursive way of thinking

Almost every tree problem is solved by answering: "if I already had the answer for the left subtree and the right subtree, how do I combine them at this node?" Then the base case handles an empty node.

```python run
class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right

root = TreeNode(8, TreeNode(3, TreeNode(1), TreeNode(6)), TreeNode(10, None, TreeNode(14)))

def height(n):
    return 0 if n is None else 1 + max(height(n.left), height(n.right))

def count(n):
    return 0 if n is None else 1 + count(n.left) + count(n.right)

def invert(n):                                   # mirror the tree
    if n:
        n.left, n.right = invert(n.right), invert(n.left)
    return n

def has_path_sum(n, target):                     # root-to-leaf path adding up to target
    if n is None:
        return False
    if n.left is None and n.right is None:
        return n.val == target
    return has_path_sum(n.left, target - n.val) or has_path_sum(n.right, target - n.val)

def diameter(root):                              # longest path between any two nodes, in edges
    best = 0
    def depth(n):
        nonlocal best
        if n is None:
            return 0
        l, r = depth(n.left), depth(n.right)
        best = max(best, l + r)                  # path passing through this node
        return 1 + max(l, r)
    depth(root)
    return best

print(height(root), count(root), has_path_sum(root, 17), diameter(root))
```

The `diameter` function shows a common trick: the recursion returns one thing (depth) while updating another (the best answer) on the way.

### Lowest common ancestor

The deepest node that has both targets beneath it. Used for "nearest shared manager" in an organisation chart and for merge bases in version control.

```python run
class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def lca(node, p, q):
    if node is None or node.val in (p, q):
        return node
    left, right = lca(node.left, p, q), lca(node.right, p, q)
    if left and right:
        return node                  # p and q are on different sides: this is the split point
    return left or right

root = TreeNode(3, TreeNode(5, TreeNode(6), TreeNode(2, TreeNode(7), TreeNode(4))), TreeNode(1, TreeNode(0), TreeNode(8)))
print(lca(root, 6, 4).val, lca(root, 7, 8).val)
```

## Binary search trees

A BST keeps an ordering rule at every node: everything in the left subtree is smaller, everything in the right subtree is larger. Searching is binary search on a tree: compare and go left or right.

```python run
class TreeNode:
    def __init__(self, val):
        self.val, self.left, self.right = val, None, None

def insert(node, val):
    if node is None:
        return TreeNode(val)
    if val < node.val:
        node.left = insert(node.left, val)
    elif val > node.val:
        node.right = insert(node.right, val)
    return node

def search(node, val):
    while node and node.val != val:
        node = node.left if val < node.val else node.right
    return node is not None

def inorder(n):
    return inorder(n.left) + [n.val] + inorder(n.right) if n else []

def is_valid_bst(n, low=float("-inf"), high=float("inf")):
    if n is None:
        return True
    if not low < n.val < high:
        return False
    return is_valid_bst(n.left, low, n.val) and is_valid_bst(n.right, n.val, high)

root = None
for v in [50, 30, 70, 20, 40, 60, 80]:
    root = insert(root, v)
print(inorder(root), search(root, 60), search(root, 65), is_valid_bst(root))
```

Search, insert and delete cost O(height). Insert sorted data into a plain BST and it becomes a chain with height n. **Self-balancing trees** (red-black trees, AVL trees) rotate nodes on insert and delete to keep height at O(log n). You rarely implement them; you should know they exist and why.

Real use:

- **B-trees and B+ trees** are balanced trees with hundreds of keys per node, so a table of a billion rows is only three or four levels deep. Every relational database index is one. Each node is one disk page, so a lookup costs a handful of page reads.
- Ordered maps in Java (`TreeMap`) and C++ (`std::map`) are red-black trees. Python has no built-in one; use the `bisect` module on a sorted list or the `sortedcontainers` package.

## Heaps and priority queues

A heap is a binary tree where every parent is smaller than or equal to its children (a min-heap). The smallest item is always at the root. It is stored in a plain array: the children of index i are at 2i + 1 and 2i + 2.

- Peek at the minimum: O(1).
- Push or pop: O(log n), by swapping the item up or down the tree.
- Build from a list: O(n) with `heapify`.

```python run
import heapq

tasks = []
heapq.heappush(tasks, (2, "write report"))
heapq.heappush(tasks, (1, "fix line stoppage"))     # lower number = higher priority
heapq.heappush(tasks, (3, "update dashboard"))
while tasks:
    print(heapq.heappop(tasks))

nums = [5, 1, 9, 3, 7, 2]
print(heapq.nlargest(3, nums), heapq.nsmallest(2, nums))
```

Python only has a min-heap. For a max-heap, push negated values.

Real use: operating system schedulers, Dijkstra's shortest path, merging sorted files, event simulation, "top k" analytics, timers in servers.

### Top k with a heap of size k

To find the k largest of n items, keep a min-heap of size k. Each new item either beats the smallest of the current top k or is dropped. Cost O(n log k) and only O(k) memory, so it works on a stream that does not fit in memory.

```python run
import heapq
from collections import Counter

def k_largest(stream, k):
    heap = []
    for x in stream:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:
            heapq.heapreplace(heap, x)      # pop the smallest, push x
    return sorted(heap, reverse=True)

def top_k_frequent(words, k):
    counts = Counter(words)
    return heapq.nlargest(k, counts, key=counts.get)

print(k_largest([4, 9, 1, 7, 12, 3, 8], 3))
print(top_k_frequent("a b a c b a d c a".split(), 2))
```

### Merging k sorted lists

Keep one candidate from each list in a heap; pop the smallest and push the next item from the same list. This is how databases merge sorted runs and how search engines merge results from many shards.

```python run
import heapq

def merge_k(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        val, i, j = heapq.heappop(heap)
        out.append(val)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out

print(merge_k([[1, 4, 9], [2, 3, 10], [5, 6]]))
```

### Running median with two heaps

Keep the smaller half in a max-heap and the larger half in a min-heap. The median is at the tops.

```python run
import heapq

class RunningMedian:
    def __init__(self):
        self.low, self.high = [], []          # low: max-heap via negation; high: min-heap
    def add(self, x):
        heapq.heappush(self.low, -x)
        heapq.heappush(self.high, -heapq.heappop(self.low))   # largest of low moves up
        if len(self.high) > len(self.low):
            heapq.heappush(self.low, -heapq.heappop(self.high))
    def median(self):
        if len(self.low) > len(self.high):
            return -self.low[0]
        return (-self.low[0] + self.high[0]) / 2

m = RunningMedian()
for x in [5, 15, 1, 3]:
    m.add(x)
    print(x, "->", m.median())
```

Real use: live p50 latency on a monitoring dashboard.

## Tries

A trie (prefix tree) stores strings character by character. Words that share a prefix share a path. Looking up a word of length L costs O(L) regardless of how many words are stored, and finding everything that starts with a prefix is direct.

```python run
class Trie:
    def __init__(self):
        self.children = {}
        self.is_word = False

    def insert(self, word):
        node = self
        for ch in word:
            node = node.children.setdefault(ch, Trie())
        node.is_word = True

    def _find(self, prefix):
        node = self
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def contains(self, word):
        node = self._find(word)
        return node is not None and node.is_word

    def complete(self, prefix, limit=5):
        out, node = [], self._find(prefix)
        def walk(n, path):
            if len(out) >= limit:
                return
            if n.is_word:
                out.append(prefix + path)
            for ch in sorted(n.children):
                walk(n.children[ch], path + ch)
        if node:
            walk(node, "")
        return out

t = Trie()
for w in ["gear", "gearbox", "gasket", "gauge", "bolt", "bearing"]:
    t.insert(w)
print(t.contains("gear"), t.contains("gea"), t.complete("ga"), t.complete("b"))
```

Real use: search-box autocomplete, spell checkers, IP routing tables (longest prefix match), T9 keyboards, and the vocabulary lookup inside LLM tokenisers.

## Other trees you should recognise

| Structure | What it answers | Where it is used |
| --- | --- | --- |
| B+ tree | Ordered lookup and range scans on disk | Database indexes, file systems |
| Segment tree / Fenwick tree | Range sum or minimum with updates in O(log n) | Analytics, competitive programming |
| LSM tree | Fast writes by appending and merging sorted files | Cassandra, RocksDB, many NoSQL stores |
| Merkle tree | Whether two large datasets differ, by comparing hashes | Git, blockchains, replica repair in databases |
| Abstract syntax tree | The structure of source code | Compilers, linters, code formatters |
| DOM | The structure of a web page | Browsers |

## Check yourself

```quiz
[
  {"q": "Which traversal of a binary search tree returns values in sorted order?", "options": ["Preorder", "Inorder", "Level order"], "answer": 1, "why": "Left subtree (smaller), node, right subtree (larger)."},
  {"q": "You insert 1, 2, 3, 4, 5 in that order into a plain BST. What is its height?", "options": ["About log₂ 5", "5 (a chain)", "1"], "answer": 1, "why": "Each value goes to the right of the last. Balanced trees exist to prevent this."},
  {"q": "You need the 10 largest values from a stream of a billion numbers. Best tool?", "options": ["Sort everything", "A min-heap of size 10", "A hash set"], "answer": 1, "why": "O(n log 10) time and constant memory; the heap root is the weakest of the current top 10."},
  {"q": "Why do databases use B-trees with wide nodes instead of binary trees?", "options": ["They are easier to code", "Fewer levels means fewer disk page reads per lookup", "Binary trees cannot store numbers"], "answer": 1, "why": "With hundreds of keys per node a billion rows fit in three or four levels."},
  {"q": "What does a trie do better than a hash set of words?", "options": ["Exact lookup", "Finding all words with a given prefix", "Using less memory always"], "answer": 1, "why": "Prefix queries walk one path; a hash set would have to scan every word."},
  {"q": "In the recursive `height` function, what is the base case?", "options": ["A leaf returns 1", "An empty node returns 0", "The root returns 0"], "answer": 1, "why": "Handling `None` once covers leaves and missing children uniformly."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**. Tree tasks use the `TreeNode` class and helpers that are already in the starter: `build(values)` creates a tree from a level-order list (`None` marks a missing child) and `to_list(root)` turns a tree back into such a list (trailing `None`s removed).

````task
id: tree-basics
title: Depth, invert, same tree, diameter
kind: code
level: medium
@@statement
Write four recursive functions on a binary tree (`TreeNode` with `.val`, `.left`, `.right`):

1. `max_depth(root)`: number of nodes on the longest root-to-leaf path. Empty tree (`None`) gives `0`.
2. `invert_tree(root)`: mirror the tree (swap left and right everywhere) in place and return the root. `None` returns `None`.
3. `is_same_tree(a, b)`: `True` if both trees have the same shape and the same values.
4. `diameter(root)`: the number of **edges** on the longest path between any two nodes (the path need not pass through the root). Empty tree or single node gives `0`.

**Example** (tree `build([1, 2, 3, 4, 5])`)

```
max_depth(tree)  -> 3
diameter(tree)   -> 3        (4 -> 2 -> 1 -> 3)
to_list(invert_tree(tree)) -> [1, 3, 2, None, None, 5, 4]
```
@@starter
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def to_list(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def max_depth(root):
    pass

def invert_tree(root):
    pass

def is_same_tree(a, b):
    pass

def diameter(root):
    pass
@@tests
_t = build([1, 2, 3, 4, 5])
assert max_depth(_t) == 3, "depth"
assert max_depth(None) == 0, "depth of empty"
assert max_depth(build([1, None, 2, None, 3])) == 3, "depth of a chain"
assert diameter(_t) == 3, "diameter through the root"
assert diameter(None) == 0 and diameter(build([1])) == 0, "diameter small"
assert diameter(build([1, 2, None, 3, None, 4])) == 3, "chain on one side"
assert diameter(build([1, 2, 3, 4, 5, None, None, 6, None, None, 7])) == 4, "diameter not through the root"
assert is_same_tree(build([1, 2, 3]), build([1, 2, 3])) is True, "same"
assert is_same_tree(build([1, 2]), build([1, None, 2])) is False, "same values, different shape"
assert is_same_tree(None, None) is True and is_same_tree(None, build([1])) is False, "empty cases"
assert is_same_tree(build([1, 2, 3]), build([1, 2, 4])) is False, "different value"
assert to_list(invert_tree(build([1, 2, 3, 4, 5]))) == [1, 3, 2, None, None, 5, 4], "invert"
assert invert_tree(None) is None, "invert empty"
@@hint
All four follow one pattern: handle `None` first, recurse on `left` and `right`, then combine. For the diameter, a helper can return the depth while updating a best-so-far value of `left_depth + right_depth`.
@@solution
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def to_list(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def max_depth(root):
    if root is None:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))

def invert_tree(root):
    if root is None:
        return None
    root.left, root.right = invert_tree(root.right), invert_tree(root.left)
    return root

def is_same_tree(a, b):
    if a is None or b is None:
        return a is b
    return a.val == b.val and is_same_tree(a.left, b.left) and is_same_tree(a.right, b.right)

def diameter(root):
    best = [0]

    def depth(node):
        if node is None:
            return 0
        l = depth(node.left)
        r = depth(node.right)
        best[0] = max(best[0], l + r)
        return 1 + max(l, r)

    depth(root)
    return best[0]
````

````task
id: tree-views
title: Level order, right side view, zigzag
kind: code
level: medium
@@statement
Write three breadth-first (queue based) functions on a binary tree:

1. `level_order(root)`: a list of lists, one list per level, values left to right.
2. `right_side_view(root)`: the values you would see standing on the right of the tree: the last value of each level, top to bottom.
3. `zigzag(root)`: like `level_order`, but level 0 goes left to right, level 1 right to left, level 2 left to right, and so on.

An empty tree (`None`) gives `[]` for all three.

**Example** (tree `build([3, 9, 20, None, None, 15, 7])`)

```
level_order(tree)      -> [[3], [9, 20], [15, 7]]
right_side_view(tree)  -> [3, 20, 7]
zigzag(tree)           -> [[3], [20, 9], [15, 7]]
```
@@starter
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def level_order(root):
    pass

def right_side_view(root):
    pass

def zigzag(root):
    pass
@@tests
_t = build([3, 9, 20, None, None, 15, 7])
assert level_order(_t) == [[3], [9, 20], [15, 7]], "level order"
assert right_side_view(_t) == [3, 20, 7], "right side view"
assert zigzag(_t) == [[3], [20, 9], [15, 7]], "zigzag"
assert level_order(None) == [] and right_side_view(None) == [] and zigzag(None) == [], "empty tree"
assert level_order(build([1])) == [[1]], "single node"
assert right_side_view(build([1, 2, 3, 4, None, None, 5])) == [1, 3, 5], "right view per level"
assert right_side_view(build([1, 2, None, 3])) == [1, 2, 3], "left-only chain is visible"
assert zigzag(build([1, 2, 3, 4, 5, 6, 7])) == [[1], [3, 2], [4, 5, 6, 7]], "zigzag three levels"
@@hint
Process the queue one whole level at a time: take `size = len(queue)` and pop exactly that many nodes. For zigzag, reverse every odd level's list.
@@solution
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def level_order(root):
    if root is None:
        return []
    out = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        out.append(level)
    return out

def right_side_view(root):
    return [level[-1] for level in level_order(root)]

def zigzag(root):
    return [lvl[::-1] if i % 2 else lvl for i, lvl in enumerate(level_order(root))]
````

````task
id: bst-and-lca
title: Validate BST, kth smallest, lowest common ancestor
kind: code
level: hard
@@statement
Write three functions on a binary tree:

1. `is_valid_bst(root)`: `True` if for every node all values in its left subtree are **strictly smaller** and all values in its right subtree are **strictly larger** (checking only the direct children is not enough). Empty tree is valid.
2. `kth_smallest(root, k)`: the k-th smallest value (1-based) of a valid BST, using in-order traversal. Raise `ValueError` if `k` is out of range.
3. `lca(root, p, q)`: the value of the lowest common ancestor of the nodes with values `p` and `q` in a binary tree (not necessarily a BST; all values are unique and both exist). A node counts as its own ancestor.

**Example**

```
is_valid_bst(build([2, 1, 3]))                   -> True
is_valid_bst(build([5, 1, 4, None, None, 3, 6])) -> False
kth_smallest(build([3, 1, 4, None, 2]), 1)       -> 1
lca(build([3, 5, 1, 6, 2, 0, 8]), 5, 1)          -> 3
```
@@starter
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def is_valid_bst(root):
    pass

def kth_smallest(root, k):
    pass

def lca(root, p, q):
    pass
@@tests
assert is_valid_bst(build([2, 1, 3])) is True, "valid"
assert is_valid_bst(build([5, 1, 4, None, None, 3, 6])) is False, "right child smaller than root"
assert is_valid_bst(build([5, 4, 6, None, None, 3, 7])) is False, "deep node breaks the rule"
assert is_valid_bst(build([2, 2, 2])) is False, "duplicates are invalid"
assert is_valid_bst(None) is True and is_valid_bst(build([1])) is True, "empty and single"
assert kth_smallest(build([3, 1, 4, None, 2]), 1) == 1, "smallest"
assert kth_smallest(build([5, 3, 6, 2, 4, None, None, 1]), 3) == 3, "third smallest"
assert kth_smallest(build([2, 1, 3]), 3) == 3, "largest"
try:
    kth_smallest(build([2, 1, 3]), 4)
    assert False, "k too large must raise ValueError"
except ValueError:
    pass
_t = build([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4])
assert lca(_t, 5, 1) == 3, "lca at root"
assert lca(_t, 5, 4) == 5, "a node is its own ancestor"
assert lca(_t, 6, 4) == 5, "lca inside left subtree"
assert lca(_t, 7, 4) == 2, "lca deep"
@@hint
Validate by passing down an open interval `(low, high)`: going left sets `high = node.val`, going right sets `low = node.val`. For LCA, return the node if it matches p or q; if both sides return something, the current node is the answer.
@@solution
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def is_valid_bst(root, low=None, high=None):
    if root is None:
        return True
    if low is not None and root.val <= low:
        return False
    if high is not None and root.val >= high:
        return False
    return is_valid_bst(root.left, low, root.val) and is_valid_bst(root.right, root.val, high)

def kth_smallest(root, k):
    stack = []
    node = root
    count = 0
    while stack or node:
        while node:
            stack.append(node)
            node = node.left
        node = stack.pop()
        count += 1
        if count == k:
            return node.val
        node = node.right
    raise ValueError("k out of range")

def lca(root, p, q):
    def walk(node):
        if node is None:
            return None
        if node.val == p or node.val == q:
            return node
        left = walk(node.left)
        right = walk(node.right)
        if left and right:
            return node
        return left or right

    found = walk(root)
    return found.val if found else None
````

````task
id: tree-from-traversals
title: Build a tree from preorder and inorder
kind: code
level: hard
@@statement
Write `build_tree(preorder, inorder)`.

**Input**: two lists of the same length holding the preorder and inorder traversals of one binary tree with **unique** values (may be empty).

**Output**: the root `TreeNode` of the reconstructed tree, or `None` for empty input. Aim for O(n) using a dict from value to inorder index.

**Example**

```
tree = build_tree([3, 9, 20, 15, 7], [9, 3, 15, 20, 7])
to_list(tree) -> [3, 9, 20, None, None, 15, 7]
```
@@starter
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def to_list(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def build_tree(preorder, inorder):
    pass
@@tests
assert to_list(build_tree([3, 9, 20, 15, 7], [9, 3, 15, 20, 7])) == [3, 9, 20, None, None, 15, 7], "classic"
assert build_tree([], []) is None, "empty"
assert to_list(build_tree([1], [1])) == [1], "single"
assert to_list(build_tree([1, 2, 3], [3, 2, 1])) == [1, 2, None, 3], "left chain"
assert to_list(build_tree([1, 2, 3], [1, 2, 3])) == [1, None, 2, None, 3], "right chain"
assert to_list(build_tree([1, 2, 4, 5, 3], [4, 2, 5, 1, 3])) == [1, 2, 3, 4, 5], "complete tree"
@@hint
The first preorder item is the root. Its position in the inorder list tells you how many nodes belong to the left subtree; split by that count and recurse.
@@solution
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def to_list(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def build_tree(preorder, inorder):
    index = {v: i for i, v in enumerate(inorder)}
    pos = [0]

    def helper(lo, hi):
        if lo > hi:
            return None
        val = preorder[pos[0]]
        pos[0] += 1
        node = TreeNode(val)
        mid = index[val]
        node.left = helper(lo, mid - 1)
        node.right = helper(mid + 1, hi)
        return node

    return helper(0, len(inorder) - 1)
````

````task
id: tree-serialize
title: Serialize and deserialize a binary tree
kind: code
level: hard
@@statement
Write `serialize(root)` and `deserialize(text)` so that a tree survives a round trip through a string.

**Format** (so the output can be checked): a preorder traversal where a missing child is written as `null`, all items joined by commas, no spaces. Values are integers.

**Input / Output**
- `serialize(root)` returns the string. An empty tree (`None`) gives `"null"`.
- `deserialize(text)` returns the root `TreeNode` (or `None`).

**Example**

```
tree: 1 with left child 2 and right child 3
serialize(tree)   -> "1,2,null,null,3,null,null"
deserialize("1,2,null,null,3,null,null") gives the same tree back
```
@@starter
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def to_list(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def serialize(root):
    pass

def deserialize(text):
    pass
@@tests
assert serialize(build([1, 2, 3])) == "1,2,null,null,3,null,null", "format"
assert serialize(None) == "null", "empty tree"
assert serialize(build([7])) == "7,null,null", "single node"
assert deserialize("null") is None, "deserialize empty"
for _vals in ([1, 2, 3], [1, None, 2, None, 3], [5, 3, 8, 1, 4, 7, 9], [-1, -2], [1]):
    assert to_list(deserialize(serialize(build(_vals)))) == _vals, "round trip " + str(_vals)
assert serialize(build([1, 2, None, 3])) == "1,2,3,null,null,null,null", "left chain"
@@hint
Serialize with a recursive preorder that appends `"null"` for `None`. Deserialize by turning the text into an iterator of tokens and consuming one token per recursive call: `null` returns `None`, otherwise create a node and read its left then right subtree.
@@solution
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    q = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            q.append(node.right)
        i += 1
    return root

def to_list(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def serialize(root):
    parts = []

    def walk(node):
        if node is None:
            parts.append("null")
            return
        parts.append(str(node.val))
        walk(node.left)
        walk(node.right)

    walk(root)
    return ",".join(parts)

def deserialize(text):
    tokens = iter(text.split(","))

    def walk():
        tok = next(tokens)
        if tok == "null":
            return None
        node = TreeNode(int(tok))
        node.left = walk()
        node.right = walk()
        return node

    return walk()
````

````task
id: kth-largest-stream
title: Kth largest in a stream
kind: code
level: easy
@@statement
Write `class KthLargest` using a min-heap of size `k` (`heapq`).

- `KthLargest(k, nums)`: `k >= 1`; `nums` is the initial list of integers (may be empty or shorter than `k`).
- `add(val)`: add a number to the stream and return the current k-th largest value of everything seen so far (duplicates count separately). If fewer than `k` numbers have been seen, return `None`.

**Example**

```
s = KthLargest(3, [4, 5, 8, 2])
s.add(3)  -> 4
s.add(5)  -> 5
s.add(10) -> 5
```
@@starter
import heapq

class KthLargest:
    def __init__(self, k, nums):
        pass

    def add(self, val):
        pass
@@tests
_s = KthLargest(3, [4, 5, 8, 2])
assert _s.add(3) == 4, "first add"
assert _s.add(5) == 5, "second add"
assert _s.add(10) == 5, "third add"
assert _s.add(9) == 8, "fourth add"
assert _s.add(4) == 8, "fifth add"
_e = KthLargest(1, [])
assert _e.add(-3) == -3, "k=1 on empty start"
assert _e.add(-2) == -2, "k=1 keeps the maximum"
_f = KthLargest(2, [])
assert _f.add(1) is None, "fewer than k numbers"
assert _f.add(1) == 1, "duplicates count separately"
@@hint
Keep only the `k` largest numbers in the heap. The smallest of them, `heap[0]`, is the k-th largest. Pop whenever the heap grows beyond `k`.
@@solution
import heapq

class KthLargest:
    def __init__(self, k, nums):
        self.k = k
        self.heap = []
        for n in nums:
            self._push(n)

    def _push(self, val):
        heapq.heappush(self.heap, val)
        if len(self.heap) > self.k:
            heapq.heappop(self.heap)

    def add(self, val):
        self._push(val)
        if len(self.heap) < self.k:
            return None
        return self.heap[0]
````

````task
id: merge-k-sorted
title: Merge K sorted lists
kind: code
level: medium
@@statement
Write `merge_k(lists)` using a heap (`heapq.heappush` / `heappop`). Do not use `heapq.merge` or `sorted`.

**Input**: a list of `k` lists, each already sorted ascending (any may be empty; `lists` itself may be empty).

**Output**: one new sorted list containing all items. Time O(N log k), where N is the total item count. The inputs must not be modified.

**Example**

```
merge_k([[1, 4, 5], [1, 3, 4], [2, 6]]) -> [1, 1, 2, 3, 4, 4, 5, 6]
```
@@starter
import heapq

def merge_k(lists):
    pass
@@tests
assert merge_k([[1, 4, 5], [1, 3, 4], [2, 6]]) == [1, 1, 2, 3, 4, 4, 5, 6], "classic"
assert merge_k([]) == [], "no lists"
assert merge_k([[], []]) == [], "only empty lists"
assert merge_k([[], [1]]) == [1], "one empty one not"
assert merge_k([[3, 3], [3]]) == [3, 3, 3], "duplicates"
_in = [[1, 2], [0]]
merge_k(_in)
assert _in == [[1, 2], [0]], "inputs not modified"
assert merge_k([list(range(0, 100, 2)), list(range(1, 100, 2))]) == list(range(100)), "interleaved"
@@hint
Put `(value, list_index, position)` for the first item of each non-empty list on the heap. Pop the smallest, append it, then push the next item of that same list.
@@solution
import heapq

def merge_k(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        val, i, pos = heapq.heappop(heap)
        out.append(val)
        if pos + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][pos + 1], i, pos + 1))
    return out
````

````task
id: median-stream
title: Median of a data stream
kind: code
level: hard
@@statement
Write `class MedianFinder` using two heaps (a max-heap for the lower half and a min-heap for the upper half; `heapq` only has min-heaps, so store negated numbers for the max-heap).

- `add_num(x)`: add an integer. O(log n).
- `find_median()`: return the median of all numbers added so far as a `float`: the middle value if the count is odd, or the mean of the two middle values if even. Raise `ValueError` if no numbers were added. O(1).

**Example**

```
m = MedianFinder()
m.add_num(1); m.add_num(2)
m.find_median() -> 1.5
m.add_num(3)
m.find_median() -> 2.0
```
@@starter
import heapq

class MedianFinder:
    def __init__(self):
        pass

    def add_num(self, x):
        pass

    def find_median(self):
        pass
@@tests
_m = MedianFinder()
try:
    _m.find_median()
    assert False, "empty must raise ValueError"
except ValueError:
    pass
_m.add_num(1)
assert _m.find_median() == 1.0, "one number"
_m.add_num(2)
assert _m.find_median() == 1.5, "two numbers"
_m.add_num(3)
assert _m.find_median() == 2.0, "three numbers"
_m.add_num(-10)
assert _m.find_median() == 1.5, "negative number shifts the median"
_n = MedianFinder()
for _x in (5, 5, 5, 5):
    _n.add_num(_x)
assert _n.find_median() == 5.0 and isinstance(_n.find_median(), float), "duplicates, float result"
import random as _random
_rng = _random.Random(3)
_k = MedianFinder()
_seen = []
for _ in range(200):
    _v = _rng.randint(-100, 100)
    _seen.append(_v)
    _k.add_num(_v)
    _s = sorted(_seen)
    _mid = len(_s) // 2
    _want = float(_s[_mid]) if len(_s) % 2 else (_s[_mid - 1] + _s[_mid]) / 2
    assert _k.find_median() == _want, "random stream matches sorted median"
@@hint
Keep `low` (negated max-heap) and `high` (min-heap) so that `len(low)` equals `len(high)` or is one larger. After inserting, rebalance by moving one top item across.
@@solution
import heapq

class MedianFinder:
    def __init__(self):
        self.low = []
        self.high = []

    def add_num(self, x):
        heapq.heappush(self.low, -x)
        heapq.heappush(self.high, -heapq.heappop(self.low))
        if len(self.high) > len(self.low):
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def find_median(self):
        if not self.low:
            raise ValueError("no numbers")
        if len(self.low) > len(self.high):
            return float(-self.low[0])
        return (-self.low[0] + self.high[0]) / 2
````

````task
id: task-scheduler
title: Task scheduler cooldown
kind: code
level: hard
@@statement
Write `least_intervals(tasks, n)`.

**Input**: `tasks`, a list of single-letter strings (each is one unit-time task); `n`, the cooldown: after running a task, the **same letter** cannot run again until `n` other intervals (tasks or idle) have passed. The CPU may idle.

**Output**: the minimum number of time intervals (int) needed to finish all tasks. Empty `tasks` gives `0`.

**Example**

```
least_intervals(["A","A","A","B","B","B"], 2) -> 8     (A B idle A B idle A B)
least_intervals(["A","A","A","B","B","B"], 0) -> 6
```
@@starter
from collections import Counter
import heapq

def least_intervals(tasks, n):
    pass
@@tests
assert least_intervals(["A", "A", "A", "B", "B", "B"], 2) == 8, "classic"
assert least_intervals(["A", "A", "A", "B", "B", "B"], 0) == 6, "no cooldown"
assert least_intervals([], 5) == 0, "empty"
assert least_intervals(["A"], 10) == 1, "single task never waits"
assert least_intervals(["A", "A", "A", "A", "A", "A", "B", "C", "D", "E", "F", "G"], 2) == 16, "dominant task"
assert least_intervals(["A", "B", "C", "D"], 5) == 4, "all different"
assert least_intervals(["A", "A", "B", "B"], 1) == 4, "fits without idle"
@@hint
Think about the most frequent task: its copies must be spaced `n + 1` apart, forming frames. Count how many tasks share that top frequency, and remember the answer can never be less than `len(tasks)`.
@@solution
from collections import Counter
import heapq

def least_intervals(tasks, n):
    if not tasks:
        return 0
    counts = Counter(tasks)
    m = max(counts.values())
    c = sum(1 for v in counts.values() if v == m)
    return max(len(tasks), (m - 1) * (n + 1) + c)
````

````task
id: trie
title: Trie with prefix search
kind: code
level: medium
@@statement
Write `class Trie` built from nested dicts (one node per character).

- `insert(word)`: add a lowercase word.
- `search(word)`: `True` only if exactly this word was inserted.
- `starts_with(prefix)`: `True` if any inserted word starts with `prefix` (the empty prefix is `True` once something is inserted, and `False` on an empty trie).
- `words_with_prefix(prefix)`: a sorted list of all inserted words that start with `prefix`, each word once. (This is the building block of autocomplete and of Word Search II.)

**Example**

```
t = Trie()
t.insert("apple"); t.insert("app")
t.search("app")           -> True
t.search("appl")          -> False
t.starts_with("appl")     -> True
t.words_with_prefix("ap") -> ["app", "apple"]
```
@@starter
class Trie:
    def __init__(self):
        pass

    def insert(self, word):
        pass

    def search(self, word):
        pass

    def starts_with(self, prefix):
        pass

    def words_with_prefix(self, prefix):
        pass
@@tests
_t = Trie()
assert _t.starts_with("") is False, "empty trie has no prefixes"
_t.insert("apple")
_t.insert("app")
_t.insert("bat")
assert _t.search("apple") is True and _t.search("app") is True, "inserted words"
assert _t.search("appl") is False, "a prefix is not a word"
assert _t.search("apples") is False, "longer word is not present"
assert _t.starts_with("appl") is True and _t.starts_with("b") is True, "prefixes"
assert _t.starts_with("c") is False, "unknown prefix"
assert _t.starts_with("") is True, "empty prefix after insert"
assert _t.words_with_prefix("ap") == ["app", "apple"], "words with prefix"
assert _t.words_with_prefix("") == ["app", "apple", "bat"], "all words"
assert _t.words_with_prefix("z") == [], "no match"
_t.insert("app")
assert _t.words_with_prefix("app") == ["app", "apple"], "duplicate insert does not duplicate results"
@@hint
Each node is a dict `char -> child`; mark the end of a word with a special key such as `"$"`. For `words_with_prefix`, walk to the prefix node, then collect words with a recursive DFS.
@@solution
class Trie:
    END = "$"

    def __init__(self):
        self.root = {}

    def insert(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node[self.END] = True

    def _find(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node:
                return None
            node = node[ch]
        return node

    def search(self, word):
        node = self._find(word)
        return node is not None and self.END in node

    def starts_with(self, prefix):
        node = self._find(prefix)
        return node is not None and bool(node)

    def words_with_prefix(self, prefix):
        node = self._find(prefix)
        out = []
        if node is None:
            return out

        def walk(n, path):
            if self.END in n:
                out.append(path)
            for ch in n:
                if ch != self.END:
                    walk(n[ch], path + ch)

        walk(node, prefix)
        return sorted(out)
````

````task
id: word-dictionary
title: Add and search words with wildcards
kind: code
level: hard
@@statement
Write `class WordDictionary` using a trie and DFS.

- `add_word(word)`: store a lowercase word.
- `search(pattern)`: `True` if some stored word matches `pattern`, where each `.` matches **any single letter** and every other character must match itself. Word and pattern must have the same length.

**Example**

```
d = WordDictionary()
d.add_word("bad"); d.add_word("dad"); d.add_word("mad")
d.search("pad")  -> False
d.search("bad")  -> True
d.search(".ad")  -> True
d.search("b..")  -> True
d.search("b.")   -> False
```
@@starter
class WordDictionary:
    def __init__(self):
        pass

    def add_word(self, word):
        pass

    def search(self, pattern):
        pass
@@tests
_d = WordDictionary()
for _w in ("bad", "dad", "mad"):
    _d.add_word(_w)
assert _d.search("pad") is False, "no match"
assert _d.search("bad") is True, "exact"
assert _d.search(".ad") is True, "wildcard first"
assert _d.search("b..") is True, "wildcards last"
assert _d.search("b.") is False, "too short"
assert _d.search("b...") is False, "too long"
assert _d.search("...") is True, "all wildcards"
assert _d.search("ba") is False, "a prefix alone is not a word"
assert _d.search("") is False, "empty pattern with no empty word"
_e = WordDictionary()
assert _e.search(".") is False, "empty dictionary"
_e.add_word("a")
assert _e.search(".") is True, "single letter wildcard"
@@hint
Recurse with `(node, index)`. For a letter follow that one child; for `.` try every child (except the end marker). Succeed only when the index reaches the end of the pattern at a node marked as a word end.
@@solution
class WordDictionary:
    END = "$"

    def __init__(self):
        self.root = {}

    def add_word(self, word):
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node[self.END] = True

    def search(self, pattern):
        def dfs(node, i):
            if i == len(pattern):
                return self.END in node
            ch = pattern[i]
            if ch == ".":
                return any(dfs(child, i + 1) for key, child in node.items() if key != self.END)
            return ch in node and dfs(node[ch], i + 1)

        return dfs(self.root, 0)
````

````task
id: min-heap
title: Min-heap from scratch
kind: code
level: medium
@@statement
Write `class MinHeap` backed by a Python list, **without** `heapq`.

- `push(x)`: insert a number (sift up). O(log n).
- `pop()`: remove and return the smallest number (move the last item to the root, sift down). Raise `IndexError` if empty. O(log n).
- `peek()`: return the smallest number without removing it. Raise `IndexError` if empty.
- `__len__()`: number of items.

Duplicates are allowed. The parent of index `i` is `(i - 1) // 2`; its children are `2*i + 1` and `2*i + 2`.

**Example**

```
h = MinHeap()
for x in (5, 3, 8, 1): h.push(x)
h.pop() -> 1
h.pop() -> 3
len(h)  -> 2
```
@@starter
class MinHeap:
    def __init__(self):
        pass

    def push(self, x):
        pass

    def pop(self):
        pass

    def peek(self):
        pass

    def __len__(self):
        return 0
@@tests
_h = MinHeap()
for _x in (5, 3, 8, 1):
    _h.push(_x)
assert len(_h) == 4, "length"
assert _h.peek() == 1, "peek"
assert _h.pop() == 1 and _h.pop() == 3, "pops in order"
assert len(_h) == 2, "length after pops"
assert _h.pop() == 5 and _h.pop() == 8, "drain"
try:
    _h.pop()
    assert False, "pop on empty must raise IndexError"
except IndexError:
    pass
try:
    _h.peek()
    assert False, "peek on empty must raise IndexError"
except IndexError:
    pass
import random as _random
_rng = _random.Random(11)
_data = [_rng.randint(-1000, 1000) for _ in range(500)]
_g = MinHeap()
for _x in _data:
    _g.push(_x)
assert [_g.pop() for _ in range(500)] == sorted(_data), "heap sort of random data with duplicates"
_s = MinHeap()
_s.push(2)
_s.push(2)
_s.push(1)
assert [_s.pop(), _s.pop(), _s.pop()] == [1, 2, 2], "duplicates"
@@hint
`push`: append, then while the item is smaller than its parent, swap them. `pop`: save the root, move the last item to index 0, then repeatedly swap it with its smaller child until it is not larger than either child.
@@solution
class MinHeap:
    def __init__(self):
        self._a = []

    def push(self, x):
        a = self._a
        a.append(x)
        i = len(a) - 1
        while i > 0:
            parent = (i - 1) // 2
            if a[i] < a[parent]:
                a[i], a[parent] = a[parent], a[i]
                i = parent
            else:
                break

    def peek(self):
        if not self._a:
            raise IndexError("heap is empty")
        return self._a[0]

    def pop(self):
        a = self._a
        if not a:
            raise IndexError("heap is empty")
        top = a[0]
        last = a.pop()
        if a:
            a[0] = last
            i = 0
            n = len(a)
            while True:
                left, right = 2 * i + 1, 2 * i + 2
                smallest = i
                if left < n and a[left] < a[smallest]:
                    smallest = left
                if right < n and a[right] < a[smallest]:
                    smallest = right
                if smallest == i:
                    break
                a[i], a[smallest] = a[smallest], a[i]
                i = smallest
        return top

    def __len__(self):
        return len(self._a)
````
