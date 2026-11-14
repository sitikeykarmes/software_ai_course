---
id: py-files-data
title: Files, JSON and CSV
minutes: 30
---

Programs keep their results by writing files, and get their input by reading them. Two text formats cover most everyday work: CSV for tables and JSON for nested data.

## Reading and writing text files

Always open files with `with`. The file is closed when the block ends, even if an error happens inside it.

```python run
from pathlib import Path

path = Path("notes.txt")

with open(path, "w", encoding="utf-8") as f:      # "w" creates or overwrites
    f.write("first line\n")
    f.write("second line\n")

with open(path, "a", encoding="utf-8") as f:      # "a" appends
    f.write("third line\n")

with open(path, encoding="utf-8") as f:           # reading is the default mode
    for number, line in enumerate(f, start=1):
        print(number, line.rstrip("\n"))

print(path.read_text(encoding="utf-8").count("line"), path.exists(), path.suffix)
```

Examples on this page run in a scratch folder that is deleted afterwards, so they cannot touch your own files.

> Always pass `encoding="utf-8"`. Without it Python uses the system default, which on Windows is often not UTF-8, and names with accents or non-Latin letters break.

## JSON

JSON looks like Python dictionaries and lists. `json.dumps` turns Python data into JSON text, `json.loads` turns the text back into data.

```python run
import json

order = {"id": 1042, "items": [{"name": "keyboard", "qty": 1}, {"name": "mouse", "qty": 2}], "paid": True, "note": None}

text = json.dumps(order, indent=2)
print(text)

back = json.loads(text)
print(back["items"][1]["name"], back["paid"], back["note"])
print(sum(item["qty"] for item in back["items"]))
```

| JSON | Python |
| --- | --- |
| object `{}` | `dict` |
| array `[]` | `list` |
| `"text"` | `str` |
| `12`, `1.5` | `int`, `float` |
| `true`, `false`, `null` | `True`, `False`, `None` |

## CSV

Use the `csv` module instead of `line.split(",")`. It copes with commas and quotes inside a field.

```python run
import csv, io

text = 'name,city,score\nAna,"Pune, India",82\nBen,Oslo,95\n'

for row in csv.DictReader(io.StringIO(text)):     # each row is a dict keyed by the header
    print(row["name"], "|", row["city"], "|", int(row["score"]))

out = io.StringIO()
writer = csv.writer(out)
writer.writerow(["item", "price"])
writer.writerows([["tea", 40], ["coffee, large", 60]])
print(out.getvalue())
```

`io.StringIO` wraps a string so that it behaves like an open file. It is handy for trying things out and for tests. With a real file you would write `open("data.csv", newline="", encoding="utf-8")` in its place.

Every value read from a CSV file is a string. Convert numbers with `int()` or `float()` before calculating.

## Check yourself

```quiz
[
  {"q": "What does opening a file with mode `\"w\"` do to an existing file?", "options": ["Appends to it", "Erases it and starts again", "Raises an error"], "answer": 1, "why": "`\"w\"` truncates. Use `\"a\"` to add to the end."},
  {"q": "What does `json.loads('[1, null, true]')` return?", "options": ["`[1, None, True]`", "`[1, 'null', 'true']`", "`'[1, null, true]'`"], "answer": 0, "why": "JSON `null` and `true` become Python `None` and `True`."},
  {"q": "What type is `row[\"score\"]` from `csv.DictReader`?", "options": ["`int`", "`str`", "It depends on the value"], "answer": 1, "why": "CSV has no types. Every field arrives as a string."}
]
```

## Exercises

````task
id: order-total
title: Total of a JSON order
kind: code
level: easy
@@statement
An order arrives as JSON text. Write `order_total(json_text)` that returns the amount to pay.

**Input**: `json_text`, a JSON object with
- `"items"`: a list of objects, each with `"price"` (number) and `"qty"` (whole number),
- `"discount"`: optional, a percentage from 0 to 100. Treat a missing key as `0`.

**Output**: the sum of `price * qty` over all items, reduced by the discount, as a float rounded to 2 decimals.

**Example**

```
order_total('{"items": [{"price": 250, "qty": 2}, {"price": 99.5, "qty": 1}], "discount": 10}')
-> 539.55        ((500 + 99.5) minus 10%)
```
@@starter
import json

def order_total(json_text):
    pass

print(order_total('{"items": [{"price": 250, "qty": 2}, {"price": 99.5, "qty": 1}], "discount": 10}'))
@@tests
assert order_total('{"items": [{"price": 250, "qty": 2}, {"price": 99.5, "qty": 1}], "discount": 10}') == 539.55, "two items with a discount"
assert order_total('{"items": [{"price": 10, "qty": 3}]}') == 30.0, "no discount key"
assert order_total('{"items": []}') == 0.0, "no items"
assert order_total('{"items": [{"price": 19.99, "qty": 3}], "discount": 0}') == 59.97, "rounded to two decimals"
assert order_total('{"items": [{"price": 80, "qty": 1}], "discount": 100}') == 0.0, "full discount"
assert isinstance(order_total('{"items": []}'), float), "the result is a float"
@@hint
`data = json.loads(json_text)`, then `sum(item["price"] * item["qty"] for item in data["items"])`. Read the discount with `data.get("discount", 0)`.
@@solution
import json

def order_total(json_text):
    data = json.loads(json_text)
    subtotal = sum(item["price"] * item["qty"] for item in data["items"])
    discount = data.get("discount", 0)
    return round(float(subtotal * (1 - discount / 100)), 2)
````

````task
id: log-summary
title: Summarise a log file
kind: code
level: medium
@@statement
A service writes one line per event in this format:

```
2026-11-14 09:15:02 ERROR payment timeout
```

That is a date, a time, a level (`INFO`, `WARNING` or `ERROR`) and a message, separated by single spaces. The message may contain spaces.

Write `summarise_log(text)`.

**Input**: `text`, the whole log as one string. Lines are separated by `\n`. Blank lines must be ignored.

**Output**: a dict with two keys:
- `"counts"`: a dict mapping each level that appears to its number of lines,
- `"errors"`: the list of messages of the `ERROR` lines, in order.

**Example**

```
summarise_log("2026-11-14 09:00:00 INFO started\n2026-11-14 09:15:02 ERROR payment timeout\n")
-> {"counts": {"INFO": 1, "ERROR": 1}, "errors": ["payment timeout"]}
```
@@starter
def summarise_log(text):
    pass

print(summarise_log("2026-11-14 09:00:00 INFO started\n2026-11-14 09:15:02 ERROR payment timeout\n"))
@@tests
_log = "2026-11-14 09:00:00 INFO started\n2026-11-14 09:15:02 ERROR payment timeout\n\n2026-11-14 09:16:00 WARNING slow query\n2026-11-14 09:17:30 ERROR disk full on /var\n2026-11-14 09:18:00 INFO stopped\n"
assert summarise_log(_log) == {"counts": {"INFO": 2, "ERROR": 2, "WARNING": 1}, "errors": ["payment timeout", "disk full on /var"]}, "mixed log with a blank line"
assert summarise_log("") == {"counts": {}, "errors": []}, "empty log"
assert summarise_log("\n\n") == {"counts": {}, "errors": []}, "only blank lines"
assert summarise_log("2026-01-01 00:00:00 INFO ok") == {"counts": {"INFO": 1}, "errors": []}, "no trailing newline"
assert summarise_log("2026-01-01 00:00:00 ERROR a  b") == {"counts": {"ERROR": 1}, "errors": ["a  b"]}, "the message is kept exactly"
@@hint
`line.split(" ", 3)` splits at the first three spaces only, so the fourth part is the complete message. Skip lines where `line.strip()` is empty.
@@solution
def summarise_log(text):
    counts = {}
    errors = []
    for line in text.split("\n"):
        if not line.strip():
            continue
        date, time, level, message = line.split(" ", 3)
        counts[level] = counts.get(level, 0) + 1
        if level == "ERROR":
            errors.append(message)
    return {"counts": counts, "errors": errors}
````

````task
ref: python-core/csv-group-average
````
