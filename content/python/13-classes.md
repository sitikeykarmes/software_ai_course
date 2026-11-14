---
id: py-classes
title: Classes and objects
minutes: 35
---

A class describes a kind of thing: the data it holds and what it can do. An object is one instance of that class. Classes are worth using when data and the functions that work on it belong together and you need many independent copies.

## A first class

```python run
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner              # attributes live on the instance
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

    def can_pay(self, amount):
        return amount <= self.balance

ana = Account("Ana", 500)
ben = Account("Ben")
ana.deposit(250)

print(ana.owner, ana.balance, ana.can_pay(700))
print(ben.owner, ben.balance)            # each instance has its own data
```

`__init__` runs when you create an object. `self` is the object the method was called on: `ana.deposit(250)` is the same call as `Account.deposit(ana, 250)`.

## Special methods

Methods with double underscores let your objects work with Python's built-in syntax.

```python run
class Money:
    def __init__(self, amount, currency="INR"):
        self.amount = amount
        self.currency = currency

    def __repr__(self):                       # what print() and the console show
        return f"Money({self.amount}, {self.currency!r})"

    def __eq__(self, other):                  # ==
        return isinstance(other, Money) and (self.amount, self.currency) == (other.amount, other.currency)

    def __add__(self, other):                 # +
        if self.currency != other.currency:
            raise ValueError("different currencies")
        return Money(self.amount + other.amount, self.currency)

    def __lt__(self, other):                  # <  (enough for sorted)
        return self.amount < other.amount

a, b = Money(100), Money(250)
print(a + b, a == Money(100), a == b)
print(sorted([b, a]))
```

Without `__repr__` an object prints as something like `<__main__.Money object at 0x...>`. Without `__eq__`, two objects are equal only if they are the very same object.

| Method | Used by |
| --- | --- |
| `__init__` | `Money(100)` |
| `__repr__` | `print(x)`, the console |
| `__eq__`, `__lt__` | `==`, `<`, `sorted` |
| `__add__` | `+` |
| `__len__` | `len(x)` |
| `__contains__` | `item in x` |
| `__getitem__` | `x[key]` |

## Properties

A property looks like an attribute from outside but runs a method. Use it for values computed from other attributes and for validating assignments.

```python run
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):                       # read with r.area, no brackets
        return self.width * self.height

    @property
    def width(self):
        return self._width

    @width.setter
    def width(self, value):
        if value <= 0:
            raise ValueError("width must be positive")
        self._width = value

r = Rectangle(3, 4)
r.width = 10
print(r.area)
try:
    r.width = -1
except ValueError as error:
    print("Rejected:", error)
```

A leading underscore, as in `_width`, is a convention that means "internal, do not touch from outside". Python does not enforce it.

## Class attributes and class methods

```python run
class Ticket:
    issued = 0                            # shared by all instances

    def __init__(self, title):
        Ticket.issued += 1
        self.number = Ticket.issued
        self.title = title

    @classmethod
    def from_line(cls, line):             # an alternative way to build an object
        return cls(line.strip().title())

t1 = Ticket("Printer broken")
t2 = Ticket.from_line("  no network  ")
print(t1.number, t2.number, t2.title, Ticket.issued)
```

## Check yourself

```quiz
[
  {"q": "What is `self` inside a method?", "options": ["The class", "The instance the method was called on", "A copy of the instance"], "answer": 1, "why": "`obj.method()` passes `obj` as the first argument."},
  {"q": "Two objects of a class without `__eq__` hold the same data. What does `a == b` give?", "options": ["`True`", "`False`", "An error"], "answer": 1, "why": "The default comparison checks identity, and they are two different objects."},
  {"q": "What does `@property` allow?", "options": ["Calling a method without brackets, like an attribute", "Making an attribute private", "Sharing data between instances"], "answer": 0, "why": "A property runs a method on attribute access."}
]
```

## Exercises

````task
id: bank-account
title: Bank account with a history
kind: code
level: medium
@@statement
Write a class `BankAccount`.

**Requirements**
- `BankAccount(owner, balance=0)` stores the owner and the opening balance.
- `deposit(amount)` adds to the balance and returns the new balance. A non-positive amount raises `ValueError`.
- `withdraw(amount)` subtracts from the balance and returns the new balance. A non-positive amount, or an amount larger than the balance, raises `ValueError` and leaves the balance unchanged.
- `balance` is readable as an attribute.
- `history` is a list of tuples, one per **successful** operation, in order: `("deposit", amount)` or `("withdraw", amount)`.

**Example**

```
acct = BankAccount("Ana", 100)
acct.deposit(50)     -> 150
acct.withdraw(30)    -> 120
acct.history         -> [("deposit", 50), ("withdraw", 30)]
acct.withdraw(500)   raises ValueError, balance stays 120
```
@@starter
class BankAccount:
    def __init__(self, owner, balance=0):
        pass

    def deposit(self, amount):
        pass

    def withdraw(self, amount):
        pass

acct = BankAccount("Ana", 100)
print(acct.deposit(50))
@@tests
def _raises(action):
    try:
        action()
    except ValueError:
        return True
    return False

_a = BankAccount("Ana", 100)
assert _a.owner == "Ana" and _a.balance == 100, "owner and opening balance are stored"
assert _a.deposit(50) == 150, "deposit returns the new balance"
assert _a.withdraw(30) == 120, "withdraw returns the new balance"
assert _a.history == [("deposit", 50), ("withdraw", 30)], "history records both operations"
assert _raises(lambda: _a.withdraw(500)), "overdrawing raises ValueError"
assert _raises(lambda: _a.deposit(0)), "depositing zero raises ValueError"
assert _raises(lambda: _a.withdraw(-5)), "withdrawing a negative amount raises ValueError"
assert _a.balance == 120 and len(_a.history) == 2, "failed operations change nothing"
_b = BankAccount("Ben")
assert _b.balance == 0 and _b.history == [], "a second account starts empty with its own history"
@@hint
Create `self.history = []` inside `__init__`, not at class level, so every account gets its own list. Validate first, then change the balance, then append to the history.
@@solution
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("amount must be positive")
        self.balance += amount
        self.history.append(("deposit", amount))
        return self.balance

    def withdraw(self, amount):
        if amount <= 0:
            raise ValueError("amount must be positive")
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        self.history.append(("withdraw", amount))
        return self.balance
````

````task
id: vector2
title: A 2D vector with operators
kind: code
level: medium
@@statement
Write a class `Vector` for two-dimensional vectors that works with Python's operators.

**Requirements**
- `Vector(x, y)` stores `x` and `y`.
- `v + w` and `v - w` return a new `Vector`.
- `v * k` multiplies both parts by the number `k` and returns a new `Vector`.
- `v == w` is `True` when both parts are equal.
- `abs(v)` returns the length, `sqrt(x*x + y*y)`.
- `repr(v)` is `Vector(x, y)`, for example `Vector(3, 4)`.

**Example**

```
Vector(1, 2) + Vector(3, 4)   -> Vector(4, 6)
Vector(3, 4) * 2              -> Vector(6, 8)
abs(Vector(3, 4))             -> 5.0
```
@@starter
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

print(Vector(1, 2))
@@tests
assert repr(Vector(3, 4)) == "Vector(3, 4)", "repr shows the parts"
assert Vector(1, 2) == Vector(1, 2), "equal parts compare equal"
assert not (Vector(1, 2) == Vector(2, 1)), "different parts are not equal"
assert Vector(1, 2) + Vector(3, 4) == Vector(4, 6), "addition"
assert Vector(5, 5) - Vector(2, 7) == Vector(3, -2), "subtraction"
assert Vector(3, 4) * 2 == Vector(6, 8), "multiplication by a number"
assert abs(Vector(3, 4)) == 5.0, "length"
_v = Vector(1, 1)
_w = _v + Vector(1, 1)
assert (_v.x, _v.y) == (1, 1) and _w is not _v, "operators return new vectors"
@@hint
Implement `__repr__`, `__eq__`, `__add__`, `__sub__`, `__mul__` and `__abs__`. Each arithmetic method ends with `return Vector(...)`.
@@solution
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

    def __eq__(self, other):
        return isinstance(other, Vector) and (self.x, self.y) == (other.x, other.y)

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Vector(self.x - other.x, self.y - other.y)

    def __mul__(self, k):
        return Vector(self.x * k, self.y * k)

    def __abs__(self):
        return (self.x ** 2 + self.y ** 2) ** 0.5
````
