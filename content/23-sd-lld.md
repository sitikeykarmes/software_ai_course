---
id: sd-lld
title: Low-level design: SOLID, design patterns and worked class designs
minutes: 65
---

High-level design decides which services exist. Low-level design (LLD) decides the classes inside one: their responsibilities, relationships and interfaces. Interviews call it "machine coding" or "object-oriented design", and you are judged on whether the code is correct, readable and easy to extend.

## The four ideas of object-oriented design

- **Encapsulation**: an object hides its data and exposes methods. Callers cannot put it into an invalid state.
- **Abstraction**: expose what something does, hide how. A `PaymentGateway` has `charge()`; the caller does not care which provider is behind it.
- **Inheritance**: a class reuses and specialises another. Use it for true "is a" relationships only.
- **Polymorphism**: different classes answer the same call in their own way, so code can work with any of them.

## SOLID, with a before and after for each

### Single responsibility

A class should have one reason to change.

```python
# Before: three reasons to change (pricing rules, storage, email format)
class Order:
    def total(self): ...
    def save_to_database(self): ...
    def send_confirmation_email(self): ...

# After
class Order:            # business data and rules
    def total(self): ...
class OrderRepository:  # storage
    def save(self, order): ...
class OrderNotifier:    # communication
    def confirm(self, order): ...
```

### Open for extension, closed for modification

Add behaviour by adding code, not by editing tested code.

```python run
from abc import ABC, abstractmethod

class Discount(ABC):
    @abstractmethod
    def apply(self, amount): ...

class NoDiscount(Discount):
    def apply(self, amount): return amount
class PercentOff(Discount):
    def __init__(self, percent): self.percent = percent
    def apply(self, amount): return amount * (100 - self.percent) / 100
class FlatOff(Discount):
    def __init__(self, value): self.value = value
    def apply(self, amount): return max(0, amount - self.value)

def checkout(amount, discount):          # never needs editing when a new discount type appears
    return discount.apply(amount)

print(checkout(1000, NoDiscount()), checkout(1000, PercentOff(10)), checkout(1000, FlatOff(150)))
```

The alternative, an `if discount_type == "percent" … elif …` chain, must be edited and retested for every new type.

### Liskov substitution

A subclass must be usable wherever its parent is expected, without surprises. The classic violation: `Square` inheriting from `Rectangle` and breaking code that sets width and height independently. If a subclass must throw "not supported" for a parent method, the hierarchy is wrong.

### Interface segregation

Many small interfaces are better than one large one. A `Printer` that only prints should not be forced to implement `scan()` and `fax()`.

### Dependency inversion

High-level code depends on abstractions, not concrete classes. Pass dependencies in.

```python run
class SmtpMailer:
    def send(self, to, body): return f"SMTP -> {to}"
class FakeMailer:
    def __init__(self): self.sent = []
    def send(self, to, body): self.sent.append((to, body)); return "fake"

class SignupService:
    def __init__(self, mailer):            # depends on "something with send()", not on SMTP
        self.mailer = mailer
    def register(self, email):
        return self.mailer.send(email, "Welcome")

print(SignupService(SmtpMailer()).register("asha@x.in"))
fake = FakeMailer()
SignupService(fake).register("test@x.in")
print("a test can inspect:", fake.sent)
```

## Design patterns worth knowing

A pattern is a named solution to a recurring design problem. Know these well; recognise the rest.

| Pattern | Problem it solves | Everyday example |
| --- | --- | --- |
| Strategy | Swap an algorithm at run time | Discount types; payment methods; sort orders |
| Factory | Create objects without naming the concrete class | `create_notifier("sms")` |
| Singleton | Exactly one instance | Configuration, connection pool. Overused; prefer passing the instance |
| Observer | Notify many listeners of a change | Event bus, UI event handlers, webhooks |
| Decorator | Add behaviour by wrapping | Python decorators; logging or caching around a call |
| Adapter | Make an incompatible interface fit | Wrapping a third-party SDK behind your own interface |
| Facade | One simple entry point to a complex subsystem | `OrderService.place_order()` hiding stock, payment, shipping |
| State | Behaviour depends on the current state | Order: created, paid, shipped, delivered |
| Command | Represent an action as an object | Undo and redo; job queues |
| Builder | Build a complex object step by step | Query builders; HTTP request builders |
| Iterator | Walk a collection without exposing its structure | Python's `for` loop and generators |
| Template method | Fixed skeleton, variable steps | A report generator with overridable sections |
| Repository | Hide data access behind a collection-like interface | `UserRepository.find_by_email()` |

```python run
# Factory + Strategy
class Email:
    def send(self, to, msg): return f"email to {to}: {msg}"
class Sms:
    def send(self, to, msg): return f"sms to {to}: {msg[:10]}"
class Push:
    def send(self, to, msg): return f"push to {to}: {msg}"

def notifier_factory(channel):
    return {"email": Email, "sms": Sms, "push": Push}[channel]()

print(notifier_factory("sms").send("9000000000", "Your OTP is 4821"))

# Observer
class Stock:
    def __init__(self):
        self._price, self._observers = 0, []
    def subscribe(self, fn):
        self._observers.append(fn)
    def set_price(self, price):
        self._price = price
        for fn in self._observers:
            fn(price)

s = Stock()
s.subscribe(lambda p: print("  dashboard shows", p))
s.subscribe(lambda p: print("  alert!") if p > 100 else None)
s.set_price(120)

# State machine
class Order:
    TRANSITIONS = {"CREATED": {"PAID", "CANCELLED"}, "PAID": {"SHIPPED", "REFUNDED"}, "SHIPPED": {"DELIVERED"}}
    def __init__(self):
        self.state = "CREATED"
    def move(self, new_state):
        if new_state not in self.TRANSITIONS.get(self.state, set()):
            raise ValueError(f"cannot go from {self.state} to {new_state}")
        self.state = new_state

o = Order(); o.move("PAID"); o.move("SHIPPED")
try:
    o.move("CANCELLED")
except ValueError as exc:
    print("rejected:", exc)
```

## How to approach an LLD question

1. **Clarify** the requirements and scope. List the use cases.
2. **Find the nouns**: they become classes. Find the verbs: they become methods.
3. **Decide relationships**: "has a" (composition), "is a" (inheritance), "uses" (dependency).
4. **Sketch the main flows** through the objects.
5. **Write the code**, core first, with clear names and small methods.
6. **Handle edge cases and concurrency**; say how you would extend it.

## Worked design 1: parking lot

**Requirements**: several floors; spots of sizes for motorcycles, cars and trucks; a vehicle gets the nearest free spot that fits; a ticket is issued on entry; the fee is computed on exit from the duration.

**Classes**: `Vehicle` (with a size), `Spot`, `Ticket`, `ParkingLot`, and a `FeePolicy` strategy so pricing can change without touching the lot.

```python run
import itertools, time
from dataclasses import dataclass, field
from enum import IntEnum

class Size(IntEnum):
    MOTORCYCLE = 1
    CAR = 2
    TRUCK = 3

@dataclass
class Vehicle:
    plate: str
    size: Size

@dataclass
class Spot:
    floor: int
    number: int
    size: Size
    vehicle: Vehicle = None
    def fits(self, vehicle):
        return self.vehicle is None and self.size >= vehicle.size

@dataclass
class Ticket:
    id: int
    vehicle: Vehicle
    spot: Spot
    entered_at: float = field(default_factory=time.time)

class HourlyFee:                                   # a strategy; swap for a flat or weekend policy
    RATES = {Size.MOTORCYCLE: 10, Size.CAR: 30, Size.TRUCK: 60}
    def amount(self, ticket, now):
        hours = max(1, -(-(now - ticket.entered_at) // 3600))      # round up, minimum one hour
        return int(hours) * self.RATES[ticket.vehicle.size]

class LotFull(Exception):
    pass

class ParkingLot:
    def __init__(self, spots, fee_policy):
        self.spots = sorted(spots, key=lambda s: (s.floor, s.number))     # "nearest" = lowest floor, lowest number
        self.fee_policy, self.active, self._ids = fee_policy, {}, itertools.count(1)

    def park(self, vehicle):
        for spot in self.spots:
            if spot.fits(vehicle):
                spot.vehicle = vehicle
                ticket = Ticket(next(self._ids), vehicle, spot)
                self.active[ticket.id] = ticket
                return ticket
        raise LotFull(f"no spot for {vehicle.plate}")

    def leave(self, ticket_id, now=None):
        ticket = self.active.pop(ticket_id)
        ticket.spot.vehicle = None
        return self.fee_policy.amount(ticket, now or time.time())

    def free_count(self):
        return sum(s.vehicle is None for s in self.spots)

lot = ParkingLot([Spot(0, 1, Size.MOTORCYCLE), Spot(0, 2, Size.CAR), Spot(1, 1, Size.CAR), Spot(1, 2, Size.TRUCK)], HourlyFee())
t1 = lot.park(Vehicle("MH12AB1234", Size.CAR))
t2 = lot.park(Vehicle("MH14XY9876", Size.CAR))
t3 = lot.park(Vehicle("MH01ZZ0001", Size.CAR))               # car takes the truck spot: it fits
print("spots:", [(t.spot.floor, t.spot.number) for t in (t1, t2, t3)], "| free:", lot.free_count())
try:
    lot.park(Vehicle("MH02TR5555", Size.TRUCK))
except LotFull as exc:
    print("full:", exc)
print("fee after 2.5 hours:", lot.leave(t1.id, now=t1.entered_at + 2.5 * 3600), "| free:", lot.free_count())
```

**Extensions to discuss**: a lock around `park` for concurrent entry gates; a heap of free spots per size for O(log n) allocation; reserved and electric-vehicle spots as a spot attribute; payment methods as another strategy.

## Worked design 2: Splitwise-style expense sharing

**Requirements**: users add an expense paid by one person and split among several, equally or by exact amounts; show who owes whom; simplify debts.

```python run
from collections import defaultdict

class ExpenseBook:
    def __init__(self):
        self.balance = defaultdict(int)             # positive: is owed money; negative: owes. In paise.

    def add_equal(self, payer, amount, participants):
        share, remainder = divmod(amount, len(participants))
        for i, person in enumerate(participants):
            owed = share + (1 if i < remainder else 0)       # spread the leftover paise
            self.balance[person] -= owed
        self.balance[payer] += amount

    def add_exact(self, payer, shares):
        for person, owed in shares.items():
            self.balance[person] -= owed
        self.balance[payer] += sum(shares.values())

    def settle(self):
        """Greedy simplification: repeatedly match the biggest debtor with the biggest creditor."""
        creditors = sorted(((v, p) for p, v in self.balance.items() if v > 0), reverse=True)
        debtors = sorted(((-v, p) for p, v in self.balance.items() if v < 0), reverse=True)
        payments, i, j = [], 0, 0
        while i < len(debtors) and j < len(creditors):
            owe, debtor = debtors[i]
            due, creditor = creditors[j]
            pay = min(owe, due)
            payments.append(f"{debtor} pays {creditor} Rs {pay / 100:.2f}")
            debtors[i], creditors[j] = (owe - pay, debtor), (due - pay, creditor)
            if debtors[i][0] == 0: i += 1
            if creditors[j][0] == 0: j += 1
        return payments

book = ExpenseBook()
book.add_equal("asha", 90000, ["asha", "ravi", "meena"])          # dinner Rs 900
book.add_exact("ravi", {"asha": 20000, "meena": 10000})           # cab: Ravi paid for the other two
book.add_equal("meena", 30000, ["asha", "ravi", "meena"])         # snacks
print(dict(book.balance), "| sums to zero:", sum(book.balance.values()) == 0)
print("\n".join(book.settle()))
```

**Design points**: money as integers; split types as strategies (`EqualSplit`, `ExactSplit`, `PercentSplit`); the invariant that balances sum to zero is a natural test.

## Worked design 3: an in-memory cache with pluggable eviction

**Requirements**: `get`, `put`, a capacity, and an eviction policy that can be swapped (LRU, LFU, FIFO).

```python run
from collections import OrderedDict, defaultdict

class LruPolicy:
    def __init__(self): self.order = OrderedDict()
    def touch(self, key): self.order[key] = True; self.order.move_to_end(key)
    def evict(self): return self.order.popitem(last=False)[0]
    def remove(self, key): self.order.pop(key, None)

class LfuPolicy:
    def __init__(self): self.count = defaultdict(int)
    def touch(self, key): self.count[key] += 1
    def evict(self):
        key = min(self.count, key=self.count.get)
        del self.count[key]
        return key
    def remove(self, key): self.count.pop(key, None)

class Cache:
    def __init__(self, capacity, policy):
        self.capacity, self.policy, self.data = capacity, policy, {}
    def get(self, key):
        if key not in self.data:
            return None
        self.policy.touch(key)
        return self.data[key]
    def put(self, key, value):
        if key not in self.data and len(self.data) >= self.capacity:
            victim = self.policy.evict()
            del self.data[victim]
            print(f"   evicted {victim}")
        self.data[key] = value
        self.policy.touch(key)

for name, policy in (("LRU", LruPolicy()), ("LFU", LfuPolicy())):
    print(name)
    c = Cache(2, policy)
    c.put("a", 1); c.put("b", 2)
    c.get("a"); c.get("a"); c.get("b")
    c.put("c", 3)                    # LRU evicts a (b was used last); LFU evicts b (used least often)
    print("   keys now:", sorted(c.data))
```

The cache does not know how eviction works; the policy does not know what is stored. That separation is the whole point of the strategy pattern.

## More LLD questions and what each tests

| Question | Central idea |
| --- | --- |
| Elevator system | State machine; scheduling strategy |
| Library management | Entities and relationships; availability rules |
| Vending machine | State pattern; inventory; payment |
| Tic-tac-toe, chess, snakes and ladders | Board modelling; move validation; turn management |
| Rate limiter | Strategy for algorithms; thread safety |
| Logger framework | Singleton, levels, pluggable sinks (observer) |
| File system | Composite pattern (files and folders share an interface) |
| Hotel or movie booking | Concurrency on a shared resource; state transitions |
| Notification service | Factory and strategy per channel; retry |
| Pub/sub system | Observer; queues; consumer offsets |

## What good LLD code looks like

- Names that say what things are: `ParkingLot.park(vehicle)`, not `PL.proc(v)`.
- Small classes with one job; small methods that do one thing.
- Composition by default; inheritance only for real "is a".
- Dependencies passed in, so tests can use fakes.
- Invalid states made impossible: validated constructors, enums instead of strings, private fields with methods.
- No premature generality: design for the stated requirements, and say how you would extend.
- Tests for the core rules.

## Check yourself

```quiz
[
  {"q": "A class computes prices, writes to the database and sends emails. Which principle does it break?", "options": ["Liskov substitution", "Single responsibility", "Interface segregation"], "answer": 1, "why": "It has three unrelated reasons to change."},
  {"q": "You add a new discount type by writing one new class, editing nothing else. Which principle is this?", "options": ["Open for extension, closed for modification", "Dependency inversion", "Singleton"], "answer": 0, "why": "Behaviour is extended by adding code, not changing tested code."},
  {"q": "Which pattern lets a cache swap LRU for LFU without changing the cache class?", "options": ["Observer", "Strategy", "Adapter"], "answer": 1, "why": "The algorithm is an object the cache holds and calls."},
  {"q": "Why pass a mailer into `SignupService` instead of creating it inside?", "options": ["It is shorter", "Tests can pass a fake, and the implementation can change without editing the service", "Python requires it"], "answer": 1, "why": "This is dependency inversion through injection."},
  {"q": "An order must not go from SHIPPED back to CREATED. Which pattern models this cleanly?", "options": ["State machine", "Builder", "Facade"], "answer": 0, "why": "Allowed transitions are explicit and everything else is rejected."},
  {"q": "In the parking lot, why is the fee calculation a separate class?", "options": ["To make the file longer", "Pricing rules change independently of how spots are allocated", "Because of Python's GIL"], "answer": 1, "why": "Separate responsibilities; a new policy plugs in without touching the lot."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: parking-lot
title: Thread-safe parking lot with free-spot heaps
kind: code
level: hard
@@statement
Build a `ParkingLot` class. Spots have a size (`"S"`, `"M"` or `"L"`). A vehicle fits in a spot of its own size or a larger one.

**Constructor**: `ParkingLot(spots)` where `spots` is a list of sizes, e.g. `["S", "M", "L"]`. The spot id is the index in that list (0, 1, 2).

**Methods**
- `park(size)`: park a vehicle of size `size`. Pick the **smallest** spot size that fits and has a free spot, and inside that size the **lowest spot id** (keep one `heapq` of free ids per size). Return a ticket number: integers starting at 1, +1 for every successful park. If nothing fits return `None` (and do not use up a ticket number).
- `spot_of(ticket)`: the spot id of that ticket.
- `leave(ticket, hours, weekend=False)`: free the spot and return the fee. Fee = `max(1, ceil(hours))` x rate of the **vehicle** size (`S`=1, `M`=2, `L`=3). On a weekend the fee is multiplied by 1.5. An unknown or already used ticket raises `KeyError`.
- `park` must be safe to call from many threads at once (use a `threading.Lock`): two threads must never get the same spot.

**Example**

```
lot = ParkingLot(["S", "M", "L"])
lot.park("S")        -> 1   (spot 0)
lot.park("S")        -> 2   (spot 1, the M spot, because S is full)
lot.leave(1, 1.2)    -> 2   (2 hours x rate 1)
```
@@starter
import heapq
import math
import threading

class ParkingLot:
    def __init__(self, spots):
        pass

    def park(self, size):
        pass

    def spot_of(self, ticket):
        pass

    def leave(self, ticket, hours, weekend=False):
        pass
@@tests
_lot = ParkingLot(["S", "M", "L"])
_t1 = _lot.park("S")
assert _t1 == 1 and _lot.spot_of(_t1) == 0, "first S goes to spot 0, ticket 1"
_t2 = _lot.park("S")
assert _t2 == 2 and _lot.spot_of(_t2) == 1, "S overflows into the M spot"
_t3 = _lot.park("S")
assert _t3 == 3 and _lot.spot_of(_t3) == 2, "then into the L spot"
assert _lot.park("S") is None, "lot is full"
assert _lot.leave(_t1, 1.2) == 2, "1.2h rounds up to 2h at rate 1"
assert _lot.park("M") is None, "freed S spot is too small for M"
_t4 = _lot.park("S")
assert _t4 == 4 and _lot.spot_of(_t4) == 0, "failed park must not use a ticket number; freed spot reused"
assert _lot.leave(_t3, 2, weekend=True) == 3.0, "weekend fee 2h x 1 x 1.5"
assert _lot.leave(_t2, 0) == 1, "minimum one hour"
_failed = False
try:
    _lot.leave(_t2, 1)
except KeyError:
    _failed = True
assert _failed, "second leave with the same ticket raises KeyError"
_lot2 = ParkingLot(["M", "L"])
_tl = _lot2.park("L")
assert _lot2.spot_of(_tl) == 1 and _lot2.leave(_tl, 3) == 9, "L rate is 3"
_lot3 = ParkingLot(["M", "M"])
assert _lot3.spot_of(_lot3.park("M")) == 0 and _lot3.spot_of(_lot3.park("M")) == 1, "lowest id first"
_lot4 = ParkingLot(["S"] * 5)
_res = []
_threads = [threading.Thread(target=lambda: _res.append(_lot4.park("S"))) for _ in range(20)]
for _th in _threads:
    _th.start()
for _th in _threads:
    _th.join()
_ok = [r for r in _res if r is not None]
assert len(_ok) == 5 and len(set(_ok)) == 5, "exactly 5 distinct tickets under concurrency"
@@hint
Keep `self._free = {"S": [], "M": [], "L": []}` filled with `heappush`, and a dict `ticket -> (spot, vehicle_size)`. Loop over sizes from the requested one upwards and `heappop` the first non-empty heap, all inside `with self._lock`.
@@solution
import heapq
import math
import threading

class ParkingLot:
    ORDER = ["S", "M", "L"]
    RATE = {"S": 1, "M": 2, "L": 3}

    def __init__(self, spots):
        self._lock = threading.Lock()
        self._spot_size = list(spots)
        self._free = {"S": [], "M": [], "L": []}
        for spot_id, size in enumerate(spots):
            heapq.heappush(self._free[size], spot_id)
        self._tickets = {}
        self._next = 1

    def park(self, size):
        with self._lock:
            for s in self.ORDER[self.ORDER.index(size):]:
                if self._free[s]:
                    spot = heapq.heappop(self._free[s])
                    ticket = self._next
                    self._next += 1
                    self._tickets[ticket] = (spot, size)
                    return ticket
            return None

    def spot_of(self, ticket):
        return self._tickets[ticket][0]

    def leave(self, ticket, hours, weekend=False):
        with self._lock:
            spot, size = self._tickets.pop(ticket)
            heapq.heappush(self._free[self._spot_size[spot]], spot)
        fee = max(1, math.ceil(hours)) * self.RATE[size]
        return fee * 1.5 if weekend else fee
````

````task
id: expense-undo
title: Expense book with percentage splits and undo
kind: code
level: medium
@@statement
Build `ExpenseBook`, a shared-expense tracker. Every `add` is a *command* that you store, so `undo` can remove it (command pattern).

**Methods**
- `add(payer, amount, split)`: `amount` is an int number of cents (> 0). `split` is a dict `name -> percent` (ints) that must sum to exactly 100. Each person owes `amount * percent // 100` cents; any leftover cents (because of rounding down) are added to the share of the **alphabetically first** name in `split`. The payer gets `+amount`, each person in `split` gets `-share` (the payer may be inside `split`). Invalid amount or percentages raise `ValueError` and change nothing.
- `balances()`: dict `name -> net cents` for everyone who appears in a remaining expense (positive = is owed money). Net values always sum to 0.
- `undo()`: remove the most recent remaining expense and return `True`; return `False` if there is nothing to undo.

**Example**

```
book = ExpenseBook()
book.add("ann", 1000, {"ann": 50, "bob": 50})
book.balances()   -> {"ann": 500, "bob": -500}
book.add("ann", 101, {"ann": 50, "bob": 50})   # shares 50 + 50, leftover 1 goes to ann
book.balances()   -> {"ann": 550, "bob": -550}
book.undo()       -> True
```
@@starter
class ExpenseBook:
    def __init__(self):
        self._history = []

    def add(self, payer, amount, split):
        pass

    def balances(self):
        pass

    def undo(self):
        pass
@@tests
_b = ExpenseBook()
_b.add("ann", 1000, {"ann": 50, "bob": 50})
assert _b.balances() == {"ann": 500, "bob": -500}, "50/50 split"
_b.add("bob", 100, {"ann": 33, "bob": 33, "cy": 34})
assert _b.balances() == {"ann": 467, "bob": -433, "cy": -34}, "three-way split"
assert sum(_b.balances().values()) == 0, "balances sum to zero"
assert _b.undo() is True, "undo returns True"
assert _b.balances() == {"ann": 500, "bob": -500}, "cy disappears after undo"
_b.add("ann", 101, {"bob": 50, "ann": 50})
assert _b.balances() == {"ann": 550, "bob": -550}, "leftover cent goes to alphabetically first name"
_failed = 0
for _args in [("ann", 100, {"ann": 90}), ("ann", 0, {"ann": 100}), ("ann", -5, {"ann": 100})]:
    try:
        _b.add(*_args)
    except ValueError:
        _failed += 1
assert _failed == 3, "invalid input raises ValueError"
assert _b.balances() == {"ann": 550, "bob": -550}, "failed add changes nothing"
assert _b.undo() and _b.undo(), "two undos succeed"
assert _b.undo() is False and _b.balances() == {}, "nothing left to undo"
@@hint
Store each expense as a delta dict (`name -> change`). `balances()` sums all stored deltas; `undo()` is just `self._history.pop()`.
@@solution
class ExpenseBook:
    def __init__(self):
        self._history = []

    def add(self, payer, amount, split):
        if amount <= 0 or sum(split.values()) != 100:
            raise ValueError("bad expense")
        shares = {name: amount * pct // 100 for name, pct in split.items()}
        shares[min(split)] += amount - sum(shares.values())
        delta = {payer: amount}
        for name, share in shares.items():
            delta[name] = delta.get(name, 0) - share
        self._history.append(delta)

    def balances(self):
        result = {}
        for delta in self._history:
            for name, change in delta.items():
                result[name] = result.get(name, 0) + change
        return result

    def undo(self):
        if not self._history:
            return False
        self._history.pop()
        return True
````

````task
id: elevator
title: Elevator controller for one lift, then two
kind: code
level: medium
@@statement
Build an `Elevator` that serves floor requests with the "keep going in one direction" (SCAN) rule, and a function that dispatches a call to the best of several lifts.

**`Elevator(start=0)`**
- Attribute `floor`: the current floor. Internal direction starts as `"up"`.
- `request(floor)`: add a stop. Requesting the current floor is ignored. Duplicates count once.
- `pending`: a property returning the sorted list of floors still to visit.
- `step()`: move **one floor** and return the new `floor`. Rule: keep the current direction while at least one pending stop lies ahead in that direction; otherwise reverse. Arriving at a pending floor removes it. With no pending stops, do not move (return `floor`) and remember the last direction.

**`nearest_lift(lifts, floor)`**: return the **index** of the lift whose `floor` is closest to `floor`; ties go to the lowest index.

**Example**

```
e = Elevator(5)
e.request(7); e.request(2)
[e.step() for _ in range(7)]  -> [6, 7, 6, 5, 4, 3, 2]
```
@@starter
class Elevator:
    def __init__(self, start=0):
        self.floor = start

    def request(self, floor):
        pass

    @property
    def pending(self):
        pass

    def step(self):
        pass

def nearest_lift(lifts, floor):
    pass
@@tests
_e = Elevator(5)
_e.request(7)
_e.request(2)
_e.request(5)
assert _e.pending == [2, 7], "current floor ignored, pending sorted"
assert [_e.step() for _ in range(7)] == [6, 7, 6, 5, 4, 3, 2], "up first, then reverse"
assert _e.pending == [] and _e.step() == 2, "idle stays put"
_e2 = Elevator(0)
_e2.request(4)
assert [_e2.step() for _ in range(4)] == [1, 2, 3, 4], "simple trip up"
_e2.request(2)
_e2.request(6)
assert [_e2.step() for _ in range(6)] == [5, 6, 5, 4, 3, 2], "direction is remembered, keeps going up first"
_e3 = Elevator(3)
_e3.request(3)
_e3.request(1)
_e3.request(1)
assert _e3.pending == [1], "duplicates count once"
assert _e3.step() == 2 and _e3.step() == 1, "reverses immediately when nothing is above"
assert nearest_lift([Elevator(0), Elevator(10)], 7) == 1, "closest lift"
assert nearest_lift([Elevator(0), Elevator(10)], 5) == 0, "tie goes to lowest index"
@@hint
Keep `self._stops` as a set and `self._dir` as `"up"`/`"down"`. In `step`, check whether any stop lies ahead in the current direction and flip the direction if none does.
@@solution
class Elevator:
    def __init__(self, start=0):
        self.floor = start
        self._stops = set()
        self._dir = "up"

    def request(self, floor):
        if floor != self.floor:
            self._stops.add(floor)

    @property
    def pending(self):
        return sorted(self._stops)

    def step(self):
        if not self._stops:
            return self.floor
        up = any(f > self.floor for f in self._stops)
        down = any(f < self.floor for f in self._stops)
        if self._dir == "up" and not up:
            self._dir = "down"
        elif self._dir == "down" and not down:
            self._dir = "up"
        self.floor += 1 if self._dir == "up" else -1
        self._stops.discard(self.floor)
        return self.floor

def nearest_lift(lifts, floor):
    best = 0
    for i, lift in enumerate(lifts):
        if abs(lift.floor - floor) < abs(lifts[best].floor - floor):
            best = i
    return best
````

````task
id: vending-machine
title: Vending machine state machine
kind: code
level: medium
@@statement
Build `VendingMachine(stock)` where `stock` is a dict `name -> (price_cents, quantity)`. Copy it; do not mutate the caller's dict.

**State** (property `state`, a string)
- `"out_of_stock"` when every quantity is 0
- else `"has_money"` when inserted credit is above 0
- else `"idle"`

(The "dispensing" state is the moment inside a successful `select`; afterwards the machine is idle or out of stock again.)

**Methods**
- `insert(cents)`: add credit and return `True`. `cents <= 0` raises `ValueError`. When the machine is out of stock the coin is refused: return `False`, no credit added.
- `select(name)`: returns a tuple `(status, change)`, checked in this order:
  1. unknown name: `("unknown", 0)`
  2. quantity is 0: `("sold_out", 0)`
  3. credit < price: `("insufficient", 0)`
  4. otherwise: quantity -1, credit becomes 0, return `("dispensed", credit - price)`
  In cases 1-3 the credit is kept.
- `cancel()`: return all credit (an int) and set it to 0.

**Example**

```
vm = VendingMachine({"cola": (150, 1)})
vm.insert(200)        -> True
vm.state              -> "has_money"
vm.select("cola")     -> ("dispensed", 50)
vm.state              -> "out_of_stock"
```
@@starter
class VendingMachine:
    def __init__(self, stock):
        pass

    @property
    def state(self):
        pass

    def insert(self, cents):
        pass

    def select(self, name):
        pass

    def cancel(self):
        pass
@@tests
_stock = {"cola": (150, 2), "chips": (100, 1)}
_vm = VendingMachine(_stock)
assert _vm.state == "idle", "starts idle"
assert _vm.insert(100) is True and _vm.state == "has_money", "coin accepted"
assert _vm.select("cola") == ("insufficient", 0) and _vm.state == "has_money", "credit kept"
_vm.insert(100)
assert _vm.select("cola") == ("dispensed", 50) and _vm.state == "idle", "change returned, back to idle"
_vm.insert(100)
assert _vm.select("chips") == ("dispensed", 0), "exact money"
_vm.insert(200)
assert _vm.select("chips") == ("sold_out", 0), "chips are gone"
assert _vm.cancel() == 200 and _vm.state == "idle", "refund"
assert _vm.select("nope") == ("unknown", 0), "unknown item"
_vm.insert(150)
assert _vm.select("cola") == ("dispensed", 0) and _vm.state == "out_of_stock", "last item sold"
assert _vm.insert(10) is False and _vm.cancel() == 0, "coin refused when out of stock"
assert _stock == {"cola": (150, 2), "chips": (100, 1)}, "caller's dict not mutated"
_bad = False
try:
    VendingMachine({"a": (1, 1)}).insert(0)
except ValueError:
    _bad = True
assert _bad, "zero coin raises ValueError"
@@hint
Store `self._items = {name: [price, qty]}` and `self._credit`. Make `state` a computed property so it can never get out of sync with the data.
@@solution
class VendingMachine:
    def __init__(self, stock):
        self._items = {n: [p, q] for n, (p, q) in stock.items()}
        self._credit = 0

    @property
    def state(self):
        if all(q == 0 for _, q in self._items.values()):
            return "out_of_stock"
        return "has_money" if self._credit > 0 else "idle"

    def insert(self, cents):
        if cents <= 0:
            raise ValueError("coin must be positive")
        if self.state == "out_of_stock":
            return False
        self._credit += cents
        return True

    def select(self, name):
        if name not in self._items:
            return ("unknown", 0)
        price, qty = self._items[name]
        if qty == 0:
            return ("sold_out", 0)
        if self._credit < price:
            return ("insufficient", 0)
        change = self._credit - price
        self._items[name][1] -= 1
        self._credit = 0
        return ("dispensed", change)

    def cancel(self):
        refund, self._credit = self._credit, 0
        return refund
````

````task
id: logger-design
title: Logger with levels, handlers and a formatter
kind: code
level: medium
@@statement
Design a small logging library with pluggable outputs.

**Levels**: `DEBUG < INFO < WARNING < ERROR`.

**`default_format(level, name, msg)`** returns `"[LEVEL] name: msg"`, e.g. `"[INFO] api: hello"`.

**`MemoryHandler(min_level="DEBUG")`**: a handler that keeps lines in the list attribute `lines`. Its method `handle(level, line)` stores `line` only if `level` is at least `min_level`. (A file or console handler would have the same `handle` method; that is what makes outputs pluggable.)

**`Logger(name, level="INFO", formatter=None)`**
- `add_handler(handler)`: any object with a `handle(level, line)` method.
- `log(level, msg)`: ignore it if `level` is below the logger level. Otherwise build the line with `formatter(level, name, msg)` (`default_format` when `None`) and pass `(level, line)` to every handler in the order added.
- Shortcuts `debug`, `info`, `warning`, `error` call `log` with the matching level name.
- An unknown level name (in the constructor or in `log`) raises `ValueError`.

**Example**

```
h = MemoryHandler()
lg = Logger("api")
lg.add_handler(h)
lg.debug("x"); lg.info("hello")
h.lines   -> ["[INFO] api: hello"]
```
@@starter
LEVELS = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}

def default_format(level, name, msg):
    pass

class MemoryHandler:
    def __init__(self, min_level="DEBUG"):
        self.lines = []

    def handle(self, level, line):
        pass

class Logger:
    def __init__(self, name, level="INFO", formatter=None):
        pass

    def add_handler(self, handler):
        pass

    def log(self, level, msg):
        pass

    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        pass
@@tests
_h = MemoryHandler()
_lg = Logger("api")
_lg.add_handler(_h)
_lg.debug("x")
_lg.info("hello")
assert _h.lines == ["[INFO] api: hello"], "debug filtered by logger level"
_h1, _h2 = MemoryHandler(), MemoryHandler("ERROR")
_lg2 = Logger("db", "DEBUG")
_lg2.add_handler(_h1)
_lg2.add_handler(_h2)
_lg2.debug("a")
_lg2.error("b")
assert _h1.lines == ["[DEBUG] db: a", "[ERROR] db: b"], "handler 1 gets both"
assert _h2.lines == ["[ERROR] db: b"], "handler min_level filters"
_h3 = MemoryHandler()
_lg3 = Logger("x", formatter=lambda level, name, msg: level.lower() + "|" + msg)
_lg3.add_handler(_h3)
_lg3.warning("careful")
assert _h3.lines == ["warning|careful"], "custom formatter"
class _Collect:
    def __init__(self):
        self.got = []
    def handle(self, level, line):
        self.got.append((level, line))
_c = _Collect()
_lg4 = Logger("z")
_lg4.add_handler(_c)
_lg4.error("boom")
assert _c.got == [("ERROR", "[ERROR] z: boom")], "any object with handle() works"
_bad = 0
for _fn in (lambda: _lg4.log("LOUD", "x"), lambda: Logger("q", "LOUD")):
    try:
        _fn()
    except ValueError:
        _bad += 1
assert _bad == 2, "unknown level raises ValueError"
@@hint
Compare levels through the `LEVELS` dict (`LEVELS[level] >= LEVELS[self.level]`). Validate with `if level not in LEVELS: raise ValueError(...)`.
@@solution
LEVELS = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}

def default_format(level, name, msg):
    return "[%s] %s: %s" % (level, name, msg)

class MemoryHandler:
    def __init__(self, min_level="DEBUG"):
        self.min_level = min_level
        self.lines = []

    def handle(self, level, line):
        if LEVELS[level] >= LEVELS[self.min_level]:
            self.lines.append(line)

class Logger:
    def __init__(self, name, level="INFO", formatter=None):
        if level not in LEVELS:
            raise ValueError("unknown level")
        self.name = name
        self.level = level
        self.formatter = formatter or default_format
        self.handlers = []

    def add_handler(self, handler):
        self.handlers.append(handler)

    def log(self, level, msg):
        if level not in LEVELS:
            raise ValueError("unknown level")
        if LEVELS[level] < LEVELS[self.level]:
            return
        line = self.formatter(level, self.name, msg)
        for handler in self.handlers:
            handler.handle(level, line)

    def debug(self, msg):
        self.log("DEBUG", msg)

    def info(self, msg):
        self.log("INFO", msg)

    def warning(self, msg):
        self.log("WARNING", msg)

    def error(self, msg):
        self.log("ERROR", msg)
````

````task
id: tests-first
title: Five tests before features
kind: text
level: easy
@@statement
You are about to build a **vending machine** (items with a price and quantity, coins go in, `select` dispenses and returns change). Before writing any code, write the **five tests** of its core rules, as Python `def test_...` functions.

**Deliverable**: exactly five tests. Each test has a name that states the rule, a setup with concrete numbers (for example a cola for 150 cents with quantity 2), one action and one assertion on the exact result. Example of the style:

```
def test_exact_money_gives_no_change():
    vm = VendingMachine({"cola": (150, 2)})
    vm.insert(150)
    assert vm.select("cola") == ("dispensed", 0)
```

Cover five *different* rules. Write them against the public interface only (`insert`, `select`, `cancel`, `state`), no private attributes.
@@criteria
- Contains exactly five separate tests, each with a name that states one rule.
- Each test uses concrete numbers and asserts an exact expected result (not just "no error").
- Covers the happy path (successful purchase with correct change).
- Covers at least two failure or edge rules, for example insufficient money, sold out, unknown item, or refund.
- Covers a state rule such as quantity going down after a sale or credit being cleared.
- Tests use only the public interface.
@@solution
```
def test_exact_money_gives_no_change():
    vm = VendingMachine({"cola": (150, 2)}); vm.insert(150)
    assert vm.select("cola") == ("dispensed", 0)

def test_overpay_returns_change():
    vm = VendingMachine({"cola": (150, 2)}); vm.insert(200)
    assert vm.select("cola") == ("dispensed", 50)

def test_insufficient_money_keeps_credit():
    vm = VendingMachine({"cola": (150, 2)}); vm.insert(100)
    assert vm.select("cola") == ("insufficient", 0)
    assert vm.cancel() == 100

def test_sold_out_item_is_refused():
    vm = VendingMachine({"cola": (150, 1), "tea": (100, 1)})
    vm.insert(150); vm.select("cola"); vm.insert(150)
    assert vm.select("cola") == ("sold_out", 0)

def test_credit_is_cleared_after_purchase():
    vm = VendingMachine({"cola": (150, 2)}); vm.insert(200); vm.select("cola")
    assert vm.state == "idle"
```
Each test pins down exactly one rule with exact numbers, so a failing test tells you which rule broke.
````
