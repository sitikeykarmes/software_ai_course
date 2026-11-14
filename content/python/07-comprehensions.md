---
id: py-comprehensions
title: Comprehensions
minutes: 25
---

A comprehension builds a new list, dictionary or set from an existing collection in one expression. It replaces the "create empty list, loop, append" pattern.

## From a loop to a comprehension

```python run
prices = [120, 80, 45, 300]

with_tax = []
for p in prices:
    with_tax.append(round(p * 1.18, 2))
print(with_tax)

with_tax = [round(p * 1.18, 2) for p in prices]      # the same thing
print(with_tax)
```

Read it in this order: **for** each `p` in `prices`, produce `round(p * 1.18, 2)`.

## Filtering

An `if` at the end keeps only some items. An `if ... else` at the front chooses what to produce for every item.

```python run
numbers = [3, -1, 4, -1, 5, -9, 2]

positives = [n for n in numbers if n > 0]             # keep some
clipped = [n if n > 0 else 0 for n in numbers]        # change some
print(positives)
print(clipped)

names = ["  Ana", "ben ", "", "  ", "Chen"]
print([n.strip().title() for n in names if n.strip()])
```

## Dictionaries and sets

```python run
words = ["apple", "fig", "kiwi", "plum", "fig"]

lengths = {w: len(w) for w in words}          # dict comprehension
print(lengths)

unique_lengths = {len(w) for w in words}      # set comprehension
print(unique_lengths)

prices = {"tea": 40, "coffee": 60, "juice": 90}
print({name: price for name, price in prices.items() if price >= 60})
print({price: name for name, price in prices.items()})    # swap keys and values
```

## zip, enumerate, any and all

```python run
names = ["Ana", "Ben", "Chen"]
scores = [82, 45, 78]

print(dict(zip(names, scores)))
print([name for name, score in zip(names, scores) if score >= 50])
print([f"{i}. {name}" for i, name in enumerate(names, start=1)])

print(any(score < 50 for score in scores))    # is at least one below 50?
print(all(score >= 40 for score in scores))   # are all of them 40 or more?
print(sum(score for score in scores) / len(scores))
```

Inside a function call you can leave out the square brackets. That is a generator expression: it feeds the items one at a time instead of building a list first.

## Nested comprehensions

```python run
matrix = [[1, 2, 3], [4, 5, 6]]

flat = [value for row in matrix for value in row]     # read the fors left to right
print(flat)

grid = [[row * col for col in range(1, 4)] for row in range(1, 4)]
print(grid)
```

> If a comprehension needs more than one `for` and one `if`, a normal loop is usually easier to read. Short and clear is the goal, not short at any cost.

## Check yourself

```quiz
[
  {"q": "What is `[x * 2 for x in range(4) if x % 2]`?", "options": ["`[0, 4]`", "`[2, 6]`", "`[0, 2, 4, 6]`"], "answer": 1, "why": "`x % 2` is truthy for the odd values 1 and 3, which are doubled."},
  {"q": "Which expression builds a dictionary?", "options": ["`[k: v for k, v in pairs]`", "`{k: v for k, v in pairs}`", "`{k, v for k, v in pairs}`"], "answer": 1, "why": "Curly braces with `key: value` make a dict comprehension."},
  {"q": "What does `all([])` return?", "options": ["`True`", "`False`", "It raises an error"], "answer": 0, "why": "`all` is true when no item is false, which includes the case of no items at all."}
]
```

## Exercises

````task
id: squares-of-evens
title: Squares of the even numbers
kind: code
level: easy
@@statement
Write `squares_of_evens(numbers)` that returns the squares of the even numbers in a list, in their original order.

Write the body as a single list comprehension.

**Input**: `numbers`, a list of ints. It may be empty.

**Output**: a new list of ints.

**Example**

```
squares_of_evens([1, 2, 3, 4, 6])  -> [4, 16, 36]
squares_of_evens([1, 3])           -> []
```
@@starter
def squares_of_evens(numbers):
    pass

print(squares_of_evens([1, 2, 3, 4, 6]))
@@tests
assert squares_of_evens([1, 2, 3, 4, 6]) == [4, 16, 36], "mixed numbers"
assert squares_of_evens([1, 3]) == [], "no even numbers"
assert squares_of_evens([]) == [], "empty list"
assert squares_of_evens([-2, 0]) == [4, 0], "zero and negative numbers are even too"
assert squares_of_evens([2, 2]) == [4, 4], "duplicates are kept"
@@hint
The shape is `[expression for n in numbers if condition]`. A number is even when `n % 2 == 0`.
@@solution
def squares_of_evens(numbers):
    return [n * n for n in numbers if n % 2 == 0]
````

````task
id: transpose
title: Transpose a matrix
kind: code
level: medium
@@statement
A matrix is stored as a list of rows, where every row is a list of the same length. Write `transpose(matrix)` that swaps rows and columns: the first row of the result is the first column of the input, and so on.

**Input**: `matrix`, a list of equal-length lists. It may be empty.

**Output**: a new list of lists. An empty matrix gives `[]`.

**Example**

```
transpose([[1, 2, 3],
           [4, 5, 6]])
-> [[1, 4],
    [2, 5],
    [3, 6]]
```
@@starter
def transpose(matrix):
    pass

print(transpose([[1, 2, 3], [4, 5, 6]]))
@@tests
assert transpose([[1, 2, 3], [4, 5, 6]]) == [[1, 4], [2, 5], [3, 6]], "two rows become three"
assert transpose([]) == [], "empty matrix"
assert transpose([[7]]) == [[7]], "one cell"
assert transpose([[1, 2]]) == [[1], [2]], "one row becomes one column"
assert transpose([[1], [2]]) == [[1, 2]], "one column becomes one row"
assert transpose(transpose([[1, 2], [3, 4]])) == [[1, 2], [3, 4]], "transposing twice gives the original"
assert all(type(row) is list for row in transpose([[1, 2], [3, 4]])), "rows must be lists, not tuples"
@@hint
`zip(*matrix)` yields the columns as tuples. Wrap each one: `[list(column) for column in zip(*matrix)]`.
@@solution
def transpose(matrix):
    return [list(column) for column in zip(*matrix)]
````

````task
id: invert-index
title: Build a word index
kind: code
level: medium
@@statement
A search engine keeps an index that says, for every word, which documents contain it. Write `build_index(documents)`.

**Input**: `documents`, a dict that maps a document name to its text. Words are separated by spaces. Treat words as case-insensitive.

**Output**: a dict that maps each lower case word to the **sorted list** of document names that contain it. Each name appears at most once per word.

**Example**

```
build_index({"a.txt": "red green", "b.txt": "Green blue green"})
-> {"red": ["a.txt"], "green": ["a.txt", "b.txt"], "blue": ["b.txt"]}
```
@@starter
def build_index(documents):
    pass

print(build_index({"a.txt": "red green", "b.txt": "Green blue green"}))
@@tests
assert build_index({"a.txt": "red green", "b.txt": "Green blue green"}) == {"red": ["a.txt"], "green": ["a.txt", "b.txt"], "blue": ["b.txt"]}, "two documents"
assert build_index({}) == {}, "no documents"
assert build_index({"x": ""}) == {}, "an empty document adds no words"
assert build_index({"z": "hi", "a": "hi", "m": "HI"}) == {"hi": ["a", "m", "z"]}, "names are sorted"
assert build_index({"d": "go go go"}) == {"go": ["d"]}, "a document is listed once per word"
@@hint
Collect names in a set per word first (`index.setdefault(word, set()).add(name)`), then convert with a dict comprehension: `{word: sorted(names) for word, names in index.items()}`.
@@solution
def build_index(documents):
    index = {}
    for name, text in documents.items():
        for word in text.lower().split():
            index.setdefault(word, set()).add(name)
    return {word: sorted(names) for word, names in index.items()}
````
