---
id: dsa-graphs
title: Graphs: BFS, DFS, topological sort, shortest paths, union-find
minutes: 75
---

A graph is a set of nodes (vertices) joined by edges. Anything with relationships is a graph: roads between cities, friendships, web links, package dependencies, tasks that must run in order, machines on a network. Most graph problems are solved by one of six algorithms, all built on two traversals.

## Vocabulary and representation

- **Directed** edges go one way (A follows B); **undirected** edges go both ways (A is friends with B).
- **Weighted** edges carry a cost such as distance or time.
- **Cycle**: a path that returns to its start. A directed graph with no cycles is a **DAG**.
- **Connected component**: a group of nodes all reachable from each other.

| Representation | Space | Check if edge (u, v) exists | List neighbours of u | Use when |
| --- | --- | --- | --- | --- |
| Adjacency list (dict of lists) | O(V + E) | O(degree) | O(degree) | Almost always |
| Adjacency matrix (V × V grid) | O(V²) | O(1) | O(V) | Dense graphs, small V |
| Edge list | O(E) | O(E) | O(E) | Kruskal's algorithm, input formats |

```python run
from collections import defaultdict

edges = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D"), ("D", "E")]
graph = defaultdict(list)
for u, v in edges:
    graph[u].append(v)
    graph[v].append(u)        # leave this line out for a directed graph
print(dict(graph))
```

A grid is a graph too: each cell is a node and its neighbours are the cells up, down, left and right.

## Breadth-first search

BFS explores in rings: all nodes one step away, then two steps, and so on, using a queue. Because of that order it finds the **shortest path in an unweighted graph**. Time O(V + E).

```python run
from collections import deque

graph = {"A": ["B", "C"], "B": ["A", "D"], "C": ["A", "D"], "D": ["B", "C", "E"], "E": ["D", "F"], "F": ["E"]}

def shortest_path(graph, start, goal):
    queue = deque([start])
    parent = {start: None}                  # doubles as the visited set
    while queue:
        node = queue.popleft()
        if node == goal:
            path = []
            while node is not None:         # walk back through parents
                path.append(node)
                node = parent[node]
            return path[::-1]
        for nxt in graph[node]:
            if nxt not in parent:
                parent[nxt] = node
                queue.append(nxt)
    return None

print(shortest_path(graph, "A", "F"))
```

Mark a node visited when you add it to the queue, not when you remove it, or the same node gets queued many times.

### BFS on a grid: fewest steps through a maze

```python run
from collections import deque

def min_steps(grid, start, goal):
    rows, cols = len(grid), len(grid[0])
    queue = deque([(start[0], start[1], 0)])
    seen = {start}
    while queue:
        r, c, d = queue.popleft()
        if (r, c) == goal:
            return d
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 0 and (nr, nc) not in seen:
                seen.add((nr, nc))
                queue.append((nr, nc, d + 1))
    return -1

maze = [[0, 0, 0, 1],
        [1, 1, 0, 1],
        [0, 0, 0, 0],
        [0, 1, 1, 0]]
print(min_steps(maze, (0, 0), (3, 3)))
```

**Multi-source BFS** starts with several nodes in the queue at once. Example: "how many minutes until every fresh orange is rotten" starts from all rotten oranges together. The same idea computes, for every cell on a shop floor, the distance to the nearest fire exit.

Real use: degrees of separation on a social network, a web crawler visiting pages level by level, network broadcast, autonomous vehicle routing on a floor grid.

## Depth-first search

DFS goes as far as possible along one path, then backtracks. Use recursion or an explicit stack. Time O(V + E). It is the tool for exploring everything reachable, detecting cycles, and ordering dependencies.

```python run
def dfs(graph, node, seen=None):
    if seen is None:
        seen = []
    seen.append(node)
    for nxt in graph[node]:
        if nxt not in seen:
            dfs(graph, nxt, seen)
    return seen

graph = {"A": ["B", "C"], "B": ["D"], "C": ["D"], "D": ["E"], "E": []}
print(dfs(graph, "A"))
```

### Counting connected components: number of islands

Scan the grid; each time you find unvisited land, that is a new island, and a DFS marks every cell of it.

```python run
def count_islands(grid):
    rows, cols = len(grid), len(grid[0])
    seen = set()
    def sink(r, c):
        stack = [(r, c)]
        while stack:
            r, c = stack.pop()
            if (r, c) in seen or not (0 <= r < rows and 0 <= c < cols) or grid[r][c] == "0":
                continue
            seen.add((r, c))
            stack.extend([(r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)])
    islands = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "1" and (r, c) not in seen:
                islands += 1
                sink(r, c)
    return islands

print(count_islands(["11000", "11000", "00100", "00011"]))
```

The explicit stack avoids Python's recursion limit (about 1,000 frames) on large grids. Real use: the paint-bucket fill in image editors, finding connected defect regions in an inspection image.

### Cycle detection in a directed graph

Colour each node: white (unvisited), grey (on the current path), black (finished). Reaching a grey node means you came back to something still in progress: a cycle.

```python run
def has_cycle(graph):
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {n: WHITE for n in graph}
    def visit(n):
        colour[n] = GREY
        for nxt in graph[n]:
            if colour[nxt] == GREY:
                return True
            if colour[nxt] == WHITE and visit(nxt):
                return True
        colour[n] = BLACK
        return False
    return any(colour[n] == WHITE and visit(n) for n in graph)

print(has_cycle({"a": ["b"], "b": ["c"], "c": []}), has_cycle({"a": ["b"], "b": ["c"], "c": ["a"]}))
```

Real use: detecting circular imports, deadlocks (a cycle in the wait-for graph), and circular references in spreadsheets.

## Topological sort

Given tasks with dependencies, produce an order in which every task comes after the ones it depends on. It exists only if the graph has no cycle. **Kahn's algorithm**: repeatedly take a node with no remaining prerequisites.

```python run
from collections import deque, defaultdict

def topo_order(tasks, depends_on):
    """depends_on: list of (task, prerequisite)."""
    after = defaultdict(list)
    indegree = {t: 0 for t in tasks}
    for task, pre in depends_on:
        after[pre].append(task)
        indegree[task] += 1
    ready = deque(t for t in tasks if indegree[t] == 0)
    order = []
    while ready:
        t = ready.popleft()
        order.append(t)
        for nxt in after[t]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
    if len(order) != len(tasks):
        raise ValueError("cycle: no valid order")
    return order

steps = ["press", "weld", "paint", "assembly", "inspection"]
deps = [("weld", "press"), ("paint", "weld"), ("assembly", "paint"), ("inspection", "assembly"), ("inspection", "weld")]
print(topo_order(steps, deps))
```

Real use: build systems (`make`, Bazel), package installers resolving dependencies, Airflow and other pipeline schedulers, spreadsheet recalculation, course prerequisites.

## Shortest paths with weights: Dijkstra

BFS treats every edge as cost 1. With different weights, always expand the closest unexplored node next, using a min-heap. Requires non-negative weights. Time O((V + E) log V).

```python run
import heapq

def dijkstra(graph, start):
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > dist.get(node, float("inf")):
            continue                              # stale entry: a shorter route was found already
        for nxt, weight in graph[node]:
            nd = d + weight
            if nd < dist.get(nxt, float("inf")):
                dist[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    return dist

roads = {
    "Pune":   [("Mumbai", 150), ("Nashik", 210)],
    "Mumbai": [("Pune", 150), ("Nashik", 170), ("Surat", 280)],
    "Nashik": [("Pune", 210), ("Mumbai", 170), ("Surat", 230)],
    "Surat":  [("Mumbai", 280), ("Nashik", 230)],
}
print(dijkstra(roads, "Pune"))
```

Real use: map routing, network routing protocols (OSPF), lowest-cost paths in logistics.

| Algorithm | Handles | Time | Use when |
| --- | --- | --- | --- |
| BFS | Unweighted | O(V + E) | Every edge costs the same |
| Dijkstra | Non-negative weights | O((V + E) log V) | Road distances, latencies |
| Bellman-Ford | Negative weights, detects negative cycles | O(V × E) | Currency arbitrage, some routing |
| Floyd-Warshall | All pairs | O(V³) | Small graphs, need every pair |
| A* | Non-negative weights plus a distance estimate | Faster than Dijkstra in practice | Games, robotics, maps |

## Union-find (disjoint sets)

Union-find answers "are these two nodes in the same group?" and merges groups, both in almost constant time. Each group is a tree; `find` returns its root. Two optimisations make it fast: **path compression** (point nodes straight at the root as you pass) and **union by size** (attach the smaller tree under the larger).

```python run
class UnionFind:
    def __init__(self, items):
        self.parent = {x: x for x in items}
        self.size = {x: 1 for x in items}
        self.groups = len(self.parent)

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]     # path compression
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False                                      # already connected
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.groups -= 1
        return True

uf = UnionFind("ABCDEF")
for a, b in [("A", "B"), ("B", "C"), ("D", "E")]:
    uf.union(a, b)
print(uf.find("A") == uf.find("C"), uf.find("A") == uf.find("D"), uf.groups)
print("adding A-C creates a cycle:", not uf.union("A", "C"))
```

Real use: detecting whether adding a link creates a loop in a network, grouping duplicate customer accounts that share an email or phone, image segmentation, percolation.

### Minimum spanning tree with Kruskal

Connect all nodes with the least total edge weight: sort edges by weight and add each one unless it would form a cycle, which union-find tells you instantly.

```python run
def kruskal(nodes, edges):
    parent = {n: n for n in nodes}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    total, chosen = 0, []
    for w, a, b in sorted(edges):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
            total += w
            chosen.append((a, b, w))
    return total, chosen

print(kruskal("ABCD", [(1, "A", "B"), (4, "A", "C"), (3, "B", "C"), (2, "C", "D"), (5, "B", "D")]))
```

Real use: laying cable or pipe between sites at the lowest cost, clustering.

## Choosing the algorithm

| The question | Reach for |
| --- | --- |
| Fewest steps or hops | BFS |
| Is there any path; explore everything; count regions | DFS or BFS |
| Order tasks with prerequisites; can all courses be finished | Topological sort |
| Cheapest path with weights | Dijkstra |
| Are two things connected; group things; does this edge make a cycle | Union-find |
| Cheapest way to connect everything | Kruskal or Prim |
| Is there a cycle in a directed graph | DFS with three colours, or topological sort failing |

## Check yourself

```quiz
[
  {"q": "Why does BFS find the shortest path in an unweighted graph?", "options": ["It uses a stack", "It visits nodes in order of their distance from the start", "It visits every edge twice"], "answer": 1, "why": "The queue processes all nodes at distance d before any at distance d + 1."},
  {"q": "A build system must compile files in dependency order. Which algorithm?", "options": ["Dijkstra", "Topological sort", "Binary search"], "answer": 1, "why": "It orders a DAG so every node follows its prerequisites."},
  {"q": "Dijkstra's algorithm gives wrong answers when:", "options": ["The graph is directed", "Some edge weights are negative", "The graph has cycles"], "answer": 1, "why": "It assumes a node's distance is final when popped, which negative edges can break."},
  {"q": "You must repeatedly merge groups and ask whether two items are in the same group. Best structure?", "options": ["Adjacency matrix", "Union-find", "Trie"], "answer": 1, "why": "Both operations are nearly O(1) with path compression and union by size."},
  {"q": "In DFS cycle detection for a directed graph, what signals a cycle?", "options": ["Reaching a finished (black) node", "Reaching a node still on the current path (grey)", "Reaching a leaf"], "answer": 1, "why": "A grey node is an ancestor in the current path, so the edge closes a loop."},
  {"q": "What is the usual space cost of an adjacency list?", "options": ["O(V²)", "O(V + E)", "O(E²)"], "answer": 1, "why": "One entry per node plus one per edge (two for undirected)."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: count-islands
title: Number of islands
kind: code
level: easy
@@statement
Write a function `count_islands(grid)` that counts the islands in a map.

**Input**
- `grid`: a list of strings, all the same length. `"1"` is land and `"0"` is water. The grid may be empty.

**Output**: an `int`, the number of islands. An island is a group of land cells connected **up, down, left or right** (diagonals do not connect). Do not change `grid`. An empty grid gives `0`.

**Example**

```
count_islands(["11000",
               "11000",
               "00100",
               "00011"])
-> 3
```
@@starter
def count_islands(grid):
    # TODO: scan every cell; when you find unseen land, count it and flood-fill its island
    pass

print(count_islands(["11000", "11000", "00100", "00011"]))
@@tests
assert count_islands(["11000", "11000", "00100", "00011"]) == 3, "basic example"
assert count_islands([]) == 0, "empty grid"
assert count_islands(["0"]) == 0, "only water"
assert count_islands(["1"]) == 1, "single land cell"
assert count_islands(["101", "010", "101"]) == 5, "diagonals do not connect"
_g = ["111", "101", "111"]
assert count_islands(_g) == 1, "ring is one island"
assert _g == ["111", "101", "111"], "input not changed"
@@hint
Keep a `seen` set of cells. For each unseen `"1"`, add 1 to the answer and use a stack or queue to mark every land cell reachable from it.
@@solution
def count_islands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = set()
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == "1" and (r, c) not in seen:
                count += 1
                seen.add((r, c))
                stack = [(r, c)]
                while stack:
                    cr, cc = stack.pop()
                    for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1" and (nr, nc) not in seen:
                            seen.add((nr, nc))
                            stack.append((nr, nc))
    return count
````

````task
id: rotting-oranges
title: Rotting oranges
kind: code
level: medium
@@statement
Write a function `minutes_to_rot(grid)` for a grid of oranges.

**Input**
- `grid`: a list of lists of ints. `0` = empty cell, `1` = fresh orange, `2` = rotten orange.

**Output**: an `int`, the number of minutes until no fresh orange is left.
- Every minute, each fresh orange that is next to (up, down, left, right) a rotten orange becomes rotten.
- If there is no fresh orange at the start, return `0`.
- If some fresh orange can never rot, return `-1`.
- Do not change `grid`.

**Example**

```
minutes_to_rot([[2,1,1],
                [1,1,0],
                [0,1,1]])
-> 4
```
@@starter
from collections import deque

def minutes_to_rot(grid):
    # TODO: multi-source BFS starting from every rotten orange at once
    pass

print(minutes_to_rot([[2, 1, 1], [1, 1, 0], [0, 1, 1]]))
@@tests
assert minutes_to_rot([[2, 1, 1], [1, 1, 0], [0, 1, 1]]) == 4, "basic example"
assert minutes_to_rot([[2, 1, 1], [0, 1, 1], [1, 0, 1]]) == -1, "unreachable orange"
assert minutes_to_rot([[0, 2]]) == 0, "no fresh orange"
assert minutes_to_rot([[0]]) == 0, "only empty"
assert minutes_to_rot([[1]]) == -1, "fresh but no rotten"
assert minutes_to_rot([[2, 1, 1, 1, 1]]) == 4, "a line"
_g = [[2, 1], [1, 1]]
assert minutes_to_rot(_g) == 2, "square"
assert _g == [[2, 1], [1, 1]], "input not changed"
@@hint
Put all rotten oranges in the queue at minute 0 and count fresh ones. Each BFS level is one minute; if fresh oranges remain at the end, return -1.
@@solution
from collections import deque

def minutes_to_rot(grid):
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    queue = deque()
    fresh = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c))
            elif grid[r][c] == 1:
                fresh += 1
    seen = set(queue)
    minutes = 0
    while queue and fresh:
        for _ in range(len(queue)):
            r, c = queue.popleft()
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1 and (nr, nc) not in seen:
                    seen.add((nr, nc))
                    fresh -= 1
                    queue.append((nr, nc))
        minutes += 1
    return minutes if fresh == 0 else -1
````

````task
id: course-order
title: Course schedule order
kind: code
level: medium
@@statement
Write a function `course_order(n, prereqs)` that returns an order in which all courses can be taken.

**Input**
- `n`: number of courses, labelled `0` to `n-1`.
- `prereqs`: a list of pairs `(course, prereq)`, meaning you must finish `prereq` before `course`.

**Output**: a `list` of all `n` course numbers in a valid order.
- When several courses are available at the same time, take the **smallest number first**. This makes the answer unique.
- If the prerequisites contain a cycle (so not all courses can be taken), return `[]`.
- `n = 0` gives `[]`.

**Example**

```
course_order(4, [(1, 0), (2, 0), (3, 1), (3, 2)])  ->  [0, 1, 2, 3]
course_order(2, [(0, 1), (1, 0)])                  ->  []
```
@@starter
import heapq

def course_order(n, prereqs):
    # TODO: topological sort (Kahn) using a min-heap of courses with in-degree 0
    pass

print(course_order(4, [(1, 0), (2, 0), (3, 1), (3, 2)]))
@@tests
assert course_order(2, [(1, 0)]) == [0, 1], "simple chain"
assert course_order(4, [(1, 0), (2, 0), (3, 1), (3, 2)]) == [0, 1, 2, 3], "diamond"
assert course_order(2, [(0, 1), (1, 0)]) == [], "cycle"
assert course_order(3, []) == [0, 1, 2], "no prerequisites"
assert course_order(3, [(0, 2)]) == [1, 2, 0], "smallest available first"
assert course_order(0, []) == [], "no courses"
assert course_order(4, [(1, 0), (2, 1), (1, 2)]) == [], "cycle among some courses"
@@hint
Count in-degrees, keep a min-heap of courses with in-degree 0, pop one, and decrease the in-degree of the courses that depend on it. If you finish with fewer than `n` courses, there was a cycle.
@@solution
import heapq

def course_order(n, prereqs):
    indeg = [0] * n
    after = [[] for _ in range(n)]
    for course, pre in prereqs:
        indeg[course] += 1
        after[pre].append(course)
    heap = [i for i in range(n) if indeg[i] == 0]
    heapq.heapify(heap)
    order = []
    while heap:
        cur = heapq.heappop(heap)
        order.append(cur)
        for nxt in after[cur]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                heapq.heappush(heap, nxt)
    return order if len(order) == n else []
````

````task
id: network-delay
title: Network delay time
kind: code
level: medium
@@statement
Write a function `network_delay(times, n, k)`: a signal is sent from node `k`; how long until every node has received it?

**Input**
- `times`: a list of directed edges `(u, v, w)`: the signal goes from `u` to `v` in `w` time units (`w >= 0`).
- `n`: number of nodes, labelled `1` to `n`.
- `k`: the start node.

**Output**: an `int`, the time when the **last** node receives the signal (the largest shortest-path distance from `k`). If some node can never be reached, return `-1`. If `n = 1`, return `0`.

**Example**

```
network_delay([(2, 1, 1), (2, 3, 1), (3, 4, 1)], 4, 2)  ->  2
network_delay([(1, 2, 1)], 2, 2)                          ->  -1
```
@@starter
import heapq

def network_delay(times, n, k):
    # TODO: Dijkstra from k, then take the maximum distance
    pass

print(network_delay([(2, 1, 1), (2, 3, 1), (3, 4, 1)], 4, 2))
@@tests
assert network_delay([(2, 1, 1), (2, 3, 1), (3, 4, 1)], 4, 2) == 2, "LeetCode example"
assert network_delay([(1, 2, 1)], 2, 1) == 1, "two nodes"
assert network_delay([(1, 2, 1)], 2, 2) == -1, "unreachable node"
assert network_delay([], 1, 1) == 0, "single node"
assert network_delay([(1, 2, 10), (1, 3, 1), (3, 2, 2)], 3, 1) == 3, "shorter indirect path wins"
assert network_delay([(1, 2, 1), (2, 3, 1), (1, 3, 5), (3, 4, 2)], 4, 1) == 4, "mixed paths"
@@hint
Build an adjacency list, run Dijkstra with a heap of `(distance, node)`, and answer `max(dist.values())` only if `len(dist) == n`.
@@solution
import heapq

def network_delay(times, n, k):
    graph = {}
    for u, v, w in times:
        graph.setdefault(u, []).append((v, w))
    dist = {}
    heap = [(0, k)]
    while heap:
        d, node = heapq.heappop(heap)
        if node in dist:
            continue
        dist[node] = d
        for nxt, w in graph.get(node, []):
            if nxt not in dist:
                heapq.heappush(heap, (d + w, nxt))
    return max(dist.values()) if len(dist) == n else -1
````

````task
id: redundant-connection
title: Redundant connection
kind: code
level: medium
@@statement
Write a function `find_redundant_edge(edges)` using union-find (disjoint set).

**Input**
- `edges`: a list of undirected edges `(a, b)` between nodes labelled with positive ints, given in order.

**Output**: the **first** edge (as the same tuple) that connects two nodes which are already connected by the edges before it, so adding it creates a cycle. If no edge does that, return `None`. Empty input gives `None`.

**Example**

```
find_redundant_edge([(1, 2), (2, 3), (3, 4), (1, 4), (1, 5)])  ->  (1, 4)
find_redundant_edge([(1, 2), (2, 3)])                           ->  None
```
@@starter
def find_redundant_edge(edges):
    # TODO: union-find with find() and union(); an edge whose ends share a root closes a cycle
    pass

print(find_redundant_edge([(1, 2), (2, 3), (3, 4), (1, 4), (1, 5)]))
@@tests
assert find_redundant_edge([(1, 2), (1, 3), (2, 3)]) == (2, 3), "triangle"
assert find_redundant_edge([(1, 2), (2, 3), (3, 4), (1, 4), (1, 5)]) == (1, 4), "cycle in the middle"
assert find_redundant_edge([(1, 2), (2, 3)]) is None, "a tree has no redundant edge"
assert find_redundant_edge([]) is None, "no edges"
assert find_redundant_edge([(1, 2), (3, 4), (2, 3), (1, 4), (1, 3)]) == (1, 4), "first closing edge is returned"
assert find_redundant_edge([(1, 2), (2, 1)]) == (2, 1), "duplicate edge"
@@hint
Keep a `parent` dict. `find(x)` follows parents to the root. If `find(a) == find(b)` the edge is redundant, otherwise point one root at the other.
@@solution
def find_redundant_edge(edges):
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return (a, b)
        parent[ra] = rb
    return None
````

````task
id: metro-routes
title: Metro: fewest stops and fastest route
kind: code
level: hard
@@statement
Model a metro map and write `best_routes(graph, start, goal)`, which returns two routes.

**Input**
- `graph`: a dict mapping each station name to a list of `(neighbor, minutes)` pairs (non-negative ints). Edges are given in both directions when the track is two-way.
- `start`, `goal`: station names.

**Output**: a tuple `(fewest_stops_path, fastest_path)`. Each path is a list of station names from `start` to `goal`.
- `fewest_stops_path` has the fewest stations; ignore minutes.
- `fastest_path` has the smallest total minutes.
- If several paths are equally good, return the one that is smallest when compared as a list (alphabetical order of stations).
- If `start == goal`, both are `[start]`. If `goal` cannot be reached, return `(None, None)`.

**Example**

```
G = {"A": [("B", 5), ("C", 2), ("D", 20)],
     "B": [("A", 5), ("D", 1)],
     "C": [("A", 2), ("D", 10)],
     "D": [("A", 20), ("B", 1), ("C", 10)]}
best_routes(G, "A", "D")  ->  (["A", "D"], ["A", "B", "D"])
```
@@starter
import heapq

def best_routes(graph, start, goal):
    # TODO: one search with each hop costing 1 (BFS idea), one with each hop costing its minutes (Dijkstra)
    pass

_G = {"A": [("B", 5), ("C", 2), ("D", 20)], "B": [("A", 5), ("D", 1)],
      "C": [("A", 2), ("D", 10)], "D": [("A", 20), ("B", 1), ("C", 10)]}
print(best_routes(_G, "A", "D"))
@@tests
_G = {"A": [("B", 5), ("C", 2), ("D", 20)], "B": [("A", 5), ("D", 1)],
      "C": [("A", 2), ("D", 10)], "D": [("A", 20), ("B", 1), ("C", 10)]}
assert best_routes(_G, "A", "D") == (["A", "D"], ["A", "B", "D"]), "different best routes"
assert best_routes(_G, "A", "A") == (["A"], ["A"]), "start equals goal"
_T = {"A": [("B", 1), ("C", 1)], "B": [("D", 1)], "C": [("D", 1)], "D": []}
assert best_routes(_T, "A", "D") == (["A", "B", "D"], ["A", "B", "D"]), "ties pick the alphabetically smaller path"
_U = {"A": [], "B": []}
assert best_routes(_U, "A", "B") == (None, None), "unreachable"
_L = {"A": [("B", 1)], "B": [("C", 1)], "C": []}
assert best_routes(_L, "A", "C") == (["A", "B", "C"], ["A", "B", "C"]), "line"
assert best_routes(_L, "C", "A") == (None, None), "one-way tracks"
@@hint
Write one helper that runs a heap search over `(cost, path)` tuples; pass it a function that says what one edge costs (always 1, or its minutes). Skip stations you have already finalized.
@@solution
import heapq

def best_routes(graph, start, goal):
    def search(edge_cost):
        heap = [(0, [start])]
        done = set()
        while heap:
            cost, path = heapq.heappop(heap)
            node = path[-1]
            if node == goal:
                return path
            if node in done:
                continue
            done.add(node)
            for nxt, minutes in graph.get(node, []):
                if nxt not in done:
                    heapq.heappush(heap, (cost + edge_cost(minutes), path + [nxt]))
        return None

    return search(lambda m: 1), search(lambda m: m)
````
