---
id: ai-agents
title: Agents: LangChain, LangGraph, MCP, A2A and agent kits
minutes: 70
---

An agent is a language model running tools in a loop until a task is done. Frameworks differ in syntax; all of them wrap the tool-calling loop from [the previous lesson](#ai-llm-apis) and add state, persistence and control. This lesson builds each idea in plain Python first, then shows the framework version, so that no framework feels like magic.

## Workflows and agents

- A **workflow** has steps fixed by your code; the model fills in each one. Predictable, cheap, easy to test.
- An **agent** lets the model decide which step comes next. Flexible, and harder to predict, test and budget.

Use the simplest design that works. Many products called agents are workflows, and that is usually the right choice.

| Pattern | Shape | Example |
| --- | --- | --- |
| Prompt chaining | The output of step 1 feeds step 2 | Outline, then draft, then edit |
| Routing | Classify the input and send it to a specialised prompt or model | Billing questions versus technical ones |
| Parallelisation | Run sub-tasks at the same time and merge | Review a contract for five kinds of risk |
| Orchestrator and workers | One model plans and delegates sub-tasks | Research across many sources |
| Evaluator and optimiser | One model writes, another critiques, loop until good | Code that must pass tests |
| ReAct agent | Think, call a tool, read the result, repeat | Open-ended tasks with tools |

## An agent from scratch

The whole idea in forty lines. The fake model follows a plan a real model would produce; the loop, the tools, the step limit and the trace are real.

```python run
import json

# ---------- tools ----------
STOCK = {"gasket-12": 4, "bearing-7": 120}
REORDER_LEVEL = {"gasket-12": 20, "bearing-7": 50}
orders_placed = []

def check_stock(part):
    return {"part": part, "units": STOCK.get(part), "reorder_level": REORDER_LEVEL.get(part)}

def place_order(part, quantity):
    orders_placed.append((part, quantity))
    return {"ordered": quantity, "part": part, "reference": f"PO-{len(orders_placed):04d}"}

TOOLS = {"check_stock": check_stock, "place_order": place_order}
NEEDS_APPROVAL = {"place_order"}                       # actions that spend money

# ---------- a scripted stand-in for an LLM ----------
def fake_llm(messages):
    tool_results = [json.loads(m["content"]) for m in messages if m["role"] == "tool"]
    if len(tool_results) == 0:
        return {"thought": "I need the current stock first.", "tool": "check_stock", "args": {"part": "gasket-12"}}
    if len(tool_results) == 1:
        s = tool_results[0]
        if s["units"] < s["reorder_level"]:
            return {"thought": f"{s['units']} is below the reorder level {s['reorder_level']}; order the difference.",
                    "tool": "place_order", "args": {"part": s["part"], "quantity": s["reorder_level"] - s["units"]}}
        return {"answer": "Stock is sufficient; nothing ordered."}
    return {"answer": f"Ordered {tool_results[1]['ordered']} units of {tool_results[1]['part']} (ref {tool_results[1]['reference']})."}

# ---------- the agent loop ----------
def run_agent(goal, approve, max_steps=6):
    messages = [{"role": "system", "content": "You manage spare parts. Use tools; never guess stock."},
                {"role": "user", "content": goal}]
    for step in range(1, max_steps + 1):
        reply = fake_llm(messages)
        if "answer" in reply:
            return reply["answer"]
        print(f"step {step}: {reply['thought']}  ->  {reply['tool']}({reply['args']})")
        if reply["tool"] in NEEDS_APPROVAL and not approve(reply["tool"], reply["args"]):
            result = {"error": "a human declined this action"}
        else:
            result = TOOLS[reply["tool"]](**reply["args"])
        messages.append({"role": "tool", "content": json.dumps(result)})
    return "Stopped: step limit reached."

print(run_agent("Make sure we have enough gasket-12.", approve=lambda tool, args: args["quantity"] <= 50))
print("orders placed:", orders_placed)
```

Everything a framework adds is a refinement of this loop.

## What an agent needs

- **Tools** with clear descriptions and validated inputs.
- **State and memory**: short-term (the conversation and tool results in the context window) and long-term (facts stored outside and retrieved when relevant).
- **Planning**: breaking a goal into steps, sometimes as an explicit to-do list the agent maintains.
- **Stopping rules**: a maximum number of steps, a token or money budget, a timeout.
- **Human in the loop**: pause for approval before actions that cost money or cannot be undone, as above.
- **Observability**: a trace of every model call and tool call.

## LangChain and LangGraph

Both reached version 1.0 in October 2025. LangGraph is the low-level runtime; LangChain is the high-level layer built on it, and its `create_agent` function replaced the older `create_react_agent` helper. Tutorials written before that use APIs that no longer exist, so check the date of anything you read.

```python
from langchain.agents import create_agent
from langchain.tools import tool

@tool
def check_stock(part: str) -> dict:
    """Return the units in stock and the reorder level for a part number."""
    return lookup(part)

agent = create_agent(
    model="<provider>:<model-name>",
    tools=[check_stock],
    system_prompt="You manage spare parts. Use tools; never guess stock.",
)
result = agent.invoke({"messages": [{"role": "user", "content": "Do we have enough gasket-12?"}]})
print(result["messages"][-1].content)
```

LangChain also provides one interface over many model providers, document loaders, text splitters and vector store adapters. **LangSmith** is the company's tracing and evaluation product.

### The idea behind LangGraph, built by hand

LangGraph models an application as a **graph**: a shared **state**, **nodes** (functions that read the state and return updates) and **edges** (which node runs next, possibly chosen by a condition). Loops and branches are explicit. Here is that idea in plain Python, running an agentic retrieval flow: retrieve, grade the results, rewrite the query and retry if they are poor, then answer.

```python run
END = "__end__"

class Graph:
    def __init__(self):
        self.nodes, self.edges, self.routers = {}, {}, {}
    def add_node(self, name, fn):            self.nodes[name] = fn
    def add_edge(self, src, dst):            self.edges[src] = dst
    def add_conditional_edges(self, src, router): self.routers[src] = router
    def run(self, state, start, max_steps=20):
        node, trace = start, []
        for _ in range(max_steps):
            trace.append(node)
            state = {**state, **self.nodes[node](state)}        # a node returns a partial update
            node = self.routers[node](state) if node in self.routers else self.edges[node]
            if node == END:
                return state, trace
        raise RuntimeError("step limit reached")

KNOWLEDGE = {"return window": "Items can be returned within 30 days.", "refund time": "Refunds take 7 working days."}

def retrieve(state):
    hits = [text for key, text in KNOWLEDGE.items() if key in state["query"]]
    return {"docs": hits, "attempts": state.get("attempts", 0) + 1}

def grade(state):                             # a routing function: decides the next node
    if state["docs"] or state["attempts"] >= 2:
        return "generate"
    return "rewrite"

def rewrite(state):                           # a real system asks a model to rephrase
    return {"query": state["query"].replace("send it back", "return window")}

def generate(state):
    if not state["docs"]:
        return {"answer": "I don't know based on the available documents."}
    return {"answer": f"{state['docs'][0]} [source: policy]"}

g = Graph()
g.add_node("retrieve", retrieve); g.add_node("rewrite", rewrite); g.add_node("generate", generate)
g.add_conditional_edges("retrieve", grade)
g.add_edge("rewrite", "retrieve")             # a loop
g.add_edge("generate", END)

for question in ["how long is the return window", "how long do I have to send it back", "do you sell tyres"]:
    final, trace = g.run({"query": question}, start="retrieve")
    print(f"{question!r}\n   path: {' -> '.join(trace)}\n   answer: {final['answer']}")
```

The real library looks very similar:

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver

class State(TypedDict):
    query: str
    docs: list[str]
    answer: str
    attempts: int

g = StateGraph(State)
g.add_node("retrieve", retrieve)
g.add_node("rewrite", rewrite)
g.add_node("generate", generate)
g.add_edge(START, "retrieve")
g.add_conditional_edges("retrieve", grade, {"generate": "generate", "rewrite": "rewrite"})
g.add_edge("rewrite", "retrieve")
g.add_edge("generate", END)

app = g.compile(checkpointer=InMemorySaver())
out = app.invoke({"query": "how long do I have to send it back"}, config={"configurable": {"thread_id": "user-42"}})
```

What the library adds beyond the toy:

- **Checkpointers** save the state after every step, so a run can resume after a crash and a conversation can continue later by thread ID.
- **Interrupts** pause the graph for human approval and resume from the same point.
- **Streaming** of tokens and step events to the user interface.
- **Subgraphs** for composing agents, and parallel branches.
- **Durable execution** for runs that take minutes or hours.

Use `create_agent` for a single agent with tools; drop down to an explicit graph when you need branches, loops, approvals or several agents.

## Model Context Protocol (MCP)

Every application used to write its own integration for every tool. MCP is an open protocol that standardises the connection: write a tool **server** once, and any MCP-capable **client** (chat applications, IDEs, agent frameworks) can use it.

- **Host**: the application the user runs. **Client**: the connector inside the host. **Server**: the program exposing capabilities.
- **Server primitives**: **tools** (functions the model may call), **resources** (data the application can read, such as files or records), **prompts** (reusable templates).
- **Transports**: standard input and output for local servers; HTTP for remote ones.
- **Messages** are JSON-RPC 2.0, such as `tools/list` and `tools/call`.
- **Current revision**: the 2026-07-28 specification made the protocol stateless. The initialise handshake and the session ID were removed, and each request carries its protocol version and capabilities, so any server instance behind a load balancer can handle any request. MCP is maintained under the Agentic AI Foundation, part of the Linux Foundation.

The protocol's core is small enough to imitate. This miniature server handles the two essential methods:

```python run
import json

def stock_level(part_number: str) -> int:
    """Return the units in stock for a part number."""
    return {"gasket-12": 4, "bearing-7": 120}.get(part_number, 0)

REGISTRY = {"stock_level": {"fn": stock_level, "description": stock_level.__doc__,
                            "inputSchema": {"type": "object", "properties": {"part_number": {"type": "string"}}, "required": ["part_number"]}}}

def handle(request_json):
    req = json.loads(request_json)
    try:
        if req["method"] == "tools/list":
            result = {"tools": [{"name": n, "description": t["description"], "inputSchema": t["inputSchema"]} for n, t in REGISTRY.items()]}
        elif req["method"] == "tools/call":
            tool = REGISTRY[req["params"]["name"]]
            value = tool["fn"](**req["params"]["arguments"])
            result = {"content": [{"type": "text", "text": json.dumps(value)}]}
        else:
            return json.dumps({"jsonrpc": "2.0", "id": req["id"], "error": {"code": -32601, "message": "method not found"}})
        return json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": result})
    except (KeyError, TypeError) as exc:
        return json.dumps({"jsonrpc": "2.0", "id": req.get("id"), "error": {"code": -32602, "message": f"invalid params: {exc}"}})

print(handle('{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'))
print(handle('{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "stock_level", "arguments": {"part_number": "gasket-12"}}}'))
```

With the official Python SDK a real server is a few lines:

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("inventory")

@mcp.tool()
def stock_level(part_number: str) -> int:
    """Return the units in stock for a part number."""
    return db.query_stock(part_number)

@mcp.resource("inventory://low-stock")
def low_stock() -> str:
    """Parts below their reorder level."""
    return db.low_stock_report()

if __name__ == "__main__":
    mcp.run()
```

Import paths have shifted between SDK versions, so follow the current official documentation when you build.

Security matters here. A server runs with real permissions, and tool results are untrusted text that can carry injected instructions. Grant least privilege, review what a server can do before connecting it, and require confirmation for risky tools.

## Agent2Agent (A2A)

MCP connects an agent to tools. **A2A** connects agents to other agents, including ones built by other teams or vendors with other frameworks. Each agent publishes an **Agent Card** at a well-known URL describing its name, skills and endpoint. A client agent discovers it and sends it a task; the remote agent replies with a message or a longer-running task with results. A2A started at Google, moved to the Linux Foundation, and reached version 1.0 in 2026.

A simple way to remember the difference: MCP when your agent is the expert using tools; A2A when your agent collaborates with another expert agent.

## Agent development kits and frameworks

| Kit | From | Character |
| --- | --- | --- |
| LangChain and LangGraph | LangChain | The largest ecosystem; high-level agents plus an explicit graph runtime with persistence |
| Google ADK | Google | Open-source kit with native MCP and A2A support; integrates closely with Gemini and Vertex AI, works with other models |
| OpenAI Agents SDK | OpenAI | A small set of primitives: agents, handoffs, guardrails, tracing |
| Claude Agent SDK | Anthropic | The harness behind Claude Code as a library: file, shell and tool use, subagents |
| Microsoft Agent Framework | Microsoft | Successor to AutoGen and Semantic Kernel; strong Azure and .NET integration |
| CrewAI | CrewAI | Role-based teams of agents; quick to prototype |
| LlamaIndex | LlamaIndex | Strongest on data ingestion and RAG; agents and workflows on top |
| Pydantic AI | Pydantic | Type-safe agents with validated outputs |
| DSPy | Stanford | Programs with typed signatures whose prompts are tuned by an optimiser |
| smolagents | Hugging Face | A minimal library where the agent writes code to call tools |

Learn one deeply (LangGraph appears most in job descriptions) and build the raw loop yourself once. Switching kits is easy when you understand the loop, the state and the tools.

## Multi-agent systems

- **Supervisor**: one agent routes work to specialists and combines their results.
- **Handoffs**: an agent passes the conversation to another with a different prompt and tools.
- **Debate or review**: agents take opposing roles and a judge or synthesiser decides. A group chat with support and opposition modes plus a synthesis agent is this pattern.
- **Parallel workers**: sub-agents explore different parts of a problem at the same time, each with its own context window.

Every extra agent multiplies tokens and failure points. Split into several agents when the context would otherwise overflow, when tasks can run in parallel, or when roles need different tools and permissions. Otherwise one agent with good tools is simpler and usually better.

## Memory

| Kind | What it holds | Implementation |
| --- | --- | --- |
| Working memory | The current conversation and tool results | The context window |
| Summaries | Compressed older turns | A model call that summarises |
| Semantic memory | Facts about the user or domain | A vector store or key-value store, retrieved by relevance |
| Episodic memory | What happened in past tasks | Stored traces, retrieved as examples |
| Procedural memory | How to do things | Prompts, saved instructions, skills |

## How agents fail

| Failure | Defence |
| --- | --- |
| Infinite loops or repeating a failed call | Step limit; detect repeated identical calls; clear error messages |
| Losing the goal in a long task | A written plan or to-do list in the state; summarisation |
| Acting on injected instructions from a web page or document | Treat tool output as data; restrict tools after reading untrusted content; approvals |
| Runaway cost | Token and money budgets per run |
| Wrong tool or wrong arguments | Better tool names and descriptions; fewer tools; validation |
| Irreversible mistakes | Human approval; dry-run mode; sandboxed execution |
| Silent quality regressions | Evaluations built from real traces, run on every change |

## Check yourself

```quiz
[
  {"q": "What is the essential difference between a workflow and an agent?", "options": ["Agents use bigger models", "In a workflow your code fixes the steps; in an agent the model chooses the next step", "Workflows cannot use tools"], "answer": 1, "why": "Control over the path is what distinguishes them."},
  {"q": "What does a LangGraph checkpointer provide?", "options": ["Faster tokens", "Saved state after each step, so runs can resume and conversations can continue", "Automatic prompts"], "answer": 1, "why": "Persistence is what makes long and interrupted runs reliable."},
  {"q": "What problem does MCP solve?", "options": ["Training models faster", "A standard way to connect LLM applications to tools and data, so integrations are written once", "Compressing prompts"], "answer": 1, "why": "One server works with every MCP-capable client."},
  {"q": "MCP versus A2A:", "options": ["They are the same", "MCP connects an agent to tools; A2A connects agents to other agents", "A2A replaced MCP"], "answer": 1, "why": "They are complementary layers."},
  {"q": "An agent can issue refunds. What is the most important safeguard?", "options": ["A longer system prompt", "Human approval or strict limits enforced in code before the tool runs", "A higher temperature"], "answer": 1, "why": "Controls on irreversible actions must live in code, not only in instructions."},
  {"q": "When is splitting into multiple agents justified?", "options": ["Always, more agents are better", "When context would overflow, tasks run in parallel, or roles need different tools and permissions", "Never"], "answer": 1, "why": "Each agent adds cost and failure points, so it needs a reason."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: agent-loop-guard
title: Stop a runaway agent loop
kind: code
level: medium
@@statement
Write `check_agent_loop(steps, max_steps=5, token_budget=1000)`, the guard that decides whether an agent loop must stop.

**Input**: `steps` is a list of planned tool calls, each `{"tool": str, "args": dict, "tokens": int}` where `tokens` is what that step costs.

**Output**: a tuple `(status, index)`. Walk through the steps in order; for step `i` apply these checks in this order and stop at the first that triggers (the step is **not** executed):
1. `"max_steps"` if `i >= max_steps`.
2. `"repeat"` if the step has the same `tool` and the same `args` as step `i - 1` (a repeated identical call).
3. `"budget"` if the total tokens of steps `0..i` (including this one) exceed `token_budget`.

Return `(status, i)` for the trigger. If no check ever triggers, return `("ok", len(steps))`. Empty steps give `("ok", 0)`.

**Example**

```
s = [{"tool": "search", "args": {"q": "x"}, "tokens": 100},
     {"tool": "search", "args": {"q": "x"}, "tokens": 100}]
check_agent_loop(s) -> ("repeat", 1)
```
@@starter
def check_agent_loop(steps, max_steps=5, token_budget=1000):
    # your code here
    pass
@@tests
_a = {"tool": "search", "args": {"q": "x"}, "tokens": 100}
_b = {"tool": "search", "args": {"q": "y"}, "tokens": 100}
_c = {"tool": "calc", "args": {"q": "x"}, "tokens": 100}
assert check_agent_loop([_a, _a]) == ("repeat", 1), "identical consecutive calls"
assert check_agent_loop([_a, _b, _a]) == ("ok", 3), "same call but not consecutive is fine"
assert check_agent_loop([]) == ("ok", 0), "empty"
assert check_agent_loop([_a, _b, _c, _a, _b, _c], max_steps=4) == ("max_steps", 4), "step limit"
assert check_agent_loop([_a, _b, _c], token_budget=250) == ("budget", 2), "third step passes 250 tokens"
assert check_agent_loop([_a, _b, _c], token_budget=300) == ("ok", 3), "exactly at budget is allowed"
assert check_agent_loop([_a, _a], max_steps=1) == ("max_steps", 1), "max_steps is checked before repeat"
@@hint
Keep a running `total`. Inside the loop, test the three conditions in the stated order and `return` as soon as one is true.
@@solution
def check_agent_loop(steps, max_steps=5, token_budget=1000):
    total = 0
    for i, step in enumerate(steps):
        if i >= max_steps:
            return ("max_steps", i)
        if i > 0 and step["tool"] == steps[i - 1]["tool"] and step["args"] == steps[i - 1]["args"]:
            return ("repeat", i)
        total += step["tokens"]
        if total > token_budget:
            return ("budget", i)
    return ("ok", len(steps))
````

````task
id: checkpoint-resume
title: Checkpoint and resume a graph
kind: code
level: medium
@@statement
A tiny sequential graph saves its state after every node so a crashed run can resume. Write `run_graph(nodes, state, checkpoint=None, stop_after=None)`. Use a JSON **string** as the checkpoint (no files).

**Input**
- `nodes`: list of `(name, fn)`; `fn(state_dict)` returns the new state dict.
- `state`: the starting dict. `checkpoint`: `None` or a JSON string produced by an earlier call.
- `stop_after`: `None` or a node name; after that node finishes and is saved, stop (simulates a crash).

**Output**: a tuple `(state, checkpoint_json)`.
- If `checkpoint` is given, load it: it has the form `{"done": [names], "state": {...}}`. Start from its state and skip every node already in `done` (never run them again).
- After each node that runs, record its name in `done` and rebuild the checkpoint with `json.dumps({"done": done, "state": state}, sort_keys=True)`.
- If no node runs, the returned checkpoint is built from the current `done` and `state` the same way.
- Do not mutate the `state` dict you were given (pass a copy to nodes).

**Example**

```
nodes = [("a", lambda s: dict(s, x=1)), ("b", lambda s: dict(s, y=2))]
st, ck = run_graph(nodes, {}, stop_after="a")   # st == {"x": 1}
st2, ck2 = run_graph(nodes, {}, checkpoint=ck)  # node a is skipped, st2 == {"x": 1, "y": 2}
```
@@starter
import json

def run_graph(nodes, state, checkpoint=None, stop_after=None):
    # your code here
    pass
@@tests
_calls = []
def _mk(name, key, val):
    def fn(s):
        _calls.append(name)
        return dict(s, **{key: val})
    return fn
_nodes = [("a", _mk("a", "x", 1)), ("b", _mk("b", "y", 2)), ("c", _mk("c", "z", 3))]
_start = {}
_st, _ck = run_graph(_nodes, _start, stop_after="a")
assert _st == {"x": 1} and _calls == ["a"], "stops after a"
assert json.loads(_ck) == {"done": ["a"], "state": {"x": 1}}, "checkpoint content"
_st2, _ck2 = run_graph(_nodes, _start, checkpoint=_ck)
assert _st2 == {"x": 1, "y": 2, "z": 3}, "resumed result"
assert _calls == ["a", "b", "c"], "node a is not run again"
assert json.loads(_ck2)["done"] == ["a", "b", "c"], "all done"
_calls[:] = []
_st3, _ck3 = run_graph(_nodes, _start, checkpoint=_ck2)
assert _calls == [] and _st3 == {"x": 1, "y": 2, "z": 3}, "fully done checkpoint runs nothing"
assert _start == {}, "input state not mutated"
assert run_graph([], {"k": 1}) == ({"k": 1}, json.dumps({"done": [], "state": {"k": 1}}, sort_keys=True)), "no nodes"
@@hint
Start `done` and `state` from the checkpoint if there is one. Inside the loop `continue` for names already in `done`. Build the checkpoint string with a small helper.
@@solution
import json

def run_graph(nodes, state, checkpoint=None, stop_after=None):
    done = []
    state = dict(state)
    if checkpoint:
        data = json.loads(checkpoint)
        done = list(data["done"])
        state = dict(data["state"])
    def dump():
        return json.dumps({"done": done, "state": state}, sort_keys=True)
    for name, fn in nodes:
        if name in done:
            continue
        state = fn(dict(state))
        done.append(name)
        if name == stop_after:
            return state, dump()
    return state, dump()
````

````task
id: mcp-resources-list
title: Miniature MCP server with resources
kind: code
level: medium
@@statement
Write `handle_request(req, tools, resources)`, the request handler of a miniature JSON-RPC server in the style of MCP.

**Input**
- `req`: dict `{"id": int, "method": str, "params": dict (optional)}`.
- `tools`: dict mapping tool name to its description string.
- `resources`: dict mapping a URI to `{"name": str, "text": str}`.

**Output**: a response dict that always has `"jsonrpc": "2.0"` and `"id"` (copied from the request), plus either `"result"` or `"error"`.
- `"tools/list"` -> result `{"tools": [{"name": n, "description": d}, ...]}` sorted by name.
- `"resources/list"` -> result `{"resources": [{"uri": u, "name": name}, ...]}` sorted by uri (no text).
- `"resources/read"` with `params["uri"]` -> result `{"contents": [{"uri": u, "text": text}]}`. An unknown uri gives error `{"code": -32602, "message": "unknown resource"}`.
- Any other method gives error `{"code": -32601, "message": "method not found"}`.

**Example**

```
handle_request({"id": 1, "method": "resources/list"}, {}, {"file:///a": {"name": "A", "text": "hi"}})
-> {"jsonrpc": "2.0", "id": 1, "result": {"resources": [{"uri": "file:///a", "name": "A"}]}}
```
@@starter
def handle_request(req, tools, resources):
    # your code here
    pass
@@tests
_tools = {"search": "find docs", "add": "add numbers"}
_res = {"file:///b": {"name": "B", "text": "bee"}, "file:///a": {"name": "A", "text": "ay"}}
assert handle_request({"id": 1, "method": "resources/list"}, _tools, _res) == {"jsonrpc": "2.0", "id": 1, "result": {"resources": [{"uri": "file:///a", "name": "A"}, {"uri": "file:///b", "name": "B"}]}}, "resources/list sorted"
assert handle_request({"id": 2, "method": "tools/list"}, _tools, _res)["result"]["tools"] == [{"name": "add", "description": "add numbers"}, {"name": "search", "description": "find docs"}], "tools/list sorted"
assert handle_request({"id": 3, "method": "resources/read", "params": {"uri": "file:///b"}}, _tools, _res) == {"jsonrpc": "2.0", "id": 3, "result": {"contents": [{"uri": "file:///b", "text": "bee"}]}}, "read"
assert handle_request({"id": 4, "method": "resources/read", "params": {"uri": "nope"}}, _tools, _res) == {"jsonrpc": "2.0", "id": 4, "error": {"code": -32602, "message": "unknown resource"}}, "unknown uri"
assert handle_request({"id": 5, "method": "ping"}, _tools, _res)["error"] == {"code": -32601, "message": "method not found"}, "unknown method"
assert handle_request({"id": 6, "method": "resources/list"}, {}, {})["result"] == {"resources": []}, "empty"
@@hint
Build the response as `{"jsonrpc": "2.0", "id": req["id"]}` and add a `"result"` or `"error"` key in each branch. Use `req.get("params", {})`.
@@solution
def handle_request(req, tools, resources):
    resp = {"jsonrpc": "2.0", "id": req["id"]}
    method = req["method"]
    params = req.get("params", {})
    if method == "tools/list":
        resp["result"] = {"tools": [{"name": n, "description": tools[n]} for n in sorted(tools)]}
    elif method == "resources/list":
        resp["result"] = {"resources": [{"uri": u, "name": resources[u]["name"]} for u in sorted(resources)]}
    elif method == "resources/read":
        uri = params.get("uri")
        if uri in resources:
            resp["result"] = {"contents": [{"uri": uri, "text": resources[uri]["text"]}]}
        else:
            resp["error"] = {"code": -32602, "message": "unknown resource"}
    else:
        resp["error"] = {"code": -32601, "message": "method not found"}
    return resp
````

````task
id: single-vs-supervisor
title: Compare a single agent with a supervisor
kind: code
level: easy
@@statement
Write `compare_agents(results, price_per_1k)` to compare a single agent with a supervisor plus two specialists on the same tasks.

**Input**
- `results`: list of dicts `{"task": str, "single_tokens": int, "multi_tokens": int, "single_ok": bool, "multi_ok": bool}`.
- `price_per_1k`: dollars per 1,000 tokens.

**Output**: a dict with
- `"single_cost"`, `"multi_cost"`: total tokens / 1000 * price, rounded to 4 decimals.
- `"single_acc"`, `"multi_acc"`: fraction of tasks with `*_ok` true (float), `0.0` if `results` is empty.
- `"winner"`: `"multi"` if `multi_acc > single_acc`; `"single"` if `single_acc > multi_acc`; if accuracy is equal, the cheaper one, and `"single"` if the costs are also equal.

**Example**

```
r = [{"task": "t1", "single_tokens": 1000, "multi_tokens": 3000, "single_ok": True, "multi_ok": True}]
compare_agents(r, 0.01)
-> {"single_cost": 0.01, "multi_cost": 0.03, "single_acc": 1.0, "multi_acc": 1.0, "winner": "single"}
```
@@starter
def compare_agents(results, price_per_1k):
    # your code here
    pass
@@tests
_r = [{"task": "t1", "single_tokens": 1000, "multi_tokens": 3000, "single_ok": True, "multi_ok": True}]
assert compare_agents(_r, 0.01) == {"single_cost": 0.01, "multi_cost": 0.03, "single_acc": 1.0, "multi_acc": 1.0, "winner": "single"}, "equal accuracy, single cheaper"
_r2 = _r + [{"task": "t2", "single_tokens": 1000, "multi_tokens": 3000, "single_ok": False, "multi_ok": True}]
_o = compare_agents(_r2, 0.01)
assert _o["single_acc"] == 0.5 and _o["multi_acc"] == 1.0 and _o["winner"] == "multi", "multi more accurate"
assert _o["single_cost"] == 0.02 and _o["multi_cost"] == 0.06, "costs"
_r3 = [{"task": "t", "single_tokens": 500, "multi_tokens": 100, "single_ok": True, "multi_ok": True}]
assert compare_agents(_r3, 0.01)["winner"] == "multi", "equal accuracy, multi cheaper"
assert compare_agents([], 0.01) == {"single_cost": 0.0, "multi_cost": 0.0, "single_acc": 0.0, "multi_acc": 0.0, "winner": "single"}, "empty"
@@hint
Sum the tokens and count the `True` values first, then decide the winner with accuracy first and cost second.
@@solution
def compare_agents(results, price_per_1k):
    n = len(results)
    sc = round(sum(r["single_tokens"] for r in results) / 1000 * price_per_1k, 4)
    mc = round(sum(r["multi_tokens"] for r in results) / 1000 * price_per_1k, 4)
    sa = sum(1 for r in results if r["single_ok"]) / n if n else 0.0
    ma = sum(1 for r in results if r["multi_ok"]) / n if n else 0.0
    if ma > sa:
        w = "multi"
    elif sa > ma:
        w = "single"
    else:
        w = "multi" if mc < sc else "single"
    return {"single_cost": sc, "multi_cost": mc, "single_acc": sa, "multi_acc": ma, "winner": w}
````

````task
id: sqlite-mcp-design
title: Design a safe SQLite MCP server
kind: text
level: medium
@@statement
Scenario: you own a SQLite database `shop.db` with tables `customers(id, name, email)`, `orders(id, customer_id, total_cents, status)` and `refunds(id, order_id, amount_cents)`, with about 1,000 customers and 20,000 orders. You want a desktop chat client (or a LangGraph agent with a human-approval interrupt) to use it through an MCP server you write.

**Deliverable**: a design of 250 to 400 words that lists:
1. The tools you expose (3 to 5), each with its name, input schema (field names and types) and a one-line description.
2. One resource you expose and why it is a resource instead of a tool.
3. How you prevent harm: which tools are read-only, how you stop SQL injection, row limits, and how a write (such as issuing a refund) needs human approval.
4. Two failure cases (for example a huge result, an unknown id) and the exact error message the server returns.
@@solution
Tools: (1) get_order(order_id: integer) returns one order with its status. (2) find_customer(email: string) returns id and name for an exact email match. (3) list_orders(customer_id: integer, limit: integer, default 20, max 100) returns the newest orders. (4) request_refund(order_id: integer, amount_cents: integer, reason: string) creates a pending refund row; it does not pay anything.

Resource: schema://shop is a read-only text description of the three tables and their columns. The client loads it as context once; it is data, not an action the model decides to take.

Safety: tools 1 to 3 open the database read-only (file:shop.db?mode=ro) and use parameterised queries (SELECT ... WHERE id = ?), never string-built SQL, so injection through arguments is impossible. There is no tool that takes raw SQL. Every list is capped at 100 rows. request_refund writes only a pending row, and the client (or a graph interrupt) shows an approval prompt with order id and amount; amount_cents must be positive and not above the order total. A separate human step marks it approved.

Failure cases: an unknown order id returns an error result {"isError": true, "text": "order 99999 not found"}. A limit above 100 is rejected with "limit must be between 1 and 100" instead of silently returning thousands of rows.
@@criteria
- Lists 3 to 5 tools with names, typed input fields and one-line descriptions.
- Names a resource (such as the schema) and explains why it is data rather than an action.
- Uses parameterised queries or read-only mode and exposes no raw-SQL tool.
- Requires human approval, or a pending state, for the write operation and validates the amount.
- Gives two concrete failure cases with exact error messages, including a row or size limit.
````
