---
id: py-first-steps
title: Values, variables and types
minutes: 25
---

A Python program is a list of instructions that the interpreter runs from top to bottom. Most instructions do one of two things: compute a value, or give a value a name so you can use it later.

## Values and names

`=` does not mean "equals". It means "make the name on the left refer to the value on the right". The name is a label, not a box: the same value can have several labels.

```python run
price = 249.50          # a float (a number with a decimal point)
quantity = 3            # an int (a whole number)
item = "keyboard"       # a str (text)
in_stock = True         # a bool (True or False)

total = price * quantity
print(item, "x", quantity, "costs", total)
print(type(price), type(quantity), type(item), type(in_stock))
```

Change a value and press Run again. Every example on these pages is editable.

| Type | Example | Used for |
| --- | --- | --- |
| `int` | `42`, `-7`, `1_000_000` | Counting, indexes |
| `float` | `3.14`, `2.0`, `1e-3` | Measurements |
| `str` | `"hello"`, `'a'` | Text |
| `bool` | `True`, `False` | Yes or no answers |
| `NoneType` | `None` | "No value here" |

## Arithmetic

```python run
print(7 + 2, 7 - 2, 7 * 2)
print(7 / 2)      # true division always gives a float: 3.5
print(7 // 2)     # floor division drops the remainder: 3
print(7 % 2)      # modulo is the remainder: 1
print(2 ** 10)    # power: 1024

minutes = 135
print(minutes // 60, "hours and", minutes % 60, "minutes")
```

`//` and `%` work as a pair: one gives how many whole groups fit, the other gives what is left over. You will use that pair constantly, for clocks, pages, grids and digits.

> Floats are approximations. `0.1 + 0.2` prints `0.30000000000000004`. Compare floats with a tolerance, or use `round(value, 2)` when you show them.

## Text and f-strings

An f-string builds text from values. Put an `f` before the quotes and write expressions inside `{}`.

```python run
name = "Asha"
score = 91.456

print(f"{name} scored {score}")
print(f"{name} scored {score:.1f}")        # one decimal place
print(f"{7:03d}")                          # pad with zeros to width 3: 007
print(f"{name!r} has {len(name)} letters") # !r shows the quotes

print(name.upper(), name.lower(), name[0], name[-1])
```

## Converting between types

Input from a user, a file or a web form always arrives as text. Convert it before you calculate.

```python run
age_text = "34"
print(age_text + "1")        # text joined to text: 341
print(int(age_text) + 1)     # a number plus a number: 35

print(float("2.5") * 2, str(99) + "%", int(3.99))   # int() cuts, it does not round
print(bool(0), bool(""), bool("no"), bool(17))      # empty and zero are False
```

## Check yourself

```quiz
[
  {"q": "What does `17 // 5` give?", "options": ["`3.4`", "`3`", "`2`"], "answer": 1, "why": "`//` is floor division: 5 fits into 17 three whole times."},
  {"q": "What is the type of `7 / 7`?", "options": ["`int`", "`float`", "`bool`"], "answer": 1, "why": "`/` always produces a float, here `1.0`."},
  {"q": "What does `int(\"12\") + int(\"3\")` give?", "options": ["`\"123\"`", "`15`", "An error"], "answer": 1, "why": "Both strings are converted to numbers first, then added."}
]
```

## Exercises

````task
id: seconds-to-clock
title: Seconds to a clock time
kind: code
level: easy
@@statement
Write `seconds_to_clock(seconds)` that turns a number of seconds into the text `H:MM:SS`.

**Input**: `seconds`, a whole number, 0 or greater.

**Output**: a string. Hours have no padding. Minutes and seconds always have two digits.

**Example**

```
seconds_to_clock(3725)  -> "1:02:05"
seconds_to_clock(59)    -> "0:00:59"
```
@@starter
def seconds_to_clock(seconds):
    # use // and % to split seconds into hours, minutes and seconds
    pass

print(seconds_to_clock(3725))
@@tests
assert seconds_to_clock(3725) == "1:02:05", "one hour, two minutes, five seconds"
assert seconds_to_clock(59) == "0:00:59", "under a minute"
assert seconds_to_clock(0) == "0:00:00", "zero"
assert seconds_to_clock(3600) == "1:00:00", "exactly one hour"
assert seconds_to_clock(86399) == "23:59:59", "last second of the day"
assert seconds_to_clock(360000) == "100:00:00", "hours are not capped"
@@hint
`hours = seconds // 3600`, then work with the remainder `seconds % 3600`. The format `{minutes:02d}` pads to two digits.
@@solution
def seconds_to_clock(seconds):
    hours = seconds // 3600
    minutes = seconds % 3600 // 60
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:02d}"
````

````task
id: initials
title: Initials from a full name
kind: code
level: easy
@@statement
Write `initials(full_name)` that returns the first letter of every word in a name, in capitals, each followed by a dot.

**Input**: `full_name`, a string of one or more words separated by spaces. There may be extra spaces at the ends or between words.

**Output**: a string such as `"A.K."`. An empty or all-space name gives `""`.

**Example**

```
initials("ada king lovelace")  -> "A.K.L."
initials("  grace   hopper ")  -> "G.H."
```
@@starter
def initials(full_name):
    pass

print(initials("ada king lovelace"))
@@tests
assert initials("ada king lovelace") == "A.K.L.", "three words"
assert initials("  grace   hopper ") == "G.H.", "extra spaces"
assert initials("Linus") == "L.", "one word"
assert initials("") == "", "empty name"
assert initials("   ") == "", "only spaces"
assert initials("alan mathison TURING") == "A.M.T.", "already upper case"
@@hint
`full_name.split()` with no argument splits on any run of spaces and ignores the ends. Take `word[0].upper()` for each word.
@@solution
def initials(full_name):
    result = ""
    for word in full_name.split():
        result += word[0].upper() + "."
    return result
````
