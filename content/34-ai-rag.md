---
id: ai-rag
title: Embeddings, vector search and RAG
minutes: 65
---

Retrieval-augmented generation (RAG) gives a model facts it was never trained on: search your documents, paste the best passages into the prompt, and ask the model to answer from them. It is the most common production AI pattern, and most of its quality comes from the retrieval half. This lesson builds a complete retrieval pipeline in plain Python so that nothing is hidden.

## Why RAG exists

A model alone has three limits: it does not know your private documents, it does not know anything after its training cutoff, and it cannot show where an answer came from. RAG addresses all three, and updating knowledge means updating documents, not retraining.

## Embeddings

An **embedding model** turns text into a vector so that texts with similar meaning land close together. "How do I reset my password?" and "I forgot my login details" share almost no words, yet their embeddings are near each other. Closeness is measured with cosine similarity.

Real embeddings come from a neural network:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("<embedding-model-name>")
vectors = model.encode(["Returns are accepted within 30 days.", "Can I send an item back?"], normalize_embeddings=True)
print(vectors.shape, float(vectors[0] @ vectors[1]))        # e.g. (2, 384) and a high similarity
```

To run without installing anything, the examples below use a simpler vector: **TF-IDF**, which weights each word by how often it appears in the document and how rare it is overall. It captures shared vocabulary, not meaning, which is exactly the gap neural embeddings fill. The pipeline around it is identical.

## A complete retrieval pipeline from scratch

```python run
import math, re
from collections import Counter

DOCS = {
    "returns":   "Items can be returned within 30 days of delivery with the original receipt. Refunds are issued to the original payment method within 7 working days.",
    "shipping":  "Standard shipping takes 3 to 5 working days. Express shipping delivers the next working day for orders placed before noon.",
    "warranty":  "The warranty covers manufacturing defects for one year from purchase. Accidental damage and battery wear are not covered.",
    "torque":    "Cylinder head bolts must be tightened to 45 Nm in the sequence shown in drawing CH-204. Recheck torque after the first heat cycle.",
    "leak-test": "Every gearbox is leak tested at 0.5 bar for 60 seconds. A pressure drop above 5 millibar fails the unit and it goes to rework.",
}

STOPWORDS = set("a an and are at be by can do for from how i in is it my of on or the to what with".split())

def tokenize(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS]      # drop words that carry no topic

# ---- indexing: done once, offline ----
doc_tokens = {d: tokenize(t) for d, t in DOCS.items()}
df = Counter(word for toks in doc_tokens.values() for word in set(toks))       # in how many docs each word appears
N = len(DOCS)
idf = {w: math.log((N + 1) / (c + 1)) + 1 for w, c in df.items()}              # rare words weigh more

def vectorize(tokens):
    tf = Counter(tokens)
    vec = {w: tf[w] * idf.get(w, 0.0) for w in tf}
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {w: v / norm for w, v in vec.items()}                               # unit length

index = {d: vectorize(toks) for d, toks in doc_tokens.items()}

# ---- querying: done per question ----
def search(query, k=2):
    q = vectorize(tokenize(query))
    scores = {d: sum(q.get(w, 0) * v for w, v in vec.items()) for d, vec in index.items()}   # cosine similarity
    return sorted(scores.items(), key=lambda kv: -kv[1])[:k]

for question in ["How long do refunds take?", "What torque for cylinder head bolts?", "pressure limit in the leak test"]:
    print(f"{question!r:42} -> {[(d, round(s, 2)) for d, s in search(question)]}")

best_doc, best_score = search("Can I send it back?", k=1)[0]
print(f"\n'Can I send it back?' -> best score {best_score:.2f}: no shared words, so nothing matches. A neural embedding would find 'returns'.")
```

That last line is why neural embeddings matter, and also why combining both kinds of search works best.

## The full RAG pipeline

### Indexing (offline)

1. **Load** the sources: PDFs, web pages, wikis, tickets, database rows.
2. **Parse** them into clean text. Tables, scanned pages and multi-column layouts are the hard part, and bad parsing is the most common root cause of bad answers.
3. **Chunk** the text into passages.
4. **Embed** each chunk.
5. **Store** the vector, the text and **metadata**: source, page, section, date, document version, access rights.

### Answering (online)

1. Optionally **rewrite** the question into a standalone search query.
2. **Retrieve** the top 20 to 50 chunks, applying metadata filters.
3. **Rerank** and keep the best 3 to 8.
4. **Build the prompt**: instructions, the chunks with source IDs, the question.
5. **Generate** an answer that cites its sources and says so when the context does not contain the answer.

```python run
PROMPT = """Answer the question using only the context below.
Cite the source id in square brackets after each fact.
If the context does not contain the answer, reply exactly: I don't know based on the available documents.

<context>
{context}
</context>

Question: {question}"""

def build_prompt(question, hits):
    context = "\n\n".join(f"[{doc_id}] {text}" for doc_id, text in hits)
    return PROMPT.format(context=context, question=question)

hits = [("returns", "Items can be returned within 30 days of delivery with the original receipt."),
        ("warranty", "The warranty covers manufacturing defects for one year from purchase.")]
print(build_prompt("Can I return an item after three weeks?", hits))
```

## Chunking

| Strategy | How | Notes |
| --- | --- | --- |
| Fixed size with overlap | For example 500 tokens with 50 overlapping | Simple baseline; may cut mid-sentence |
| Structure-aware | Split on headings, paragraphs, list items, code blocks; keep tables whole | Usually the best first improvement |
| Semantic | Split where the topic changes | More computation |
| Parent-child | Search small chunks for precision; give the model their larger parent section | Good balance of precision and context |
| Contextual | Prepend a sentence describing where the chunk sits in the document before embedding | Helps chunks that are ambiguous alone |

```python run
def chunk(text, size=12, overlap=3):
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + size]))
        if start + size >= len(words):
            break
        start += size - overlap                 # overlap keeps sentences that straddle a boundary retrievable
    return chunks

text = ("Every gearbox is leak tested at 0.5 bar for 60 seconds. A pressure drop above 5 millibar fails the unit "
        "and it goes to rework. Reworked units are retested once and scrapped on a second failure.")
for i, c in enumerate(chunk(text)):
    print(i, "|", c)
```

Chunks that are too small lose their meaning; chunks that are too large dilute the match and waste context. Test sizes on your own questions.

## Vector search at scale

Comparing a query with every vector is exact, and too slow for millions of vectors. **Approximate nearest neighbour (ANN)** indexes trade a little accuracy for a large speed-up.

- **HNSW**: a layered graph. Search hops between neighbours towards the query. Fast and accurate; memory-hungry. The common default.
- **IVF**: cluster the vectors, then search only the nearest clusters.
- **Product quantisation**: compress vectors to save memory at some cost in accuracy.

| Store | Kind | When to choose |
| --- | --- | --- |
| pgvector | PostgreSQL extension | You already use PostgreSQL; up to millions of vectors; you want joins and transactions |
| Qdrant, Weaviate, Milvus | Dedicated open-source vector databases | Large scale; rich filtering; hybrid search |
| Pinecone | Managed service | No operations work |
| Chroma, LanceDB | Embedded, local | Prototypes and small applications |
| FAISS | A library, not a database | In-process search; research |
| Elasticsearch, OpenSearch | Search engine with vector support | Keyword and vector search together |

## Improving retrieval

### Hybrid search

Vector search finds meaning; keyword search (BM25) finds exact terms such as part numbers, error codes and names. Run both and merge with **reciprocal rank fusion**: each result earns 1 / (60 + rank) from each list.

```python run
def reciprocal_rank_fusion(*rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0) + 1 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)

vector_results  = ["returns", "warranty", "shipping", "faq-12"]        # good at meaning
keyword_results = ["drawing-CH-204", "returns", "torque"]              # good at exact terms
print(reciprocal_rank_fusion(vector_results, keyword_results))
```

### More techniques

| Technique | What it does |
| --- | --- |
| Reranking | A cross-encoder model reads the query and each candidate together and rescores them. A large precision gain for little work |
| Query rewriting | Turns a follow-up ("what about international?") into a standalone query using the chat history |
| Multi-query | Generates several phrasings, retrieves for each, merges |
| HyDE | Generates a hypothetical answer and searches with its embedding |
| Metadata filtering | Restricts by date, product, department, document version, user permissions |
| GraphRAG | Builds a knowledge graph of entities and relations to answer questions that span many documents |
| Agentic RAG | An agent decides when to search, what to search for, and whether the results are good enough |

## Evaluating RAG

Evaluate the two halves separately, or you will not know which one to fix.

**Retrieval**: for a set of questions with known relevant chunks, measure

- **recall@k**: was a relevant chunk in the top k?
- **MRR** (mean reciprocal rank): how high was the first relevant chunk?
- **nDCG**: a rank-weighted score when several chunks are relevant.

```python run
def evaluate(test_cases, search_fn, k=3):
    hits, reciprocal = 0, 0.0
    for question, relevant in test_cases:
        results = search_fn(question, k)
        for rank, doc in enumerate(results, start=1):
            if doc in relevant:
                hits += 1
                reciprocal += 1 / rank
                break
    n = len(test_cases)
    return {"recall@%d" % k: round(hits / n, 2), "MRR": round(reciprocal / n, 2)}

golden = [("refund time", {"returns"}), ("next day delivery", {"shipping"}), ("bolt torque value", {"torque"}), ("battery covered?", {"warranty"})]

retriever_v1 = lambda q, k: {"refund time": ["shipping", "returns", "warranty"], "next day delivery": ["shipping", "returns", "torque"],
                             "bolt torque value": ["leak-test", "warranty", "shipping"], "battery covered?": ["returns", "shipping", "warranty"]}[q][:k]
retriever_v2 = lambda q, k: {"refund time": ["returns", "shipping", "warranty"], "next day delivery": ["shipping", "returns", "torque"],
                             "bolt torque value": ["torque", "leak-test", "shipping"], "battery covered?": ["warranty", "returns", "shipping"]}[q][:k]

print("baseline        :", evaluate(golden, retriever_v1))
print("hybrid + rerank :", evaluate(golden, retriever_v2))
```

**Generation**: measure

- **faithfulness**: is every claim supported by the retrieved context?
- **answer relevance**: does it address the question?
- **correctness** against a reference answer.

Tools such as Ragas and DeepEval automate these with a model acting as judge. Check the judge against your own labels on a sample before trusting it.

## Where RAG fails and how to fix it

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The right document is never retrieved | Bad parsing or chunking; vocabulary mismatch | Fix extraction; hybrid search; query rewriting |
| Retrieved, and ranked too low to be used | Weak ranking | Add a reranker; a better embedding model |
| In the context, yet the answer is wrong | Too much noise, or the model ignored it | Fewer, better chunks; clearer prompt; a stronger model |
| A confident answer with no support | No "I don't know" path | Instruct and test refusal; require citations |
| Out-of-date answers | A stale index | Incremental re-indexing; dates in metadata; prefer the newest version |
| Users see data they should not | No access control in retrieval | Filter by permission before anything reaches the model |
| Answers need several documents combined | Single-shot retrieval | Multi-step or agentic retrieval; GraphRAG |

## RAG, fine-tuning or a long prompt?

| Approach | Use when | Weakness |
| --- | --- | --- |
| Put everything in the prompt | The material is small and fits comfortably | Cost and latency on every call |
| RAG | Knowledge is large, changes, or needs citations and access control | Retrieval errors |
| Fine-tuning | You need a style, a format or a narrow skill, not new facts | Does not reliably add facts; retraining for every update |

They combine: a fine-tuned model can still use RAG.

## A realistic example

An assistant over a plant's standard operating procedures and quality manuals:

- **Parsing**: procedures contain tables of torque values and tolerances, so table extraction must be checked by hand on a sample.
- **Chunking**: by procedure step, keeping each table whole, with the procedure title and revision prepended to every chunk.
- **Hybrid search**: operators search by part numbers, drawing numbers and defect codes, which keyword search handles and embeddings do not.
- **Metadata filters**: production line, document revision (only the current one), and department.
- **Answers** must cite the procedure and revision so an operator can verify before acting, and must refuse when the procedures do not cover the question.
- **Evaluation**: fifty real questions from supervisors with the correct procedure identified, run on every change.

## Check yourself

```quiz
[
  {"q": "What do embeddings capture that keyword matching does not?", "options": ["Exact part numbers", "Similarity of meaning between texts with different words", "Document length"], "answer": 1, "why": "Texts with similar meaning have nearby vectors even without shared words."},
  {"q": "Users search for error code E-4471 and vector search misses it. What helps most?", "options": ["A larger chunk size", "Hybrid search that adds keyword (BM25) matching", "A higher temperature"], "answer": 1, "why": "Exact identifiers are where keyword search is strong."},
  {"q": "Answers are wrong, and you find the correct chunk was never in the top 20. Where is the problem?", "options": ["The LLM", "Retrieval: parsing, chunking or search", "The prompt wording"], "answer": 1, "why": "Generation cannot use what retrieval did not supply. Measure the halves separately."},
  {"q": "Why include overlap between chunks?", "options": ["To use more storage", "So content spanning a boundary is still retrievable in one piece", "To speed up search"], "answer": 1, "why": "A sentence cut in half may match neither chunk well."},
  {"q": "How should document permissions be enforced in RAG?", "options": ["Ask the model not to reveal restricted text", "Filter at retrieval so restricted chunks never reach the prompt", "Hide the citation"], "answer": 1, "why": "Anything in the prompt can leak. Enforce access in code before the model sees it."},
  {"q": "Your company's product manual changes weekly. Best way to keep the assistant current?", "options": ["Fine-tune the model weekly", "RAG with incremental re-indexing", "A longer system prompt"], "answer": 1, "why": "Updating an index is far cheaper and more reliable than retraining."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: recall-at-k
title: Recall at k over test questions
kind: code
level: easy
@@statement
Write `recall_at_k(results, relevant, k)` that measures how often retrieval finds the right documents.

**Input**
- `results`: dict mapping a question to the ranked list of document ids your retriever returned (best first).
- `relevant`: dict mapping a question to the **set** of document ids that are correct for it.
- `k`: how many top results to look at.

**Output**: a float. For each question in `relevant`, recall is `(number of relevant ids found in the first k results) / (number of relevant ids)`. Return the mean over all questions in `relevant`. A question missing from `results` scores 0. A question whose relevant set is empty is skipped. If there are no questions to score, return `0.0`.

**Example**

```
results  = {"q1": ["d1", "d2", "d3"], "q2": ["d9", "d4", "d5"]}
relevant = {"q1": {"d1"}, "q2": {"d4", "d5"}}
recall_at_k(results, relevant, 2) -> (1.0 + 0.5) / 2 = 0.75
```
@@starter
def recall_at_k(results, relevant, k):
    # your code here
    pass
@@tests
_r = {"q1": ["d1", "d2", "d3"], "q2": ["d9", "d4", "d5"]}
_rel = {"q1": {"d1"}, "q2": {"d4", "d5"}}
assert recall_at_k(_r, _rel, 2) == 0.75, "mean of 1.0 and 0.5"
assert recall_at_k(_r, _rel, 3) == 1.0, "k=3 finds everything"
assert recall_at_k(_r, _rel, 0) == 0.0, "k=0 finds nothing"
assert recall_at_k({}, _rel, 3) == 0.0, "missing questions score 0"
assert recall_at_k(_r, {}, 3) == 0.0, "no questions"
assert recall_at_k(_r, {"q1": set(), "q2": {"d4"}}, 3) == 1.0, "empty relevant set skipped"
@@hint
Slice with `results.get(q, [])[:k]`, intersect with the relevant set, and divide by its size.
@@solution
def recall_at_k(results, relevant, k):
    scores = []
    for q, rel in relevant.items():
        if not rel:
            continue
        found = set(results.get(q, [])[:k]) & set(rel)
        scores.append(len(found) / len(rel))
    return sum(scores) / len(scores) if scores else 0.0
````

````task
id: bm25-rank
title: BM25 ranking
kind: code
level: medium
@@statement
Implement BM25 keyword scoring. Write `bm25_rank(query, docs, k1=1.5, b=0.75)`.

**Input**
- `query`: a string. `docs`: dict mapping a document id to its text.
- Tokenise both with `re.findall(r"[a-z0-9]+", text.lower())`.

**Formula** for each document `d` and each distinct query term `t`:

```
idf(t)   = ln(1 + (N - n_t + 0.5) / (n_t + 0.5))     N = number of docs, n_t = docs containing t
score   += idf(t) * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len(d) / avgdl))
```
`tf` is how often `t` occurs in `d`, `len(d)` its token count, `avgdl` the average token count over all docs.

**Output**: a list of `(doc_id, score)` sorted by score descending (ties by id ascending). Only include documents with a score above 0. Empty `docs` or an empty query gives `[]`.

**Example**

```
docs = {"d1": "refund policy refund within 30 days",
        "d2": "shipping policy takes 5 days",
        "d3": "contact support by email"}
[d for d, s in bm25_rank("refund policy", docs)] -> ["d1", "d2"]
```
@@starter
import math
import re

def bm25_rank(query, docs, k1=1.5, b=0.75):
    # your code here
    pass
@@tests
_docs = {"d1": "refund policy refund within 30 days",
         "d2": "shipping policy takes 5 days",
         "d3": "contact support by email"}
_out = bm25_rank("refund policy", _docs)
assert [d for d, s in _out] == ["d1", "d2"], "d1 best, d3 has no match"
assert all(s > 0 for d, s in _out), "only positive scores"
assert _out[0][1] > _out[1][1], "scores descending"
assert bm25_rank("", _docs) == [], "empty query"
assert bm25_rank("refund", {}) == [], "no documents"
assert bm25_rank("zebra", _docs) == [], "no match"
assert sorted(d for d, s in bm25_rank("days", _docs)) == ["d1", "d2"], "both contain days"
assert bm25_rank("days", {"b": "x days", "a": "x days"})[0][0] == "a", "ties broken by id"
@@hint
First compute the tokens per document, `N`, `avgdl` and a document frequency per term. The document frequency counts documents, not occurrences.
@@solution
import math
import re

def bm25_rank(query, docs, k1=1.5, b=0.75):
    tok = lambda s: re.findall(r"[a-z0-9]+", s.lower())
    toks = {d: tok(t) for d, t in docs.items()}
    terms = set(tok(query))
    if not toks or not terms:
        return []
    n = len(toks)
    avgdl = sum(len(t) for t in toks.values()) / n
    out = []
    for d, t in toks.items():
        score = 0.0
        for term in terms:
            tf = t.count(term)
            if tf == 0:
                continue
            df = sum(1 for x in toks.values() if term in x)
            idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
            score += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * len(t) / avgdl))
        if score > 0:
            out.append((d, score))
    out.sort(key=lambda x: (-x[1], x[0]))
    return out
````

````task
id: reciprocal-rank-fusion
title: Reciprocal rank fusion
kind: code
level: easy
@@statement
Combine several rankings into one with reciprocal rank fusion. Write `reciprocal_rank_fusion(rankings, k=60)`.

**Input**: `rankings` is a list of ranked lists of document ids (best first), for example one from BM25 and one from embeddings. `k` is a constant.

**Output**: a list of document ids sorted by fused score, highest first, ties by id ascending. The fused score of a document is the sum over every ranking that contains it of `1 / (k + rank)`, where `rank` starts at 1. Empty input gives `[]`.

**Example**

```
reciprocal_rank_fusion([["a", "b", "c"], ["b", "c", "a"]])
-> ["b", "a", "c"]
```
(b: 1/62 + 1/61, a: 1/61 + 1/63, c: 1/63 + 1/62)
@@starter
def reciprocal_rank_fusion(rankings, k=60):
    # your code here
    pass
@@tests
assert reciprocal_rank_fusion([["a", "b", "c"], ["b", "c", "a"]]) == ["b", "a", "c"], "worked example"
assert reciprocal_rank_fusion([]) == [], "empty"
assert reciprocal_rank_fusion([["x", "y"]]) == ["x", "y"], "single ranking keeps order"
assert reciprocal_rank_fusion([["a"], ["b"]]) == ["a", "b"], "tie broken by id"
assert reciprocal_rank_fusion([["a", "z"], ["b", "z"]]) == ["z", "a", "b"], "z appears in both lists"
_in = [["a", "b"], ["b", "a"]]
reciprocal_rank_fusion(_in)
assert _in == [["a", "b"], ["b", "a"]], "inputs unchanged"
@@hint
Keep a dict of scores and add `1 / (k + position)` using `enumerate(ranking, start=1)`.
@@solution
def reciprocal_rank_fusion(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            scores[doc] = scores.get(doc, 0.0) + 1.0 / (k + rank)
    return [d for d, s in sorted(scores.items(), key=lambda x: (-x[1], x[0]))]
````

````task
id: chunk-words
title: Fixed-size chunks with overlap
kind: code
level: easy
@@statement
Write `chunk_words(text, size, overlap)` that splits a document into overlapping chunks of words.

**Input**: `text` string; `size` words per chunk (>= 1); `overlap` words shared with the previous chunk (`0 <= overlap < size`).

**Output**: a list of strings. Split with `text.split()`. Chunk `i` starts at word `i * (size - overlap)` and holds up to `size` words, joined with single spaces. Stop once a chunk reaches the last word (no chunk may consist only of words already in the previous chunk). Empty or whitespace-only text gives `[]`.

**Example**

```
chunk_words("a b c d e f g", 3, 1) -> ["a b c", "c d e", "e f g"]
chunk_words("a b c d", 10, 0)       -> ["a b c d"]
```
@@starter
def chunk_words(text, size, overlap):
    # your code here
    pass
@@tests
assert chunk_words("a b c d e f g", 3, 1) == ["a b c", "c d e", "e f g"], "overlap 1"
assert chunk_words("a b c d", 10, 0) == ["a b c d"], "shorter than size"
assert chunk_words("", 3, 1) == [], "empty"
assert chunk_words("a b c d", 2, 0) == ["a b", "c d"], "no overlap"
assert chunk_words("a b c d e", 2, 0) == ["a b", "c d", "e"], "last short chunk"
assert chunk_words("a b c d e", 3, 2) == ["a b c", "b c d", "c d e"], "overlap 2 stops at the end"
@@hint
Loop with `start += size - overlap`, and `break` after appending a chunk whose end index reaches `len(words)`.
@@solution
def chunk_words(text, size, overlap):
    words = text.split()
    chunks = []
    step = size - overlap
    start = 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + size]))
        if start + size >= len(words):
            break
        start += step
    return chunks
````

````task
id: chunk-markdown
title: Structure-aware chunking
kind: code
level: medium
@@statement
Write `chunk_markdown(text)` that splits a Markdown document on headings so lists and paragraphs stay together.

**Input**: a Markdown string. A heading line starts with `#` (any level).

**Output**: a list of strings. Each chunk starts at a heading line and contains every following line up to (not including) the next heading. Text before the first heading becomes its own chunk if it is not blank. Strip leading and trailing blank lines from each chunk, keep inner lines as they are, and join lines with `"\n"`. A heading with no body is still a chunk. Empty or blank text gives `[]`.

**Example**

```
text = "# Refunds\n- 30 days\n- receipt needed\n\n## Exceptions\nSale items"
chunk_markdown(text)
-> ["# Refunds\n- 30 days\n- receipt needed", "## Exceptions\nSale items"]
```
@@starter
def chunk_markdown(text):
    # your code here
    pass
@@tests
_t = "# Refunds\n- 30 days\n- receipt needed\n\n## Exceptions\nSale items"
assert chunk_markdown(_t) == ["# Refunds\n- 30 days\n- receipt needed", "## Exceptions\nSale items"], "two sections"
assert chunk_markdown("") == [], "empty"
assert chunk_markdown("  \n\n") == [], "blank"
assert chunk_markdown("intro line\n# A\nbody") == ["intro line", "# A\nbody"], "preamble chunk"
assert chunk_markdown("# A\n# B\ntext") == ["# A", "# B\ntext"], "heading without body"
assert chunk_markdown("# A\n\nfirst\n\nsecond\n") == ["# A\n\nfirst\n\nsecond"], "inner blank lines kept"
@@hint
Walk the lines; when a line starts with `#`, close the current group and start a new one. Strip blank lines from the ends of each group at the end.
@@solution
def chunk_markdown(text):
    groups = [[]]
    for line in text.split("\n"):
        if line.startswith("#"):
            groups.append([line])
        else:
            groups[-1].append(line)
    out = []
    for g in groups:
        s = "\n".join(g).strip("\n")
        if s.strip():
            out.append(s)
    return out
````

````task
id: filtered-search
title: Search with metadata and permission filter
kind: code
level: medium
@@statement
Write `filtered_search(docs, query, user_groups, department=None)`.

**Input**
- `docs`: list of dicts `{"id": str, "text": str, "department": str, "groups": set}`.
- `query`: string; `user_groups`: set of groups the user belongs to; `department`: optional string.
- Tokenise text and query with `re.findall(r"[a-z0-9]+", s.lower())`.

**Output**: a list of document ids. A document is eligible only if its `groups` share at least one member with `user_groups` (permission), and, when `department` is not `None`, its department equals it. Rank eligible documents by the number of **distinct** query tokens that appear in the text (descending), ties by id ascending. Leave out documents with zero matches. Never return ids of documents the user may not see.

**Example**

```
docs = [{"id": "hr1", "text": "salary bands", "department": "hr", "groups": {"hr"}},
        {"id": "g1", "text": "salary policy for all", "department": "all", "groups": {"hr", "staff"}}]
filtered_search(docs, "salary policy", {"staff"}) -> ["g1"]
```
@@starter
import re

def filtered_search(docs, query, user_groups, department=None):
    # your code here
    pass
@@tests
_docs = [
    {"id": "hr1", "text": "salary bands", "department": "hr", "groups": {"hr"}},
    {"id": "g1", "text": "salary policy for all", "department": "all", "groups": {"hr", "staff"}},
    {"id": "g2", "text": "policy on salary and bonus", "department": "hr", "groups": {"staff"}},
]
assert filtered_search(_docs, "salary policy", {"staff"}) == ["g1", "g2"], "staff cannot see hr1"
assert filtered_search(_docs, "salary policy", {"hr"}) == ["g1", "hr1"], "hr sees g1 and hr1"
assert filtered_search(_docs, "salary policy", {"staff"}, department="hr") == ["g2"], "department filter"
assert filtered_search(_docs, "salary", {"other"}) == [], "no permission"
assert filtered_search(_docs, "zebra", {"hr", "staff"}) == [], "no match"
assert filtered_search(_docs, "salary salary", {"staff"}) == ["g1", "g2"], "distinct tokens counted once"
@@hint
Filter first, rank second. `set(tokens(query)) & set(tokens(text))` gives the distinct matches.
@@solution
import re

def filtered_search(docs, query, user_groups, department=None):
    tok = lambda s: set(re.findall(r"[a-z0-9]+", s.lower()))
    q = tok(query)
    scored = []
    for d in docs:
        if not (set(d["groups"]) & set(user_groups)):
            continue
        if department is not None and d["department"] != department:
            continue
        n = len(q & tok(d["text"]))
        if n > 0:
            scored.append((-n, d["id"]))
    return [i for _, i in sorted(scored)]
````

````task
id: rag-design-plan
title: Design a grounded RAG assistant
kind: text
level: medium
@@statement
Scenario: a company has 2,000 policy PDFs (about 40 pages each, 3 revisions per policy, 12 departments). Employees ask HR and IT questions; some documents are restricted to managers. Answers must cite sources and say "I don't know" when the documents do not cover the question.

**Deliverable**: a design of 250 to 400 words with these five parts:
1. Chunking: chunk size, overlap, and whether you split by structure. Justify with numbers.
2. Storage: what metadata you store per chunk and how revision and permission filters work (for example a PostgreSQL table with a pgvector column).
3. Retrieval: hybrid search (BM25 plus embeddings), fusion method, how many chunks you fetch and how many you pass to the model.
4. Prompt and citations: how the model is told to cite and to refuse.
5. Testing: how you test the "I don't know" path with at least 5 unanswerable questions, and which two metrics you track.
@@solution
Chunking: split by headings first, then pack paragraphs up to about 400 tokens with 50 tokens (12%) overlap, keeping lists and tables whole. At 40 pages per PDF that gives roughly 100 chunks per document and about 200,000 chunks for the current revisions, small enough for one Postgres table. Prefix each chunk with its document title and heading path so it stands alone.

Storage: table chunks(id, doc_id, revision, is_current, department, allowed_groups text[], heading_path, text, embedding vector(768), tsv tsvector). Filter on is_current; keep old revisions for audit. The permission filter (allowed_groups && user_groups) is applied inside the SQL query before ranking, so restricted text is never retrieved rather than removed afterwards.

Retrieval: run full-text (BM25-style) search and vector search, each returning 30 chunks, fuse with reciprocal rank fusion (k=60), optionally rerank the top 20, and pass the best 5 chunks (about 2,000 tokens) to the model.

Prompt: "Answer only from the numbered sources. After every claim add [source id]. If the sources do not contain the answer, reply exactly: I don't know based on the available documents." Validate that every cited id was in the provided set.

Testing: write at least 5 questions the documents cannot answer (another company's policy, a future year, a personal question) and assert the reply contains the refusal and no citation. Track recall@5 for retrieval on 50 labelled questions and the refusal rate on the unanswerable set (target above 95%), plus citation validity.
@@criteria
- Gives a concrete chunk size and overlap with a justification, and mentions structure-aware splitting or keeping lists together.
- Stores revision, department and allowed groups as metadata, and applies the permission filter before ranking.
- Uses hybrid retrieval with a named fusion method and states how many chunks are fetched and how many are passed to the model.
- Instructs the model to cite sources and to refuse with a fixed phrase, and describes validating citations.
- Describes a test for at least 5 unanswerable questions and names two metrics such as recall@k and refusal rate.
````
