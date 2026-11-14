---
id: py-lists-tuples
title: Lists and tuples
minutes: 30
---

A list is an ordered collection that you can change. A tuple is an ordered collection that you cannot. Use a list for "many things of the same kind" and a tuple for "one record with fixed parts".

## Creating and changing lists

```python run
queue = ["weld", "paint"]
queue.append("assembly")          # add at the end
queue.insert(0, "press")          # add at a position (everything after it shifts)
queue.extend(["test", "pack"])    # add several items
print(queue, len(queue))

last = queue.pop()                # remove and return the last item
queue.remove("paint")             # remove the first matching value
del queue[0]                      # remove by position
print(queue, "removed:", last)

queue[0] = "WELD"                 # replace by position
print(queue, "test" in queue, queue.index("test"))
```

## Slices make copies

```python run
numbers = [10, 20, 30, 40, 50]
print(numbers[1:4], numbers[:2], numbers[-2:], numbers[::-1])

same = numbers            # a second name for the SAME list
copy = numbers[:]         # a new list with the same items
same.append(60)
print(numbers)            # changed through the other name
print(copy)               # unaffected
```

> `b = a` never copies a list. If a function changes a list that was passed in, the caller sees the change. Copy with `a[:]` or `list(a)` when you need an independent list.

## Sorting

```python run
scores = [72, 95, 58, 88]

print(sorted(scores))                 # returns a NEW sorted list
print(sorted(scores, reverse=True))
print(scores)                         # the original is unchanged

scores.sort()                         # sorts in place and returns None
print(scores, min(scores), max(scores), sum(scores))

people = [("Ben", 31), ("Ana", 25), ("Chen", 31)]
print(sorted(people, key=lambda p: p[1]))            # sort by age
print(sorted(people, key=lambda p: (-p[1], p[0])))   # age descending, then name
```

`key` is a function that is called once per item and returns the value to sort by. Returning a tuple sorts by several criteria at once.

## Tuples and unpacking

```python run
point = (12.5, 7.0)
x, y = point                      # unpacking: one name per part
print(x, y)

first, *middle, last = [1, 2, 3, 4, 5]
print(first, middle, last)

def min_max(values):
    return min(values), max(values)   # returns one tuple

low, high = min_max([4, 9, 2])
low, high = high, low                 # swap two names without a temporary
print(low, high)
```

## Check yourself

```quiz
[
  {"q": "After `a = [1, 2]; b = a; b.append(3)`, what is `a`?", "options": ["`[1, 2]`", "`[1, 2, 3]`", "An error is raised"], "answer": 1, "why": "`b = a` gives the same list a second name. No copy is made."},
  {"q": "What does `nums.sort()` return?", "options": ["The sorted list", "`None`", "A new list"], "answer": 1, "why": "`sort()` changes the list in place and returns `None`. Use `sorted(nums)` when you need a value back."},
  {"q": "Which of these can be used as a dictionary key?", "options": ["`[1, 2]`", "`(1, 2)`", "Both"], "answer": 1, "why": "Keys must be immutable. A tuple is, a list is not."}
]
```

## Exercises

````task
id: second-largest
title: Second largest value
kind: code
level: easy
@@statement
Write `second_largest(numbers)` that returns the second largest **distinct** value in a list.

**Input**: `numbers`, a list of ints. It may be empty and may contain duplicates.

**Output**: an `int`, or `None` when there are fewer than two distinct values.

**Example**

```
second_largest([4, 9, 2, 9, 7])  -> 7     (9 is the largest, 7 is next)
second_largest([5, 5, 5])        -> None  (only one distinct value)
```
@@starter
def second_largest(numbers):
    pass

print(second_largest([4, 9, 2, 9, 7]))
@@tests
assert second_largest([4, 9, 2, 9, 7]) == 7, "duplicates of the maximum are ignored"
assert second_largest([5, 5, 5]) is None, "one distinct value"
assert second_largest([]) is None, "empty list"
assert second_largest([3]) is None, "one item"
assert second_largest([1, 2]) == 1, "two items"
assert second_largest([-5, -1, -3]) == -3, "negative numbers"
_data = [3, 1, 2]
second_largest(_data)
assert _data == [3, 1, 2], "the input list is not reordered"
@@hint
`sorted(set(numbers))` gives the distinct values in order without touching the original list. Then check its length before taking `[-2]`.
@@solution
def second_largest(numbers):
    distinct = sorted(set(numbers))
    if len(distinct) < 2:
        return None
    return distinct[-2]
````

````task
id: rotate-left
title: Rotate a list
kind: code
level: easy
@@statement
Write `rotate_left(items, k)` that returns a new list with the items moved `k` places to the left. Items that fall off the front come back at the end.

**Input**
- `items`: a list of any values. It may be empty.
- `k`: a whole number, 0 or greater. It may be larger than the length of the list.

**Output**: a new list. The input list must not be changed.

**Example**

```
rotate_left([1, 2, 3, 4, 5], 2)  -> [3, 4, 5, 1, 2]
rotate_left([1, 2, 3], 4)        -> [2, 3, 1]      (4 places is the same as 1)
```
@@starter
def rotate_left(items, k):
    pass

print(rotate_left([1, 2, 3, 4, 5], 2))
@@tests
assert rotate_left([1, 2, 3, 4, 5], 2) == [3, 4, 5, 1, 2], "rotate by two"
assert rotate_left([1, 2, 3], 4) == [2, 3, 1], "k larger than the length"
assert rotate_left([1, 2, 3], 0) == [1, 2, 3], "no rotation"
assert rotate_left([], 3) == [], "empty list"
assert rotate_left(["a"], 10) == ["a"], "one item"
assert rotate_left([1, 2, 3], 3) == [1, 2, 3], "a full turn"
_data = [1, 2, 3]
rotate_left(_data, 1)
assert _data == [1, 2, 3], "the input list is not modified"
@@hint
Reduce `k` with `k % len(items)` (guard against an empty list first), then join two slices: `items[k:] + items[:k]`.
@@solution
def rotate_left(items, k):
    if not items:
        return []
    k %= len(items)
    return items[k:] + items[:k]
````

````task
ref: python-core/rank-scores
````
