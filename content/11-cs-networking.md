---
id: cs-networking
title: Networking: what happens when you open a URL
minutes: 45
---

Typing `https://shop.example.com/cart` triggers a fixed chain: find the server's address, open a connection, encrypt it, send a request, receive a response. Each link in the chain is a classic interview question and a common place for outages.

## The chain, step by step

1. **DNS lookup**. The browser asks a resolver for the IP address of `shop.example.com`. The resolver asks a root server, then the `.com` servers, then the domain's own name servers, and caches the answer for the record's time to live (TTL).
2. **TCP connection**. Client and server perform a three-way handshake: SYN, SYN-ACK, ACK. From then on TCP delivers bytes reliably and in order.
3. **TLS handshake**. The server presents a certificate signed by an authority the browser trusts. The two sides agree on a secret key. Everything after is encrypted.
4. **HTTP request**. The browser sends a method, a path, headers and sometimes a body.
5. **Server side**. The request passes a CDN or load balancer, reaches an application server, which may call a cache, a database and other services.
6. **HTTP response**. A status code, headers and a body come back. The browser parses the HTML, requests the CSS, JavaScript and images it references, and renders the page.

## The layer model

| Layer | Job | Examples | Unit |
| --- | --- | --- | --- |
| Application | What the data means | HTTP, DNS, SMTP, WebSocket, gRPC | Message |
| Transport | Process-to-process delivery, reliability | TCP, UDP, QUIC | Segment |
| Network | Routing between networks | IP | Packet |
| Link | One hop on a physical medium | Ethernet, Wi-Fi | Frame |

Each layer wraps the one above. "Layer 4 load balancer" means it sees IP addresses and ports; "layer 7" means it understands HTTP.

## IP addresses and ports

- An **IP address** identifies a machine on a network. IPv4 is four numbers (`192.168.1.20`); IPv6 is longer and exists because IPv4 ran out.
- A **port** identifies a program on that machine: 80 HTTP, 443 HTTPS, 22 SSH, 5432 PostgreSQL, 6379 Redis, 27017 MongoDB.
- **Private ranges** (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are not reachable from the internet. **NAT** on a router translates private addresses to one public address.
- **CIDR notation**: `10.0.0.0/16` means the first 16 bits are fixed, leaving 65,536 addresses. `/24` leaves 256.
- `127.0.0.1` (localhost) is the machine itself. The course server binds to it so only your own computer can reach it.

## DNS

| Record | Maps | Example use |
| --- | --- | --- |
| A / AAAA | Name to IPv4 / IPv6 address | `api.example.com` to a load balancer |
| CNAME | Name to another name | `www` to a CDN hostname |
| MX | Domain to mail servers | Email delivery |
| TXT | Free text | Domain ownership proof, email anti-spoofing (SPF, DKIM) |
| NS | Domain to its name servers | Delegation |

A low TTL lets you move traffic quickly during a migration; a high TTL reduces lookups. DNS can also spread load (returning several addresses) and route by geography.

```python run
import socket
try:
    print(socket.gethostbyname("localhost"))
    print(socket.getaddrinfo("localhost", 443)[0][4])
except OSError as exc:
    print("lookup failed:", exc)
```

## TCP and UDP

| | TCP | UDP |
| --- | --- | --- |
| Connection | Handshake first | None |
| Delivery | Guaranteed, in order, resends lost data | Best effort; may drop or reorder |
| Speed | Some overhead | Minimal overhead |
| Used by | HTTP/1.1, HTTP/2, databases, SSH | DNS, video calls, games, QUIC (HTTP/3) |

TCP also does **flow control** (do not overwhelm the receiver) and **congestion control** (slow down when the network drops packets).

A complete TCP server and client fit in a few lines. This runs both on your machine:

```python run
import socket, threading

def serve(server):
    conn, addr = server.accept()               # wait for one client
    with conn:
        data = conn.recv(1024)
        conn.sendall(b"echo: " + data.upper())

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(("127.0.0.1", 0))                  # port 0: let the OS choose a free port
server.listen()
port = server.getsockname()[1]
threading.Thread(target=serve, args=(server,), daemon=True).start()

with socket.create_connection(("127.0.0.1", port)) as client:
    client.sendall(b"hello over tcp")
    print(client.recv(1024).decode(), "| server port", port)
server.close()
```

Every web framework is built on exactly this: accept a connection, read bytes, parse them as HTTP, write bytes back.

## TLS and HTTPS

TLS gives three guarantees: **confidentiality** (nobody on the path can read it), **integrity** (nobody can alter it unnoticed), **authentication** (the server is who the certificate says).

1. The client says hello and lists the ciphers it supports.
2. The server replies with its **certificate**: its public key plus identity, signed by a **certificate authority (CA)**.
3. The client checks the signature against CAs it trusts, the hostname, and the expiry date.
4. Both sides run a key exchange to derive a shared **session key** without sending it.
5. All further data uses fast symmetric encryption with that key.

Asymmetric cryptography (public and private keys) is slow, so it is used only to authenticate and agree on the key. Expired certificates are a frequent cause of real outages; automate renewal (Let's Encrypt, managed certificates).

## HTTP in detail

```
POST /api/orders HTTP/1.1
Host: shop.example.com
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{"item_id": 42, "qty": 1}
```

```
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/orders/981

{"id": 981, "status": "pending"}
```

| Method | Meaning | Safe to repeat? |
| --- | --- | --- |
| GET | Read | Yes |
| POST | Create or trigger an action | No, unless you add an idempotency key |
| PUT | Replace the whole resource | Yes |
| PATCH | Partial update | Depends on the body |
| DELETE | Remove | Yes |

| Status | Meaning | Typical case |
| --- | --- | --- |
| 200, 201, 204 | OK, created, no content | Success |
| 301, 302, 304 | Moved permanently, found, not modified | Redirects, cache hit |
| 400 | Bad request | Malformed input |
| 401, 403 | Not authenticated, not allowed | Missing token; valid token but no permission |
| 404, 409, 422, 429 | Not found, conflict, validation failed, rate limited | Client-side problems |
| 500, 502, 503, 504 | Server bug, bad gateway, unavailable, gateway timeout | Server or upstream failure |

Make a real request with only the standard library:

```python run
import json, urllib.request

req = urllib.request.Request("http://127.0.0.1:8000/course.js", headers={"User-Agent": "lesson-demo"})
try:
    with urllib.request.urlopen(req, timeout=3) as resp:
        print(resp.status, resp.headers["Content-Type"], len(resp.read()), "bytes")
except OSError as exc:
    print("request failed (is the course on another port?):", exc)
```

### Things every engineer should know about HTTP

- **Stateless**: each request stands alone. State lives in cookies, tokens and databases.
- **Headers** carry metadata: `Content-Type`, `Authorization`, `Accept`, `User-Agent`, `Cache-Control`.
- **Cookies**: small values the server sets with `Set-Cookie`; the browser sends them back on every request to that site.
- **Caching**: `Cache-Control: max-age=3600` lets browsers and CDNs reuse a response. `ETag` lets the client ask "has it changed?" and get a tiny 304 reply.
- **Keep-alive**: one TCP connection is reused for many requests, saving handshakes.
- **Versions**: HTTP/1.1 handles one request at a time per connection. HTTP/2 multiplexes many requests on one connection and compresses headers. HTTP/3 runs on QUIC over UDP, so one lost packet does not stall every stream.
- **CORS**: a browser blocks JavaScript on site A from reading responses from site B unless B replies with `Access-Control-Allow-Origin` naming A. It is a browser rule protecting users; it is not server security.

## Proxies, gateways and firewalls

- A **forward proxy** sits in front of clients: a corporate proxy that filters outbound traffic.
- A **reverse proxy** sits in front of servers: it terminates TLS, compresses, caches and routes requests. Nginx, HAProxy, Envoy and cloud load balancers are reverse proxies.
- A **firewall** allows or blocks traffic by address, port and protocol.
- A **VPN** creates an encrypted tunnel that makes a remote machine part of a private network.

## Tools

| Tool | What it shows |
| --- | --- |
| `curl -v URL` | The full request and response, including TLS details |
| `nslookup name` / `dig name` | DNS answers |
| `ping host` | Whether a host is reachable and the round-trip time |
| `tracert host` (Windows) / `traceroute host` | Each hop on the path |
| `netstat -ano` (Windows) / `ss -tlnp` (Linux) | Which ports are listening and which process owns them |
| Browser DevTools, Network tab | Every request a page makes, with timing |

## Check yourself

```quiz
[
  {"q": "In what order do these happen for a new HTTPS request?", "options": ["TLS handshake, DNS, TCP handshake, HTTP", "DNS, TCP handshake, TLS handshake, HTTP", "TCP handshake, DNS, HTTP, TLS"], "answer": 1, "why": "You need the address before connecting, a connection before encrypting, and encryption before sending the request."},
  {"q": "Which protocol would you choose for a live video call?", "options": ["TCP, because it resends lost data", "UDP, because a late packet is useless and delay matters more", "SMTP"], "answer": 1, "why": "Retransmission would add delay; real-time media prefers to drop."},
  {"q": "A user is logged in but may not view the admin page. Which status code?", "options": ["401", "403", "404"], "answer": 1, "why": "401 means not authenticated; 403 means authenticated but not permitted."},
  {"q": "What does the certificate in TLS prove?", "options": ["The server is fast", "The server controls the domain, as vouched for by a trusted authority", "The data is compressed"], "answer": 1, "why": "Authentication of the server's identity is the certificate's job."},
  {"q": "Your frontend at `app.example.com` cannot read responses from `api.example.com` in the browser, but curl works. Likely cause?", "options": ["DNS failure", "Missing CORS headers on the API", "The API is down"], "answer": 1, "why": "CORS is enforced by browsers only, which is why curl succeeds."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: label-curl-output
title: Label the phases of a curl request
kind: text
level: easy
@@statement
Run `curl -v https://example.com` in a terminal. The output looks roughly like this (shortened; your IPs differ):

```
*   Trying 93.184.216.34:443...
* Connected to example.com (93.184.216.34) port 443
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
* TLSv1.3 (IN), TLS handshake, Server hello (2):
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
> GET / HTTP/1.1
> Host: example.com
> User-Agent: curl/8.4.0
> Accept: */*
< HTTP/1.1 200 OK
< Content-Type: text/html; charset=UTF-8
< Content-Length: 1256
<
<!doctype html> ...
```

Deliver **8-14 lines**:

1. A numbered list of the five phases in the order they happen (DNS, TCP, TLS, HTTP request, HTTP response). For each phase write which line(s) of your own output belong to it, and what it achieves in one sentence.
2. Which phase is NOT directly visible in the output above, and how you could still see its cost (for example `curl -w "%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}\n" -o /dev/null -s https://example.com`).
3. Which header tells the client how many bytes of body to read, and which line is the status line.
@@hint
Each phase needs something from the previous one: you cannot open a TCP connection without an IP address.
@@solution
1. DNS: turns example.com into 93.184.216.34. It happens before the first "Trying" line, so it is hidden (curl only prints the result in "Trying 93.184.216.34:443").
2. TCP: "Trying ..." and "Connected to example.com ... port 443" - the three-way handshake gives a reliable byte stream to port 443.
3. TLS: the "TLS handshake, Client hello / Server hello" lines and "SSL connection using TLSv1.3" - agree on keys and verify the certificate so everything after is encrypted.
4. HTTP request: the lines starting with ">" - method, path, Host header, other headers.
5. HTTP response: the lines starting with "<" - status line, headers, then the body.

DNS is the phase you do not see; `-w` with time_namelookup shows its cost, time_connect minus time_namelookup is the TCP handshake, and time_appconnect minus time_connect is TLS.
The status line is `HTTP/1.1 200 OK`; `Content-Length: 1256` tells the client to read 1256 body bytes.
@@criteria
- Lists the phases in the correct order: DNS, TCP, TLS, request, response.
- Maps the right output lines to each phase (Trying/Connected = TCP, handshake lines = TLS, > lines = request, < lines = response).
- Notes that DNS happens before the visible output and shows how to measure it with curl -w timings.
- Explains the purpose of each phase in one sentence (name to IP, reliable connection, encryption, ask, answer).
- Identifies the status line and the Content-Length header correctly.
````

````task
id: dns-resolver
title: Resolve names through CNAME records
kind: code
level: medium
@@statement
`nslookup` shows different record types: an `A` record gives an IP address, a `CNAME` record says "this name is an alias of another name". Write a tiny resolver: `resolve(records, name, max_hops=10)`.

**Input**
- `records`: a list of `(name, rtype, value)` tuples, where `rtype` is `"A"` or `"CNAME"`. Names are lower-case strings.
- `name`: the name to look up.
- `max_hops`: the most CNAME links to follow (default 10).

**Output**: a list of IP strings.
- If `name` has `A` records, return all their values, in the order they appear in `records` (an `A` record wins over a `CNAME` for the same name).
- Else, if it has a `CNAME`, follow the first one and repeat for the target name.
- Follow at most `max_hops` CNAME links. If the name is unknown, the chain loops, or it needs more hops, return `[]`.

**Example**

```
recs = [("www.shop.com", "CNAME", "shop.cdn.net"),
        ("shop.cdn.net", "A", "10.0.0.1"),
        ("shop.cdn.net", "A", "10.0.0.2")]
resolve(recs, "www.shop.com")  ->  ["10.0.0.1", "10.0.0.2"]
resolve(recs, "nope.com")      ->  []
```
@@starter
def resolve(records, name, max_hops=10):
    # TODO: loop: A records? return them; CNAME? move to its target; otherwise give up
    pass

_recs = [("www.shop.com", "CNAME", "shop.cdn.net"),
         ("shop.cdn.net", "A", "10.0.0.1"),
         ("shop.cdn.net", "A", "10.0.0.2")]
print(resolve(_recs, "www.shop.com"))
@@tests
_recs = [("www.shop.com", "CNAME", "shop.cdn.net"),
         ("shop.cdn.net", "A", "10.0.0.1"),
         ("shop.cdn.net", "A", "10.0.0.2")]
assert resolve(_recs, "www.shop.com") == ["10.0.0.1", "10.0.0.2"], "alias then two A records"
assert resolve(_recs, "shop.cdn.net") == ["10.0.0.1", "10.0.0.2"], "direct A records"
assert resolve(_recs, "nope.com") == [], "unknown name"
assert resolve([], "a.com") == [], "no records"
assert resolve([("a", "CNAME", "b"), ("b", "CNAME", "a")], "a") == [], "loop"
assert resolve([("a", "CNAME", "b"), ("a", "A", "1.1.1.1")], "a") == ["1.1.1.1"], "A beats CNAME"
assert resolve([("a", "CNAME", "b"), ("b", "CNAME", "c"), ("c", "A", "9.9.9.9")], "a") == ["9.9.9.9"], "two hops"
_ok = [("n%d" % i, "CNAME", "n%d" % (i + 1)) for i in range(10)] + [("n10", "A", "1.1.1.1")]
assert resolve(_ok, "n0") == ["1.1.1.1"], "10 hops is allowed"
_long = [("n%d" % i, "CNAME", "n%d" % (i + 1)) for i in range(11)] + [("n11", "A", "1.1.1.1")]
assert resolve(_long, "n0") == [], "11 hops is too many"
@@hint
Use `for _ in range(max_hops + 1)`; each round, look at the current name: return the A values if any, otherwise replace the current name by the CNAME target, otherwise return `[]`. Falling out of the loop means too many hops.
@@solution
def resolve(records, name, max_hops=10):
    current = name
    for _ in range(max_hops + 1):
        ips = [v for n, t, v in records if n == current and t == "A"]
        if ips:
            return ips
        targets = [v for n, t, v in records if n == current and t == "CNAME"]
        if not targets:
            return []
        current = targets[0]
    return []
````

````task
id: echo-server-loop
title: Echo server that serves clients one after another
kind: code
level: medium
@@statement
A TCP connection is a **byte stream**: one `send` may arrive split across several `recv` calls. Model an echo server without real sockets.

Write two functions:

1. `echo_lines(chunks)`: the data received from ONE client. `chunks` is a list of `bytes` pieces in arrival order (pieces can cut a line anywhere). An empty `b""` piece means the client closed the connection; ignore anything after it. Return a list of replies: each **complete line** (ending in `\n`) echoed back, including its `\n`. A last partial line without `\n` is dropped.
2. `serve(connections)`: the server loop. `connections` is a list; each item is a `chunks` list (one client) or `None`, which means "shut the server down". Handle clients **one at a time, in order**; stop at the first `None`. Return a list with the replies of each handled client.

**Example**

```
echo_lines([b"hel", b"lo\nwor", b"ld\n", b""])  ->  [b"hello\n", b"world\n"]
serve([[b"hi\n", b""], [b"yo\n", b""], None, [b"late\n", b""]])
    ->  [[b"hi\n"], [b"yo\n"]]
```
@@starter
def echo_lines(chunks):
    # TODO: append chunks to a buffer; split off every complete line
    pass

def serve(connections):
    # TODO: loop over connections, one client at a time, until None
    pass

print(echo_lines([b"hel", b"lo\nwor", b"ld\n", b""]))
@@tests
assert echo_lines([b"hello\n", b""]) == [b"hello\n"], "one full line"
assert echo_lines([b"hel", b"lo\nwor", b"ld\n", b""]) == [b"hello\n", b"world\n"], "lines split across chunks"
assert echo_lines([b"a\nb\nc\n", b""]) == [b"a\n", b"b\n", b"c\n"], "several lines in one chunk"
assert echo_lines([b"no newline", b""]) == [], "partial line is dropped"
assert echo_lines([]) == [], "no data at all"
assert echo_lines([b"x\n", b"", b"y\n"]) == [b"x\n"], "data after close is ignored"
assert serve([[b"hi\n", b""], [b"yo\n", b""]]) == [[b"hi\n"], [b"yo\n"]], "two clients in order"
assert serve([[b"hi\n", b""], None, [b"late\n", b""]]) == [[b"hi\n"]], "stops at None"
assert serve([]) == [], "no clients"
assert serve([None]) == [], "immediate shutdown"
@@hint
Keep `buf = b""`. After each chunk do `buf += chunk`, then `while b"\n" in buf: line, buf = buf.split(b"\n", 1)` and reply with `line + b"\n"`.
@@solution
def echo_lines(chunks):
    buf = b""
    replies = []
    for chunk in chunks:
        if chunk == b"":
            break
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            replies.append(line + b"\n")
    return replies

def serve(connections):
    results = []
    for conn in connections:
        if conn is None:
            break
        results.append(echo_lines(conn))
    return results
````

````task
id: json-http-handler
title: A minimal JSON HTTP handler
kind: code
level: medium
@@statement
`http.server` boils down to: parse the request line, route it, build a status, headers and a JSON body. Write that core as a pure function `handle_request(method, target)`. (Afterwards, open `app.py` in this project and find where it does the same routing and JSON encoding.)

**Input**
- `method`: a string such as `"GET"` or `"POST"` (case-insensitive).
- `target`: the request target, a path with an optional query string, e.g. `"/hello?name=Ada"`.

**Output**: a tuple `(status, headers, body)`:
- `status`: int. `headers`: dict that always contains `"Content-Type": "application/json"`. `body`: a JSON **string** (made with `json.dumps`).
- `GET /health` -> `200`, body `{"status": "ok"}`.
- `GET /hello` -> `200`, body `{"message": "Hello, <name>!"}` where `<name>` is the `name` query parameter, or `world` if it is missing or empty.
- A known path with a method other than GET -> `405`, body `{"error": "method not allowed"}`, and an extra header `"Allow": "GET"`.
- Any other path -> `404`, body `{"error": "not found"}` (whatever the method).

**Example**

```
handle_request("GET", "/hello?name=Ada")
-> (200, {"Content-Type": "application/json"}, '{"message": "Hello, Ada!"}')
```
@@starter
import json
from urllib.parse import urlsplit, parse_qs

def handle_request(method, target):
    # TODO: split target into path and query, route on the path, return (status, headers, body)
    pass

print(handle_request("GET", "/hello?name=Ada"))
@@tests
import json as _json
_r = handle_request("GET", "/health")
assert _r is not None and _r[0] == 200 and _json.loads(_r[2]) == {"status": "ok"}, "health"
assert _r[1]["Content-Type"] == "application/json", "content type header"
_s, _h, _b = handle_request("GET", "/hello?name=Ada")
assert _s == 200 and _json.loads(_b) == {"message": "Hello, Ada!"}, "hello with name"
_s, _h, _b = handle_request("get", "/hello")
assert _s == 200 and _json.loads(_b) == {"message": "Hello, world!"}, "default name, lowercase method"
_s, _h, _b = handle_request("GET", "/hello?name=")
assert _json.loads(_b) == {"message": "Hello, world!"}, "empty name"
_s, _h, _b = handle_request("GET", "/nope")
assert _s == 404 and _json.loads(_b) == {"error": "not found"}, "404"
assert _h["Content-Type"] == "application/json", "errors are JSON too"
_s, _h, _b = handle_request("POST", "/health")
assert _s == 405 and _h.get("Allow") == "GET" and _json.loads(_b) == {"error": "method not allowed"}, "405"
_s, _h, _b = handle_request("POST", "/missing")
assert _s == 404, "unknown path wins over method"
assert isinstance(_b, str), "body is a string"
@@hint
`urlsplit(target)` gives `.path` and `.query`; `parse_qs(query).get("name", [""])[0]` gets the first value. Build the body with `json.dumps(...)`.
@@solution
import json
from urllib.parse import urlsplit, parse_qs

def handle_request(method, target):
    parts = urlsplit(target)
    path = parts.path
    headers = {"Content-Type": "application/json"}
    if path not in ("/health", "/hello"):
        return 404, headers, json.dumps({"error": "not found"})
    if method.upper() != "GET":
        headers["Allow"] = "GET"
        return 405, headers, json.dumps({"error": "method not allowed"})
    if path == "/health":
        return 200, headers, json.dumps({"status": "ok"})
    name = parse_qs(parts.query).get("name", [""])[0] or "world"
    return 200, headers, json.dumps({"message": "Hello, %s!" % name})
````

````task
id: devtools-slowest-request
title: Find the slowest request in a waterfall
kind: text
level: medium
@@statement
You open DevTools (Network tab) on a shop page and copy these timings. All times are in milliseconds.

| Request | DNS | TCP+TLS | Waiting (TTFB) | Download | Size |
|---|---|---|---|---|---|
| GET /index.html | 40 | 120 | 180 | 10 | 14 KB |
| GET /app.js | 0 | 0 | 40 | 220 | 1.8 MB |
| GET /logo.png | 0 | 0 | 30 | 15 | 20 KB |
| GET api.shop.com/products | 60 | 140 | 900 | 25 | 60 KB |
| GET cdn.fonts.net/font.woff2 | 50 | 130 | 35 | 40 | 90 KB |

Deliver **8-12 lines**:

1. The total time of each request, and which one is slowest.
2. For the slowest request, which phase dominates and what that tells you (server work, network distance, or a big file).
3. Why `app.js` and `logo.png` show 0 for DNS and TCP+TLS.
4. Two concrete fixes for the slowest request and one fix for `app.js`.
5. One reason the page might still load slowly even if every single request is fast (think about how requests depend on each other).
@@hint
Add the four phases for each row. Then compare the biggest phase of the slowest row against the same phase in other rows.
@@solution
1. Totals: index.html 350 ms, app.js 260 ms, logo.png 45 ms, api products 1125 ms, font 255 ms. The API call to api.shop.com/products is slowest.
2. Waiting (TTFB) is 900 ms of its 1125 ms. DNS, connection and download are normal compared with other requests, so the server spends most of the time building the response (database queries or slow code), not the network.
3. The browser already has a connection to the same host (index.html opened it) and reuses it with keep-alive, so no new DNS lookup or TCP/TLS handshake is needed.
4. For the API: cache the product list (server-side cache or Cache-Control / CDN) and add a database index or fix the slow query; pagination would shrink the work too. For app.js (1.8 MB, download-dominated): minify, compress with gzip or brotli, code-split so only the needed part loads, and cache it with a long max-age.
5. Requests can be chained: the HTML must arrive before the browser discovers app.js, and the JS must run before it calls the API, so the waterfall adds up; render-blocking scripts also delay the first paint.
@@criteria
- Computes the totals correctly (350, 260, 45, 1125, 255 ms) and names the API request as slowest.
- Identifies TTFB (server wait) as the dominant phase and explains it means slow server work rather than network or size.
- Explains connection reuse (keep-alive) for the 0 DNS and 0 TCP+TLS values.
- Proposes at least two valid fixes for the API (cache, index or query fix, pagination, CDN) and one for app.js (compression, minify, splitting, caching).
- Mentions dependency chains or render-blocking resources as a cause of slowness even when single requests are fast.
````
