---
id: py-functional
title: Functions as values
minutes: 30
---

In Python a function is a value like any other. You can store it in a variable, put it in a list, pass it to another function and return it from one. Much of the standard library is built on this.

## Passing a function

```python run
def apply_twice(func, value):
    return func(func(value))

def add_three(n):
    return n + 3

print(apply_twice(add_three, 10))
print(apply_twice(str.upper, "abc"))

operations = {"double": lambda n: n * 2, "square": lambda n: n * n}
for name, func in operations.items():
    print(name, func(7))
```

`lambda n: n * 2` is a small function without a name. It can hold one expression. Anything longer deserves a `def`.

## key functions

`sorted`, `min` and `max` accept a `key`: a function that says what to compare.

```python run
words = ["kiwi", "Banana", "fig", "apple"]

print(sorted(words))                              # capitals sort before lower case
print(sorted(words, key=str.lower))               # ignore case
print(sorted(words, key=len))                     # by length
print(sorted(words, key=lambda w: (len(w), w.lower())))   # length, then alphabet
print(max(words, key=len), min(words, key=str.lower))

orders = [{"id": 7, "total": 250}, {"id": 3, "total": 990}, {"id": 5, "total": 40}]
print(sorted(orders, key=lambda o: o["total"], reverse=True)[0])
```

## map and filter

```python run
temps_c = [18.5, 22.0, 31.4]

print(list(map(lambda c: c * 9 / 5 + 32, temps_c)))
print(list(filter(lambda c: c > 20, temps_c)))

# The comprehension versions are usually easier to read
print([c * 9 / 5 + 32 for c in temps_c])
print([c for c in temps_c if c > 20])
```

## Closures: functions that remember

A function defined inside another function can use the outer function's variables, and it keeps them alive after the outer function has returned.

```python run
def make_multiplier(factor):
    def multiply(n):
        return n * factor          # factor is remembered
    return multiply

double = make_multiplier(2)
triple = make_multiplier(3)
print(double(10), triple(10))

def make_counter():
    count = 0
    def increment():
        nonlocal count             # needed to assign to the outer variable
        count += 1
        return count
    return increment

counter = make_counter()
print(counter(), counter(), counter())
```

Each call of `make_counter` creates its own separate `count`. This is the idea behind decorators, which you meet in the advanced unit.

## Check yourself

```quiz
[
  {"q": "What does `sorted([\"bb\", \"a\", \"ccc\"], key=len)` return?", "options": ["`['a', 'bb', 'ccc']`", "`['ccc', 'bb', 'a']`", "`[1, 2, 3]`"], "answer": 0, "why": "`key` decides the order, but the original items are returned."},
  {"q": "What is `(lambda a, b: a + b)(2, 3)`?", "options": ["A function", "`5`", "A syntax error"], "answer": 1, "why": "The lambda is defined and called immediately with 2 and 3."},
  {"q": "Why is `nonlocal` needed in a counter closure?", "options": ["To read the outer variable", "To assign to the outer variable", "To make the variable global"], "answer": 1, "why": "Reading works without it. Assignment would otherwise create a new local variable."}
]
```

## Exercises

````task
id: sort-by-length
title: Sort words by length, then alphabet
kind: code
level: easy
@@statement
Write `sort_words(words)` that returns the words sorted by **length, shortest first**. Words of the same length are ordered alphabetically, ignoring case.

**Input**: `words`, a list of strings. It may be empty.

**Output**: a new list. The input list must not be changed, and each word keeps its original capitals.

**Example**

```
sort_words(["pear", "Fig", "apple", "kiwi", "date"])
-> ["Fig", "date", "kiwi", "pear", "apple"]
```
@@starter
def sort_words(words):
    pass

print(sort_words(["pear", "Fig", "apple", "kiwi", "date"]))
@@tests
assert sort_words(["pear", "Fig", "apple", "kiwi", "date"]) == ["Fig", "date", "kiwi", "pear", "apple"], "length first, then alphabet"
assert sort_words([]) == [], "empty list"
assert sort_words(["b", "A", "c"]) == ["A", "b", "c"], "case is ignored when comparing"
assert sort_words(["ccc", "bb", "a"]) == ["a", "bb", "ccc"], "shortest first"
_data = ["bb", "a"]
sort_words(_data)
assert _data == ["bb", "a"], "the input list is not modified"
@@hint
Use `sorted` with a key that returns a tuple: `key=lambda w: (len(w), w.lower())`.
@@solution
def sort_words(words):
    return sorted(words, key=lambda w: (len(w), w.lower()))
````

````task
id: make-averager
title: A running average that remembers
kind: code
level: medium
@@statement
Write `make_averager()` that returns a function. Each time the returned function is called with a number, it returns the average of **all numbers it has received so far**.

Every call of `make_averager()` must create an independent averager.

**Input**: the returned function takes one int or float.

**Output**: the returned function gives back a float.

**Example**

```
avg = make_averager()
avg(10)  -> 10.0
avg(20)  -> 15.0
avg(60)  -> 30.0
```
@@starter
def make_averager():
    pass

avg = make_averager()
print(avg(10), avg(20), avg(60))
@@tests
_avg = make_averager()
assert _avg(10) == 10.0, "first value"
assert _avg(20) == 15.0, "average of two"
assert _avg(60) == 30.0, "average of three"
_other = make_averager()
assert _other(4) == 4.0, "a second averager starts fresh"
assert _avg(10) == 25.0, "the first averager kept its own history"
assert isinstance(_other(5), float), "the result is a float"
@@hint
Keep `total` and `count` in the outer function and update them in the inner function with `nonlocal total, count`.
@@solution
def make_averager():
    total = 0
    count = 0

    def add(value):
        nonlocal total, count
        total += value
        count += 1
        return total / count

    return add
````

````task
id: compose
title: Chain functions together
kind: code
level: medium
@@statement
Write `pipeline(*functions)` that returns a new function. Calling the new function with a value passes the value through every function **from left to right** and returns the final result.

**Input**: any number of one-argument functions.

**Output**: a function of one argument. With no functions at all, it returns its argument unchanged.

**Example**

```
clean = pipeline(str.strip, str.lower, lambda s: s.replace(" ", "-"))
clean("  Hello World ")   -> "hello-world"

pipeline()(42)            -> 42
```
@@starter
def pipeline(*functions):
    pass

clean = pipeline(str.strip, str.lower)
print(clean("  Hello World "))
@@tests
_clean = pipeline(str.strip, str.lower, lambda s: s.replace(" ", "-"))
assert _clean("  Hello World ") == "hello-world", "three steps in order"
assert pipeline()(42) == 42, "no functions returns the value unchanged"
assert pipeline(lambda n: n + 1)(1) == 2, "one function"
assert pipeline(lambda n: n + 1, lambda n: n * 10)(1) == 20, "left to right: add, then multiply"
assert pipeline(lambda n: n * 10, lambda n: n + 1)(1) == 11, "order matters"
assert _clean("A B") == "a-b", "the pipeline can be reused"
@@hint
Define an inner function `run(value)` that loops `for func in functions: value = func(value)` and returns `value`. Return `run`.
@@solution
def pipeline(*functions):
    def run(value):
        for func in functions:
            value = func(value)
        return value
    return run
````
