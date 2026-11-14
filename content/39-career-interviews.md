---
id: career-interviews
title: Interview preparation
minutes: 40
---

Software and AI engineering interviews test a known set of things in a known set of rounds. This lesson describes each round, how it is graded, and how to prepare, with the questions that come up most.

## The rounds

| Round | What is asked | How to prepare |
| --- | --- | --- |
| Online assessment / coding | Two or three DSA problems under time pressure | 150 to 250 problems by pattern, from the [DSA module](#dsa-complexity-arrays) |
| Computer science fundamentals | Operating systems, databases, networking, object-oriented design | [OS](#cs-os-concurrency), [Networking](#cs-networking), [Databases](#be-databases) |
| Low-level design | Design the classes for a parking lot, an expense splitter, a rate limiter | [Low-level design](#sd-lld) |
| High-level system design | Design a URL shortener, a chat system, a feed. More weight for experienced hires | The whole [System design module](#sd-method) |
| Project deep-dive | Why this database? What broke? How would it scale? What did you measure? | Know every decision and number in your projects |
| AI engineering rounds | Design a RAG system or an agent; how to evaluate it; reducing hallucination, cost, latency | The [AI module](#ai-llm-apis) from LLM APIs onward |
| Machine learning rounds | Bias and variance, metrics, leakage, a modelling case study | [Classical ML](#ai-classical-ml), [Deep learning](#ai-deep-learning) |
| Behavioural | Conflict, failure, ownership, why this role | Five prepared stories |

## The coding round

### What is being graded

- **Correctness**, including edge cases.
- **Complexity**: can you find and state an efficient solution?
- **Communication**: do you think aloud, ask about constraints, and explain trade-offs?
- **Code quality**: readable names, small steps, no mess.
- **Testing**: do you trace your code on an example and find your own bugs?

A candidate who reaches a working solution while explaining clearly usually beats one who silently writes the optimal one.

### The routine for every problem

1. **Restate** the problem. Ask about input size, value ranges, duplicates, empty input, and what to return when there is no answer.
2. **Work an example by hand**, then a tricky one.
3. **State the brute force** and its complexity.
4. **Improve it**: name the pattern (hash map, two pointers, sliding window, binary search, BFS, DP…). Say the complexity before coding.
5. **Write the code**, speaking as you go.
6. **Trace it** on your example. Check empty input, one element, and the largest case.
7. **State time and space complexity.** Mention what you would do with more time.

### A preparation schedule

| Weeks | Topics | Problems |
| --- | --- | --- |
| 1 to 2 | Arrays, strings, hashing, two pointers, sliding window | 40 |
| 3 to 4 | Stacks, queues, linked lists, binary search, sorting | 35 |
| 5 to 6 | Trees, heaps, tries | 35 |
| 7 to 8 | Graphs: BFS, DFS, topological sort, union-find, shortest paths | 30 |
| 9 to 10 | Backtracking, dynamic programming, greedy | 40 |
| 11 to 12 | Mixed timed sets and mock interviews | 30 |

Do problems by pattern, not at random. When stuck for 25 minutes, read the solution, understand it, close it, and write it from memory the next day. Keep a list of problems you could not solve and repeat them a week later.

## Computer science fundamentals: the questions

**Operating systems**

- Process and thread: differences, and when to use each.
- What happens during a context switch?
- What is a deadlock, the four conditions, and how do you prevent one?
- Mutex and semaphore.
- Virtual memory and paging.
- Concurrency and parallelism; Python's global interpreter lock.

**Databases**

- ACID, with an example of each property.
- What is an index, how does a B-tree index work, and what does it cost?
- Isolation levels and the anomalies each prevents.
- Normalisation, and when to denormalise.
- SQL: joins, group by with having, window functions, "second highest salary", "top N per group".
- SQL and NoSQL: how to choose.
- How would you find and fix a slow query?

**Networking**

- What happens when you type a URL and press Enter?
- TCP and UDP. The three-way handshake.
- How HTTPS and TLS work.
- HTTP methods, status codes, statelessness, cookies.
- DNS resolution.
- REST, and how it differs from gRPC and GraphQL.

**Object-oriented design**

- The four pillars with examples.
- SOLID principles.
- Composition and inheritance.
- Three design patterns you have used, and where.

Answer each in the same shape: a one-sentence definition, how it works, a concrete example, and a trade-off.

## System design rounds

Use the six steps from [the method lesson](#sd-method) every time. Graders look for:

- **Requirements first**. Candidates who start drawing immediately lose points.
- **Numbers**. A quick estimate that drives a decision.
- **A clear walk through the read path and the write path.**
- **Trade-offs said aloud**, with the reason for each choice.
- **Depth somewhere**. Go deep on two or three hard parts.
- **Failure handling**. What happens when a component dies?

Sentences worth having ready:

- "Reads outnumber writes by about 100 to 1, so I will optimise the read path with a cache and replicas."
- "This data needs strong consistency because it is money; the feed can be eventually consistent."
- "The bottleneck at ten times the load would be the database writes; I would shard by user ID."
- "If the cache is down we fall back to the database with a rate limit to protect it."

The sixteen worked designs in this course cover the questions asked most. Practise each on paper with a 35-minute timer.

## AI engineering rounds

Expect a mixture of concept questions and a design exercise.

**Concepts**

- How does an LLM generate text? Tokens, attention, sampling, temperature.
- What is a context window, and how do you manage a long conversation?
- What is hallucination, and how do you reduce it?
- Explain RAG end to end. How do you chunk? Why hybrid search? What does a reranker do?
- How do you evaluate a RAG system? Which metrics for retrieval and which for generation?
- When would you fine-tune instead of using RAG or a better prompt? What is LoRA?
- What is tool calling? Describe the agent loop.
- Workflow and agent: the difference, and when to prefer each.
- What is MCP and what problem does it solve?
- What is prompt injection, and how do you defend against it?
- How do you control cost and latency in an LLM product?

**A typical design exercise**: "Design a support assistant that answers from our documentation and can look up order status."

A strong answer covers: requirements and success metrics; the ingestion pipeline; retrieval with hybrid search and permissions; the tool for order status with validation; streaming; the evaluation set and how it runs in CI; tracing and cost monitoring; guardrails for injection and for actions; the fallback when the model provider is down. The [LLM product design](#sd-cases-3) is a full worked version.

**What distinguishes strong candidates**: they talk about evaluation unprompted, they know where these systems fail, and they treat the model as one unreliable component inside a normal software system.

## Machine learning rounds

- Bias and variance; overfitting and how to detect and reduce it.
- Precision, recall, F1, ROC-AUC; which to use for imbalanced data and why.
- Data leakage: examples and prevention.
- How gradient descent works; the learning rate.
- How a decision tree chooses a split; random forest and gradient boosting.
- Regularisation: L1 and L2.
- Cross-validation, and the right way to split time series.
- How backpropagation works; why activation functions are needed.
- A case study: "How would you build a model to detect defective parts?" Structure the answer as problem and metric, data and labels, baseline, features, model, evaluation, deployment, monitoring.

## The project deep-dive

Interviewers probe to find out whether you built it and understood it. Prepare for each project:

- **A two-minute overview**: the problem, what you built, the result.
- **The architecture**, drawn from memory.
- **Three decisions** and their alternatives: "I chose PostgreSQL over MongoDB because…".
- **The hardest bug** and how you found it.
- **What you measured.**
- **What you would do differently**, and how it would scale to a hundred times the load.

If you used an AI assistant to write part of a project, make sure you can explain every line anyway. "The assistant wrote that part" ends an interview.

## Behavioural rounds

Prepare five stories in the **STAR** shape: the **S**ituation, your **T**ask, the **A**ction you took, the **R**esult with a number where possible.

| Theme | A question it answers |
| --- | --- |
| A technical challenge you solved | "Tell me about a hard problem." |
| A failure or mistake | "Tell me about a time you failed." What you learned matters most |
| A disagreement | "Tell me about a conflict with a colleague." |
| Taking initiative | "Tell me about going beyond your role." |
| Learning something quickly | "Tell me about picking up a new skill." |

Speak about what **you** did, not what "we" did. Have a clear, honest answer for "why this role?" and "why are you moving from your current work?" that points forward to what you want to build.

## Resume

- **One page** for early-career candidates.
- **Order**: contact and links; skills grouped by area; projects; experience; education.
- **Each point**: a strong verb, what you did, a measured result. "Built a retrieval pipeline with hybrid search that raised recall@5 from 0.61 to 0.88 on a 50-question evaluation set."
- **Only list technologies you can be questioned on.**
- **Links that work**: GitHub with pinned projects and good READMEs; a deployed demo where possible.
- **Match the job description's vocabulary** where it is true for you; many companies filter by keywords.

## On the day

- For remote rounds, test your editor, microphone and connection beforehand.
- Think aloud. Silence gives the interviewer nothing to grade.
- When stuck, say what you are considering and why it does not work yet. Hints are normal and using one well counts for you.
- If you do not know something, say so, then reason towards an answer from what you do know.
- Ask questions at the end: about the team's work, the on-call load, how they evaluate their AI features, what a successful first six months looks like.

## Check yourself

```quiz
[
  {"q": "In a coding interview you see the optimal solution immediately. What should you do first?", "options": ["Start typing silently", "Clarify constraints and state your approach and its complexity aloud", "Ask for a harder problem"], "answer": 1, "why": "Communication and verifying assumptions are graded, and they prevent solving the wrong problem."},
  {"q": "What do system design interviewers most want to hear?", "options": ["Many technology names", "Requirements, numbers, and trade-offs with reasons", "A perfect final diagram"], "answer": 1, "why": "They are assessing judgment, not a memorised architecture."},
  {"q": "In an AI engineering interview, what sets strong candidates apart?", "options": ["Naming the newest model", "Explaining how they would evaluate the system and where it fails", "Avoiding the topic of cost"], "answer": 1, "why": "Evaluation and failure modes are what production AI work consists of."},
  {"q": "What is the STAR format for?", "options": ["Rating code quality", "Structuring behavioural answers: situation, task, action, result", "Estimating system load"], "answer": 1, "why": "It keeps stories concrete and focused on what you did."},
  {"q": "You are stuck on a problem for several minutes in an interview. Best move?", "options": ["Stay silent until you solve it", "Explain what you have tried and what blocks you; accept a hint", "Give up"], "answer": 1, "why": "Interviewers can only credit reasoning they can hear."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks). For the coding tasks, set a 25-minute timer and explain your approach out loud as you go.

````task
id: two-sum
title: Two sum
kind: code
level: easy
@@statement
Write `two_sum(nums, target)` that finds two different positions whose values add up to `target`.

**Input**: `nums` a list of integers (may be empty, may contain negatives and duplicates); `target` an integer.

**Output**: a list `[i, j]` with `i < j` and `nums[i] + nums[j] == target`. If several pairs exist, return the one with the smallest `j`, and for that `j` the smallest `i`. If there is no pair return `[]`. Do not use the same element twice. Aim for O(n) time using a dictionary.

**Example**

```
two_sum([2, 7, 11, 15], 9) -> [0, 1]
two_sum([3, 3], 6)         -> [0, 1]
two_sum([1, 2], 10)        -> []
```
@@starter
def two_sum(nums, target):
    # your code here
    pass
@@tests
assert two_sum([2, 7, 11, 15], 9) == [0, 1], "basic"
assert two_sum([3, 3], 6) == [0, 1], "duplicates"
assert two_sum([1, 2], 10) == [], "no pair"
assert two_sum([], 5) == [], "empty"
assert two_sum([5], 10) == [], "single element cannot pair with itself"
assert two_sum([-1, -2, -3, 4], 1) == [2, 3], "negatives"
assert two_sum([1, 4, 2, 3], 5) == [0, 1], "smallest j wins"
@@hint
Scan left to right, storing each value's first index in a dict; for each `x` look up `target - x` before storing `x`.
@@solution
def two_sum(nums, target):
    seen = {}
    for j, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], j]
        if x not in seen:
            seen[x] = j
    return []
````

````task
id: valid-brackets
title: Valid brackets
kind: code
level: easy
@@statement
Write `is_valid(s)` that checks whether the brackets in a string are balanced and properly nested.

**Input**: a string `s` that may contain `()`, `[]`, `{}` and any other characters (ignore the other characters).

**Output**: `True` or `False`. Every opening bracket must be closed by the same kind in the right order. The empty string is valid.

**Example**

```
is_valid("([]{})")   -> True
is_valid("(]")       -> False
is_valid("a(b)c")    -> True
is_valid("((")       -> False
```
@@starter
def is_valid(s):
    # your code here
    pass
@@tests
assert is_valid("([]{})") is True, "nested"
assert is_valid("(]") is False, "wrong kind"
assert is_valid("") is True, "empty"
assert is_valid("a(b)c") is True, "other characters ignored"
assert is_valid("((") is False, "unclosed"
assert is_valid(")(") is False, "closing first"
assert is_valid("{[}]") is False, "bad nesting"
@@hint
Use a list as a stack: push openers, and for a closer check that the stack is non-empty and its top is the matching opener.
@@solution
def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
````

````task
id: merge-intervals
title: Merge intervals
kind: code
level: medium
@@statement
Write `merge_intervals(intervals)` that merges overlapping intervals.

**Input**: a list of `[start, end]` pairs with `start <= end`, in any order. Intervals that touch (one ends exactly where the next starts) count as overlapping.

**Output**: a new sorted list of `[start, end]` lists with no overlaps. Do not modify the input. Empty input gives `[]`.

**Example**

```
merge_intervals([[1, 3], [8, 10], [2, 6]]) -> [[1, 6], [8, 10]]
merge_intervals([[1, 4], [4, 5]])          -> [[1, 5]]
```
@@starter
def merge_intervals(intervals):
    # your code here
    pass
@@tests
assert merge_intervals([[1, 3], [8, 10], [2, 6]]) == [[1, 6], [8, 10]], "unsorted input"
assert merge_intervals([[1, 4], [4, 5]]) == [[1, 5]], "touching intervals merge"
assert merge_intervals([]) == [], "empty"
assert merge_intervals([[5, 6]]) == [[5, 6]], "single"
assert merge_intervals([[1, 10], [2, 3], [4, 5]]) == [[1, 10]], "contained intervals"
_i = [[3, 4], [1, 2]]
merge_intervals(_i)
assert _i == [[3, 4], [1, 2]], "input unchanged"
@@hint
Sort by start, then compare each interval's start with the end of the last merged one. Append copies, not the original lists.
@@solution
def merge_intervals(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
````

````task
id: lru-cache
title: LRU cache
kind: code
level: medium
@@statement
Implement a class `LRUCache` with a fixed capacity that evicts the **least recently used** key.

**Methods**
- `LRUCache(capacity)`: `capacity >= 1`.
- `get(key)`: return the value, or `-1` if the key is absent. A hit makes the key the most recently used.
- `put(key, value)`: insert or update the key and make it the most recently used. If the cache then holds more than `capacity` keys, remove the least recently used one.

Both methods should run in O(1) on average.

**Example**

```
c = LRUCache(2)
c.put(1, "a"); c.put(2, "b")
c.get(1)       -> "a"      (key 2 is now least recent)
c.put(3, "c")               (evicts key 2)
c.get(2)       -> -1
```
@@starter
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        pass

    def get(self, key):
        pass

    def put(self, key, value):
        pass
@@tests
_c = LRUCache(2)
_c.put(1, "a"); _c.put(2, "b")
assert _c.get(1) == "a", "hit"
_c.put(3, "c")
assert _c.get(2) == -1, "key 2 evicted"
assert _c.get(1) == "a" and _c.get(3) == "c", "others remain"
_c.put(1, "z")
_c.put(4, "d")
assert _c.get(3) == -1 and _c.get(1) == "z", "update refreshes recency"
_d = LRUCache(1)
_d.put("x", 1)
_d.put("y", 2)
assert _d.get("x") == -1 and _d.get("y") == 2, "capacity 1"
assert LRUCache(3).get("none") == -1, "miss on empty"
@@hint
`OrderedDict.move_to_end(key)` marks a key as most recent and `popitem(last=False)` removes the oldest.
@@solution
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.data = OrderedDict()

    def get(self, key):
        if key not in self.data:
            return -1
        self.data.move_to_end(key)
        return self.data[key]

    def put(self, key, value):
        self.data[key] = value
        self.data.move_to_end(key)
        if len(self.data) > self.capacity:
            self.data.popitem(last=False)
````

````task
id: star-story
title: Write a STAR story
kind: text
level: medium
@@statement
Prompt: "Tell me about a time you disagreed with a teammate about a technical decision." (If you have no work example, use a university or personal project with another person.) This is one of the five STAR stories you should prepare.

**Deliverable**: one story of 150 to 220 words in the STAR structure with labelled parts: **Situation** (1 to 2 sentences), **Task** (1 sentence: your responsibility), **Action** (3 to 4 sentences, all about what *you* did, using "I"), **Result** (1 to 2 sentences with at least one number such as hours saved, percent, users or defects). Finish with one sentence on what you would do differently.
@@solution
Situation: In my final-year project, my teammate wanted to store sensor readings in a NoSQL database while I preferred PostgreSQL; we had two weeks before the demo. Task: As the person responsible for the data layer, I had to settle the choice without damaging the team. Action: I asked him to list the queries he expected, and we found 80% were joins across devices and days. I built a one-hour prototype of both with 100,000 rows and timed the three main queries. I shared the numbers in a short table and asked him to point out anything I had missed; he did, and we added an index. I proposed we revisit the choice if the data grew tenfold. Result: PostgreSQL ran the main query in 40 ms against 310 ms, we finished two days early, and the demo handled 5 users with no errors. Next time I would run the comparison on day one rather than after a week of debate.
@@criteria
- Uses all four labelled STAR parts and stays within about 150 to 220 words.
- The Action part describes what the candidate personally did, with specific steps rather than "we".
- The disagreement is handled respectfully and resolved with evidence or a clear process.
- The Result contains at least one concrete number.
- Ends with a reflection on what the candidate would do differently.
````

````task
id: url-shortener-design
title: Design a URL shortener
kind: text
level: hard
@@statement
Prompt: design a URL shortener. Numbers: 100 million new URLs per month, 100:1 read-to-write ratio, links kept for 5 years, 7-character codes, p99 redirect latency under 100 ms. Give yourself 35 minutes, as in a real round.

**Deliverable**: a design of 300 to 450 words with
1. Back-of-envelope numbers: writes per second, reads per second, storage for 5 years (state your assumed bytes per record).
2. The API (2 endpoints) and the data model.
3. How you generate unique 7-character codes and why that strategy avoids collisions.
4. Where you cache and how you scale reads.
5. Two trade-offs or failure cases you would raise with the interviewer.
@@solution
Numbers: 100M per month is about 40 writes per second (100,000,000 / 2.6M seconds), so reads are about 4,000 per second, with peaks of perhaps 10,000. At 500 bytes per record, 5 years is 6 billion records, about 3 TB.

API: POST /urls {long_url} -> {code}; GET /{code} -> 301 or 302 redirect. Table urls(code primary key, long_url, created_at, expires_at).

Codes: 7 base62 characters give 62^7, about 3.5 trillion, far more than 6 billion. A counter service hands out ranges of ids to each app server, which base62-encodes the id, so collisions are impossible; random codes would need a uniqueness check and retries.

Reads: put a Redis cache with an LRU policy in front of the database. Since a small share of links gets most traffic, a cache sized for hot links gives roughly a 90% hit rate, so the database sees about 400 reads per second. Add read replicas, and partition by code hash when one machine is not enough. A CDN or cached 301 responses absorb repeat visits.

Trade-offs: 301 is cacheable and cheap but hides click analytics; 302 keeps analytics but costs more load. If the counter service fails, servers keep using their remaining ranges, so only new ranges stop. Custom aliases need a uniqueness check, and abuse needs rate limits and a malware scan.
@@criteria
- Computes writes per second and reads per second from the given numbers (about 40 and 4,000).
- Estimates 5-year storage with a stated bytes-per-record assumption.
- Defines two API endpoints and a data model with the code as key.
- Explains collision-free code generation and shows that 7 characters are enough.
- Describes caching and read scaling, and raises at least two trade-offs or failure cases.
````

````task
id: explain-rag-vs-finetune
title: Explain RAG versus fine-tuning aloud
kind: text
level: medium
@@statement
Interview question: "A client wants a chatbot that answers questions about their 5,000 internal documents, which change weekly. Do we use RAG or fine-tuning?" Write the answer you would say in two minutes (about 250 to 300 words), then practise saying it aloud.

**Deliverable**: an answer that gives a clear recommendation in the first sentence, then two reasons tied to the numbers in the question, one situation where you would choose the other option, how you would measure success (name one metric with a target), and one risk you would mention.
@@solution
I would use RAG. The documents change weekly, and with RAG an update means re-indexing the changed files in minutes, while fine-tuning would need a new training run every week and the model would still blur details. Second, with 5,000 documents the client will want to see where an answer came from; RAG can cite the passage, while a fine-tuned model cannot point to a source and can state outdated facts confidently.

I would choose fine-tuning, or add it on top, if the problem were style or format rather than knowledge: for example if answers must always follow a strict template or tone, or if cost and latency must drop by using a smaller model on a narrow task. Often the best system is RAG for facts plus a light fine-tune for format.

To measure success I would build 50 real questions with known source passages and track recall@5 for retrieval and the share of answers that are faithful to the sources, aiming for over 90% on both before launch. I would also check that the bot says "I don't know" on unanswerable questions.

The main risk is access control: if confidential documents are retrieved for the wrong user, that is a data leak, so I would filter by permissions inside the search query, not after it.
@@criteria
- States a clear recommendation (RAG) in the first sentence.
- Uses the facts in the question (weekly changes, 5,000 documents) in the reasons.
- Gives a fair case for when fine-tuning would be the better or complementary choice.
- Names a concrete success metric such as recall@k or faithfulness with a target.
- Mentions a realistic risk such as permissions, chunking or hallucination.
````

````task
id: resume-bullets
title: Rewrite resume bullets
kind: text
level: easy
@@statement
Rewrite these four resume bullets so each starts with a strong past-tense verb, states the action, and ends with a number. Use your own real figures if you have them; otherwise use plausible example figures.

1. "Responsible for the backend of the company website."
2. "Worked on improving the search feature."
3. "Helped with deployment and testing."
4. "Did data analysis for the sales team."

**Deliverable**: four rewritten bullets, each 15 to 30 words, in the pattern "Verb + what you did + how + measurable result".
@@solution
1. Built the checkout API in Python and PostgreSQL, serving 20,000 daily users and cutting average response time from 800 ms to 250 ms.
2. Improved site search by adding typo tolerance and BM25 ranking, raising the share of searches ending in a click from 41% to 58%.
3. Automated deployment with a GitHub Actions pipeline and 120 integration tests, reducing release time from 2 hours to 15 minutes.
4. Analysed 18 months of sales data in SQL and pandas, identifying three underperforming regions and informing a campaign that lifted their revenue by 12%.
@@criteria
- Every bullet starts with a strong past-tense action verb, not "responsible for", "worked on" or "helped".
- Every bullet names the specific action or technology used.
- Every bullet ends with a measurable result containing a number.
- Bullets are 15 to 30 words and read as one sentence each.
````
