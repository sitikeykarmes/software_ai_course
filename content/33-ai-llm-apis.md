---
id: ai-llm-apis
title: Building with LLM APIs: prompts, context, structured output, tools
minutes: 60
---

Building on an LLM means sending a list of messages and getting text or a structured action back. The engineering skill is deciding what goes into that list, forcing the output into a shape your code can trust, and handling cost, latency and failure. So that every example runs without an API key, this lesson uses a small fake model with the same interface; the real call is shown beside it.

## The chat API shape

Nearly every provider uses the same structure.

| Role | Purpose |
| --- | --- |
| `system` | Sets the assistant's role, rules and context. Written by you, the developer |
| `user` | The person's request |
| `assistant` | The model's earlier replies |
| `tool` | The result of a tool the model asked to call |

The API is **stateless**: you send the whole conversation each time.

```python
import os
from openai import OpenAI

# Many providers expose an OpenAI-compatible endpoint; only base_url, key and model name change.
client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=os.environ["GROQ_API_KEY"])

resp = client.chat.completions.create(
    model="<model-name>",
    temperature=0,
    max_tokens=200,
    messages=[
        {"role": "system", "content": "You are a support assistant for an electronics shop. Answer in two sentences."},
        {"role": "user", "content": "Can I return headphones after 20 days?"},
    ],
)
print(resp.choices[0].message.content)
print(resp.usage.prompt_tokens, resp.usage.completion_tokens)      # what you pay for
```

It is plain HTTP. With only the standard library:

```python
import json, os, urllib.request

body = {"model": "<model-name>", "messages": [{"role": "user", "content": "Say hello."}]}
req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions",
                             data=json.dumps(body).encode(),
                             headers={"Authorization": "Bearer " + os.environ["GROQ_API_KEY"], "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=30) as r:
    print(json.loads(r.read())["choices"][0]["message"]["content"])
```

## Prompting principles

- **Be specific**. State the task, the audience, the format, the length, and what to do when unsure. Vague prompts get average answers.
- **Give context**. Paste the policy, the schema, the relevant data. The model cannot use what it cannot see.
- **Show examples** (few-shot). Two or three input-output pairs teach format and tone better than a description.
- **Separate parts clearly**. Wrap documents and data in delimiters or XML-style tags so they are not mistaken for instructions.
- **Give the model room to reason** on multi-step tasks, or use a reasoning model; ask for the final answer in a marked field.
- **Say what to do**, not only what to avoid.
- **Iterate against test cases**, not by feel.

A weak prompt and a strong one for the same job:

```
WEAK
Summarise this complaint.

STRONG
You are triaging customer complaints for a car service centre.

Summarise the complaint inside <complaint> tags for the service manager.
- Two sentences at most.
- State the vehicle part involved and what the customer wants.
- If the complaint mentions a safety risk (brakes, steering, fire, airbags), begin with "SAFETY:".
- If information is missing, say what is missing. Do not guess.

<example>
Complaint: "AC stopped cooling a week after service, I want it fixed free."
Summary: The air conditioning stopped cooling one week after service. The customer wants a free repair.
</example>

<complaint>
{complaint_text}
</complaint>
```

## Context engineering

Prompting is one message. Context engineering is managing everything in the window across a long task: system instructions, tool definitions, retrieved documents, conversation history, tool results, memory notes.

- **Relevance beats volume**. Irrelevant text lowers quality and raises cost.
- **History management**: keep recent turns verbatim, summarise older ones, drop stale tool outputs.
- **Memory**: store durable facts outside the window (a database or files) and load what applies.
- **Stable prefix first**: unchanging instructions and tool definitions go at the start so prompt caching works.
- **Budget**: decide how many tokens each part may use.

```python run
def count_tokens(text):
    return max(1, len(text) // 4)                      # rough rule: about 4 characters per token

def build_context(system, history, question, budget=120):
    used = count_tokens(system) + count_tokens(question)
    kept = []
    for turn in reversed(history):                     # newest first: keep what fits
        cost = count_tokens(turn["content"])
        if used + cost > budget:
            break
        kept.append(turn); used += cost
    dropped = len(history) - len(kept)
    messages = [{"role": "system", "content": system}]
    if dropped:
        messages.append({"role": "system", "content": f"[{dropped} earlier messages summarised: user asked about returns and warranty]"})
    return messages + list(reversed(kept)) + [{"role": "user", "content": question}], used

history = [{"role": "user", "content": "What is your return policy for headphones bought online last month?"},
           {"role": "assistant", "content": "Returns are accepted within 30 days with the original receipt and packaging."},
           {"role": "user", "content": "And what does the warranty cover exactly, including accidental damage and battery wear?"},
           {"role": "assistant", "content": "The warranty covers manufacturing defects for one year. Accidental damage and normal battery wear are not covered."},
           {"role": "user", "content": "Ok thanks."},
           {"role": "assistant", "content": "You're welcome."}]
messages, used = build_context("You are a concise support assistant.", history, "Can I still return them if the box is open?")
for m in messages:
    print(f"{m['role']:9} {m['content'][:80]}")
print("approx tokens used:", used)
```

## Structured output

Code needs data, not prose. Define a schema, ask the model for JSON that matches it, **validate**, and retry on failure. Never trust the shape of model output.

```python run
import json

def fake_llm(prompt, attempt):
    """Stands in for a model call. The first reply is malformed, as real ones sometimes are."""
    if attempt == 1:
        return 'Sure! Here is the JSON: {"category": "billing", "urgency": "high"}'
    return '{"category": "billing", "urgency": 4, "summary": "Charged twice for one order"}'

SCHEMA = {"category": {"billing", "shipping", "technical", "other"}, "urgency": range(1, 6), "summary": str}

def validate(data):
    if set(data) != set(SCHEMA):
        raise ValueError(f"expected keys {sorted(SCHEMA)}, got {sorted(data)}")
    if data["category"] not in SCHEMA["category"]:
        raise ValueError("category must be one of " + ", ".join(sorted(SCHEMA["category"])))
    if not isinstance(data["urgency"], int) or data["urgency"] not in SCHEMA["urgency"]:
        raise ValueError("urgency must be an integer from 1 to 5")
    if not isinstance(data["summary"], str):
        raise ValueError("summary must be a string")
    return data

def classify(ticket, max_attempts=3):
    prompt = f"Classify this ticket as JSON with keys category, urgency (1-5), summary.\n<ticket>{ticket}</ticket>"
    for attempt in range(1, max_attempts + 1):
        raw = fake_llm(prompt, attempt)
        try:
            return validate(json.loads(raw))
        except (ValueError, KeyError) as exc:
            print(f"attempt {attempt} rejected: {exc}")
            prompt += f"\nYour previous reply was invalid ({exc}). Reply with JSON only."     # tell the model what was wrong
    raise RuntimeError("model did not produce valid output")

print(classify("I was charged twice for order 981, please refund one."))
```

In practice you describe the schema with Pydantic or JSON Schema and use the provider's structured-output feature, which constrains the model to valid JSON. You still validate, because a valid shape can hold wrong values.

```python
from pydantic import BaseModel
from typing import Literal

class Ticket(BaseModel):
    category: Literal["billing", "shipping", "technical", "other"]
    urgency: int
    summary: str

resp = client.chat.completions.parse(model="<model-name>", response_format=Ticket,
                                     messages=[{"role": "user", "content": f"Classify this ticket:\n{text}"}])
ticket = resp.choices[0].message.parsed          # a validated Ticket object
```

Method names differ between providers and SDK versions; the pattern is the same everywhere.

## Tool calling

A model cannot run code or fetch data. With **tool calling** (also called function calling) you describe functions; the model replies with the name and arguments of one it wants; **your code** runs it and sends the result back; the model continues. This loop is the basis of every agent.

```python run
import json

# ---- your tools: ordinary functions ----
ORDERS = {"A-1042": {"status": "shipped", "eta": "2 days"}, "A-1043": {"status": "processing", "eta": "5 days"}}

def get_order_status(order_id):
    if order_id not in ORDERS:
        return {"error": f"no order {order_id}"}
    return ORDERS[order_id]

def cancel_order(order_id):
    if ORDERS.get(order_id, {}).get("status") != "processing":
        return {"error": "only orders still processing can be cancelled"}
    ORDERS[order_id]["status"] = "cancelled"
    return {"cancelled": order_id}

TOOLS = {"get_order_status": get_order_status, "cancel_order": cancel_order}

# ---- a fake model that behaves like a tool-calling LLM ----
def fake_llm(messages):
    last = messages[-1]
    if last["role"] == "user":
        return {"tool_call": {"name": "get_order_status", "arguments": json.dumps({"order_id": "A-1042"})}}
    if last["role"] == "tool":
        result = json.loads(last["content"])
        return {"content": f"Your order A-1042 has {result['status']} and should arrive in {result['eta']}."}

# ---- the loop: this is the part you write ----
def run(user_message, max_steps=5):
    messages = [{"role": "system", "content": "You are a support assistant. Use tools for order questions."},
                {"role": "user", "content": user_message}]
    for step in range(max_steps):
        reply = fake_llm(messages)
        if "tool_call" not in reply:
            return reply["content"]                                    # final answer
        call = reply["tool_call"]
        args = json.loads(call["arguments"])
        print(f"  step {step + 1}: model requests {call['name']}({args})")
        if call["name"] not in TOOLS:
            result = {"error": "unknown tool"}
        else:
            result = TOOLS[call["name"]](**args)                       # YOUR code executes it
        messages.append({"role": "assistant", "content": None, "tool_call": call})
        messages.append({"role": "tool", "content": json.dumps(result)})
    return "Stopped: too many steps."

print(run("Where is my order A-1042?"))
```

With a real API, you pass tool descriptions as JSON Schema and the loop is the same:

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_order_status",
        "description": "Look up the current status and delivery estimate of an order by its ID.",
        "parameters": {"type": "object", "properties": {"order_id": {"type": "string", "description": "Like A-1042"}}, "required": ["order_id"]},
    },
}]
resp = client.chat.completions.create(model="<model-name>", messages=messages, tools=tools)
msg = resp.choices[0].message
for call in msg.tool_calls or []:
    result = TOOLS[call.function.name](**json.loads(call.function.arguments))
    messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})
```

Rules for tools:

- **Descriptions are prompts**. Clear names, precise descriptions and tight parameter schemas decide whether the model picks the right tool with the right arguments.
- **Validate arguments** before acting. The model can invent an order ID.
- **Return errors as data** so the model can correct itself.
- **Limit the steps**, as the loop above does.
- **Require confirmation** for actions that spend money or cannot be undone.
- **Least privilege**: a tool should be able to do only what the feature needs.

## Streaming

A long answer takes many seconds. Streaming sends tokens as they are generated, so the user sees progress almost at once.

```python run
import time

def fake_stream(text):
    for word in text.split():
        time.sleep(0.05)                      # tokens arrive over time
        yield word + " "

start = time.perf_counter()
first = None
for chunk in fake_stream("Your order has shipped and should arrive within two days."):
    if first is None:
        first = time.perf_counter() - start
    print(chunk, end="", flush=True)
print(f"\ntime to first token {first:.2f}s, total {time.perf_counter() - start:.2f}s")
```

Real APIs take `stream=True` and return an iterator of chunks; your web server forwards them to the browser with Server-Sent Events.

## Production concerns

| Concern | Practice |
| --- | --- |
| Errors and rate limits | Retry 429 and 5xx responses with exponential backoff and jitter; set timeouts; have a fallback model |
| Cost | Log tokens per request; route simple tasks to small models; cache prompt prefixes and repeated answers; use batch APIs for offline work; cap output length |
| Latency | Shorter prompts and outputs; smaller models; parallel calls; streaming |
| Provider independence | Wrap calls behind your own interface, or use a gateway such as LiteLLM or OpenRouter |
| Secrets | API keys in environment variables or a secret manager; never in frontend code or Git |
| Untrusted input | Text from users, web pages and documents may contain instructions aimed at the model. See prompt injection in [evals and operations](#ai-evals-ops) |
| Privacy | Know what data you send to a provider and what their retention terms are; redact where needed |
| Testing | An evaluation set that runs on every prompt or model change |

```python run
def cost(prompt_tokens, completion_tokens, in_price, out_price):
    """Prices are per million tokens."""
    return prompt_tokens / 1e6 * in_price + completion_tokens / 1e6 * out_price

requests_per_day = 50_000
big = cost(3000, 400, in_price=3.00, out_price=15.00)        # illustrative prices, not any provider's actual rates
small = cost(3000, 400, in_price=0.15, out_price=0.60)
print(f"large model: ${big * requests_per_day:,.0f} per day")
print(f"small model: ${small * requests_per_day:,.0f} per day")
print(f"route 80% of traffic to the small model: ${(0.8 * small + 0.2 * big) * requests_per_day:,.0f} per day")
```

Check each provider's pricing page for real numbers; the arithmetic is what matters.

## Check yourself

```quiz
[
  {"q": "Who executes a tool when a model 'calls' it?", "options": ["The model provider", "Your application code", "The user's browser"], "answer": 1, "why": "The model only returns a name and arguments; your code runs the function and returns the result."},
  {"q": "Why validate structured output even when the provider guarantees valid JSON?", "options": ["JSON is slow", "The shape can be valid while the values are wrong or invented", "To use more tokens"], "answer": 1, "why": "A syntactically valid object can still contain a non-existent ID or an out-of-range value."},
  {"q": "A chat has 200 turns and is nearing the context limit. Best approach?", "options": ["Send everything and hope", "Keep recent turns, summarise older ones, drop stale tool output", "Delete the system prompt"], "answer": 1, "why": "Relevance beats volume; summaries preserve what matters."},
  {"q": "Why put documents inside tags or delimiters in a prompt?", "options": ["It looks neat", "So the model treats them as data and can tell them apart from instructions", "It reduces tokens"], "answer": 1, "why": "Clear boundaries reduce confusion and help against injected instructions."},
  {"q": "Which change most reduces perceived waiting time for a long answer?", "options": ["A higher temperature", "Streaming the tokens", "A longer system prompt"], "answer": 1, "why": "Users see the first words within a second instead of waiting for the whole answer."},
  {"q": "Where must an API key never appear?", "options": ["In an environment variable", "In frontend code or a Git repository", "In a secret manager"], "answer": 1, "why": "Anything shipped to browsers or committed to history is exposed."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: trim-history
title: Keep chat history inside a token budget
kind: code
level: medium
@@statement
A chat app must send the whole history to the model, but only a limited number of tokens fit. Write `trim_history(messages, budget)`.

**Input**
- `messages`: a list of dicts `{"role": str, "content": str}` in chronological order. Roles are `"system"`, `"user"` or `"assistant"`.
- `budget`: an integer, the maximum total tokens allowed.
- Count tokens with a simple rule: the number of whitespace-separated words in `content` (`len(content.split())`).

**Output**: a new list of messages, in the original order.
- Every `"system"` message is always kept.
- Of the other messages, keep the **most recent** ones that fit. Walk from newest to oldest and stop at the first message that does not fit (never keep a message while skipping a newer one).
- If the system messages alone exceed the budget, return only the system messages.
- Do not modify the input list. Empty input gives `[]`.

**Example**

```
msgs = [
  {"role": "system", "content": "be brief"},          # 2 tokens
  {"role": "user", "content": "one two three"},       # 3
  {"role": "assistant", "content": "four five"},      # 2
  {"role": "user", "content": "six"},                 # 1
]
trim_history(msgs, 6) -> [system, assistant "four five", user "six"]
trim_history(msgs, 1) -> [system]
```
@@starter
def trim_history(messages, budget):
    # your code here
    pass

print(trim_history([{"role": "user", "content": "hello there"}], 5))
@@tests
_m = [
    {"role": "system", "content": "be brief"},
    {"role": "user", "content": "one two three"},
    {"role": "assistant", "content": "four five"},
    {"role": "user", "content": "six"},
]
_copy = list(_m)
assert trim_history(_m, 6) == [_m[0], _m[2], _m[3]], "drops the oldest non-system message"
assert trim_history(_m, 100) == _m, "everything fits"
assert trim_history(_m, 1) == [_m[0]], "system alone exceeds budget"
assert trim_history([], 10) == [], "empty input"
assert _m == _copy, "input must not be modified"
assert trim_history(_m, 3) == [_m[0], _m[3]], "stop at first message that does not fit"
@@hint
Compute the system tokens first, then loop over the non-system messages in reverse, adding while the running total stays within the budget.
@@solution
def trim_history(messages, budget):
    def cost(m):
        return len(m["content"].split())
    system = [m for m in messages if m["role"] == "system"]
    used = sum(cost(m) for m in system)
    kept = []
    for m in reversed([m for m in messages if m["role"] != "system"]):
        if used + cost(m) > budget:
            break
        used += cost(m)
        kept.append(m)
    keep_ids = set(id(m) for m in system + kept)
    return [m for m in messages if id(m) in keep_ids]
````

````task
id: backoff-schedule
title: Retry with exponential backoff
kind: code
level: easy
@@statement
Write two small helpers used by a retrying API client.

1. `backoff_delays(retries, base=1.0, factor=2.0, cap=30.0)` returns the list of seconds to wait before each retry. The wait before retry number `i` (starting at 0) is `min(cap, base * factor ** i)`.
2. `should_retry(status)` returns `True` if an HTTP status code is worth retrying: `429` and any `500` to `599`. Everything else (200, 400, 401, 404...) returns `False`.

**Input**: `retries` is a non-negative integer; `status` an integer.

**Output**: a list of floats, and a bool. `retries=0` gives `[]`.

**Example**

```
backoff_delays(6)            -> [1.0, 2.0, 4.0, 8.0, 16.0, 30.0]
backoff_delays(3, base=0.5)  -> [0.5, 1.0, 2.0]
should_retry(429) -> True     should_retry(404) -> False
```
@@starter
def backoff_delays(retries, base=1.0, factor=2.0, cap=30.0):
    pass

def should_retry(status):
    pass
@@tests
assert backoff_delays(6) == [1.0, 2.0, 4.0, 8.0, 16.0, 30.0], "cap applies at 30"
assert backoff_delays(3, base=0.5) == [0.5, 1.0, 2.0], "custom base"
assert backoff_delays(0) == [], "zero retries"
assert backoff_delays(3, factor=3.0, cap=5.0) == [1.0, 3.0, 5.0], "custom factor and cap"
assert should_retry(429) and should_retry(500) and should_retry(503) and should_retry(599), "retryable"
assert not should_retry(400) and not should_retry(401) and not should_retry(200) and not should_retry(404), "not retryable"
@@hint
A list comprehension over `range(retries)` with `min(cap, ...)` is enough. For the status, a chained comparison `500 <= status <= 599` helps.
@@solution
def backoff_delays(retries, base=1.0, factor=2.0, cap=30.0):
    return [min(cap, base * factor ** i) for i in range(retries)]

def should_retry(status):
    return status == 429 or 500 <= status <= 599
````

````task
id: parse-tool-call
title: Validate a JSON tool call
kind: code
level: medium
@@statement
A model replies with text that should be a JSON tool call such as `{"name": "add", "arguments": {"a": 1, "b": 2}}`. Never trust it. Write `parse_tool_call(text, tools)`.

**Input**
- `text`: the raw model reply (a string).
- `tools`: a dict mapping a tool name to a dict of `argument name -> Python type`, e.g. `{"add": {"a": int, "b": int}}`.

**Output**: a tuple `(ok, value)`.
- On success: `(True, {"name": name, "args": args_dict})`.
- On failure: `(False, message)` where `message` is exactly one of the strings below. Check in this order and return the first problem:
  1. `"invalid json"` if `text` is not valid JSON.
  2. `"bad shape"` if the JSON is not an object with a string `"name"` and an object `"arguments"`.
  3. `"unknown tool"` if the name is not in `tools`.
  4. `"missing argument: X"` for the alphabetically first required argument that is absent.
  5. `"unexpected argument: X"` for the alphabetically first argument not declared.
  6. `"wrong type: X"` for the alphabetically first argument whose value has the wrong type. A `bool` is **not** accepted where `int` is expected.

**Example**

```
tools = {"add": {"a": int, "b": int}}
parse_tool_call('{"name": "add", "arguments": {"a": 1, "b": 2}}', tools)
-> (True, {"name": "add", "args": {"a": 1, "b": 2}})
parse_tool_call('{"name": "add", "arguments": {"a": 1}}', tools)
-> (False, "missing argument: b")
```
@@starter
import json

def parse_tool_call(text, tools):
    # your code here
    pass
@@tests
_tools = {"add": {"a": int, "b": int}, "greet": {"name": str}}
assert parse_tool_call('{"name": "add", "arguments": {"a": 1, "b": 2}}', _tools) == (True, {"name": "add", "args": {"a": 1, "b": 2}}), "valid call"
assert parse_tool_call("not json", _tools) == (False, "invalid json"), "invalid json"
assert parse_tool_call("[1, 2]", _tools) == (False, "bad shape"), "not an object"
assert parse_tool_call('{"name": "add"}', _tools) == (False, "bad shape"), "no arguments"
assert parse_tool_call('{"name": "nope", "arguments": {}}', _tools) == (False, "unknown tool"), "unknown tool"
assert parse_tool_call('{"name": "add", "arguments": {"a": 1}}', _tools) == (False, "missing argument: b"), "missing"
assert parse_tool_call('{"name": "greet", "arguments": {"name": "x", "z": 1}}', _tools) == (False, "unexpected argument: z"), "unexpected"
assert parse_tool_call('{"name": "add", "arguments": {"a": "1", "b": 2}}', _tools) == (False, "wrong type: a"), "wrong type"
assert parse_tool_call('{"name": "add", "arguments": {"a": true, "b": 2}}', _tools) == (False, "wrong type: a"), "bool is not int"
@@hint
Wrap `json.loads` in try/except `ValueError`. For the type check use `type(value) is expected` so that `True` is rejected for `int`.
@@solution
import json

def parse_tool_call(text, tools):
    try:
        data = json.loads(text)
    except ValueError:
        return (False, "invalid json")
    if not isinstance(data, dict) or not isinstance(data.get("name"), str) or not isinstance(data.get("arguments"), dict):
        return (False, "bad shape")
    name = data["name"]
    if name not in tools:
        return (False, "unknown tool")
    spec = tools[name]
    args = data["arguments"]
    for key in sorted(spec):
        if key not in args:
            return (False, "missing argument: " + key)
    for key in sorted(args):
        if key not in spec:
            return (False, "unexpected argument: " + key)
    for key in sorted(args):
        if type(args[key]) is not spec[key]:
            return (False, "wrong type: " + key)
    return (True, {"name": name, "args": args})
````

````task
id: confirm-before-cancel
title: Tool loop with a confirmation step
kind: code
level: medium
@@statement
Build the tool-dispatch loop of an agent with a **fake model** that replays a script, and require confirmation before a dangerous tool runs. Write `run_agent(script, tools, confirm)`.

**Input**
- `script`: a list of model replies, used one per turn in order. A reply is either `{"tool": name, "args": {...}}` or `{"final": text}`.
- `tools`: a dict mapping a tool name to a Python function taking keyword arguments and returning a string.
- `confirm`: a function `confirm(name, args) -> bool`.
- The tool name `"cancel_order"` is dangerous: call `confirm(name, args)` first. If it returns `False`, do **not** run the tool; the observation is `"cancelled by user"`. Other tools never call `confirm`.
- A tool name not in `tools` gives the observation `"error: unknown tool"`.

**Output**: a tuple `(final_text, log)`.
- `log` is a list of `(tool_name, observation)` tuples, one per tool reply, in order.
- Stop at the first `{"final": ...}` reply and return its text. If the script ends without a final reply, `final_text` is `None`.

**Example**

```
tools = {"lookup": lambda order_id: "shipped", "cancel_order": lambda order_id: "cancelled"}
script = [{"tool": "lookup", "args": {"order_id": 7}},
          {"tool": "cancel_order", "args": {"order_id": 7}},
          {"final": "done"}]
run_agent(script, tools, lambda n, a: False)
-> ("done", [("lookup", "shipped"), ("cancel_order", "cancelled by user")])
```
@@starter
def run_agent(script, tools, confirm):
    # your code here
    pass
@@tests
_ran = []
_tools = {
    "lookup": lambda order_id: "shipped",
    "cancel_order": lambda order_id: _ran.append(order_id) or "cancelled",
}
_script = [{"tool": "lookup", "args": {"order_id": 7}},
           {"tool": "cancel_order", "args": {"order_id": 7}},
           {"final": "done"}]
assert run_agent(_script, _tools, lambda n, a: False) == ("done", [("lookup", "shipped"), ("cancel_order", "cancelled by user")]), "declined"
assert _ran == [], "tool must not run when declined"
assert run_agent(_script, _tools, lambda n, a: True) == ("done", [("lookup", "shipped"), ("cancel_order", "cancelled")]), "approved"
assert _ran == [7], "tool runs once when approved"
_asked = []
run_agent([{"tool": "lookup", "args": {"order_id": 1}}, {"final": "x"}], _tools, lambda n, a: _asked.append(n) or True)
assert _asked == [], "safe tools never ask"
assert run_agent([{"tool": "boom", "args": {}}], _tools, lambda n, a: True) == (None, [("boom", "error: unknown tool")]), "unknown tool and no final"
assert run_agent([], _tools, lambda n, a: True) == (None, []), "empty script"
@@hint
Iterate over `script`; branch on `"final" in reply`. Build the observation string first, then append `(name, observation)` to the log.
@@solution
def run_agent(script, tools, confirm):
    log = []
    for reply in script:
        if "final" in reply:
            return (reply["final"], log)
        name = reply["tool"]
        args = reply.get("args", {})
        if name not in tools:
            obs = "error: unknown tool"
        elif name == "cancel_order" and not confirm(name, args):
            obs = "cancelled by user"
        else:
            obs = tools[name](**args)
        log.append((name, obs))
    return (None, log)
````

````task
id: call-cost-log
title: Cost and latency summary
kind: code
level: easy
@@statement
Write `summarize_calls(calls, price_in, price_out)` that summarises a log of LLM calls and finds the most expensive one.

**Input**
- `calls`: a list of dicts `{"id": str, "in_tokens": int, "out_tokens": int, "latency_ms": int}`.
- `price_in`, `price_out`: dollars per **1,000,000** input / output tokens.
- Cost of one call = `(in_tokens * price_in + out_tokens * price_out) / 1_000_000`.

**Output**: a dict with keys
- `"total_cost"`: sum of costs, rounded to 6 decimals.
- `"total_latency_ms"`: sum of latencies.
- `"avg_latency_ms"`: mean latency (float), `0.0` if there are no calls.
- `"most_expensive_id"`: the id of the costliest call (the first one if tied), `None` if there are no calls.

**Example**

```
calls = [{"id": "a", "in_tokens": 1000, "out_tokens": 500, "latency_ms": 800},
         {"id": "b", "in_tokens": 200, "out_tokens": 100, "latency_ms": 400}]
summarize_calls(calls, 2, 10)
-> {"total_cost": 0.0084, "total_latency_ms": 1200, "avg_latency_ms": 600.0, "most_expensive_id": "a"}
```
@@starter
def summarize_calls(calls, price_in, price_out):
    # your code here
    pass
@@tests
_calls = [{"id": "a", "in_tokens": 1000, "out_tokens": 500, "latency_ms": 800},
          {"id": "b", "in_tokens": 200, "out_tokens": 100, "latency_ms": 400}]
assert summarize_calls(_calls, 2, 10) == {"total_cost": 0.0084, "total_latency_ms": 1200, "avg_latency_ms": 600.0, "most_expensive_id": "a"}, "two calls"
assert summarize_calls([], 2, 10) == {"total_cost": 0.0, "total_latency_ms": 0, "avg_latency_ms": 0.0, "most_expensive_id": None}, "empty"
_tie = [{"id": "x", "in_tokens": 10, "out_tokens": 0, "latency_ms": 1}, {"id": "y", "in_tokens": 10, "out_tokens": 0, "latency_ms": 3}]
assert summarize_calls(_tie, 1, 1)["most_expensive_id"] == "x", "first wins a tie"
assert summarize_calls(_calls[1:], 2, 10)["most_expensive_id"] == "b", "single call"
assert len(_calls) == 2, "input unchanged"
@@hint
Compute each call's cost once, then use `max(calls, key=cost)`; `max` returns the first item on ties.
@@solution
def summarize_calls(calls, price_in, price_out):
    def cost(c):
        return (c["in_tokens"] * price_in + c["out_tokens"] * price_out) / 1000000
    if not calls:
        return {"total_cost": 0.0, "total_latency_ms": 0, "avg_latency_ms": 0.0, "most_expensive_id": None}
    total_lat = sum(c["latency_ms"] for c in calls)
    return {
        "total_cost": round(sum(cost(c) for c in calls), 6),
        "total_latency_ms": total_lat,
        "avg_latency_ms": total_lat / len(calls),
        "most_expensive_id": max(calls, key=cost)["id"],
    }
````

````task
id: rewrite-vague-prompts
title: Rewrite three vague prompts
kind: text
level: easy
@@statement
Below are three vague prompts. Rewrite **each** into a specific prompt that states context, the exact output format and one example.

1. `Summarize this email.` (customer support emails, 100 to 300 words, read by a team lead in 10 seconds)
2. `Extract the info from this invoice.` (output goes straight into a database)
3. `Tell me if this code is good.` (a 40-line Python function in a pull request)

**Deliverable**: three rewritten prompts, each 40 to 120 words. For every prompt, include (a) who the reader or consumer is, (b) the exact output format (for example a JSON schema with field names, or "max 2 sentences"), (c) one short example input and output, and (d) what the model should do when information is missing.
@@solution
1. "You summarise customer support emails for a team lead who has 10 seconds. Output exactly: line 1 'Issue: <max 15 words>', line 2 'Urgency: low|medium|high', line 3 'Action: <one imperative sentence>'. If the email has no clear request, write 'Issue: unclear'. Example input: 'My order 4412 arrived broken and I need it by Friday.' Example output: 'Issue: Order 4412 arrived broken / Urgency: high / Action: Ship a replacement before Friday.'"

2. "You extract fields from invoice text for a database. Return only JSON with keys invoice_number (string), date (YYYY-MM-DD), total (number, no currency symbol), currency (ISO code). Use null for any field not present; never guess. Example input: 'Invoice #A-17, 3 March 2025, Total EUR 120.50' -> {"invoice_number": "A-17", "date": "2025-03-03", "total": 120.5, "currency": "EUR"}."

3. "You are a senior Python reviewer. Review the function below for bugs, missing edge cases and readability. Return a numbered list of at most 5 findings, each as 'line N: problem -> suggested fix'. If you find no problems, answer 'No issues found'. Example: 'line 12: divides by len(items) which can be 0 -> return 0.0 for empty input'."
@@criteria
- Each of the three rewrites names the audience or consumer of the output.
- Each rewrite specifies an exact, checkable output format (fields, schema or length limit), not just "be concise".
- Each rewrite contains a concrete input and output example.
- Each rewrite says what to do when information is missing or nothing is found (for example null, "unclear", "No issues found").
- The rewrites are within the stated length and do not rely on the model guessing context.
````
