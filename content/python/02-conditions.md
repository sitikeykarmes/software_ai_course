---
id: py-conditions
title: Decisions with if, elif and else
minutes: 25
---

A program becomes useful when it can choose. `if` runs a block of code only when a condition is true.

## Comparisons give booleans

```python run
temperature = 31

print(temperature > 30)      # True
print(temperature == 30)     # False: == compares, = assigns
print(temperature != 30)     # True
print(18 <= temperature <= 35)   # chained comparison, reads like maths
```

## if, elif, else

Python uses indentation to mark a block. Everything indented under the `if` line belongs to it. Use four spaces.

```python run
def describe(temperature):
    if temperature >= 35:
        return "hot"
    elif temperature >= 20:
        return "comfortable"
    elif temperature >= 5:
        return "cold"
    else:
        return "freezing"

for t in (40, 22, 7, -3):
    print(t, "->", describe(t))
```

The branches are tested from the top, and only the first true one runs. That is why the second test does not need `temperature < 35`: if you reach it, the first test already failed.

> Order matters. If you test `temperature >= 5` first, every warm day is reported as "cold". Put the most specific condition first.

## and, or, not

```python run
age, has_ticket, is_staff = 16, True, False

print(age >= 18 and has_ticket)       # both must be true
print(has_ticket or is_staff)         # at least one must be true
print(not is_staff)

# and / or stop as soon as the answer is known ("short-circuit")
items = []
if items and items[0] == "first":     # items[0] is never evaluated on an empty list
    print("starts with first")
else:
    print("empty or different")
```

## Truthiness

Every value can be used as a condition. These are treated as false: `False`, `None`, `0`, `0.0`, `""`, `[]`, `{}`, `set()`. Everything else is true.

```python run
name = ""
if not name:
    print("No name given")

orders = ["A17", "B02"]
if orders:                      # preferred over: if len(orders) > 0
    print(len(orders), "orders waiting")

# A conditional expression chooses between two values on one line
label = "adult" if 21 >= 18 else "minor"
print(label)
```

## Check yourself

```quiz
[
  {"q": "With `x = 10`, which branch runs in `if x > 5: ... elif x > 8: ... else: ...`?", "options": ["The `if` branch only", "Both the `if` and the `elif` branch", "The `elif` branch only"], "answer": 0, "why": "Branches are tested in order and only the first true one runs."},
  {"q": "What is the value of `[] or \"empty\"`?", "options": ["`[]`", "`\"empty\"`", "`True`"], "answer": 1, "why": "`or` returns the first truthy operand. An empty list is falsy, so the string is returned."},
  {"q": "Which test is true only for the numbers 1 to 9?", "options": ["`0 < n < 10`", "`n > 0 or n < 10`", "`n > 0 and 10`"], "answer": 0, "why": "A chained comparison means both parts must hold. The `or` version is true for every number."}
]
```

## Exercises

````task
id: leap-year
title: Leap year
kind: code
level: easy
@@statement
Write `is_leap_year(year)` that returns `True` when a year is a leap year.

**Rules**
- A year divisible by 4 is a leap year,
- except years divisible by 100, which are not,
- except years divisible by 400, which are.

**Input**: `year`, a positive whole number.

**Output**: `True` or `False`.

**Example**

```
is_leap_year(2024) -> True
is_leap_year(1900) -> False   (divisible by 100 but not by 400)
is_leap_year(2000) -> True    (divisible by 400)
```
@@starter
def is_leap_year(year):
    pass

print(is_leap_year(2024), is_leap_year(1900), is_leap_year(2000))
@@tests
assert is_leap_year(2024) is True, "divisible by 4"
assert is_leap_year(2023) is False, "not divisible by 4"
assert is_leap_year(1900) is False, "century that is not a leap year"
assert is_leap_year(2000) is True, "divisible by 400"
assert is_leap_year(2100) is False, "next century"
assert is_leap_year(4) is True, "small year"
@@hint
`year % 4 == 0` tests divisibility. Check the most specific rule (400) first, then 100, then 4.
@@solution
def is_leap_year(year):
    if year % 400 == 0:
        return True
    if year % 100 == 0:
        return False
    return year % 4 == 0
````

````task
id: ticket-price
title: Ticket price
kind: code
level: easy
@@statement
A cinema sells tickets at these prices. Write `ticket_price(age, is_student, is_matinee)`.

| Who | Price |
| --- | --- |
| Under 5 | 0 |
| Age 5 to 17 | 120 |
| Age 65 or over | 100 |
| Student of any other age (`is_student` is `True`) | 150 |
| Everyone else | 200 |

After choosing the price, a matinee show (`is_matinee` is `True`) takes 20 off any ticket that costs more than 0.

**Input**: `age` is a whole number 0 or greater. `is_student` and `is_matinee` are booleans.

**Output**: the price as an `int`.

**Example**

```
ticket_price(30, False, False) -> 200
ticket_price(30, True, True)   -> 130
ticket_price(3, False, True)   -> 0
```
@@starter
def ticket_price(age, is_student, is_matinee):
    pass

print(ticket_price(30, False, False))
@@tests
assert ticket_price(30, False, False) == 200, "adult"
assert ticket_price(30, True, False) == 150, "adult student"
assert ticket_price(30, True, True) == 130, "student at a matinee"
assert ticket_price(3, False, True) == 0, "free tickets stay free"
assert ticket_price(5, False, False) == 120, "age 5 is a child"
assert ticket_price(17, True, False) == 120, "a child who is a student pays the child price"
assert ticket_price(65, False, True) == 80, "senior at a matinee"
assert ticket_price(18, False, False) == 200, "age 18 is an adult"
@@hint
Use one `if / elif / else` chain to choose the base price, in the same order as the table. Apply the matinee discount afterwards with a separate `if`.
@@solution
def ticket_price(age, is_student, is_matinee):
    if age < 5:
        price = 0
    elif age <= 17:
        price = 120
    elif age >= 65:
        price = 100
    elif is_student:
        price = 150
    else:
        price = 200
    if is_matinee and price > 0:
        price -= 20
    return price
````
