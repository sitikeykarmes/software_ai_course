---
id: py-strings
title: Strings in depth
minutes: 30
---

A string is a sequence of characters. You can index it, slice it and loop over it like a list, but you cannot change it in place: every string method returns a new string.

## Indexing and slicing

```python run
word = "PYTHON"
#       012345      positions from the left
#      -6 ... -1    positions from the right

print(word[0], word[-1])        # first and last character
print(word[1:4])                # from 1 up to, not including, 4 -> YTH
print(word[:2], word[2:])       # a missing bound means "from the start" / "to the end"
print(word[::2])                # every second character -> PTO
print(word[::-1])               # a step of -1 reverses -> NOHTYP
```

A slice never raises an error for positions that are out of range, it just gives fewer characters. Indexing a single position that does not exist raises `IndexError`.

## The methods you will use every day

```python run
raw = "  Order #1042: 3x Keyboard, 1x Mouse  "

clean = raw.strip()                       # remove spaces at both ends
print(clean.lower())
print(clean.startswith("Order"), "Mouse" in clean)
print(clean.replace("x ", " x "))
print(clean.find("#"), clean.count("x"))  # position of first match, number of matches

head, items = clean.split(": ")           # split into two parts at the separator
print(head)
print(items.split(", "))                  # -> a list of strings
```

## split and join

`split` turns one string into a list. `join` does the reverse. Together they are the standard way to take text apart and put it back together.

```python run
line = "2026-11-14,weld,OK,41.2"
date, station, status, cycle = line.split(",")
print(station, float(cycle))

words = ["fast", "simple", "readable"]
print(", ".join(words))
print("-".join("abc"))            # join works on any sequence of strings

sentence = "the   quick  brown fox"
print(" ".join(sentence.split())) # collapse repeated spaces
```

> Build long strings with `join`, not with `+=` in a loop. Each `+=` copies everything written so far, which becomes slow for thousands of pieces.

## Characters and tests

```python run
for ch in "a1 B?":
    print(repr(ch), ch.isalpha(), ch.isdigit(), ch.isspace(), ch.isupper())

print(ord("a"), chr(97), chr(ord("a") + 3))    # characters are numbers underneath
```

`ord` gives the number of a character and `chr` goes back. Arithmetic on those numbers is how letter-shifting ciphers work.

## Check yourself

```quiz
[
  {"q": "What is `\"python\"[1:3]`?", "options": ["`\"py\"`", "`\"yt\"`", "`\"yth\"`"], "answer": 1, "why": "A slice starts at index 1 and stops before index 3."},
  {"q": "After `s = \"abc\"; s.upper()`, what is `s`?", "options": ["`\"ABC\"`", "`\"abc\"`", "An error is raised"], "answer": 1, "why": "Strings are immutable. `upper()` returns a new string, and nothing stored it."},
  {"q": "What does `\"a,b,,c\".split(\",\")` return?", "options": ["`['a', 'b', 'c']`", "`['a', 'b', '', 'c']`", "`['a,b', 'c']`"], "answer": 1, "why": "With an explicit separator, two separators in a row produce an empty string between them."}
]
```

## Exercises

````task
id: caesar-cipher
title: Caesar cipher
kind: code
level: medium
@@statement
A Caesar cipher shifts every letter a fixed number of places along the alphabet, wrapping around from `z` to `a`.

Write `caesar(text, shift)`.

**Input**
- `text`: any string.
- `shift`: a whole number. It may be negative or larger than 26.

**Output**: a string of the same length.
- Lower case letters stay lower case, upper case stay upper case.
- Characters that are not letters `a-z` or `A-Z` are left unchanged.

**Example**

```
caesar("Hello, World!", 3)   -> "Khoor, Zruog!"
caesar("Khoor, Zruog!", -3)  -> "Hello, World!"
caesar("xyz", 3)             -> "abc"
```
@@starter
def caesar(text, shift):
    pass

print(caesar("Hello, World!", 3))
@@tests
assert caesar("Hello, World!", 3) == "Khoor, Zruog!", "shift by three"
assert caesar("Khoor, Zruog!", -3) == "Hello, World!", "a negative shift decodes"
assert caesar("xyz", 3) == "abc", "wraps around the end"
assert caesar("abc", 26) == "abc", "a full turn changes nothing"
assert caesar("abc", 55) == "def", "shifts larger than 26"
assert caesar("", 5) == "", "empty text"
assert caesar("123 !?", 9) == "123 !?", "non-letters are unchanged"
@@hint
For a lower case letter: `chr((ord(ch) - ord("a") + shift) % 26 + ord("a"))`. The `% 26` handles wrapping, negative shifts and large shifts in one step.
@@solution
def caesar(text, shift):
    result = []
    for ch in text:
        if "a" <= ch <= "z":
            base = ord("a")
        elif "A" <= ch <= "Z":
            base = ord("A")
        else:
            result.append(ch)
            continue
        result.append(chr((ord(ch) - base + shift) % 26 + base))
    return "".join(result)
````

````task
id: title-case
title: Headline capitalisation
kind: code
level: easy
@@statement
Write `headline(text)` that formats a sentence as a headline.

**Rules**
- Words are separated by spaces. Repeated spaces and spaces at the ends are removed, and words are joined with one space.
- Every word starts with a capital letter and continues in lower case,
- except the small words `a`, `an`, `and`, `of`, `the`, `in`, `on`, `to`, which stay entirely lower case, unless the word is the first word of the headline.

**Input**: `text`, a string.

**Output**: the formatted string. Empty input gives `""`.

**Example**

```
headline("the lord of the rings")      -> "The Lord of the Rings"
headline("  a TALE  of two cities ")   -> "A Tale of Two Cities"
```
@@starter
SMALL_WORDS = {"a", "an", "and", "of", "the", "in", "on", "to"}

def headline(text):
    pass

print(headline("the lord of the rings"))
@@tests
assert headline("the lord of the rings") == "The Lord of the Rings", "small words stay lower case"
assert headline("  a TALE  of two cities ") == "A Tale of Two Cities", "spaces and capitals are normalised"
assert headline("") == "", "empty text"
assert headline("of") == "Of", "the first word is always capitalised"
assert headline("WAR AND PEACE") == "War and Peace", "upper case input"
assert headline("to be or not to be") == "To Be Or Not to Be", "only the listed small words stay lower case"
@@hint
Loop with `enumerate(text.lower().split())`. A word keeps its lower case form when `index > 0 and word in SMALL_WORDS`, otherwise use `word.capitalize()`.
@@solution
SMALL_WORDS = {"a", "an", "and", "of", "the", "in", "on", "to"}

def headline(text):
    words = []
    for index, word in enumerate(text.lower().split()):
        if index > 0 and word in SMALL_WORDS:
            words.append(word)
        else:
            words.append(word.capitalize())
    return " ".join(words)
````
