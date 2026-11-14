---
id: py-set-hashing-stacks
title: Problem set: hashing and stacks
minutes: 90
---

Problems that are solved with a dictionary, a set or a stack. They are shared with the main course lesson **Hashing, stacks, queues and linked lists**, so your progress counts in both places.

## Dictionaries as an index

When a problem asks you to group, count or look something up, a dictionary keyed by the right thing usually gives the answer in one pass. The skill is choosing the key.

```python run
from collections import defaultdict

words = ["listen", "silent", "enlist", "google", "gogole"]

groups = defaultdict(list)
for word in words:
    key = "".join(sorted(word))        # anagrams share the same sorted letters
    groups[key].append(word)

print(list(groups.values()))
```

## A stack remembers what is still open

A stack is a list where you only add and remove at the end: `append` to push, `pop` to take the most recent item. It is the natural structure for anything nested, and for "what was the last thing I have not dealt with yet?".

```python run
def is_balanced(text):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in text:
        if ch in "([{":
            stack.append(ch)                       # an opener waits on the stack
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False                       # wrong closer, or nothing open
    return not stack                               # everything opened was closed

print(is_balanced("{[()]}"), is_balanced("([)]"), is_balanced("(("))
```

## A stack of unanswered questions

For "the next larger value to the right" problems, keep a stack of positions that are still waiting for their answer. Each new value answers every smaller value on top of the stack.

```python run
def next_greater(numbers):
    answer = [None] * len(numbers)
    waiting = []                                   # positions without an answer yet
    for i, value in enumerate(numbers):
        while waiting and numbers[waiting[-1]] < value:
            answer[waiting.pop()] = value
        waiting.append(i)
    return answer

print(next_greater([2, 7, 3, 5, 4, 8]))
```

Every position is pushed once and popped at most once, so the whole thing takes one pass even though there is a loop inside a loop.

## Problems

````task
ref: dsa-hashing-stacks-lists/group-anagrams
````

````task
ref: dsa-hashing-stacks-lists/top-k-frequent
````

````task
ref: dsa-hashing-stacks-lists/valid-parentheses
````

````task
ref: dsa-hashing-stacks-lists/min-stack
````

````task
ref: dsa-hashing-stacks-lists/daily-temperatures
````
