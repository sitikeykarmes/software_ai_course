---
id: python-core
title: Python core: values, control flow, functions, collections
minutes: 60
---

Python runs your file top to bottom, one statement at a time. Every value is an object, and every variable is a name attached to an object. Most confusing bugs in Python disappear once that sentence is clear, so this lesson starts there.

## Names and objects

Assignment never copies. It attaches a name to an object.

```python run
a = [1, 2, 3]
b = a            # b is a second name for the SAME list
b.append(4)
print(a)         # [1, 2, 3, 4]  -- a changed too
print(a is b)    # True: one object, two names

c = a.copy()     # a new list with the same items
c.append(5)
print(a, c)
```

- `==` asks whether two objects have equal value. `is` asks whether they are the same object. Use `is` only with `None`: `if x is None`.
- **Immutable** objects cannot change after creation: `int`, `float`, `str`, `tuple`, `bool`, `frozenset`. Operations on them build a new object.
- **Mutable** objects can change in place: `list`, `dict`, `set`, and most objects you define.

Real consequence: a function that receives a list can modify the caller's list. That is either a feature or a bug depending on whether you meant it.

## Built-in types

| Type | Example | Notes |
| --- | --- | --- |
| `int` | `42`, `10 ** 100` | Unlimited size; never overflows |
| `float` | `3.14`, `1e-9` | 64-bit; `0.1 + 0.2 != 0.3`, so compare with `math.isclose` |
| `bool` | `True`, `False` | A subclass of int: `True + True == 2` |
| `str` | `"plant"` | Immutable sequence of Unicode characters |
| `None` | `None` | The single "no value" object |
| `list` | `[1, 2, 3]` | Ordered, mutable, allows duplicates |
| `tuple` | `(1, 2)` | Ordered, immutable; good for fixed records and dict keys |
| `dict` | `{"a": 1}` | Key to value, keeps insertion order |
| `set` | `{1, 2}` | Unique items, fast membership test |

**Truthiness**: `0`, `0.0`, `""`, `[]`, `{}`, `set()`, `None` are false in an `if`; everything else is true. So `if items:` means "if the list is not empty".

For money, use `decimal.Decimal` or integer paise or cents. Floats lose precision.

## Strings

```python run
part = "  Cylinder-Head-A12  "
clean = part.strip()
print(clean.lower(), clean.split("-"))
print(clean.replace("A12", "B07"), clean.startswith("Cyl"))
print(clean[0:8], clean[-3:], clean[::-1])     # slicing: start:stop:step

qty, price = 3, 1499.5
print(f"{qty} units at Rs {price:,.2f} = Rs {qty * price:,.2f}")   # f-string formatting
print(", ".join(["a", "b", "c"]))               # build strings with join, not += in a loop
```

Strings are immutable, so `s += x` in a loop creates a new string each time, which is O(n²) overall. Collect pieces in a list and `"".join(pieces)` once.

## Control flow

```python run
readings = [71.2, 69.8, 75.4, 80.1, 68.0]

for i, value in enumerate(readings):            # index and value together
    if value > 80:
        print(f"reading {i} is too high: {value}")
        break                                    # leave the loop
    elif value < 69:
        continue                                 # skip to the next item
    print(f"reading {i} ok")
else:
    print("no reading was too high")             # runs only if the loop did not break

n = 3
while n > 0:
    n -= 1
print("done", n)

status = "ok" if max(readings) < 85 else "alarm"  # conditional expression
print(status)
```

Useful loop helpers: `range(start, stop, step)`, `enumerate(seq)`, `zip(a, b)` to walk two sequences together, `reversed(seq)`, `sorted(seq, key=..., reverse=True)`.

## Lists, tuples, dicts and sets in practice

```python run
stations = ["weld", "paint", "assembly"]
stations.append("inspection")        # add at the end, O(1)
stations.insert(0, "press")          # add at the front, O(n): everything shifts
last = stations.pop()                # remove from the end, O(1)
print(stations, last, len(stations), "paint" in stations)

point = (12.5, 7.0)                  # tuple: a fixed record
x, y = point                         # unpacking
first, *rest = stations
print(x, y, first, rest)

defects = {"scratch": 4, "dent": 1}
defects["misalign"] = 2              # insert or update
defects["scratch"] += 1
print(defects.get("crack", 0))       # default instead of KeyError
for kind, count in defects.items():
    print(kind, count)

seen = {"A12", "B07"}
seen.add("A12")                      # duplicates are ignored
print(seen, {"A12", "C01"} & seen, {"A12", "C01"} | seen)
```

Choosing between them:

- Need order and duplicates: **list**.
- Need to look up by key: **dict**.
- Need "have I seen this?" or uniqueness: **set**. `x in my_set` is O(1); `x in my_list` is O(n). Converting a list to a set before many membership checks is one of the most common speed-ups in real code.
- Need a fixed group of values, or a dict key made of several values: **tuple**.

### Comprehensions

A comprehension builds a collection from a loop in one expression.

```python run
nums = [3, 8, 1, 9, 4]
squares = [n * n for n in nums]
evens = [n for n in nums if n % 2 == 0]
index_of = {n: i for i, n in enumerate(nums)}
unique_lengths = {len(w) for w in ["bolt", "nut", "gear", "pin"]}
print(squares, evens, index_of, unique_lengths)

grid = [[0] * 3 for _ in range(2)]   # correct 2x3 grid
bad = [[0] * 3] * 2                  # WRONG: two names for the same inner list
bad[0][0] = 99
print(grid, bad)
```

### The collections module

```python run
from collections import Counter, defaultdict, deque

words = "the line stopped the line restarted the shift ended".split()
print(Counter(words).most_common(2))

by_first = defaultdict(list)         # missing keys start as an empty list
for w in words:
    by_first[w[0]].append(w)
print(dict(by_first))

queue = deque([1, 2, 3])
queue.append(4); queue.appendleft(0) # O(1) at both ends
print(queue.popleft(), queue.pop(), queue)
```

## Functions

A function packages a computation behind a name. Keep each one small, with one job and a clear return value.

```python run
def average(values, ignore_zero=False):
    """Return the mean of values, optionally skipping zeros."""
    if ignore_zero:
        values = [v for v in values if v != 0]
    if not values:
        return None
    return sum(values) / len(values)

print(average([4, 0, 8]), average([4, 0, 8], ignore_zero=True))

def describe(*args, **kwargs):       # any number of positional and keyword arguments
    return f"args={args} kwargs={kwargs}"
print(describe(1, 2, unit="mm"))

def min_max(values):
    return min(values), max(values)  # returns a tuple
lo, hi = min_max([5, 2, 9])
print(lo, hi)
```

### The mutable default trap

Default values are created once, when the function is defined, and shared by every call.

```python run
def add_bad(item, bucket=[]):
    bucket.append(item)
    return bucket
print(add_bad(1), add_bad(2))        # [1, 2] [1, 2]  -- shared list

def add_good(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket
print(add_good(1), add_good(2))      # [1] [2]
```

### Scope, closures and functions as values

Python looks a name up in this order: Local, Enclosing function, Global, Built-in. Functions are objects, so you can pass them around and return them.

```python run
def make_counter():
    count = 0
    def increment():
        nonlocal count               # modify the enclosing variable
        count += 1
        return count
    return increment                 # the inner function remembers count: a closure

c = make_counter()
print(c(), c(), c())

parts = [("bolt", 4.5), ("gear", 120.0), ("pin", 0.8)]
print(sorted(parts, key=lambda p: p[1], reverse=True))   # sort by price
print(max(parts, key=lambda p: len(p[0])))
```

`lambda` is a small unnamed function. If it needs more than one expression, write a normal `def`.

## Errors and exceptions

```python run
def parse_reading(text):
    try:
        value = float(text)
    except ValueError:
        print(f"skipping bad reading: {text!r}")
        return None
    else:
        return value                 # runs when no exception happened
    finally:
        pass                         # always runs: close files, release locks

print([parse_reading(t) for t in ["71.5", "n/a", "68"]])

class OutOfRange(Exception):
    """Raised when a sensor value is outside its valid range."""

def check(value):
    if not 0 <= value <= 150:
        raise OutOfRange(f"{value} is outside 0 to 150")
    return value

try:
    check(200)
except OutOfRange as exc:
    print("rejected:", exc)
```

Rules that keep error handling honest:

- Catch the narrowest exception you can handle. A bare `except:` hides typos and real failures.
- Do not use exceptions you cannot act on; let them rise to a place that can log them and respond.
- Raise your own exception types for your own failure cases, as above.

## Files and modules

```python
from pathlib import Path
import json, csv

path = Path("data") / "readings.csv"
with path.open(newline="", encoding="utf-8") as f:     # 'with' closes the file even on error
    rows = list(csv.DictReader(f))

Path("summary.json").write_text(json.dumps({"rows": len(rows)}, indent=2), encoding="utf-8")
```

A **module** is a `.py` file; a **package** is a folder of modules. `import math`, `from collections import Counter`, `import numpy as np`. Code that should run only when the file is executed directly goes under:

```python
if __name__ == "__main__":
    main()
```

Third-party packages come from PyPI with `pip install name`. Normally each project gets its own **virtual environment** (`python -m venv .venv`) so its dependencies do not clash with another project's. Where you cannot create one, install with `pip install --user` and record exact versions in `requirements.txt`.

## Real-world example: summarising a log file

This is the shape of a large share of real scripts: read lines, parse, group, report.

```python run
from collections import Counter, defaultdict

log = """2026-11-03 08:01 station=weld status=OK cycle=41.2
2026-11-03 08:02 station=weld status=NG cycle=55.9
2026-11-03 08:02 station=paint status=OK cycle=30.0
2026-11-03 08:03 station=weld status=OK cycle=40.7
2026-11-03 08:04 station=paint status=NG cycle=33.1"""

status_count = Counter()
cycles = defaultdict(list)
for line in log.splitlines():
    date, time, *fields = line.split()
    record = dict(f.split("=") for f in fields)
    status_count[(record["station"], record["status"])] += 1
    cycles[record["station"]].append(float(record["cycle"]))

for station, values in cycles.items():
    ng = status_count[(station, "NG")]
    print(f"{station:6} avg cycle {sum(values) / len(values):5.1f}s  NG rate {ng / len(values):.0%}")
```

## Check yourself

```quiz
[
  {"q": "After `a = [1, 2]; b = a; b.append(3)`, what is `a`?", "options": ["`[1, 2]`", "`[1, 2, 3]`", "An error is raised"], "answer": 1, "why": "`b = a` makes a second name for the same list; no copy happens."},
  {"q": "Which is the fastest way to check membership many times?", "options": ["`x in some_list`", "`x in some_set`", "A for loop with `==`"], "answer": 1, "why": "Set lookup is O(1) on average; list lookup scans every item."},
  {"q": "What is wrong with `def f(x, items=[])`?", "options": ["Nothing", "The default list is shared across all calls", "Lists cannot be defaults"], "answer": 1, "why": "Defaults are evaluated once at definition time. Use `None` and create the list inside."},
  {"q": "When does the `else` block of a `for` loop run?", "options": ["When the loop body raised an error", "When the loop finished without `break`", "Always"], "answer": 1, "why": "It is the 'no break happened' branch, handy for search loops."},
  {"q": "Which statement about strings is true?", "options": ["`s[0] = 'x'` changes the string in place", "Strings are immutable; operations return new strings", "`+=` on strings in a loop is O(n) overall"], "answer": 1, "why": "Immutability is why repeated `+=` is quadratic and `join` is preferred."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** to find out whether it is right.

````task
id: word-frequencies
title: Most common words
kind: code
level: easy
@@statement
Write a function `word_frequencies(text, n=10)` that returns the `n` most common words in `text`.

**Input**
- `text`: a string of any length, possibly with punctuation and mixed case.
- `n`: how many words to return (default 10).

**Output**: a list of `(word, count)` tuples.
- Ignore case: `The` and `the` are the same word. Return words in lowercase.
- A word is a run of letters, digits or apostrophes. Everything else (spaces, `.`, `!`, `?`, `,`) separates words.
- Sort by count, highest first. Break ties alphabetically.
- If there are fewer than `n` distinct words, return all of them. Empty text gives `[]`.

**Example**

```
word_frequencies("The cat. The hat! A cat?")
-> [('cat', 2), ('the', 2), ('a', 1), ('hat', 1)]

word_frequencies("a b c d", 2)
-> [('a', 1), ('b', 1)]
```
@@starter
import re
from collections import Counter

def word_frequencies(text, n=10):
    # your code here
    pass

print(word_frequencies("The cat. The hat! A cat?"))
@@tests
assert word_frequencies("The cat. The hat! A cat?") == [("cat", 2), ("the", 2), ("a", 1), ("hat", 1)], "tie-break and lowercase"
assert word_frequencies("a b c d", 2) == [("a", 1), ("b", 1)], "n limits the result"
assert word_frequencies("") == [], "empty text"
assert word_frequencies("Don't stop, don't!") == [("don't", 2), ("stop", 1)], "apostrophes stay inside words"
assert len(word_frequencies(" ".join("w%d" % i for i in range(30)))) == 10, "default n is 10"
@@hint
`re.findall(r"[a-z0-9']+", text.lower())` gives the words. Then `Counter(...)`, and sort with the key `(-count, word)`.
@@solution
import re
from collections import Counter

def word_frequencies(text, n=10):
    words = re.findall(r"[a-z0-9']+", text.lower())
    counts = Counter(words)
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ranked[:n]
````

````task
id: merge-counts
title: Merge two count dictionaries
kind: code
level: easy
@@statement
Write two functions that merge two dicts of counts. When a key is in both dicts, add the values.

1. `merge_counts(a, b)`: do it by hand, **without** `Counter`.
2. `merge_counts_counter(a, b)`: do it again **with** `collections.Counter`.

**Input**: two dicts mapping strings to integers.

**Output**: a new dict. The inputs must not be changed.

**Example**

```
merge_counts({"a": 1, "b": 2}, {"b": 3, "c": 4})
-> {"a": 1, "b": 5, "c": 4}
```
@@starter
from collections import Counter

def merge_counts(a, b):
    pass

def merge_counts_counter(a, b):
    pass
@@tests
a, b = {"a": 1, "b": 2}, {"b": 3, "c": 4}
assert merge_counts(a, b) == {"a": 1, "b": 5, "c": 4}, "merge_counts result"
assert merge_counts_counter(a, b) == {"a": 1, "b": 5, "c": 4}, "merge_counts_counter result"
assert a == {"a": 1, "b": 2} and b == {"b": 3, "c": 4}, "inputs must not be modified"
assert merge_counts({}, {"x": 1}) == {"x": 1}, "empty first dict"
assert merge_counts({}, {}) == {}, "both empty"
assert type(merge_counts_counter(a, b)) is dict, "return a plain dict, not a Counter"
@@hint
Start from `result = dict(a)`, then loop over `b` and use `result.get(key, 0) + value`. For the Counter version, `Counter(a) + Counter(b)` adds counts, and `dict(...)` turns it back into a plain dict.
@@solution
from collections import Counter

def merge_counts(a, b):
    result = dict(a)
    for key, value in b.items():
        result[key] = result.get(key, 0) + value
    return result

def merge_counts_counter(a, b):
    return dict(Counter(a) + Counter(b))
````

````task
id: rank-scores
title: Sort scores, high to low
kind: code
level: easy
@@statement
Write `rank_scores(records)` that sorts `(name, score)` tuples by **score descending**, then by **name ascending** when scores are equal. Return the lines to print, one string per record, formatted as `name: score`.

**Input**: a list of `(name, score)` tuples.

**Output**: a list of strings.

**Example**

```
rank_scores([("bo", 90), ("al", 90), ("cy", 75)])
-> ["al: 90", "bo: 90", "cy: 75"]
```

The starter prints the lines for you, so you can see how it looks.
@@starter
def rank_scores(records):
    pass

for line in rank_scores([("bo", 90), ("al", 90), ("cy", 75)]):
    print(line)
@@tests
assert rank_scores([("bo", 90), ("al", 90), ("cy", 75)]) == ["al: 90", "bo: 90", "cy: 75"], "ties broken by name"
assert rank_scores([("z", 1), ("y", 5), ("x", 3)]) == ["y: 5", "x: 3", "z: 1"], "plain descending"
assert rank_scores([]) == [], "empty input"
data = [("b", 1), ("a", 2)]
rank_scores(data)
assert data == [("b", 1), ("a", 2)], "do not reorder the caller's list"
@@hint
`sorted(records, key=lambda r: (-r[1], r[0]))`: negating the score gives descending order while the name stays ascending.
@@solution
def rank_scores(records):
    ordered = sorted(records, key=lambda r: (-r[1], r[0]))
    return [f"{name}: {score}" for name, score in ordered]
````

````task
id: csv-group-average
title: Grouped average from CSV, as JSON
kind: code
level: medium
@@statement
Write `average_by_group(csv_text, group_col, value_col)`. It reads CSV text, groups the rows by one column, and returns the average of another column per group **as a JSON string**.

(In real work you would read a file. Here the CSV arrives as a string so the task runs anywhere. `csv.DictReader(io.StringIO(csv_text))` reads it exactly like a file.)

**Input**
- `csv_text`: CSV text whose first line is the header.
- `group_col`, `value_col`: column names. `value_col` holds numbers.

**Output**: a JSON string of an object mapping each group to its average, rounded to 2 decimals, with keys sorted alphabetically.

**Example**

```
csv_text = "station,cycle\nweld,10\nweld,20\npaint,5\n"
average_by_group(csv_text, "station", "cycle")
-> '{"paint": 5.0, "weld": 15.0}'
```
@@starter
import csv
import io
import json

def average_by_group(csv_text, group_col, value_col):
    # your code here
    pass

sample = "station,cycle\nweld,10\nweld,20\npaint,5\n"
print(average_by_group(sample, "station", "cycle"))
@@tests
import json as _json
sample = "station,cycle\nweld,10\nweld,20\npaint,5\n"
out = average_by_group(sample, "station", "cycle")
assert isinstance(out, str), "return a JSON string, not a dict"
assert _json.loads(out) == {"paint": 5.0, "weld": 15.0}, "averages per station"
assert out.index("paint") < out.index("weld"), "keys must be sorted"
other = "id,team,score\n1,red,7.5\n2,blue,2\n3,red,8.5\n"
assert _json.loads(average_by_group(other, "team", "score")) == {"blue": 2.0, "red": 8.0}, "different columns"
third = "g,v\na,1\na,2\na,2\n"
assert _json.loads(average_by_group(third, "g", "v")) == {"a": 1.67}, "rounded to 2 decimals"
@@hint
Collect values per group in a `defaultdict(list)` while looping over `csv.DictReader`. Convert with `float(row[value_col])`. Finish with `json.dumps(result, sort_keys=True)`.
@@solution
import csv
import io
import json
from collections import defaultdict

def average_by_group(csv_text, group_col, value_col):
    groups = defaultdict(list)
    for row in csv.DictReader(io.StringIO(csv_text)):
        groups[row[group_col]].append(float(row[value_col]))
    result = {g: round(sum(v) / len(v), 2) for g, v in groups.items()}
    return json.dumps(result, sort_keys=True)
````

````task
id: explain-eq-is
title: Explain == vs is, and list vs tuple
kind: text
level: easy
@@statement
Explain these two differences in your own words, as if to a teammate who is new to Python. Write 4 to 8 sentences in total and include **one tiny code example for each**.

1. `==` versus `is`
2. a `list` versus a `tuple`

Do not look at the lesson while you write. If you cannot, that is the part to re-read.
@@criteria
- States that `==` compares values (equality) and `is` compares identity (the same object in memory).
- Gives an example where `==` is True but `is` is False, such as two separate lists with equal contents.
- Says `is` is the right tool for `None` checks (`x is None`), not for comparing numbers or strings.
- States that a list is mutable and a tuple is immutable.
- Mentions a practical consequence, for example tuples can be dict keys or set members and lists cannot, or tuples signal a fixed record.
@@solution
`==` asks whether two objects have equal values. `is` asks whether they are the very same object in memory. For example, `[1, 2] == [1, 2]` is True, but `[1, 2] is [1, 2]` is False because they are two separate lists. Use `is` mainly for `None` checks, such as `if x is None`.

A list is mutable: you can append, remove and change items. A tuple is immutable: once created it cannot change. Because of that a tuple can be used as a dict key or set member, for example `(12.5, 7.0)` as a coordinate, while a list cannot. Use a tuple for a fixed record and a list for a collection that grows.
````
