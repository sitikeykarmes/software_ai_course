---
id: fe-essentials
title: Frontend essentials: the browser, JavaScript and React
minutes: 45
---

A backend or AI engineer does not need to be a designer, but must understand how a browser runs an application well enough to build a working interface and to debug the boundary between frontend and API. The course site you are reading is a small example: one HTML file, one stylesheet, and plain JavaScript in `static/`.

## The three languages

- **HTML** describes structure: headings, paragraphs, forms, buttons, links.
- **CSS** describes appearance: layout, colour, spacing, type.
- **JavaScript** adds behaviour: reacting to clicks, fetching data, updating the page.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Orders</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    .order { display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #ccc; }
    .paid { color: green; }
  </style>
</head>
<body>
  <h1>Orders</h1>
  <button id="load">Load orders</button>
  <div id="list"></div>
  <script>
    document.getElementById('load').addEventListener('click', async () => {
      const res = await fetch('/api/orders');
      const orders = await res.json();
      document.getElementById('list').innerHTML = orders
        .map(o => `<div class="order"><span>#${o.id}</span><span class="${o.status}">${o.status}</span></div>`)
        .join('');
    });
  </script>
</body>
</html>
```

Use **semantic HTML** (`<nav>`, `<main>`, `<button>`, `<label>`) instead of generic `<div>` elements. Screen readers, keyboards and search engines rely on it.

## CSS essentials

- **Selectors** pick elements: by tag (`p`), class (`.order`), id (`#list`), state (`button:hover`).
- **The box model**: every element is a box of content, padding, border and margin.
- **Flexbox** lays items out in one direction: `display: flex; gap: 8px; justify-content: space-between`.
- **Grid** lays items out in rows and columns: `display: grid; grid-template-columns: 250px 1fr`.
- **Responsive design**: `@media (max-width: 800px) { … }` changes the layout on small screens. Use relative units (`rem`, `%`) more than pixels.
- **Custom properties**: `--accent: #0a5f8a;` then `color: var(--accent)`. Change one value to re-theme the page, including for dark mode.
- **Specificity**: when rules conflict, the more specific selector wins; ids beat classes, classes beat tags.

Tailwind CSS is the common utility-class approach; component libraries such as Material UI and shadcn/ui give you ready-made parts.

## JavaScript in fifteen minutes

```javascript
// Variables: const by default, let when it must change. Avoid var.
const rate = 0.18;
let total = 0;

// Functions
function withTax(amount) { return amount * (1 + rate); }
const double = n => n * 2;                      // arrow function

// Arrays and objects
const prices = [100, 250, 40];
const taxed = prices.map(withTax);              // transform each item
const big = prices.filter(p => p > 50);         // keep some
const sum = prices.reduce((a, b) => a + b, 0);  // combine

const order = { id: 981, status: 'paid', items: ['gearbox'] };
const { id, status } = order;                   // destructuring
const updated = { ...order, status: 'shipped' };// copy with a change

// Equality: always use === (strict). == converts types in surprising ways.
console.log(0 == '', 0 === '');                 // true, false

// Template strings and optional chaining
console.log(`Order ${id} is ${status}`, order.customer?.name ?? 'unknown');
```

**TypeScript** adds static types on top of JavaScript and is the industry default for anything larger than a script:

```typescript
interface Order { id: number; status: 'pending' | 'paid' | 'shipped'; total: number; }
function label(o: Order): string { return `#${o.id} ${o.status}`; }
```

## How the browser runs a page

1. Parse the HTML into the **DOM**, a tree of elements.
2. Parse the CSS, compute styles, lay out positions, and paint pixels.
3. Run JavaScript, which can read and change the DOM, triggering new layout and paint.

JavaScript is **single-threaded** with an **event loop**. Long-running code freezes clicks and rendering, so anything slow (network, timers) is asynchronous: you start it and continue; a callback runs later when the result is ready.

```javascript
console.log('1');
setTimeout(() => console.log('3: timer fired'), 0);
Promise.resolve().then(() => console.log('2: promise'));
console.log('1 again');
// Output order: 1, 1 again, 2: promise, 3: timer fired
```

A **Promise** is a value that will arrive later. `async`/`await` lets you write asynchronous code that reads top to bottom:

```javascript
async function loadOrders() {
  try {
    const res = await fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    showError('Could not load orders. Check your connection and try again.');
    return [];
  }
}
```

`fetch` only rejects on network failure. An HTTP 500 still resolves, so always check `res.ok`.

## React

Changing the DOM by hand becomes unmanageable as an application grows. React lets you describe what the interface should look like for a given **state**; when the state changes, React updates the DOM to match.

```jsx
import { useEffect, useState } from 'react';

function OrderList({ userId }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');     // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/orders`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => { if (!cancelled) { setOrders(data); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };                 // cleanup when userId changes or the component leaves
  }, [userId]);

  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'error') return <p role="alert">Could not load orders.</p>;
  if (orders.length === 0) return <p>No orders yet.</p>;
  return (
    <ul>
      {orders.map(o => <OrderRow key={o.id} order={o} />)}
    </ul>
  );
}

function OrderRow({ order }) {
  return <li>#{order.id} · {order.status} · ₹{order.total}</li>;
}
```

- A **component** is a function that takes **props** (inputs) and returns markup (JSX).
- **State** is data that changes over time. Calling its setter makes React re-run the component and update only what changed.
- **Data flows down** through props; events flow up through callback props.
- **`key`** tells React which list item is which between renders.
- **Hooks**: `useState` (local state), `useEffect` (side effects such as fetching and subscriptions), `useMemo` and `useCallback` (avoid recomputation), `useContext` (shared values), `useRef` (a mutable value that does not cause a re-render).
- **Every data view needs three states**: loading, error, and empty, as above.

State management:

- **Server state** (data from your API) is best handled by a query library such as TanStack Query, which caches, deduplicates, refetches and tracks loading for you.
- **Client state** (which tab is open, a form draft) stays in components, or in a small store (Zustand, Redux Toolkit) when many components share it.

Vue, Svelte and Angular solve the same problem with different syntax. Learn one deeply.

## Rendering strategies

| Strategy | Where HTML is built | Trade-off | Typical use |
| --- | --- | --- | --- |
| Client-side rendering | In the browser after JavaScript loads | Simple hosting; slower first paint; weaker for search engines | Dashboards and internal tools (Vite + React) |
| Server-side rendering | On the server for each request | Fast first paint; good for search engines; needs a server | Content and e-commerce pages (Next.js) |
| Static generation | At build time | Fastest and cheapest; fixed until rebuilt | Documentation, blogs, marketing pages |

Next.js is the common React framework that mixes all three. Vite is the common build tool for plain React applications.

## Where frontend meets backend: the bugs you will actually hit

- **CORS errors**: the API must send `Access-Control-Allow-Origin` for the frontend's origin. See [networking](#cs-networking).
- **Token storage**: `localStorage` can be read by any script on the page; an `HttpOnly` cookie cannot. See [authentication](#be-auth).
- **Streaming**: showing an LLM's answer as it arrives means reading a stream.

```javascript
const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ message }) });
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  output.textContent += decoder.decode(value, { stream: true });
}
```

- **Never trust the client**: validation in the browser is for convenience; the server must validate again. Never put secrets or API keys in frontend code; anyone can read it.
- **Optimistic updates**: show the change immediately, then roll back if the request fails.
- **Stale closures and double requests**: effects that run twice, or responses arriving out of order. Cancel or ignore outdated requests, as the cleanup function above does.
- **XSS**: never insert untrusted text as HTML. React escapes by default; `dangerouslySetInnerHTML` and `innerHTML` do not.

## Performance and accessibility

- **Core Web Vitals** measure how fast the main content appears, how quickly the page responds to input, and how much the layout shifts.
- Ship less JavaScript: split code by route and lazy-load heavy parts. Size and compress images. Cache static assets with hashed filenames.
- Use the DevTools **Network** tab (what was requested, how long it took), **Console** (errors), and **Performance** tab.
- Accessibility basics: everything reachable by keyboard with a visible focus outline; a `<label>` for every input; sufficient colour contrast; `alt` text on images; real `<button>` elements for actions.

## Check yourself

```quiz
[
  {"q": "A `fetch` call receives an HTTP 500 response. What happens?", "options": ["The promise rejects", "The promise resolves; you must check `res.ok`", "The browser retries"], "answer": 1, "why": "`fetch` rejects only on network failure."},
  {"q": "Why is long-running JavaScript a problem in the browser?", "options": ["It uses too much disk", "It blocks the single main thread, freezing clicks and rendering", "It disables CSS"], "answer": 1, "why": "The event loop cannot process anything else until the code returns."},
  {"q": "In React, what causes a component to re-render?", "options": ["Any variable assignment", "A change to its state or props", "Every second"], "answer": 1, "why": "State setters and new props tell React the output may have changed."},
  {"q": "Where is it safe to keep an API secret key?", "options": ["In frontend JavaScript", "On the server only", "In localStorage"], "answer": 1, "why": "Everything shipped to the browser is readable by the user."},
  {"q": "Which three states should every data-loading view handle?", "options": ["Open, closed, hidden", "Loading, error, empty", "Small, medium, large"], "answer": 1, "why": "Users otherwise see blank or broken screens."},
  {"q": "Which rendering strategy suits a product page that must load fast and be indexed by search engines?", "options": ["Client-side rendering only", "Server-side rendering or static generation", "No JavaScript at all"], "answer": 1, "why": "The HTML arrives ready to show and to index."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: fetch-button-page
title: Button that loads JSON from an API
kind: text
level: easy
@@statement
Write one complete HTML file (HTML, a little CSS and plain JavaScript, no libraries) and the tiny Python server that goes with it.

**Scenario**: a Python server answers `GET /api/greeting` with the JSON `{"message": "Hello from Python", "count": 3}`.

**Deliverable**
1. The Python server (standard library `http.server` is fine), about 10-15 lines, that serves the JSON with the header `Content-Type: application/json`.
2. An HTML page with a `<button id="load">Load greeting</button>` and a `<p id="out"></p>`.
3. JavaScript so that clicking the button calls `fetch("/api/greeting")`, then writes `Hello from Python (3)` into `#out`.
4. While the request runs, the button is disabled and `#out` shows `Loading...`. If the response is not OK or the network fails, `#out` shows `Could not load greeting` and the button is enabled again.

Paste all the code and add two sentences saying how you would test it in the browser.
@@hint
Use `async`/`await` with `try`/`catch`/`finally`, and check `response.ok` before calling `response.json()`.
@@solution
Server:

```python
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/greeting":
            body = json.dumps({"message": "Hello from Python", "count": 3}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()

HTTPServer(("", 8000), H).serve_forever()
```

Page:

```html
<button id="load">Load greeting</button>
<p id="out"></p>
<script>
const btn = document.getElementById("load");
const out = document.getElementById("out");
btn.addEventListener("click", async () => {
  btn.disabled = true;
  out.textContent = "Loading...";
  try {
    const res = await fetch("/api/greeting");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    out.textContent = `${data.message} (${data.count})`;
  } catch (err) {
    out.textContent = "Could not load greeting";
  } finally {
    btn.disabled = false;
  }
});
</script>
```

To test: open the page served from the same server, click the button and see the text. Then stop the server or use the Network tab's offline mode and check that the error text appears and the button works again.
@@criteria
- The server returns valid JSON with the Content-Type `application/json`.
- The HTML uses exactly the ids `load` and `out`.
- The click handler uses `fetch` and reads the JSON, producing the text `Hello from Python (3)`.
- The button is disabled during the request and re-enabled afterwards (for example in `finally`).
- Errors are handled: `response.ok` is checked and a catch branch shows `Could not load greeting`.
- A short, realistic way to test it (browser, DevTools network tab) is given.
````

````task
id: parse-query-string
title: Parse a URL query string
kind: code
level: easy
@@statement
Browsers give JavaScript the part after `?` in a URL, and you must turn it into key/value pairs. Write `parse_query(qs)` that does the same in Python.

**Input**: `qs`, a string such as `"?a=1&b=two"` or `"a=1&b=two"`.

**Output**: a dict of strings.
- A leading `?` is ignored.
- Pairs are separated by `&` and split at the first `=`. Empty pieces (like `a=1&&b=2`) are skipped.
- Keys and values are decoded: `+` becomes a space and `%XX` becomes the character (use `urllib.parse.unquote_plus`).
- A key without `=` gets the value `""`.
- If a key appears more than once, its value is a **list** of all values in order. A key that appears once stays a plain string.
- Empty input or just `"?"` gives `{}`.

**Example**

```
parse_query("?q=hello+world%21&tag=x&tag=y")
-> {"q": "hello world!", "tag": ["x", "y"]}
```
@@starter
from urllib.parse import unquote_plus

def parse_query(qs):
    # your code here
    pass

print(parse_query("?q=hello+world%21&tag=x&tag=y"))
@@tests
assert parse_query("?a=1&b=two") == {"a": "1", "b": "two"}, "basic pairs"
assert parse_query("a=1") == {"a": "1"}, "works without the leading ?"
assert parse_query("q=hello+world%21") == {"q": "hello world!"}, "decoding of + and %XX"
assert parse_query("tag=x&tag=y&tag=z") == {"tag": ["x", "y", "z"]}, "repeated keys give a list"
assert parse_query("flag&a=1") == {"flag": "", "a": "1"}, "key without ="
assert parse_query("") == {} and parse_query("?") == {}, "empty input"
assert parse_query("a=1&&b=2") == {"a": "1", "b": "2"}, "empty pieces are skipped"
assert parse_query("expr=1%2B1%3D2") == {"expr": "1+1=2"}, "= inside an encoded value"
@@hint
`part.partition("=")` splits at the first `=` and gives an empty value when there is none. Keep a dict, and when a key already exists turn its value into a list.
@@solution
from urllib.parse import unquote_plus

def parse_query(qs):
    if qs.startswith("?"):
        qs = qs[1:]
    out = {}
    for part in qs.split("&"):
        if not part:
            continue
        key, _, value = part.partition("=")
        key, value = unquote_plus(key), unquote_plus(value)
        if key in out:
            if isinstance(out[key], list):
                out[key].append(value)
            else:
                out[key] = [out[key], value]
        else:
            out[key] = value
    return out
````

````task
id: find-by-class
title: Walk a DOM tree
kind: code
level: easy
@@statement
The DOM is a tree. Here a node is a dict `{"tag": str, "classes": [str, ...], "children": [node, ...]}`. Write `find_by_class(node, cls)`, the Python version of `querySelectorAll("." + cls)`.

**Input**: the root `node` (every node has all three keys) and a class name `cls`.

**Output**: a list of the **tags** of every node (including the root) whose `classes` contain `cls`, in document order (a parent comes before its children, siblings from first to last). No match gives `[]`. Do not change the tree.

**Example**

```
tree = div.card > [h1.title, ul > [li.item.card, li.item]]
find_by_class(tree, "card") -> ["div", "li"]
find_by_class(tree, "item") -> ["li", "li"]
```
@@starter
def find_by_class(node, cls):
    # your code here
    pass
@@tests
import copy as _copy
_tree = {"tag": "div", "classes": ["card"], "children": [
    {"tag": "h1", "classes": ["title"], "children": []},
    {"tag": "ul", "classes": [], "children": [
        {"tag": "li", "classes": ["item", "card"], "children": []},
        {"tag": "li", "classes": ["item"], "children": []},
    ]},
]}
_before = _copy.deepcopy(_tree)
assert find_by_class(_tree, "card") == ["div", "li"], "root and nested match, in document order"
assert find_by_class(_tree, "item") == ["li", "li"], "two siblings"
assert find_by_class(_tree, "title") == ["h1"], "single match"
assert find_by_class(_tree, "missing") == [], "no match"
assert find_by_class({"tag": "p", "classes": [], "children": []}, "x") == [], "single node"
assert _tree == _before, "do not modify the tree"
@@hint
Recursion: check the current node, then extend the result with the result of each child, in order.
@@solution
def find_by_class(node, cls):
    found = []
    if cls in node["classes"]:
        found.append(node["tag"])
    for child in node["children"]:
        found.extend(find_by_class(child, cls))
    return found
````

````task
id: debounce-fake-clock
title: Debounce with a fake clock
kind: code
level: medium
@@statement
A debounced function waits `wait` milliseconds after the **last** call before it really runs; every new call within the wait restarts the timer (typical for search-as-you-type). Simulate it without real time.

Write `debounce_runs(call_times, wait)`.

**Input**: `call_times`, a sorted list of integer times in ms when the user triggered the function; `wait`, an integer in ms.

**Output**: a list of the times at which the real function runs. A call at time `t` schedules a run at `t + wait`. It is cancelled when the next call arrives **before** `t + wait` (strictly smaller). If the next call is exactly at `t + wait`, the run still happens.

**Example**

```
debounce_runs([0, 100, 150, 1000], 200)
-> [350, 1200]
# 0 and 100 are cancelled by the next call, 150 runs at 350, 1000 runs at 1200
```
@@starter
def debounce_runs(call_times, wait):
    # your code here
    pass
@@tests
assert debounce_runs([0, 100, 150, 1000], 200) == [350, 1200], "example"
assert debounce_runs([], 100) == [], "no calls"
assert debounce_runs([5], 100) == [105], "single call"
assert debounce_runs([0, 200], 200) == [200, 400], "next call exactly at t+wait does not cancel"
assert debounce_runs([0, 50, 100], 100) == [200], "burst gives one run"
_calls = [0, 10]
debounce_runs(_calls, 5)
assert _calls == [0, 10], "do not change the input"
@@hint
A call is the last of its burst when it is the final call, or the gap to the next call is at least `wait`.
@@solution
def debounce_runs(call_times, wait):
    runs = []
    for i, t in enumerate(call_times):
        if i + 1 == len(call_times) or call_times[i + 1] - t >= wait:
            runs.append(t + wait)
    return runs
````

````task
id: hash-router
title: Match routes like a client-side router
kind: code
level: medium
@@statement
A single-page app maps URL paths to views, for example `/lesson/:id`. Write `match_route(routes, path)`.

**Input**: `routes`, a list of pattern strings; `path`, a string like `"/lesson/py"`.

**Output**: `(pattern, params)` for the **first** pattern that matches, otherwise `None`.
- Split both on `/` and ignore empty pieces, so `/lesson/py/` equals `/lesson/py`.
- A pattern piece starting with `:` matches any one piece and stores it in `params` under the name without the colon.
- Other pieces must be equal. The number of pieces must be equal.
- `"/"` has zero pieces and matches only an empty path.

**Example**

```
routes = ["/", "/lesson/:id", "/lesson/:id/task/:task"]
match_route(routes, "/lesson/py")        -> ("/lesson/:id", {"id": "py"})
match_route(routes, "/lesson/py/task/3") -> ("/lesson/:id/task/:task", {"id": "py", "task": "3"})
match_route(routes, "/nope")             -> None
```
@@starter
def match_route(routes, path):
    # your code here
    pass
@@tests
_routes = ["/", "/lesson/:id", "/lesson/:id/task/:task"]
assert match_route(_routes, "/") == ("/", {}), "root"
assert match_route(_routes, "/lesson/py") == ("/lesson/:id", {"id": "py"}), "one param"
assert match_route(_routes, "/lesson/py/task/3") == ("/lesson/:id/task/:task", {"id": "py", "task": "3"}), "two params"
assert match_route(_routes, "/nope") is None, "no match"
assert match_route(_routes, "/lesson/py/") == ("/lesson/:id", {"id": "py"}), "trailing slash ignored"
assert match_route(["/lesson/new", "/lesson/:id"], "/lesson/new") == ("/lesson/new", {}), "first match wins"
assert match_route([], "/x") is None, "no routes"
assert match_route(["/a/:x"], "/b/1") is None, "fixed piece must be equal"
@@hint
Turn both strings into lists with `[s for s in text.split("/") if s]`, compare lengths, then walk the two lists together.
@@solution
def match_route(routes, path):
    pieces = [s for s in path.split("/") if s]
    for route in routes:
        parts = [s for s in route.split("/") if s]
        if len(parts) != len(pieces):
            continue
        params = {}
        ok = True
        for part, piece in zip(parts, pieces):
            if part.startswith(":"):
                params[part[1:]] = piece
            elif part != piece:
                ok = False
                break
        if ok:
            return (route, params)
    return None
````

````task
id: copy-link-button
title: Add a "copy link" button
kind: text
level: medium
@@statement
Add a feature to a lesson page in plain JavaScript (no libraries): a **Copy link** button that copies the address of the current lesson to the clipboard.

**Scenario**: the page URL is `https://example.com/#/lesson/python-core`. The page header already has `<div class="lesson-header"><h1>Python core</h1></div>`.

**Deliverable** (code plus 3-5 sentences)
1. JavaScript that creates `<button class="copy-link" type="button">Copy link</button>` and appends it to `.lesson-header`.
2. On click it copies `location.href` with `navigator.clipboard.writeText`.
3. On success the button text becomes `Copied!` for 2 seconds, then returns to `Copy link`. On failure (clipboard blocked) the text becomes `Press Ctrl+C` and the URL is selected in a read-only `<input>` placed next to the button.
4. Explain why the clipboard call needs a user click and a secure context (HTTPS or localhost), and how a keyboard user can use the button.
@@hint
`navigator.clipboard.writeText` returns a promise, so use `await` in a `try`/`catch`, and `setTimeout` to restore the label.
@@solution
```js
const header = document.querySelector(".lesson-header");
const btn = document.createElement("button");
btn.className = "copy-link";
btn.type = "button";
btn.textContent = "Copy link";
header.appendChild(btn);

btn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy link"; }, 2000);
  } catch (err) {
    btn.textContent = "Press Ctrl+C";
    const input = document.createElement("input");
    input.readOnly = true;
    input.value = location.href;
    btn.after(input);
    input.select();
  }
});
```

Browsers only allow clipboard writes from a secure context and normally after a user gesture, to stop pages from silently overwriting what you copied. A real `<button>` is focusable and fires `click` on Enter or Space, so a keyboard user can tab to it and use it without extra code.
@@criteria
- Creates a button with class `copy-link` and the exact label, and appends it to `.lesson-header`.
- Uses `navigator.clipboard.writeText(location.href)` inside a click handler.
- Shows `Copied!` and restores `Copy link` after 2000 ms using `setTimeout`.
- Handles failure with the `Press Ctrl+C` text and a read-only input holding the URL.
- Explains the secure-context / user-gesture requirement and keyboard accessibility of a real button.
````

````task
id: react-orders-page
title: Specify an orders page in React
kind: text
level: hard
@@statement
You have Node.js and want to build an orders page in React with TypeScript. Before coding, write the **component and state design**.

**Scenario**: the API is `POST /api/login` (returns `{token}`), `GET /api/orders?page=N` (returns `{items: Order[], totalPages: number}`) and `POST /api/orders` (creates an order). `Order = {id: number, customer: string, total: number}`. A page holds 10 orders.

**Deliverable** (about 20-30 lines of TypeScript types and component sketches, plus a list)
1. The TypeScript types for `Order`, the list response and the state of the list (a discriminated union with `status: "loading" | "error" | "empty" | "ready"`).
2. The component tree with the name and props of each component (at least `LoginForm`, `OrderList`, `Pagination`, `NewOrderForm`).
3. A table with the 4 list states, and exactly what the user sees in each (for example the empty state text `No orders yet`).
4. Where the token is kept and what happens when the API answers `401`.
5. What you do after a successful create so the list is right (state your choice and why).
@@hint
Think about which component owns the `page` number and the fetched data, and pass them down as props.
@@solution
Types:

```ts
type Order = { id: number; customer: string; total: number };
type OrdersResponse = { items: Order[]; totalPages: number };
type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; items: Order[]; totalPages: number };
```

Components: `App` (owns `token`; shows `LoginForm` when null), `LoginForm({onLogin: (token: string) => void})`, `OrdersPage({token, onUnauthorized})` (owns `page` and `ListState`, runs the fetch in `useEffect` on `[page, token]`), `OrderList({items})`, `Pagination({page, totalPages, onChange})`, `NewOrderForm({token, onCreated})`.

States: loading shows a spinner or `Loading orders...`; error shows the message and a `Retry` button; empty (a 200 answer with zero items) shows `No orders yet`; ready shows the table and the pagination with Previous disabled on page 1 and Next disabled on the last page.

Token: keep it in React state (and optionally `sessionStorage`); send it as `Authorization: Bearer`. On a `401` call `onUnauthorized`, which clears the token and returns the user to the login form.

After a successful create, refetch page 1 (set `page` to 1 and trigger the effect again), because the server decides the order and the total pages; an optimistic insert would be wrong when sorting or paging changes.
@@criteria
- Gives correct TypeScript types, including a discriminated union with the four statuses.
- Lists components with props and says which component owns the page number and the fetched data.
- Describes all four states with concrete visible text or behaviour, including the empty state.
- Explains token storage and the handling of a 401 (clear token, show login).
- Chooses a way to refresh after creating an order (refetch or optimistic update) and justifies it.
````

````task
id: streaming-chat-view
title: Specify a streaming chat view
kind: text
level: hard
@@statement
Design a chat view that shows an answer **as it arrives** from an endpoint.

**Scenario**: `POST /api/chat` with body `{"prompt": "Hi"}` answers with a streamed body of text chunks. For the prompt `Hi` the chunks arrive as `"Hel"`, `"lo, "`, `"how can I "`, `"help?"` at 0, 100, 200 and 300 ms. The page has `<form id="chat">`, `<input id="prompt">`, and `<div id="log">`.

**Deliverable**
1. Plain JavaScript that on submit appends a `<div class="msg user">` with the prompt and a `<div class="msg bot">` that is filled chunk by chunk using `fetch`, `response.body.getReader()` and a `TextDecoder`.
2. State the final text of the bot message for the example above, and what the user sees after 250 ms.
3. How you stop the user from sending a second prompt while one is streaming, and how a **Stop** button would cancel the stream (`AbortController`).
4. Two sentences on why you set `textContent` and not `innerHTML` for model output.
@@hint
`reader.read()` returns `{done, value}`; loop until `done`, and decode with `decoder.decode(value, {stream: true})`.
@@solution
```js
const form = document.getElementById("chat");
const input = document.getElementById("prompt");
const log = document.getElementById("log");
let controller = null;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (controller) return;               // already streaming
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = "";
  const user = document.createElement("div");
  user.className = "msg user";
  user.textContent = prompt;
  const bot = document.createElement("div");
  bot.className = "msg bot";
  log.append(user, bot);

  controller = new AbortController();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bot.textContent += decoder.decode(value, { stream: true });
    }
  } catch (err) {
    if (err.name !== "AbortError") bot.textContent += " [error]";
  } finally {
    controller = null;
  }
});
// Stop button: stopBtn.onclick = () => controller && controller.abort();
```

Final bot text: `Hello, how can I help?`. After 250 ms three chunks have arrived (at 0, 100 and 200 ms), so the user sees `Hello, how can I ` and the last chunk `help?` is still to come.

While `controller` is not null the submit handler returns early (the submit button can also be disabled). `textContent` treats model output as plain text; `innerHTML` would run any HTML or script the model (or an attacker via prompt injection) produced, which is an XSS risk.
@@criteria
- Uses `fetch` with `response.body.getReader()` and `TextDecoder` in a read loop that stops when `done` is true.
- Creates the two message elements with classes `msg user` and `msg bot` and appends text incrementally.
- Gives the correct final text `Hello, how can I help?` and a sensible state at 250 ms (the first three chunks).
- Prevents a second concurrent send and cancels with `AbortController`.
- Explains that `textContent` avoids XSS from untrusted model output.
````
