---
id: py-inheritance-dataclasses
title: Inheritance and dataclasses
minutes: 30
---

Inheritance lets one class build on another. Dataclasses remove the repetitive code from classes that mainly hold data. Both are tools for saying more with less code, and both are easy to overuse.

## Inheritance

A subclass gets every method of its parent and can add or replace them.

```python run
class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def monthly_pay(self):
        return round(self.salary / 12, 2)

    def describe(self):
        return f"{self.name}: {self.monthly_pay()} per month"

class Manager(Employee):
    def __init__(self, name, salary, bonus):
        super().__init__(name, salary)        # let the parent set name and salary
        self.bonus = bonus

    def monthly_pay(self):                    # replaces the parent's version
        return round((self.salary + self.bonus) / 12, 2)

staff = [Employee("Ana", 600000), Manager("Ben", 900000, 120000)]
for person in staff:
    print(person.describe())                  # the same call, different behaviour

print(isinstance(staff[1], Employee), isinstance(staff[0], Manager))
```

`describe` is written once, in `Employee`, and still uses the right `monthly_pay` for each object. That is polymorphism: the caller does not need to know which class it has.

## Abstract base classes

When the parent only defines what its children must provide, say so explicitly.

```python run
from abc import ABC, abstractmethod
import math

class Shape(ABC):
    @abstractmethod
    def area(self):
        ...

    def describe(self):
        return f"{type(self).__name__} with area {self.area():.2f}"

class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius
    def area(self):
        return math.pi * self.radius ** 2

class Square(Shape):
    def __init__(self, side):
        self.side = side
    def area(self):
        return self.side ** 2

for shape in (Circle(1), Square(3)):
    print(shape.describe())

try:
    Shape()
except TypeError as error:
    print("Cannot create:", error)
```

> Use inheritance for a real "is a" relationship. If the relationship is "has a" (an order has a customer), give the object an attribute holding the other object instead. That is called composition, and it is the better default.

## Dataclasses

A dataclass writes `__init__`, `__repr__` and `__eq__` for you from a list of fields.

```python run
from dataclasses import dataclass, field

@dataclass
class Product:
    name: str
    price: float
    tags: list = field(default_factory=list)     # a fresh list per object
    in_stock: bool = True

    def price_with_tax(self, rate=0.18):
        return round(self.price * (1 + rate), 2)

p = Product("keyboard", 2499.0, ["usb"])
q = Product("keyboard", 2499.0, ["usb"])
print(p)
print(p == q, p.price_with_tax())

@dataclass(frozen=True, order=True)
class Version:
    major: int
    minor: int

print(sorted([Version(2, 1), Version(1, 9), Version(2, 0)]))
print(Version(1, 0) in {Version(1, 0)})          # frozen dataclasses can go in sets
```

`frozen=True` makes instances read-only, which also makes them usable as dictionary keys. `order=True` adds `<`, `>` and friends, comparing the fields in order.

## Check yourself

```quiz
[
  {"q": "What does `super().__init__(name)` do in a subclass?", "options": ["Creates a second object", "Runs the parent class's `__init__` on this object", "Calls the subclass's own `__init__` again"], "answer": 1, "why": "`super()` gives access to the parent's methods for the current instance."},
  {"q": "Which methods does `@dataclass` generate by default?", "options": ["`__init__`, `__repr__` and `__eq__`", "Only `__init__`", "`__init__` and `__hash__`"], "answer": 0, "why": "Ordering and hashing are opt-in through `order=True` and `frozen=True`."},
  {"q": "An `Order` needs to know its `Customer`. What is the better design?", "options": ["`class Order(Customer)`", "`Order` has an attribute holding a `Customer`", "`class Customer(Order)`"], "answer": 1, "why": "An order is not a kind of customer. It has one, so use composition."}
]
```

## Exercises

````task
id: shapes
title: Shapes that know their area
kind: code
level: medium
@@statement
Build a small class hierarchy.

**Requirements**
- `Shape` is the base class. Its `area()` raises `NotImplementedError`. Its `describe()` returns `"<ClassName> with area <area>"`, with the area formatted to 2 decimals.
- `Rectangle(width, height)` extends `Shape`. Area is `width * height`.
- `Square(side)` extends `Rectangle` and passes the side to the parent as both width and height.
- `Circle(radius)` extends `Shape`. Area is `math.pi * radius ** 2`.
- `total_area(shapes)` returns the sum of the areas of a list of shapes, rounded to 2 decimals. An empty list gives `0`.

**Example**

```
Rectangle(2, 3).describe()             -> "Rectangle with area 6.00"
Square(4).describe()                   -> "Square with area 16.00"
total_area([Square(2), Circle(1)])     -> 7.14
```
@@starter
import math

class Shape:
    def area(self):
        raise NotImplementedError

    def describe(self):
        pass

def total_area(shapes):
    pass
@@tests
assert Rectangle(2, 3).area() == 6, "rectangle area"
assert Rectangle(2, 3).describe() == "Rectangle with area 6.00", "describe uses the class name"
assert Square(4).area() == 16, "square area"
assert Square(4).describe() == "Square with area 16.00", "describe is inherited"
assert isinstance(Square(1), Rectangle) and isinstance(Square(1), Shape), "Square extends Rectangle"
assert abs(Circle(1).area() - 3.141592653589793) < 1e-9, "circle area"
assert Circle(2).describe() == "Circle with area 12.57", "area formatted to two decimals"
assert total_area([Square(2), Circle(1)]) == 7.14, "sum of areas"
assert total_area([]) == 0, "no shapes"
@@hint
`type(self).__name__` gives the class name of the actual object, so `describe` only needs to be written once in `Shape`. In `Square.__init__`, call `super().__init__(side, side)`.
@@solution
import math

class Shape:
    def area(self):
        raise NotImplementedError

    def describe(self):
        return f"{type(self).__name__} with area {self.area():.2f}"

class Rectangle(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

class Square(Rectangle):
    def __init__(self, side):
        super().__init__(side, side)

class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius

    def area(self):
        return math.pi * self.radius ** 2

def total_area(shapes):
    return round(sum(shape.area() for shape in shapes), 2)
````

````task
id: inventory-dataclass
title: Inventory with dataclasses
kind: code
level: medium
@@statement
Model a small warehouse with dataclasses.

**Requirements**
- `Item` is a dataclass with the fields `name` (str), `price` (float) and `quantity` (int, default `0`). It has a method `value()` that returns `price * quantity`.
- `Inventory` is a dataclass with one field `items`, a list of `Item` that defaults to a **new empty list** for every inventory.
- `Inventory.add(item)`: if an item with the same name already exists, increase its quantity by the new item's quantity and keep the existing price. Otherwise append the item.
- `Inventory.total_value()` returns the sum of all item values, rounded to 2 decimals.
- `Inventory.low_stock(limit=5)` returns the names of items whose quantity is below `limit`, sorted alphabetically.

**Example**

```
inv = Inventory()
inv.add(Item("bolt", 2.5, 10))
inv.add(Item("nut", 1.0, 3))
inv.add(Item("bolt", 9.9, 5))     # same name: quantity becomes 15, price stays 2.5
inv.total_value()   -> 40.5
inv.low_stock()     -> ["nut"]
```
@@starter
from dataclasses import dataclass, field

@dataclass
class Item:
    name: str
    price: float
    quantity: int = 0

@dataclass
class Inventory:
    pass
@@tests
assert Item("bolt", 2.5, 10) == Item("bolt", 2.5, 10), "dataclasses compare by value"
assert Item("bolt", 2.5).quantity == 0, "quantity defaults to zero"
assert Item("bolt", 2.5, 10).value() == 25.0, "value of one item"
_inv = Inventory()
_inv.add(Item("bolt", 2.5, 10))
_inv.add(Item("nut", 1.0, 3))
_inv.add(Item("bolt", 9.9, 5))
assert len(_inv.items) == 2, "the same name is merged"
assert _inv.items[0] == Item("bolt", 2.5, 15), "quantity is added and the price is kept"
assert _inv.total_value() == 40.5, "total value"
assert _inv.low_stock() == ["nut"], "below the default limit"
assert _inv.low_stock(20) == ["bolt", "nut"], "custom limit, sorted names"
assert Inventory().items == [], "a new inventory does not share the list"
@@hint
Declare the list with `items: list = field(default_factory=list)`. In `add`, loop over `self.items` looking for a matching name and `return` after updating it. Append only when the loop finishes without a match.
@@solution
from dataclasses import dataclass, field

@dataclass
class Item:
    name: str
    price: float
    quantity: int = 0

    def value(self):
        return self.price * self.quantity

@dataclass
class Inventory:
    items: list = field(default_factory=list)

    def add(self, item):
        for existing in self.items:
            if existing.name == item.name:
                existing.quantity += item.quantity
                return
        self.items.append(item)

    def total_value(self):
        return round(sum(item.value() for item in self.items), 2)

    def low_stock(self, limit=5):
        return sorted(item.name for item in self.items if item.quantity < limit)
````

````task
ref: python-advanced/library-loans
````
