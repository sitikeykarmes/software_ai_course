---
id: py-errors
title: Errors and exceptions
minutes: 30
---

When Python cannot carry out an instruction it raises an exception. If nothing handles it, the program stops and prints a traceback. Handling exceptions on purpose is what separates a script that works on your machine from a program other people can rely on.

## Reading a traceback

```python run
def average(values):
    return sum(values) / len(values)

try:
    average([])
except ZeroDivisionError as error:
    print("Caught:", type(error).__name__, "-", error)
```

Read a traceback from the bottom: the last line names the exception type and the message, and the lines above show the chain of calls that led there.

| Exception | Typical cause |
| --- | --- |
| `ValueError` | Right type, unacceptable value: `int("abc")` |
| `TypeError` | Wrong type: `"a" + 1` |
| `KeyError` | Missing dictionary key |
| `IndexError` | List position out of range |
| `AttributeError` | Method or attribute does not exist, often on `None` |
| `FileNotFoundError` | Opening a file that is not there |

## try, except, else, finally

```python run
def to_number(text):
    try:
        value = float(text)
    except ValueError:
        print(f"  {text!r} is not a number")
        return None
    else:
        print(f"  {text!r} converted")       # runs only when no exception happened
        return value
    finally:
        print("  finished", repr(text))      # always runs, even after return

print(to_number("3.5"))
print(to_number("three"))
```

Catch the **specific** exception you expect. A bare `except:` also swallows typing mistakes in your own code and makes bugs invisible.

## Raising exceptions

Raise an exception when your function is given something it cannot work with. Failing early with a clear message is better than returning a wrong answer.

```python run
def withdraw(balance, amount):
    if amount <= 0:
        raise ValueError("amount must be positive")
    if amount > balance:
        raise ValueError(f"cannot withdraw {amount}: balance is {balance}")
    return balance - amount

for amount in (30, -5, 500):
    try:
        print(withdraw(100, amount))
    except ValueError as error:
        print("Refused:", error)
```

## Your own exception types

A custom exception lets the caller handle your error separately from every other `ValueError`.

```python run
class OutOfStock(Exception):
    """Raised when an order asks for more than is available."""

def reserve(stock, item, quantity):
    available = stock.get(item, 0)
    if quantity > available:
        raise OutOfStock(f"{item}: wanted {quantity}, have {available}")
    stock[item] = available - quantity

stock = {"bolt": 5}
try:
    reserve(stock, "bolt", 2)
    reserve(stock, "bolt", 9)
except OutOfStock as error:
    print("Order failed:", error)
print(stock)
```

## Ask forgiveness, not permission

```python run
config = {"port": "8080"}

# Checking first ("look before you leap")
if "timeout" in config:
    timeout = int(config["timeout"])
else:
    timeout = 30

# Trying and handling the failure: the usual Python style
try:
    port = int(config["port"])
except (KeyError, ValueError):
    port = 80

print(timeout, port)
```

## Check yourself

```quiz
[
  {"q": "Which block runs whether or not an exception happened?", "options": ["`else`", "`finally`", "`except`"], "answer": 1, "why": "`finally` always runs. `else` runs only when the `try` block raised nothing."},
  {"q": "What does `int(\"12a\")` raise?", "options": ["`TypeError`", "`ValueError`", "`SyntaxError`"], "answer": 1, "why": "The argument has the right type (a string) but a value that cannot be converted."},
  {"q": "Why avoid a bare `except:`?", "options": ["It is slower", "It hides every error, including your own bugs", "It is a syntax error"], "answer": 1, "why": "It catches everything, so genuine mistakes pass silently."}
]
```

## Exercises

````task
id: safe-divide
title: Division that explains its failures
kind: code
level: easy
@@statement
Write `safe_divide(a, b)` that divides two values and never lets an exception escape.

**Input**: `a` and `b`, which may be numbers or anything else.

**Output**
- the result of `a / b` when the division works,
- the string `"cannot divide by zero"` when `b` is zero,
- the string `"numbers required"` when either value is not a number (for example a string or `None`).

**Example**

```
safe_divide(10, 4)     -> 2.5
safe_divide(1, 0)      -> "cannot divide by zero"
safe_divide("10", 2)   -> "numbers required"
```
@@starter
def safe_divide(a, b):
    pass

print(safe_divide(10, 4), safe_divide(1, 0), safe_divide("10", 2))
@@tests
assert safe_divide(10, 4) == 2.5, "normal division"
assert safe_divide(1, 0) == "cannot divide by zero", "integer zero"
assert safe_divide(1.5, 0.0) == "cannot divide by zero", "float zero"
assert safe_divide("10", 2) == "numbers required", "a string is not a number"
assert safe_divide(None, 2) == "numbers required", "None is not a number"
assert safe_divide(-9, 3) == -3.0, "negative numbers"
assert safe_divide(0, 5) == 0.0, "zero divided by something"
@@hint
Put `return a / b` inside `try:` and add two `except` blocks: one for `ZeroDivisionError`, one for `TypeError`.
@@solution
def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return "cannot divide by zero"
    except TypeError:
        return "numbers required"
````

````task
id: parse-age
title: Validate an age
kind: code
level: medium
@@statement
A sign-up form sends the age as text. Write `parse_age(text)` together with a custom exception `InvalidAge`.

**Requirements**
- Define `class InvalidAge(ValueError)`.
- `parse_age(text)` returns the age as an `int` when `text` (ignoring spaces at the ends) is a whole number from `0` to `130`.
- Otherwise it raises `InvalidAge` with one of these exact messages:
  - `"not a number"` when the text is not a whole number,
  - `"out of range"` when the number is below 0 or above 130.

**Example**

```
parse_age(" 42 ")   -> 42
parse_age("abc")    raises InvalidAge("not a number")
parse_age("200")    raises InvalidAge("out of range")
```
@@starter
class InvalidAge(ValueError):
    pass

def parse_age(text):
    pass

print(parse_age(" 42 "))
@@tests
def _error_of(text):
    try:
        parse_age(text)
    except InvalidAge as error:
        return str(error)
    return "no error"

assert parse_age(" 42 ") == 42, "spaces are ignored"
assert parse_age("0") == 0, "zero is allowed"
assert parse_age("130") == 130, "the upper limit is allowed"
assert _error_of("abc") == "not a number", "letters"
assert _error_of("12.5") == "not a number", "decimals are not whole numbers"
assert _error_of("") == "not a number", "empty text"
assert _error_of("200") == "out of range", "too large"
assert _error_of("-1") == "out of range", "negative"
assert issubclass(InvalidAge, ValueError), "InvalidAge extends ValueError"
@@hint
Convert inside `try: age = int(text)` and turn the `ValueError` into your own: `except ValueError: raise InvalidAge("not a number")`. Check the range afterwards.
@@solution
class InvalidAge(ValueError):
    pass

def parse_age(text):
    try:
        age = int(text.strip())
    except ValueError:
        raise InvalidAge("not a number")
    if not 0 <= age <= 130:
        raise InvalidAge("out of range")
    return age
````
