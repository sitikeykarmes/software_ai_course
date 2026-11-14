---
id: cs-os-concurrency
title: Operating systems and concurrency
minutes: 45
---

Every server is a program asking the operating system for CPU time, memory, files and network sockets. Knowing how the OS hands these out explains most performance and reliability behaviour you will meet in production.

## Processes and threads

- A **process** is a running program with its own private memory. One process crashing does not corrupt another. Starting one is relatively expensive.
- A **thread** is a path of execution inside a process. Threads share the process's memory, so they are cheap to create and can corrupt each other's data.
- The OS **scheduler** gives each runnable thread a short time slice on a CPU core, then switches. A **context switch** saves one thread's registers and loads another's; it costs microseconds, so thousands of busy threads waste real CPU time on switching.

| | Process | Thread |
| --- | --- | --- |
| Memory | Separate | Shared with other threads in the process |
| Crash impact | Isolated | Can take the whole process down |
| Communication | Pipes, sockets, shared memory (IPC) | Shared variables |
| Creation cost | Higher | Lower |
| Example | Each Chrome tab, each Gunicorn worker | Request handlers in a Java server |

## Memory

- **Stack**: one per thread. Holds function call frames and local variables. Fast, fixed size; too much recursion overflows it.
- **Heap**: shared pool for objects that outlive a function call. Managed by `malloc`/`free` in C and by a garbage collector in Python, Java and Go.
- **Virtual memory**: each process sees its own continuous address space. The OS maps it in fixed-size **pages** onto physical RAM. If RAM runs out, pages are swapped to disk and the machine slows dramatically (thrashing).
- **Memory leak**: memory that is never released. In garbage-collected languages it usually means something still holds a reference, such as an ever-growing cache or list.
- **Python memory**: objects are reference-counted and freed when the count hits zero; a cycle collector cleans up objects that reference each other.

## System calls and file descriptors

Programs run in **user mode** and cannot touch hardware. To read a file or send a packet they make a **system call**, which switches into the **kernel**. `open`, `read`, `write`, `socket`, `fork` and `mmap` are system calls.

Every open file, socket or pipe is represented by a small integer, a **file descriptor**. A process has a limit. The error "Too many open files" on a server almost always means connections or files are being opened and never closed.

## Concurrency and parallelism

- **Concurrency**: making progress on many tasks by interleaving them. One cook switching between three dishes.
- **Parallelism**: tasks literally running at the same instant on different cores. Three cooks.

Workloads fall into two kinds:

- **I/O-bound**: mostly waiting on network or disk. Web servers and API clients are like this. Concurrency helps a great deal because waiting tasks can overlap.
- **CPU-bound**: mostly computing. Image processing, encryption, model inference. Only parallelism across cores helps.

## What goes wrong with shared data

### Race conditions

Two threads read, modify and write the same data and the result depends on timing. Run this several times; the unsafe total is usually wrong.

```python run
import threading, time

class Counter:
    def __init__(self):
        self.value = 0
        self.lock = threading.Lock()

    def unsafe_add(self):
        current = self.value          # read
        time.sleep(0)                 # give another thread a chance to run here
        self.value = current + 1      # write: may overwrite someone else's update

    def safe_add(self):
        with self.lock:               # only one thread at a time in this block
            self.value += 1

def run(method_name):
    c = Counter()
    threads = [threading.Thread(target=lambda: [getattr(c, method_name)() for _ in range(2000)]) for _ in range(8)]
    for t in threads: t.start()
    for t in threads: t.join()
    return c.value

print("expected 16000")
print("unsafe:", run("unsafe_add"))
print("safe:  ", run("safe_add"))
```

The same bug exists between two web requests: both read stock = 1, both sell the last item. In that case the fix is in the database, not a thread lock.

### Tools for coordination

| Tool | Meaning | Typical use |
| --- | --- | --- |
| Mutex (lock) | One holder at a time | Protect a shared structure |
| Semaphore | Up to N holders | Limit concurrent database connections to 10 |
| Condition variable / event | Wait until something happens | Producer wakes a waiting consumer |
| Queue | Thread-safe hand-off | Pass work between threads without sharing state |
| Atomic operation | Cannot be interrupted | Counters, compare-and-swap |

The safest design shares as little as possible: pass messages through queues instead of sharing memory.

### Deadlock

Thread A holds lock 1 and waits for lock 2. Thread B holds lock 2 and waits for lock 1. Neither proceeds. Four conditions must all hold: mutual exclusion, hold and wait, no preemption, and a circular wait. Break any one to prevent it. The practical rule: **always acquire locks in the same global order**, and use timeouts.

Databases have deadlocks too: transaction 1 locks row A then wants row B while transaction 2 locks B then wants A. The database detects it and aborts one; your code must retry.

Related problems: **starvation** (a task never gets its turn) and **livelock** (tasks keep reacting to each other and make no progress).

## Python specifics

### The global interpreter lock

Standard CPython lets only one thread execute Python bytecode at a time. Consequences:

- Threads **do** help I/O-bound work, because the lock is released while waiting on the network or disk.
- Threads **do not** speed up CPU-bound pure Python. Use processes.
- Libraries such as NumPy and PyTorch release the lock inside their heavy routines, so they use many cores anyway.
- Newer Python releases offer an optional free-threaded build without the lock; check that your libraries support it before relying on it.

```python run
import time
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def cpu_work(n):
    return sum(i * i for i in range(n))

def timed(executor_cls, label):
    start = time.perf_counter()
    with executor_cls(max_workers=4) as pool:
        list(pool.map(cpu_work, [2_500_000] * 4))
    print(f"{label}: {time.perf_counter() - start:.2f}s")

if __name__ == "__main__":
    start = time.perf_counter(); [cpu_work(2_500_000) for _ in range(4)]
    print(f"sequential: {time.perf_counter() - start:.2f}s")
    timed(ThreadPoolExecutor, "threads   ")     # about the same as sequential
    timed(ProcessPoolExecutor, "processes ")    # faster on a multi-core machine
```

### asyncio and the event loop

One thread runs an **event loop**. A coroutine runs until it reaches `await`, then hands control back so another coroutine can run. Nothing runs in parallel, yet thousands of network waits overlap. The OS feature underneath is non-blocking sockets with `epoll` or its equivalents, which tell the loop which sockets are ready.

```python run
import asyncio, time

async def handle(request_id):
    await asyncio.sleep(0.5)             # a database or API call
    return f"response {request_id}"

async def main():
    start = time.perf_counter()
    results = await asyncio.gather(*(handle(i) for i in range(100)))
    print(len(results), "requests in", round(time.perf_counter() - start, 2), "seconds")

asyncio.run(main())
```

One hundred half-second waits finish in about half a second. One blocking call in a coroutine (`time.sleep`, a synchronous database driver, heavy computation) freezes all of them; push such work to a thread or process pool.

## How servers handle many requests

| Model | How it works | Example | Trade-off |
| --- | --- | --- | --- |
| Process per worker | Several OS processes, each handles one request at a time | Gunicorn sync workers | Simple and isolated; memory-heavy |
| Thread pool | A fixed pool of threads picks up requests | Java Tomcat, Flask with threads | Good for blocking code; limited by thread count |
| Event loop | One thread, non-blocking I/O, thousands of connections | Nginx, Node.js, Uvicorn | Very efficient for I/O; one blocking call stalls everything |
| Hybrid | Several processes, each with an event loop | Gunicorn managing Uvicorn workers | Uses all cores and handles many connections |

A FastAPI service in production usually runs one Uvicorn worker process per CPU core. The course server you are using right now, `app.py`, uses the thread-per-request model from the standard library.

## Check yourself

```quiz
[
  {"q": "What is the key difference between a process and a thread?", "options": ["Threads are slower", "Processes have separate memory; threads share memory within a process", "Processes cannot use the network"], "answer": 1, "why": "Shared memory makes threads cheap and makes data races possible."},
  {"q": "Your Python script makes 500 HTTP calls. What speeds it up most?", "options": ["Multiprocessing only", "asyncio or a thread pool", "Nothing can"], "answer": 1, "why": "It is I/O-bound: the time is spent waiting, which can overlap."},
  {"q": "Two threads each hold one lock and wait for the other's. This is:", "options": ["A race condition", "A deadlock", "Starvation"], "answer": 1, "why": "A circular wait where nobody can proceed."},
  {"q": "Why does a `time.sleep(2)` inside an async request handler hurt the whole server?", "options": ["It uses too much memory", "It blocks the single event-loop thread, so no other request progresses", "It raises an exception"], "answer": 1, "why": "Use `await asyncio.sleep` or run blocking work in a pool."},
  {"q": "A server reports 'Too many open files'. Most likely cause?", "options": ["The disk is full", "File descriptors (files or sockets) are leaking", "Too many threads"], "answer": 1, "why": "Each open connection or file consumes a descriptor until closed."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: race-simulation
title: Simulate a race condition
kind: code
level: medium
@@statement
`counter += 1` is really two steps: **read** the counter into a local variable, then **write** `local + 1` back. When threads interleave these steps, updates get lost. Simulate this deterministically (no real threads).

Write two functions:

1. `simulate_race(schedule)`: `schedule` is a list of thread names. Each thread name appears exactly **twice**. The first time a thread appears it **reads** the shared counter (starting at `0`) into its own local value; the second time it **writes** `local + 1` to the counter. Return the final counter value (an `int`; an empty schedule gives `0`).
2. `all_totals(n_threads)`: for `n_threads` threads named `0 .. n_threads-1`, each doing one increment, try **every possible** schedule and return a sorted list of the distinct final counter values.

**Example**

```
simulate_race(["A", "A", "B", "B"])  ->  2     (no overlap)
simulate_race(["A", "B", "A", "B"])  ->  1     (both read 0, both write 1)
all_totals(2)                         ->  [1, 2]
```
@@starter
def simulate_race(schedule):
    # TODO: keep `counter`, and a dict of each thread's local value
    pass

def all_totals(n_threads):
    # TODO: generate every ordering of the multiset {0,0,1,1,...} and collect simulate_race results
    pass

print(simulate_race(["A", "B", "A", "B"]), all_totals(2))
@@tests
assert simulate_race(["A", "A", "B", "B"]) == 2, "sequential"
assert simulate_race(["A", "B", "A", "B"]) == 1, "lost update"
assert simulate_race(["A", "B", "B", "A"]) == 1, "nested, A overwrites B"
assert simulate_race([]) == 0, "no threads"
assert simulate_race(["A", "B", "C", "A", "B", "C"]) == 1, "three threads all read 0"
assert all_totals(1) == [1], "one thread"
assert all_totals(2) == [1, 2], "two threads"
assert all_totals(3) == [1, 2, 3], "three threads"
assert all_totals(4) == [1, 2, 3, 4], "four threads"
@@hint
For `all_totals`, build schedules recursively: keep a count of how many steps each thread still has, and try every thread that has steps left.
@@solution
def simulate_race(schedule):
    counter = 0
    local = {}
    seen = {}
    for t in schedule:
        if seen.get(t, 0) == 0:
            local[t] = counter
            seen[t] = 1
        else:
            counter = local[t] + 1
            seen[t] = 2
    return counter

def all_totals(n_threads):
    results = set()
    left = [2] * n_threads
    schedule = []

    def go():
        if len(schedule) == 2 * n_threads:
            results.add(simulate_race(schedule))
            return
        for t in range(n_threads):
            if left[t] > 0:
                left[t] -= 1
                schedule.append(t)
                go()
                schedule.pop()
                left[t] += 1

    go()
    return sorted(results)
````

````task
id: producer-consumer
title: Producer and consumers with queue.Queue
kind: code
level: medium
@@statement
Write a function `squares_pipeline(items, n_consumers=2)` that uses real threads and a `queue.Queue`.

- One producer (the main thread) puts every item of `items` on the queue.
- `n_consumers` consumer threads take items off the queue and compute `item * item`.
- Consumers must stop cleanly: after the producer is done, put one **sentinel** (stop marker) per consumer on the queue. Do not use `time.sleep` or polling, and `join()` all threads.

**Input**: `items`, a list of ints; `n_consumers`, an int `>= 1`.

**Output**: a **sorted** list of the squares (sorting hides the order in which threads finished). Duplicates stay. Empty `items` gives `[]`. Do not change `items`. Protect the shared results list with a `threading.Lock`, or collect results in a second queue.

**Example**

```
squares_pipeline([3, 1, 2])     ->  [1, 4, 9]
squares_pipeline([2, 2, 5], 3)  ->  [4, 4, 25]
```
@@starter
import queue
import threading

_STOP = object()

def squares_pipeline(items, n_consumers=2):
    # TODO: create the queue, start consumers, put items, put one _STOP per consumer, join, return sorted results
    pass

print(squares_pipeline([3, 1, 2]))
@@tests
assert squares_pipeline([3, 1, 2]) == [1, 4, 9], "basic"
assert squares_pipeline([]) == [], "no items"
assert squares_pipeline([2, 2, 5], 3) == [4, 4, 25], "duplicates, three consumers"
assert squares_pipeline([-3, 4], 1) == [9, 16], "one consumer, negative numbers"
assert squares_pipeline(list(range(200)), 4) == [i * i for i in range(200)], "many items"
_items = [1, 2, 3]
squares_pipeline(_items)
assert _items == [1, 2, 3], "input not changed"
assert squares_pipeline([1], 5) == [1], "more consumers than items"
@@hint
A consumer is `while True: x = q.get(); if x is _STOP: break; ...`. After putting all items, put `n_consumers` copies of `_STOP`, then join the threads.
@@solution
import queue
import threading

_STOP = object()

def squares_pipeline(items, n_consumers=2):
    q = queue.Queue()
    results = []
    lock = threading.Lock()

    def consumer():
        while True:
            x = q.get()
            if x is _STOP:
                break
            with lock:
                results.append(x * x)

    threads = [threading.Thread(target=consumer) for _ in range(n_consumers)]
    for t in threads:
        t.start()
    for x in items:
        q.put(x)
    for _ in threads:
        q.put(_STOP)
    for t in threads:
        t.join()
    return sorted(results)
````

````task
id: deadlock-lock-order
title: Detect deadlock risk and fix lock order
kind: code
level: hard
@@statement
Two threads deadlock when one holds lock A and waits for B while the other holds B and waits for A. Model this without real threads.

Each task is a list of lock names, in the order the task acquires them. While a task holds the locks it has already taken, it asks for the next one.

Write two functions:

1. `has_deadlock_risk(tasks)`: return `True` if the tasks could deadlock. Build a graph with an edge `a -> b` whenever some task acquires `a` before `b`. A **cycle** in that graph means deadlock is possible.
2. `fix_order(tasks)`: return a **new** list of tasks where every task acquires its locks in one global order (alphabetical). Do not change the input.

**Input**: `tasks`, a list of lists of lock-name strings (no repeats inside one task). May be empty.

**Output**: `bool` for the first function, a list of lists for the second.

**Example**

```
has_deadlock_risk([["A", "B"], ["B", "A"]])   ->  True
has_deadlock_risk([["A", "B"], ["A", "B"]])   ->  False
fix_order([["B", "A"], ["C", "A"]])           ->  [["A", "B"], ["A", "C"]]
```
@@starter
def has_deadlock_risk(tasks):
    # TODO: build the "acquired before" graph and look for a cycle (DFS)
    pass

def fix_order(tasks):
    # TODO: return new lists, each sorted
    pass

print(has_deadlock_risk([["A", "B"], ["B", "A"]]))
@@tests
assert has_deadlock_risk([["A", "B"], ["B", "A"]]) is True, "classic deadlock"
assert has_deadlock_risk([["A", "B"], ["A", "B"]]) is False, "same order"
assert has_deadlock_risk([["A", "B"], ["B", "C"], ["C", "A"]]) is True, "cycle of three tasks"
assert has_deadlock_risk([]) is False, "no tasks"
assert has_deadlock_risk([["A"]]) is False, "single lock"
assert has_deadlock_risk([["A", "B", "C"], ["A", "C"], ["B", "C"]]) is False, "consistent partial order"
_t = [["B", "A"], ["C", "A"], ["A", "C", "B"]]
_fixed = fix_order(_t)
assert _fixed == [["A", "B"], ["A", "C"], ["A", "B", "C"]], "sorted per task"
assert _t == [["B", "A"], ["C", "A"], ["A", "C", "B"]], "input not changed"
assert has_deadlock_risk(_t) is True and has_deadlock_risk(_fixed) is False, "fix removes the risk"
@@hint
For every task add an edge from each lock to every lock that comes later in that task. Then run a depth-first search with "visiting" and "done" marks; reaching a "visiting" node means a cycle.
@@solution
def has_deadlock_risk(tasks):
    graph = {}
    for task in tasks:
        for i, a in enumerate(task):
            graph.setdefault(a, set())
            for b in task[i + 1:]:
                graph[a].add(b)
                graph.setdefault(b, set())
    state = {}

    def visit(node):
        state[node] = 1
        for nxt in graph[node]:
            if state.get(nxt) == 1:
                return True
            if nxt not in state and visit(nxt):
                return True
        state[node] = 2
        return False

    for node in graph:
        if node not in state and visit(node):
            return True
    return False

def fix_order(tasks):
    return [sorted(task) for task in tasks]
````

````task
id: sequential-vs-concurrent
title: Sequential, threaded and pooled timings
kind: code
level: easy
@@statement
Instead of timing real slow calls (which varies from run to run), compute the time they WOULD take. Write `simulate(durations, mode, workers=1)`.

**Input**
- `durations`: a list of non-negative ints, the time each call takes (e.g. seconds).
- `mode`: one of
  - `"sequential"`: one call after another.
  - `"unlimited"`: every call starts at time 0 at once (like `asyncio.gather` or one thread per call).
  - `"pool"`: only `workers` calls run at a time; each call, in list order, starts on the worker that becomes free first.
- `workers`: int `>= 1`, used only for `"pool"`.

**Output**: an `int`, the total elapsed time until all calls finish. Empty `durations` gives `0`. An unknown `mode` raises `ValueError`.

**Example**

```
simulate([2, 2, 2, 2], "sequential")          ->  8
simulate([2, 2, 2, 2], "unlimited")           ->  2
simulate([5, 2, 2, 2, 2], "pool", workers=2)  ->  7
  (worker 1 runs the 5; worker 2 runs 2, 2, 2 until t=6; the last 2 goes to worker 1 at t=5 and ends at 7)
```
@@starter
import heapq

def simulate(durations, mode, workers=1):
    # TODO: sum, max, or a heap holding the time each worker becomes free
    pass

print(simulate([2, 2, 2, 2], "sequential"))
@@tests
assert simulate([2, 2, 2, 2], "sequential") == 8, "sequential adds up"
assert simulate([2, 2, 2, 2], "unlimited") == 2, "unlimited takes the longest"
assert simulate([5, 2, 2, 2, 2], "pool", workers=2) == 7, "pool of 2"
assert simulate([3, 1, 1, 1], "pool", workers=2) == 3, "pool balances short calls"
assert simulate([2] * 50, "sequential") == 100, "50 calls sequential"
assert simulate([2] * 50, "unlimited") == 2, "50 calls at once"
assert simulate([2] * 50, "pool", workers=10) == 10, "50 calls on 10 workers"
assert simulate([], "sequential") == 0 and simulate([], "unlimited") == 0 and simulate([], "pool", workers=3) == 0, "empty"
assert simulate([4, 1], "pool", workers=5) == 4, "more workers than calls"
try:
    simulate([1], "fast")
    _bad = False
except ValueError:
    _bad = True
assert _bad, "unknown mode raises ValueError"
@@hint
For the pool keep a min-heap of "time this worker is free", starting with `workers` zeros. For each call pop the earliest time, push `time + duration`. The answer is the largest value left in the heap.
@@solution
import heapq

def simulate(durations, mode, workers=1):
    if mode == "sequential":
        return sum(durations)
    if mode == "unlimited":
        return max(durations) if durations else 0
    if mode == "pool":
        free = [0] * workers
        heapq.heapify(free)
        for d in durations:
            t = heapq.heappop(free)
            heapq.heappush(free, t + d)
        return max(free)
    raise ValueError("unknown mode: %r" % (mode,))
````

````task
id: inspect-python-process
title: Read a running Python process
kind: text
level: easy
@@statement
Open Task Manager (Windows: Details tab, add the "Threads" column) or run `top -H` / `ps -o pid,nlwp,rss,%cpu -p <pid>` (macOS/Linux). Start three Python processes, one per terminal:

1. `python -c "import time; time.sleep(120)"` (idle)
2. `python -c "while True: pass"` (busy loop)
3. `python -c "import threading as t; [t.Thread(target=lambda: [None for _ in iter(int, 1)]).start() for _ in range(4)]"` (4 busy threads)

Stop them with Ctrl+C (or end the process) when you are done.

Deliver **8-15 lines** containing a table with one row per process and the columns PID, memory (RSS or "Memory"), thread count, CPU %. Under the table answer: (a) why does process 2 use about one core, and why does process 3 NOT use four cores in CPython? (b) why is the idle process still using several MB of memory? (c) which two columns would you watch to detect a memory leak and a stuck process?
@@hint
Process 3 has several threads, but think about what the GIL allows to run at one moment.
@@solution
Example readings (your numbers will differ):

PID    Process         Memory   Threads   CPU
4120   idle sleep      9 MB     1         0 %
5188   busy loop       9 MB     1         ~100 % of one core (e.g. 6 % on a 16-core machine in Task Manager)
6032   4 busy threads  11 MB    5         ~100 % of one core in total

(a) A busy loop never waits, so one thread keeps one core fully busy. In CPython the GIL lets only one thread execute Python bytecode at a time, so four CPU-bound threads share about one core rather than using four. To use four cores you need four processes (multiprocessing) or native code that releases the GIL. (b) Even an idle interpreter holds its code, the loaded standard library modules and the heap, so it needs several MB resident. (c) A leak shows as memory (RSS) growing steadily over time under constant load; a stuck process shows as CPU near 0 % while it should be working (and a growing thread count can show threads piling up waiting on locks).
@@criteria
- Table has a row for each of the three processes with PID, memory, threads and CPU filled in with plausible measured values.
- Notes that the busy-loop process uses roughly one core (and explains the percentage relative to total cores).
- Explains that the GIL prevents CPU-bound threads from running Python code in parallel, so 4 threads are not 4x faster.
- Reports that the 4-thread process shows about 5 threads (main plus 4) while the others show 1.
- Explains the baseline memory of an idle interpreter.
- Names memory growth over time and CPU near zero or thread count growth as the signs of a leak and a stuck process.
````
