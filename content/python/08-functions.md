---
id: py-functions
title: Writing functions
minutes: 30
---

A function gives a name to a piece of work. You hand it inputs (arguments), it hands back a result (the return value). Small functions with one clear job are the main tool for keeping a program understandable.

## Defining and calling

```python run
def area(width, height):
    """Return the area of a rectangle."""
    return width * height

print(area(3, 4))
print(area(height=2, width=10))     # keyword arguments can come in any order
help(area)                          # the docstring is the function's built-in documentation
```

A function without a `return` statement returns `None`. Printing inside a function is not the same as returning: a printed value is shown on the screen and then lost, a returned value can be stored, compared and passed on.

```python run
def shout(text):
    print(text.upper())          # shows the text, returns None

def loud(text):
    return text.upper()          # gives the text back

result = shout("hello")
print("shout returned:", result)
print("loud returned:", loud("hello"))
```

## Default values

```python run
def greet(name, greeting="Hello", punctuation="!"):
    return f"{greeting}, {name}{punctuation}"

print(greet("Ana"))
print(greet("Ben", "Welcome"))
print(greet("Chen", punctuation="."))
```

> Never use a list or dict as a default value. The default is created once and shared by every call, so `def add(item, bucket=[])` remembers items between calls. Use `bucket=None` and create the list inside the function.

## Any number of arguments

```python run
def total(*numbers):                 # numbers is a tuple of all positional arguments
    return sum(numbers)

def describe(**details):             # details is a dict of all keyword arguments
    return ", ".join(f"{key}={value}" for key, value in details.items())

print(total(), total(1, 2, 3))
print(describe(colour="red", size=42))

values = [4, 5, 6]
print(total(*values))                # * unpacks a list into separate arguments
```

## Scope

A name created inside a function exists only while that call runs. A function can read names from outside, but assigning to a name inside makes a new local one.

```python run
rate = 0.18

def with_tax(price):
    tax = price * rate           # reads the outer name rate
    return price + tax

print(with_tax(100))
# print(tax)   would raise NameError: tax only exists inside the function
```

Prefer passing values in and returning values out. A function that depends only on its arguments is easy to test and to reuse.

## Returning early

```python run
def grade(score):
    if not 0 <= score <= 100:
        return None                  # deal with bad input first and leave
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    return "C"

print(grade(95), grade(80), grade(40), grade(140))
```

## Check yourself

```quiz
[
  {"q": "What does a function return when it has no `return` statement?", "options": ["`0`", "`None`", "The last value it computed"], "answer": 1, "why": "Without `return`, the call evaluates to `None`."},
  {"q": "In `def f(a, b=2, *rest)`, what is `rest` for the call `f(1, 2, 3, 4)`?", "options": ["`[3, 4]`", "`(3, 4)`", "`(2, 3, 4)`"], "answer": 1, "why": "`a` takes 1, `b` takes 2, and the remaining positional arguments are collected into a tuple."},
  {"q": "Why is `def add(item, bucket=[])` a bug?", "options": ["Lists cannot be defaults", "The same list is shared by every call", "`bucket` must come first"], "answer": 1, "why": "The default is evaluated once, when the function is defined."}
]
```

## Exercises

````task
id: clamp
title: Clamp a number to a range
kind: code
level: easy
@@statement
Write `clamp(value, low=0, high=100)` that forces a number into the range `low` to `high`.

**Input**
- `value`: an int or float.
- `low`, `high`: the bounds, with `low <= high`. They default to `0` and `100`.

**Output**: `low` if the value is below it, `high` if the value is above it, otherwise the value itself.

**Example**

```
clamp(150)            -> 100
clamp(-3)             -> 0
clamp(7, 1, 5)        -> 5
clamp(2.5, high=2)    -> 2
```
@@starter
def clamp(value, low=0, high=100):
    pass

print(clamp(150), clamp(-3), clamp(7, 1, 5))
@@tests
assert clamp(150) == 100, "above the default range"
assert clamp(-3) == 0, "below the default range"
assert clamp(42) == 42, "inside the range"
assert clamp(7, 1, 5) == 5, "custom bounds"
assert clamp(2.5, high=2) == 2, "keyword argument"
assert clamp(0) == 0 and clamp(100) == 100, "the bounds themselves are allowed"
assert clamp(-5, low=-10) == -5, "negative lower bound"
@@hint
Two `if` statements with early returns are enough. A one-line version is `max(low, min(value, high))`.
@@solution
def clamp(value, low=0, high=100):
    if value < low:
        return low
    if value > high:
        return high
    return value
````

````task
id: apply-discounts
title: Stack several discounts
kind: code
level: medium
@@statement
A shop applies discounts one after another. Write `final_price(price, *discounts, tax=0)`.

**Input**
- `price`: the starting price, a number 0 or greater.
- `*discounts`: any number of percentages, each from 0 to 100. They are applied in order, each to the result of the previous one.
- `tax`: a percentage added once at the end. Keyword only, default `0`.

**Output**: the final price as a float rounded to 2 decimals.

**Example**

```
final_price(200)                 -> 200.0
final_price(200, 10)             -> 180.0
final_price(200, 10, 50)         -> 90.0      (10% off, then 50% off the rest)
final_price(200, 10, tax=18)     -> 212.4
```
@@starter
def final_price(price, *discounts, tax=0):
    pass

print(final_price(200, 10, 50))
@@tests
assert final_price(200) == 200.0, "no discounts"
assert final_price(200, 10) == 180.0, "one discount"
assert final_price(200, 10, 50) == 90.0, "discounts are applied one after another"
assert final_price(200, 10, tax=18) == 212.4, "tax is added at the end"
assert final_price(0, 25, tax=5) == 0.0, "a zero price stays zero"
assert final_price(99.99, 100) == 0.0, "a full discount"
assert final_price(80, 25, 25, 25) == 33.75, "three discounts"
assert isinstance(final_price(10), float), "the result is a float"
@@hint
Loop over `discounts` and multiply by `(1 - d / 100)` each time. Multiply by `(1 + tax / 100)` afterwards and finish with `round(..., 2)`.
@@solution
def final_price(price, *discounts, tax=0):
    for discount in discounts:
        price *= 1 - discount / 100
    price *= 1 + tax / 100
    return round(float(price), 2)
````
