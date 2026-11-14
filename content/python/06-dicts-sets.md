---
id: py-dicts-sets
title: Dictionaries and sets
minutes: 30
---

A dictionary maps keys to values. A set is a collection of unique values. Both find an item in the same short time whether they hold ten entries or ten million, which makes them the tools to reach for whenever you ask "have I seen this?" or "what belongs to this?".

## Dictionaries

```python run
stock = {"bolt": 120, "nut": 300}

stock["washer"] = 75                 # add a key
stock["bolt"] -= 20                  # update a value
print(stock["bolt"], len(stock), "nut" in stock)

print(stock.get("gear"))             # missing key -> None instead of an error
print(stock.get("gear", 0))          # ... or a default you choose

removed = stock.pop("nut")           # remove a key and get its value
print(removed, stock)
```

`stock["gear"]` raises `KeyError` when the key is missing. Use `.get()` when a missing key is normal, and `[]` when it would be a bug.

## Looping over a dictionary

```python run
prices = {"tea": 40, "coffee": 60, "juice": 90}

for name in prices:                       # keys
    print(name, end=" ")
print()

for name, price in prices.items():        # key and value together
    print(f"{name:7} {price:>4}")

print(sorted(prices, key=prices.get, reverse=True))   # keys ordered by value
print(max(prices, key=prices.get), sum(prices.values()))
```

Dictionaries keep the order in which keys were inserted.

## The counting and grouping patterns

Two patterns cover most uses of a dictionary.

```python run
words = "the cat saw the other cat".split()

counts = {}
for word in words:
    counts[word] = counts.get(word, 0) + 1      # count
print(counts)

by_length = {}
for word in words:
    by_length.setdefault(len(word), []).append(word)   # group
print(by_length)

from collections import Counter, defaultdict
print(Counter(words).most_common(2))            # the standard library does both

groups = defaultdict(list)
for word in words:
    groups[word[0]].append(word)
print(dict(groups))
```

## Sets

```python run
seen = {"ana", "ben"}
seen.add("chen")
seen.add("ana")                      # already there: nothing happens
print(seen, len(seen), "ben" in seen)

a = {1, 2, 3, 4}
b = {3, 4, 5}
print(a & b)      # in both (intersection)
print(a | b)      # in either (union)
print(a - b)      # in a but not in b (difference)

print(list(set([3, 1, 3, 2, 1])))    # remove duplicates (order is not kept)
print(list(dict.fromkeys([3, 1, 3, 2, 1])))   # remove duplicates and keep order
```

> `{}` is an empty **dictionary**. An empty set is written `set()`.

## Check yourself

```quiz
[
  {"q": "What does `{\"a\": 1}.get(\"b\", 0)` return?", "options": ["`None`", "`0`", "It raises `KeyError`"], "answer": 1, "why": "`get` returns the default you pass when the key is missing."},
  {"q": "Which is the fastest way to test membership many times in a large collection?", "options": ["`x in some_list`", "`x in some_set`", "A `for` loop with `==`"], "answer": 1, "why": "A set finds an item by hashing it, which takes the same time at any size. A list is scanned item by item."},
  {"q": "What is `len({1, 2, 2, 3, 3, 3})`?", "options": ["6", "3", "1"], "answer": 1, "why": "A set stores each value once."}
]
```

## Exercises

````task
id: first-unique-char
title: First character that does not repeat
kind: code
level: easy
@@statement
Write `first_unique(text)` that returns the first character that appears exactly once in a string.

**Input**: `text`, any string. Upper and lower case are different characters.

**Output**: a one-character string, or `None` when every character repeats or the text is empty.

**Example**

```
first_unique("swiss")    -> "w"    (s repeats, w is the first that does not)
first_unique("aabb")     -> None
```
@@starter
def first_unique(text):
    pass

print(first_unique("swiss"))
@@tests
assert first_unique("swiss") == "w", "skip the repeated s"
assert first_unique("aabb") is None, "everything repeats"
assert first_unique("") is None, "empty text"
assert first_unique("x") == "x", "one character"
assert first_unique("aAbBa") == "A", "case matters"
assert first_unique("level up") == "v", "spaces count as characters"
@@hint
Make two passes: first count every character in a dict, then walk the text again and return the first character whose count is 1.
@@solution
def first_unique(text):
    counts = {}
    for ch in text:
        counts[ch] = counts.get(ch, 0) + 1
    for ch in text:
        if counts[ch] == 1:
            return ch
    return None
````

````task
id: group-by-department
title: Group people by department
kind: code
level: easy
@@statement
Write `group_by_department(people)` that turns a list of `(name, department)` tuples into a dictionary.

**Input**: `people`, a list of `(name, department)` tuples. It may be empty.

**Output**: a dict that maps each department to the **alphabetically sorted** list of its names.

**Example**

```
group_by_department([("Ben", "ops"), ("Ana", "dev"), ("Ali", "ops")])
-> {"ops": ["Ali", "Ben"], "dev": ["Ana"]}
```
@@starter
def group_by_department(people):
    pass

print(group_by_department([("Ben", "ops"), ("Ana", "dev"), ("Ali", "ops")]))
@@tests
assert group_by_department([("Ben", "ops"), ("Ana", "dev"), ("Ali", "ops")]) == {"ops": ["Ali", "Ben"], "dev": ["Ana"]}, "two departments"
assert group_by_department([]) == {}, "empty input"
assert group_by_department([("Zed", "qa")]) == {"qa": ["Zed"]}, "one person"
assert group_by_department([("c", "x"), ("a", "x"), ("b", "x")]) == {"x": ["a", "b", "c"]}, "names are sorted"
assert type(group_by_department([("a", "x")])) is dict, "return a plain dict"
@@hint
Use `groups.setdefault(department, []).append(name)` inside the loop, then sort each list before returning.
@@solution
def group_by_department(people):
    groups = {}
    for name, department in people:
        groups.setdefault(department, []).append(name)
    for names in groups.values():
        names.sort()
    return groups
````

````task
ref: python-core/merge-counts
````

````task
ref: python-core/word-frequencies
````
