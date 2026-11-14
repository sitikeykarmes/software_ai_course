---
id: be-databases
title: Databases: SQL, indexes, transactions, NoSQL
minutes: 75
---

Start every project on a relational database, PostgreSQL by default, unless you can name the specific reason another store fits better. Relational databases give you flexible queries and transactions, which are very hard to add later. Python ships with SQLite, a complete SQL database in one file, so every example here runs on your machine.

## The relational model

- Data lives in **tables** of **rows** and **columns**.
- A **primary key** uniquely identifies a row. A **foreign key** points to a row in another table, and the database refuses to leave it dangling.
- **Constraints** (`NOT NULL`, `UNIQUE`, `CHECK`) let the database enforce rules. Application code has bugs; constraints do not forget.
- **Normalisation** means storing each fact once. Put the customer's city in `customers`, not on every order, so it cannot disagree with itself. Denormalise (copy data) only when a measured read is too slow.

```python run
import sqlite3
db = sqlite3.connect(":memory:")
db.executescript("""
PRAGMA foreign_keys = ON;
CREATE TABLE customers (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  city  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);
CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount      NUMERIC NOT NULL CHECK (amount >= 0),
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL
);
INSERT INTO customers VALUES (1,'Asha','Pune','asha@x.in'),(2,'Ravi','Chennai','ravi@x.in'),(3,'Meena','Pune','meena@x.in');
INSERT INTO orders VALUES
 (1,1,1200,'paid','2026-10-02'),(2,1,800,'paid','2026-10-15'),(3,2,450,'pending','2026-10-16'),
 (4,2,2300,'paid','2026-11-01'),(5,3,150,'cancelled','2026-11-03'),(6,1,990,'paid','2026-11-05');
""")
for attempt in ["INSERT INTO orders VALUES (7, 99, 10, 'paid', '2026-11-06')",          # no such customer
                "INSERT INTO orders VALUES (7, 1, -5, 'paid', '2026-11-06')",           # negative amount
                "INSERT INTO customers VALUES (4, 'Dup', 'Delhi', 'asha@x.in')"]:        # duplicate email
    try:
        db.execute(attempt)
    except sqlite3.IntegrityError as exc:
        print("rejected:", exc)
```

## SQL you must be fluent in

```python run
import sqlite3
db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, amount NUMERIC, status TEXT, created_at TEXT);
INSERT INTO customers VALUES (1,'Asha','Pune'),(2,'Ravi','Chennai'),(3,'Meena','Pune'),(4,'Karan','Delhi');
INSERT INTO orders VALUES
 (1,1,1200,'paid','2026-10-02'),(2,1,800,'paid','2026-10-15'),(3,2,450,'pending','2026-10-16'),
 (4,2,2300,'paid','2026-11-01'),(5,3,150,'cancelled','2026-11-03'),(6,1,990,'paid','2026-11-05');
""")
def show(title, sql):
    print(title)
    for row in db.execute(sql):
        print("  ", row)

show("1. Filter, sort, limit",
     "SELECT id, amount FROM orders WHERE status = 'paid' AND amount > 900 ORDER BY amount DESC LIMIT 2")

show("2. INNER JOIN: only customers with orders",
     "SELECT c.name, o.amount FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'paid'")

show("3. LEFT JOIN: keep customers with no orders (count is 0)",
     "SELECT c.name, COUNT(o.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id")

show("4. GROUP BY with HAVING: cities whose paid total exceeds 2000",
     """SELECT c.city, COUNT(*) AS n, SUM(o.amount) AS total
        FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.status = 'paid' GROUP BY c.city HAVING SUM(o.amount) > 2000""")

show("5. Subquery: orders above the average amount",
     "SELECT id, amount FROM orders WHERE amount > (SELECT AVG(amount) FROM orders)")

show("6. CTE: name a step, then use it",
     """WITH paid AS (SELECT customer_id, SUM(amount) AS total FROM orders WHERE status = 'paid' GROUP BY customer_id)
        SELECT c.name, paid.total FROM paid JOIN customers c ON c.id = paid.customer_id ORDER BY total DESC""")

show("7. Window functions: running total and rank per customer",
     """SELECT customer_id, created_at, amount,
               SUM(amount) OVER (PARTITION BY customer_id ORDER BY created_at) AS running,
               RANK() OVER (PARTITION BY customer_id ORDER BY amount DESC) AS rnk
        FROM orders WHERE status = 'paid'""")

show("8. CASE: bucket values",
     "SELECT id, CASE WHEN amount >= 1000 THEN 'large' WHEN amount >= 500 THEN 'medium' ELSE 'small' END FROM orders")
```

The logical order in which a query runs is not the order you write it: `FROM` and `JOIN`, then `WHERE`, then `GROUP BY`, then `HAVING`, then `SELECT`, then `ORDER BY`, then `LIMIT`. That is why `WHERE` cannot use an aggregate and `HAVING` can.

| Join | Returns |
| --- | --- |
| INNER JOIN | Rows with a match on both sides |
| LEFT JOIN | Every row from the left table; NULLs where the right has no match |
| FULL OUTER JOIN | Every row from both sides |
| CROSS JOIN | Every combination |
| Self join | A table joined to itself, such as employee to manager |

Window functions compute across related rows without collapsing them: `ROW_NUMBER`, `RANK`, `LAG` and `LEAD` (previous and next row), and running aggregates. "Top 3 per group" and "change from the previous month" are window-function questions and are interview favourites.

## Indexes

Without an index the database reads every row to find matches (a full scan). An **index** is a separate sorted structure, usually a B-tree, that maps column values to row locations, so a lookup takes O(log n).

```python run
import sqlite3, time, random
db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, ts INTEGER)")
db.executemany("INSERT INTO events (user_id, kind, ts) VALUES (?, ?, ?)",
               [(random.randint(1, 50_000), random.choice(["view", "click", "buy"]), i) for i in range(300_000)])

def timed(label):
    start = time.perf_counter()
    for uid in range(1, 201):
        db.execute("SELECT COUNT(*) FROM events WHERE user_id = ?", (uid,)).fetchone()
    print(f"{label}: {(time.perf_counter() - start) * 1000:7.1f} ms for 200 lookups")
    print("   plan:", db.execute("EXPLAIN QUERY PLAN SELECT * FROM events WHERE user_id = 7").fetchone()[3])

timed("without index")
db.execute("CREATE INDEX idx_events_user ON events (user_id, ts)")
timed("with index   ")
```

Rules:

- Index columns used in `WHERE`, `JOIN` and `ORDER BY`.
- A **composite index** on `(user_id, ts)` serves queries on `user_id` alone, and on `user_id` with `ts`. It does not serve a query on `ts` alone. The order of columns matters; put equality columns first and the range or sort column last.
- A **covering index** contains every column the query needs, so the table itself is never read.
- Every index slows down inserts and updates and uses disk space. Do not index everything.
- Wrapping a column in a function (`WHERE LOWER(email) = ...`) or a leading wildcard (`LIKE '%abc'`) prevents normal index use.
- Read the plan: `EXPLAIN ANALYZE` in PostgreSQL shows whether the database chose an index scan or a sequential scan and how long each step took.

## Transactions and ACID

A transaction groups statements so that all of them happen or none do.

```python run
import sqlite3
db = sqlite3.connect(":memory:")
db.executescript("CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER CHECK (balance >= 0)); INSERT INTO accounts VALUES (1, 1000), (2, 200);")

def transfer(src, dst, amount):
    try:
        with db:                                  # BEGIN ... COMMIT, or ROLLBACK on any exception
            db.execute("UPDATE accounts SET balance = balance + ? WHERE id = ?", (amount, dst))
            db.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", (amount, src))
        return "committed"
    except sqlite3.IntegrityError:
        return "rolled back: insufficient funds"

print(transfer(1, 2, 300), db.execute("SELECT * FROM accounts").fetchall())
print(transfer(1, 2, 5000), db.execute("SELECT * FROM accounts").fetchall())   # credit is undone too
```

- **Atomicity**: all or nothing, as shown.
- **Consistency**: constraints hold before and after.
- **Isolation**: concurrent transactions do not see each other's half-finished work.
- **Durability**: once committed, the data survives a crash, because the change is first appended to a write-ahead log on disk.

### Isolation levels

| Level | Prevents | Still possible |
| --- | --- | --- |
| Read uncommitted | Nothing | Dirty reads: seeing data that is later rolled back |
| Read committed (PostgreSQL default) | Dirty reads | Non-repeatable reads: the same query returns different rows within one transaction |
| Repeatable read | Plus non-repeatable reads | Some write skew anomalies |
| Serializable | Everything: behaves as if transactions ran one at a time | More aborted transactions that you must retry |

PostgreSQL uses **MVCC** (multi-version concurrency control): a write creates a new version of the row, so readers never block writers.

### The lost update problem

Two requests read stock = 1, both decide it is available, both write stock = 0. One sale was lost. Three fixes:

```sql
-- 1. Atomic statement: check and change in one step. Zero rows updated means sold out.
UPDATE stock SET qty = qty - 1 WHERE item_id = 42 AND qty > 0;

-- 2. Pessimistic lock: others wait until this transaction ends.
BEGIN;
SELECT qty FROM stock WHERE item_id = 42 FOR UPDATE;
UPDATE stock SET qty = qty - 1 WHERE item_id = 42;
COMMIT;

-- 3. Optimistic lock: a version column; retry if someone else changed the row first.
UPDATE stock SET qty = 0, version = version + 1 WHERE item_id = 42 AND version = 7;
```

Use optimistic locking when conflicts are rare and pessimistic locking when they are common.

## Working with a database from code

- **Always use parameters** (`?` or `%s` placeholders). Building SQL with string formatting allows SQL injection.
- An **ORM** (SQLAlchemy, Django ORM) maps rows to objects. It is convenient and it hides slow queries, so log the SQL it generates.
- The **N+1 problem**: one query loads 100 orders, then 100 more queries load each order's customer. Fix with a join or eager loading.
- **Migrations** (Alembic, Flyway, Django migrations) are versioned scripts that change the schema. Never alter production tables by hand.
- A **connection pool** reuses connections, because opening one is slow and databases support a limited number. PgBouncer pools in front of PostgreSQL for many app instances.

```python run
import sqlite3
db = sqlite3.connect(":memory:")
db.executescript("CREATE TABLE users (name TEXT, role TEXT); INSERT INTO users VALUES ('asha','admin'),('ravi','viewer');")
user_input = "nobody' OR '1'='1"

unsafe = f"SELECT name, role FROM users WHERE name = '{user_input}'"
print("string-built query leaks everything:", db.execute(unsafe).fetchall())
print("parameterised query returns nothing:", db.execute("SELECT name, role FROM users WHERE name = ?", (user_input,)).fetchall())
```

## NoSQL families

| Type | Examples | Data shape | Good for |
| --- | --- | --- | --- |
| Key-value | Redis, DynamoDB | Key to value | Sessions, caches, shopping carts |
| Document | MongoDB, Firestore | JSON documents | Catalogues and content with varied fields |
| Wide-column | Cassandra, ScyllaDB, HBase | Rows grouped by partition key, sorted within | Huge write volume, time-ordered data, chat history |
| Graph | Neo4j | Nodes and edges | Social graphs, fraud rings, recommendations |
| Search | Elasticsearch, OpenSearch | Inverted index | Full-text search, log analysis |
| Time-series | TimescaleDB, InfluxDB | Timestamped points | Metrics, sensor data |
| Vector | pgvector, Qdrant, Pinecone | Embeddings | Semantic search and RAG |

NoSQL stores usually give up joins and multi-row transactions in exchange for horizontal scale and flexible schemas. You design the tables around the queries you will run, not around the entities. In Cassandra you would create one table per query pattern and accept duplicated data.

**SQL or NoSQL?** Choose relational when you need joins, transactions and ad-hoc queries, which is most business applications. Choose NoSQL when you have a clear access pattern at a scale one relational node cannot serve, or data that truly has no fixed shape.

## Scaling a database, in the order you should try

1. **Fix queries and add indexes.** This solves most problems.
2. **Scale up**: a bigger machine.
3. **Cache** hot reads ([next lesson](#be-cache-queues)).
4. **Read replicas**: the primary takes writes and streams them to copies that serve reads.
5. **Partition** a big table by time or key inside one database.
6. **Shard** across several databases. Last resort.

Replication, sharding and consistency are covered in depth in [data at scale](#sd-data-at-scale).

## OLTP and OLAP

- **OLTP** (PostgreSQL, MySQL): many small reads and writes for the live application; stored by row.
- **OLAP** (BigQuery, Snowflake, Redshift, ClickHouse, DuckDB): scans over billions of rows for analytics; stored by column so that summing one column reads only that column.

Data flows from OLTP systems to an OLAP warehouse through ETL or ELT pipelines.

## Check yourself

```quiz
[
  {"q": "You want every customer listed, including those with zero orders. Which join?", "options": ["INNER JOIN", "LEFT JOIN from customers to orders", "CROSS JOIN"], "answer": 1, "why": "LEFT JOIN keeps unmatched rows from the left table."},
  {"q": "An index exists on `(user_id, created_at)`. Which query cannot use it efficiently?", "options": ["`WHERE user_id = 5`", "`WHERE user_id = 5 ORDER BY created_at`", "`WHERE created_at > '2026-01-01'`"], "answer": 2, "why": "A composite index is usable from its leftmost column."},
  {"q": "A transfer debits one account and the server crashes before crediting the other. Which ACID property protects you?", "options": ["Atomicity", "Isolation", "Durability"], "answer": 0, "why": "The incomplete transaction is rolled back as a whole."},
  {"q": "What is the N+1 query problem?", "options": ["One query returns N+1 rows", "One query for a list, then one extra query per item", "A table with N+1 columns"], "answer": 1, "why": "It usually comes from lazy loading in an ORM and is fixed with a join or eager loading."},
  {"q": "Why do `WHERE` filters and `HAVING` filters differ?", "options": ["They are identical", "`WHERE` filters rows before grouping; `HAVING` filters groups after aggregation", "`HAVING` is faster"], "answer": 1, "why": "Aggregates do not exist yet when `WHERE` runs."},
  {"q": "Why are parameterised queries essential?", "options": ["They are shorter", "The driver sends data separately from SQL, so input cannot change the query's structure", "They create indexes"], "answer": 1, "why": "That is the defence against SQL injection."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

Tasks 1 to 3 use this small shop database (SQLite, in memory). Money is stored as whole numbers.

```
customers(id INTEGER PRIMARY KEY, name TEXT)
orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER)
```

`order_date` looks like `2024-01-20`.

````task
id: revenue-per-customer
title: Revenue per customer (join and group by)
kind: code
level: easy
@@statement
Write `revenue_per_customer(conn)` that runs one SQL query on an open `sqlite3` connection and returns the total revenue of every customer.

**Input**: `conn`, a `sqlite3.Connection` with the `customers` and `orders` tables above.

**Output**: a list of `(name, revenue)` tuples.
- `revenue` is the sum of that customer's order totals.
- Customers with **no orders** must appear with revenue `0` (use a `LEFT JOIN` and `COALESCE`).
- Sort by revenue, highest first. Break ties by name, A to Z.

**Example**

```
customers: 1 Ana, 2 Ben, 3 Cy      orders: Ana 100+300, Ben 50, Cy none
revenue_per_customer(conn) -> [('Ana', 400), ('Ben', 50), ('Cy', 0)]
```
@@starter
import sqlite3

def revenue_per_customer(conn):
    # run ONE query and return the rows as a list of tuples
    pass
@@tests
import sqlite3

def _make():
    c = sqlite3.connect(":memory:")
    c.executescript("""
    CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER);
    INSERT INTO customers VALUES (1,'Ana'),(2,'Ben'),(3,'Cy');
    INSERT INTO orders VALUES (1,1,'2024-01-05',100),(2,1,'2024-01-20',300),(3,1,'2024-02-02',200),
        (4,2,'2024-01-15',50),(5,2,'2024-02-10',50),(6,1,'2024-03-01',300);
    """)
    return c

_c = _make()
assert revenue_per_customer(_c) == [("Ana", 900), ("Ben", 100), ("Cy", 0)], "sum, order and zero for no orders"
_c.execute("INSERT INTO customers VALUES (4,'Abe')")
_c.execute("INSERT INTO orders VALUES (7,4,'2024-04-01',100)")
assert revenue_per_customer(_c) == [("Ana", 900), ("Abe", 100), ("Ben", 100), ("Cy", 0)], "ties sorted by name"
_e = sqlite3.connect(":memory:")
_e.executescript("CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER);")
assert revenue_per_customer(_e) == [], "empty database"
assert isinstance(revenue_per_customer(_c)[0], tuple), "rows are tuples"
@@hint
`SELECT c.name, COALESCE(SUM(o.total), 0) ... FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id`, then `ORDER BY` two columns.
@@solution
import sqlite3

def revenue_per_customer(conn):
    rows = conn.execute("""
        SELECT c.name, COALESCE(SUM(o.total), 0) AS revenue
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY revenue DESC, c.name ASC
    """).fetchall()
    return [tuple(r) for r in rows]
````

````task
id: top-two-orders
title: Top 2 orders per customer
kind: code
level: medium
@@statement
Write `top_two_orders(conn)` that returns each customer's two biggest orders, using a **window function** (`ROW_NUMBER() OVER (PARTITION BY ...)`) inside a subquery or CTE.

**Input**: `conn` with the shop tables above.

**Output**: a list of `(customer_id, order_id, total)` tuples.
- Rank each customer's orders by `total` from highest to lowest. If totals are equal, the **smaller order id** ranks first.
- Keep ranks 1 and 2 only. A customer with one order gives one row. A customer with no orders gives no rows.
- Sort the result by `customer_id`, then by rank.

**Example**

```
Ana (id 1) has orders #1=100, #2=300, #3=200, #6=300
top_two_orders(conn) starts with (1, 2, 300), (1, 6, 300)
```
@@starter
import sqlite3

def top_two_orders(conn):
    pass
@@tests
import sqlite3

def _make():
    c = sqlite3.connect(":memory:")
    c.executescript("""
    CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER);
    INSERT INTO customers VALUES (1,'Ana'),(2,'Ben'),(3,'Cy');
    INSERT INTO orders VALUES (1,1,'2024-01-05',100),(2,1,'2024-01-20',300),(3,1,'2024-02-02',200),
        (4,2,'2024-01-15',50),(5,2,'2024-02-10',50),(6,1,'2024-03-01',300);
    """)
    return c

_c = _make()
assert top_two_orders(_c) == [(1, 2, 300), (1, 6, 300), (2, 4, 50), (2, 5, 50)], "two per customer, tie by order id"
_c.execute("INSERT INTO orders VALUES (7,3,'2024-05-01',10)")
assert (3, 7, 10) in top_two_orders(_c), "single order customer"
_c.execute("INSERT INTO orders VALUES (8,2,'2024-05-02',500)")
_r = top_two_orders(_c)
assert [x for x in _r if x[0] == 2] == [(2, 8, 500), (2, 4, 50)], "a bigger order pushes others down"
assert _r == sorted(_r, key=lambda x: x[0]), "sorted by customer id"
@@hint
`ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY total DESC, id ASC) AS rn` in a CTE, then `WHERE rn <= 2 ORDER BY customer_id, rn`.
@@solution
import sqlite3

def top_two_orders(conn):
    rows = conn.execute("""
        WITH ranked AS (
            SELECT customer_id, id, total,
                   ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY total DESC, id ASC) AS rn
            FROM orders
        )
        SELECT customer_id, id, total FROM ranked WHERE rn <= 2 ORDER BY customer_id, rn
    """).fetchall()
    return [tuple(r) for r in rows]
````

````task
id: month-over-month
title: Month-over-month revenue change
kind: code
level: medium
@@statement
Write `monthly_change(conn)` that computes revenue per month and the change against the previous month, using the window function `LAG`.

**Input**: `conn` with the shop tables above.

**Output**: a list of `(month, revenue, change)` tuples, oldest month first.
- `month` is the first 7 characters of `order_date`, like `'2024-01'` (use `substr`).
- `revenue` is the sum of `total` in that month.
- `change` is `revenue - previous month's revenue`. For the first month it is `None`.
- Only months that have orders appear. Compare with the previous **listed** month. No orders gives `[]`.

**Example**

```
Jan 450, Feb 250, Mar 300
monthly_change(conn) -> [('2024-01', 450, None), ('2024-02', 250, -200), ('2024-03', 300, 50)]
```
@@starter
import sqlite3

def monthly_change(conn):
    pass
@@tests
import sqlite3

def _make():
    c = sqlite3.connect(":memory:")
    c.executescript("""
    CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER);
    INSERT INTO customers VALUES (1,'Ana'),(2,'Ben'),(3,'Cy');
    INSERT INTO orders VALUES (1,1,'2024-01-05',100),(2,1,'2024-01-20',300),(3,1,'2024-02-02',200),
        (4,2,'2024-01-15',50),(5,2,'2024-02-10',50),(6,1,'2024-03-01',300);
    """)
    return c

_c = _make()
assert monthly_change(_c) == [("2024-01", 450, None), ("2024-02", 250, -200), ("2024-03", 300, 50)], "three months"
_c.execute("INSERT INTO orders VALUES (7,3,'2024-06-10',1000)")
_r = monthly_change(_c)
assert _r[-1] == ("2024-06", 1000, 700), "gap month compared with previous listed month"
assert len(_r) == 4, "empty months are not listed"
_e = sqlite3.connect(":memory:")
_e.execute("CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER)")
assert monthly_change(_e) == [], "no orders"
_e.execute("INSERT INTO orders VALUES (1,1,'2023-12-31',70)")
assert monthly_change(_e) == [("2023-12", 70, None)], "single month"
@@hint
First a CTE that does `GROUP BY substr(order_date, 1, 7)`. Then `revenue - LAG(revenue) OVER (ORDER BY month)`.
@@solution
import sqlite3

def monthly_change(conn):
    rows = conn.execute("""
        WITH m AS (
            SELECT substr(order_date, 1, 7) AS month, SUM(total) AS revenue
            FROM orders GROUP BY substr(order_date, 1, 7)
        )
        SELECT month, revenue, revenue - LAG(revenue) OVER (ORDER BY month) AS change
        FROM m ORDER BY month
    """).fetchall()
    return [tuple(r) for r in rows]
````

````task
id: index-query-plan
title: Add an index and compare query plans
kind: code
level: medium
@@statement
Write `explain_before_after(conn)` that proves an index helps a lookup, by comparing the SQLite query plans.

**Input**: `conn` with the `orders` table (schema above), holding thousands of rows and **no index** on `customer_id`.

**What to do**
1. Take the query `SELECT * FROM orders WHERE customer_id = 7`.
2. Get its plan with `EXPLAIN QUERY PLAN <query>`. Join the `detail` column (the last column) of all plan rows with `" | "`. This is `before`.
3. Create the index `idx_orders_customer` on `orders(customer_id)`.
4. Get the plan again the same way. This is `after`.

**Output**: the tuple `(before, after)` of two strings. `before` shows a full table scan (contains `SCAN`). `after` mentions `idx_orders_customer`.

**Example**

```
before: "SCAN orders"
after:  "SEARCH orders USING INDEX idx_orders_customer (customer_id=?)"
```
@@starter
import sqlite3

QUERY = "SELECT * FROM orders WHERE customer_id = 7"

def explain_before_after(conn):
    pass
@@tests
import sqlite3

_c = sqlite3.connect(":memory:")
_c.execute("CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, total INTEGER)")
_c.executemany("INSERT INTO orders(customer_id, order_date, total) VALUES (?, '2024-01-01', ?)",
               [(i % 50, i) for i in range(5000)])
_res = explain_before_after(_c)
assert isinstance(_res, tuple) and len(_res) == 2, "returns a tuple of two"
_before, _after = _res
assert isinstance(_before, str) and isinstance(_after, str), "plans are strings"
assert "SCAN" in _before.upper(), "before: full scan"
assert "idx_orders_customer" in _after, "after: the new index is used"
_names = [r[1] for r in _c.execute("PRAGMA index_list(orders)")]
assert "idx_orders_customer" in _names, "index really exists"
@@hint
`conn.execute("EXPLAIN QUERY PLAN " + QUERY).fetchall()` returns rows like `(id, parent, notused, detail)`. Use `row[-1]`.
@@solution
import sqlite3

QUERY = "SELECT * FROM orders WHERE customer_id = 7"

def _plan(conn):
    rows = conn.execute("EXPLAIN QUERY PLAN " + QUERY).fetchall()
    return " | ".join(str(r[-1]) for r in rows)

def explain_before_after(conn):
    before = _plan(conn)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)")
    after = _plan(conn)
    return before, after
````

````task
id: lost-update
title: Reproduce and fix a lost update
kind: code
level: hard
@@statement
Two connections to the same SQLite file both add 1 to the same counter. If each one **reads, then writes**, one update is lost. Write two functions that show the bug and the fix. The helpers `fresh_db(path)` and `_read(path)` are given: `fresh_db` creates a file with table `counter(id INTEGER PRIMARY KEY, value INTEGER)` and one row `(1, 0)`; `_read` returns the current value.

1. `lost_update_demo(path)`: call `fresh_db(path)`, open connections `c1` and `c2`. Both read the value (`SELECT value FROM counter WHERE id = 1`). Then `c1` writes `value + 1` (using the number it read) and commits. Then `c2` does the same with its old number and commits. Close both. Return the final value.
2. `atomic_update_demo(path)`: the same two clients on a fresh file, but each runs `UPDATE counter SET value = value + 1 WHERE id = 1` and commits (no separate read). Return the final value.

**Output**: both return an `int`. The first is `1` (one update lost), the second is `2`.

**Example**

```
lost_update_demo("demo.db")     -> 1
atomic_update_demo("demo.db")   -> 2
```
@@starter
import os
import sqlite3

def fresh_db(path):
    if os.path.exists(path):
        os.remove(path)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE counter(id INTEGER PRIMARY KEY, value INTEGER)")
    conn.execute("INSERT INTO counter VALUES (1, 0)")
    conn.commit()
    conn.close()

def _read(path):
    conn = sqlite3.connect(path)
    value = conn.execute("SELECT value FROM counter WHERE id = 1").fetchone()[0]
    conn.close()
    return value

def lost_update_demo(path):
    fresh_db(path)
    # TODO: c1 and c2 both read, then both write value + 1
    pass

def atomic_update_demo(path):
    fresh_db(path)
    # TODO: two UPDATE ... SET value = value + 1
    pass
@@tests
_p = "lost_update_test.db"
assert lost_update_demo(_p) == 1, "read-then-write loses one update"
assert atomic_update_demo(_p) == 2, "atomic UPDATE keeps both"
assert lost_update_demo(_p) == 1, "demo can be repeated on a fresh file"
assert _read(_p) == 1, "database holds the final value"
try:
    os.remove(_p)
except OSError:
    pass
@@hint
In the unsafe version, read with both connections first and keep the numbers in variables; write `seen1 + 1` and `seen2 + 1` afterwards. Do not forget `commit()`.
@@solution
import os
import sqlite3

def fresh_db(path):
    if os.path.exists(path):
        os.remove(path)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE counter(id INTEGER PRIMARY KEY, value INTEGER)")
    conn.execute("INSERT INTO counter VALUES (1, 0)")
    conn.commit()
    conn.close()

def _read(path):
    conn = sqlite3.connect(path)
    value = conn.execute("SELECT value FROM counter WHERE id = 1").fetchone()[0]
    conn.close()
    return value

def lost_update_demo(path):
    fresh_db(path)
    c1 = sqlite3.connect(path)
    c2 = sqlite3.connect(path)
    seen1 = c1.execute("SELECT value FROM counter WHERE id = 1").fetchone()[0]
    seen2 = c2.execute("SELECT value FROM counter WHERE id = 1").fetchone()[0]
    c1.execute("UPDATE counter SET value = ? WHERE id = 1", (seen1 + 1,))
    c1.commit()
    c2.execute("UPDATE counter SET value = ? WHERE id = 1", (seen2 + 1,))
    c2.commit()
    c1.close()
    c2.close()
    return _read(path)

def atomic_update_demo(path):
    fresh_db(path)
    c1 = sqlite3.connect(path)
    c2 = sqlite3.connect(path)
    c1.execute("UPDATE counter SET value = value + 1 WHERE id = 1")
    c1.commit()
    c2.execute("UPDATE counter SET value = value + 1 WHERE id = 1")
    c2.commit()
    c1.close()
    c2.close()
    return _read(path)
````

````task
id: explain-analyze-reading
title: Read an EXPLAIN ANALYZE plan
kind: text
level: medium
@@statement
You run this on PostgreSQL. The table `orders` has 2,000,000 rows and no index on `customer_id`.

```
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;

Gather  (cost=1000.00..28500.00 rows=40 width=48) (actual time=0.9..210.4 rows=38 loops=1)
  Workers Planned: 2
  ->  Parallel Seq Scan on orders  (cost=0.00..27496.00 rows=17 width=48)
        (actual time=3.1..205.7 rows=13 loops=3)
        Filter: (customer_id = 42)
        Rows Removed by Filter: 666654
Execution Time: 211.0 ms
```

Write 8-15 lines that contain:
1. What the plan does and why it is slow (cite two numbers from the output).
2. The exact `CREATE INDEX` statement you would run.
3. What you expect the new plan node to be called and roughly how the execution time and "Rows Removed by Filter" change.
4. One downside of adding this index on a busy table.
@@hint
Compare how many rows are read with how many rows are returned. Think about what an index must be updated on.
@@solution
The plan scans the whole table (Parallel Seq Scan) with 3 loops, each worker reading about 667,000 rows and discarding them (Rows Removed by Filter: 666,654 per loop, about 2 million in total). Only 38 rows match, so more than 99.99 percent of the work is wasted. That is why a point lookup takes 211 ms.

Fix: `CREATE INDEX idx_orders_customer_id ON orders (customer_id);` (on a live system use `CREATE INDEX CONCURRENTLY` to avoid blocking writes).

Expected new plan: an `Index Scan`, or a `Bitmap Heap Scan` over a `Bitmap Index Scan`, using `idx_orders_customer_id` with `Index Cond: (customer_id = 42)`. "Rows Removed by Filter" should drop to 0, and execution time should fall from about 211 ms to well under 1 ms, because only the 38 matching rows are touched.

Downside: every INSERT, DELETE and UPDATE of `customer_id` must also update the index, so writes get slower, and the index uses extra disk and memory (for 2 million rows roughly 40-60 MB). Run `ANALYZE` afterwards so the planner has fresh statistics.
@@criteria
- Identifies the sequential scan and uses numbers such as about 2 million rows scanned versus 38 returned, or 666,654 rows removed per loop.
- Gives a correct `CREATE INDEX ... ON orders (customer_id)` statement.
- Predicts an Index Scan or Bitmap Index Scan with an `Index Cond`, and a large drop in time and rows removed.
- Names a real cost of the index: slower writes, extra storage, or locking during creation.
````
