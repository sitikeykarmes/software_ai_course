---
id: py-loops
title: Loops: for, while and range
minutes: 30
---

A loop repeats a block of code. Python has two: `for` walks through the items of a collection, and `while` repeats as long as a condition stays true.

## for and range

```python run
for name in ["Ana", "Ben", "Chen"]:
    print("Hello,", name)

for i in range(5):            # 0, 1, 2, 3, 4  (the stop value is not included)
    print(i, end=" ")
print()

print(list(range(2, 10, 3)))  # start, stop, step -> [2, 5, 8]
print(list(range(5, 0, -1)))  # counting down    -> [5, 4, 3, 2, 1]
```

`range(n)` gives exactly `n` numbers starting at 0. That matches how positions in a list are numbered, which is why you see it everywhere.

## Accumulating a result

The most common loop shape: start with an empty result, update it once per item, use it afterwards.

```python run
prices = [120, 80, 45, 300]

total = 0
highest = prices[0]
for price in prices:
    total += price                  # same as: total = total + price
    if price > highest:
        highest = price

print("total:", total, "highest:", highest, "average:", total / len(prices))
```

## enumerate and zip

When you need the position as well as the item, do not manage a counter by hand.

```python run
tasks = ["write", "test", "ship"]
for number, task in enumerate(tasks, start=1):
    print(number, task)

names = ["Ana", "Ben", "Chen"]
scores = [82, 95, 78]
for name, score in zip(names, scores):     # walk two lists side by side
    print(f"{name:5} {score}")
```

## while, break and continue

Use `while` when you do not know in advance how many repetitions you need.

```python run
balance, years = 1000.0, 0
while balance < 2000:
    balance *= 1.07                 # 7% interest per year
    years += 1
print("Doubled after", years, "years")

for n in range(1, 20):
    if n % 2 == 0:
        continue                    # skip the rest of this round
    if n > 9:
        break                       # leave the loop completely
    print(n, end=" ")
print()
```

> A `while` loop must change something that its condition depends on. If nothing changes, it never ends. In this portal a program is stopped after 10 seconds.

## Nested loops

```python run
for row in range(1, 4):
    for col in range(1, 4):
        print(row * col, end="\t")
    print()
```

The inner loop runs completely for every round of the outer loop: 3 x 3 = 9 steps here. Nested loops over large data get slow quickly, so count the steps before you write one.

## Check yourself

```quiz
[
  {"q": "How many numbers does `range(3, 9)` produce?", "options": ["5", "6", "7"], "answer": 1, "why": "3, 4, 5, 6, 7, 8. The stop value 9 is not included, so the count is 9 - 3."},
  {"q": "What does `break` do inside a nested loop?", "options": ["Stops every loop", "Stops only the innermost loop it is in", "Skips to the next round"], "answer": 1, "why": "`break` leaves one loop. The outer loop continues with its next round."},
  {"q": "Which loop is the right choice for 'keep asking until the answer is valid'?", "options": ["`for i in range(10)`", "`while`", "A nested `for`"], "answer": 1, "why": "You do not know the number of attempts in advance, so repeat while the condition holds."}
]
```

## Exercises

````task
id: collatz-steps
title: Collatz steps
kind: code
level: easy
@@statement
Start with a positive whole number `n` and repeat this rule until you reach 1:

- if `n` is even, halve it,
- if `n` is odd, replace it with `3 * n + 1`.

Write `collatz_steps(n)` that returns how many times the rule is applied.

**Input**: `n`, a whole number, 1 or greater.

**Output**: an `int`. For `n = 1` the answer is `0`.

**Example**

```
collatz_steps(6) -> 8      (6, 3, 10, 5, 16, 8, 4, 2, 1)
collatz_steps(1) -> 0
```
@@starter
def collatz_steps(n):
    pass

print(collatz_steps(6))
@@tests
assert collatz_steps(6) == 8, "six needs eight steps"
assert collatz_steps(1) == 0, "already at one"
assert collatz_steps(2) == 1, "one halving"
assert collatz_steps(7) == 16, "odd start"
assert collatz_steps(27) == 111, "a famously long chain"
assert collatz_steps(1024) == 10, "a power of two only halves"
@@hint
Use `while n != 1:` with a counter. Use `//` for halving so that `n` stays an int.
@@solution
def collatz_steps(n):
    steps = 0
    while n != 1:
        if n % 2 == 0:
            n //= 2
        else:
            n = 3 * n + 1
        steps += 1
    return steps
````

````task
id: running-total
title: Running totals
kind: code
level: easy
@@statement
Write `running_total(numbers)` that returns a new list where each position holds the sum of all numbers up to and including that position.

**Input**: `numbers`, a list of ints or floats. It may be empty.

**Output**: a new list of the same length. The input list must not be changed.

**Example**

```
running_total([3, 1, 4, 1])  -> [3, 4, 8, 9]
running_total([])            -> []
```
@@starter
def running_total(numbers):
    pass

print(running_total([3, 1, 4, 1]))
@@tests
assert running_total([3, 1, 4, 1]) == [3, 4, 8, 9], "basic case"
assert running_total([]) == [], "empty list"
assert running_total([5]) == [5], "one item"
assert running_total([2, -2, 2, -2]) == [2, 0, 2, 0], "negative numbers"
_data = [1, 2, 3]
running_total(_data)
assert _data == [1, 2, 3], "the input list is not modified"
@@hint
Keep a variable `total` that grows inside the loop, and append its current value to a result list on every round.
@@solution
def running_total(numbers):
    result = []
    total = 0
    for number in numbers:
        total += number
        result.append(total)
    return result
````

````task
id: count-vowels
title: Count the vowels
kind: code
level: easy
@@statement
Write `count_vowels(text)` that counts how often each vowel appears in a text.

**Input**: `text`, any string.

**Output**: a dict with exactly the keys `"a"`, `"e"`, `"i"`, `"o"`, `"u"`, each mapped to its count. Upper and lower case count as the same letter. Vowels that do not appear have the count `0`.

**Example**

```
count_vowels("Education")
-> {"a": 1, "e": 1, "i": 1, "o": 1, "u": 1}
```
@@starter
def count_vowels(text):
    counts = {"a": 0, "e": 0, "i": 0, "o": 0, "u": 0}
    # loop over the characters of text and update counts
    return None

print(count_vowels("Education"))
@@tests
assert count_vowels("Education") == {"a": 1, "e": 1, "i": 1, "o": 1, "u": 1}, "every vowel once"
assert count_vowels("") == {"a": 0, "e": 0, "i": 0, "o": 0, "u": 0}, "empty text"
assert count_vowels("rhythm") == {"a": 0, "e": 0, "i": 0, "o": 0, "u": 0}, "no vowels"
assert count_vowels("AaEe") == {"a": 2, "e": 2, "i": 0, "o": 0, "u": 0}, "case is ignored"
assert count_vowels("queue up!") == {"a": 0, "e": 2, "i": 0, "o": 0, "u": 3}, "repeated vowels and punctuation"
@@hint
Loop with `for ch in text.lower():` and test `if ch in counts:` before adding one.
@@solution
def count_vowels(text):
    counts = {"a": 0, "e": 0, "i": 0, "o": 0, "u": 0}
    for ch in text.lower():
        if ch in counts:
            counts[ch] += 1
    return counts
````
