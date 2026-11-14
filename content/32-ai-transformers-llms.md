---
id: ai-transformers-llms
title: Transformers and large language models
minutes: 60
---

A large language model does one thing: given a sequence of tokens, it outputs a probability for every possible next token. Chat, code generation, tool use and reasoning are all built by repeating that step. This lesson opens the box: tokens, embeddings, attention, training and generation, with small runnable versions of each.

## Step 1: text becomes tokens

Models do not see characters or words. Text is split into **tokens**, pieces from a fixed vocabulary of tens of thousands of entries. Common words are one token; rare words are several pieces. In English a token is roughly three-quarters of a word.

The usual algorithm is **byte-pair encoding (BPE)**: start with single characters and repeatedly merge the most frequent adjacent pair into a new token.

```python run
from collections import Counter

corpus = "low lower lowest new newer newest low low new"
words = [list(w) + ["_"] for w in corpus.split()]        # "_" marks the end of a word

def most_common_pair(words):
    pairs = Counter()
    for w in words:
        for a, b in zip(w, w[1:]):
            pairs[(a, b)] += 1
    return pairs.most_common(1)[0][0]

def merge(words, pair):
    out = []
    for w in words:
        merged, i = [], 0
        while i < len(w):
            if i + 1 < len(w) and (w[i], w[i + 1]) == pair:
                merged.append(w[i] + w[i + 1]); i += 2
            else:
                merged.append(w[i]); i += 1
        out.append(merged)
    return out

for step in range(8):
    pair = most_common_pair(words)
    words = merge(words, pair)
    print(f"merge {step + 1}: {pair[0]!r} + {pair[1]!r}")
print("tokenised:", [" ".join(w) for w in words[:6]])
```

Why this matters to you as an engineer: pricing, context limits and speed are all measured in tokens; unusual strings (IDs, code, other languages) use many more tokens than plain English; and a model can struggle with character-level tasks such as counting letters because it never sees letters.

## Step 2: tokens become vectors

Each token ID is looked up in an **embedding table** to get a vector of hundreds or thousands of numbers. These vectors are learned, and tokens used in similar contexts end up with similar vectors. Information about each token's **position** is also added (modern models use rotary position embeddings), because attention on its own has no sense of order.

## Step 3: attention

Self-attention lets each token gather information from the others. For every token the model computes three vectors: a **query** (what am I looking for?), a **key** (what do I offer?) and a **value** (what do I pass on?). The match between one token's query and every token's key decides how much of each value flows to it.

```
Attention(Q, K, V) = softmax(Q · Kᵀ / √d) · V
```

In "The trophy did not fit in the suitcase because it was too big", attention is how the vector for "it" comes to contain information from "trophy".

```python run
import math

def softmax(xs):
    m = max(xs)
    exps = [math.exp(x - m) for x in xs]
    return [e / sum(exps) for e in exps]

def dot(a, b):
    return sum(x * y for x, y in zip(a, b))

# Toy 3-dimensional vectors. In a real model these come from learned weight matrices.
tokens = ["the", "trophy", "suitcase", "it"]
keys    = [[0.1, 0.0, 0.1], [0.9, 0.8, 0.1], [0.7, 0.1, 0.9], [0.2, 0.1, 0.1]]
values  = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
query_for_it = [1.0, 1.2, -0.3]                 # "it" is looking for a big thing that was mentioned

scores = [dot(query_for_it, k) / math.sqrt(3) for k in keys]
weights = softmax(scores)
for tok, w in zip(tokens, weights):
    print(f"{tok:9} attention weight {w:.2f} {'#' * int(w * 40)}")

new_it = [sum(w * v[i] for w, v in zip(weights, values)) for i in range(3)]
print("new vector for 'it':", [round(x, 2) for x in new_it], " mostly the trophy's value")
```

**Multi-head attention** runs several attention operations in parallel, so different heads can track different relationships: grammar, reference, position.

A **causal mask** stops each position from looking at later positions, which is what makes a model generate left to right.

## Step 4: the transformer block

One block is: attention, then a small feed-forward network (MLP), each wrapped with a **residual connection** and **layer normalisation**. A model stacks dozens of these blocks. The final vector at each position is converted to one score (a **logit**) for every token in the vocabulary.

| Variant | Attention can see | Examples | Used for |
| --- | --- | --- | --- |
| Decoder-only | Only earlier tokens | GPT, Claude, Gemini, Llama families | Text generation; nearly all LLMs |
| Encoder-only | All tokens, both directions | BERT and its descendants | Embeddings, classification, reranking |
| Encoder-decoder | Encoder reads the input; decoder generates | T5, the original translation models | Translation, summarisation |

Model size is described by its number of **parameters** (weights): from under a billion for small models to hundreds of billions for the largest.

## Step 5: how LLMs are trained

1. **Pretraining**: predict the next token over an enormous body of text. No human labels are needed because the text is its own answer key. Grammar, facts, code and reasoning patterns are learned as a side effect of getting better at prediction.
2. **Instruction tuning**: fine-tune on prompt-and-response examples so the model follows instructions and holds a conversation.
3. **Preference and safety training**: methods such as reinforcement learning from human feedback shape helpfulness, tone and refusals.

The smallest possible "language model" is a table of which word follows which. It shows the principle of learning from next-word statistics:

```python run
import random
from collections import defaultdict, Counter
random.seed(4)

text = ("the line stopped because the sensor failed . the sensor failed because the cable was loose . "
        "the operator fixed the cable and the line restarted . the line stopped again because the belt slipped .")
words = text.split()

follows = defaultdict(Counter)
for a, b in zip(words, words[1:]):
    follows[a][b] += 1                         # "training": count what follows each word

print("after 'the':", dict(follows["the"]))

def generate(start, n=12):
    out = [start]
    for _ in range(n):
        options = follows[out[-1]]
        if not options:
            break
        out.append(random.choices(list(options), weights=list(options.values()))[0])
    return " ".join(out)

print(generate("the"))
```

A transformer replaces the lookup table with a network that conditions on thousands of previous tokens instead of one, which is the difference between this toy and a system that can write a program.

## Step 6: how generation works

The model produces a probability for every token, one is chosen, it is appended to the input, and the model runs again. This is **autoregressive** generation. How the token is chosen is called **sampling**.

```python run
import math, random
random.seed(2)

logits = {"restarted": 3.2, "stopped": 2.6, "failed": 1.9, "exploded": 0.2, "sang": -1.5}

def probabilities(logits, temperature):
    scaled = {t: l / temperature for t, l in logits.items()}
    m = max(scaled.values())
    exps = {t: math.exp(v - m) for t, v in scaled.items()}
    total = sum(exps.values())
    return {t: e / total for t, e in exps.items()}

def top_p(probs, p):
    kept, running = {}, 0.0
    for token, pr in sorted(probs.items(), key=lambda kv: -kv[1]):
        kept[token] = pr
        running += pr
        if running >= p:
            break
    total = sum(kept.values())
    return {t: v / total for t, v in kept.items()}

for temp in (0.2, 1.0, 2.0):
    probs = probabilities(logits, temp)
    print(f"temperature {temp}:", {t: round(p, 2) for t, p in probs.items()})

print("top-p 0.9 at temperature 1.0 keeps:", list(top_p(probabilities(logits, 1.0), 0.9)))
probs = top_p(probabilities(logits, 1.0), 0.9)
print("five samples:", random.choices(list(probs), weights=list(probs.values()), k=5))
```

| Setting | Effect |
| --- | --- |
| Temperature | Scales randomness. Near 0 always picks the most likely token; higher values give more varied output |
| Top-p (nucleus) | Sample only from the smallest set of tokens whose probabilities add up to p |
| Top-k | Sample only from the k most likely tokens |
| Max tokens | A hard cap on output length |
| Stop sequences | Strings that end generation |

Use a low temperature for extraction, classification and code; a higher one for brainstorming and creative writing.

## Concepts you will use every day

- **Context window**: the maximum number of tokens the model can see at once, input plus output. The model has no memory between calls. Anything it should know about the conversation must be sent again.
- **Hallucination**: the model generates plausible text, not verified facts. When the answer is not well supported by its training or by the prompt, it will still produce a fluent answer. Grounding with retrieval, asking for citations, and evals reduce this.
- **Knowledge cutoff**: training data ends on some date. Later facts must come from tools or retrieved documents.
- **KV cache**: during generation the model reuses its computation for earlier tokens, so each new token is cheap.
- **Prompt caching**: providers let you reuse the processed form of a long, unchanged prompt prefix across calls, lowering cost and latency.
- **Reasoning models**: models that generate intermediate thinking before the final answer. Better on multi-step problems; slower and more expensive.
- **Multimodal models**: accept images, audio or video as well as text by converting them into the same sequence of vectors.
- **Latency**: time to first token, then tokens per second.
- **Cost**: priced per million input tokens and per million output tokens, with output several times more expensive.
- **Non-determinism**: the same prompt can give different outputs, slightly so even at temperature 0. Design and test for this.

## The model landscape

| Kind | Examples | Trade-off |
| --- | --- | --- |
| Proprietary API models | OpenAI GPT, Anthropic Claude, Google Gemini families | Highest capability and no infrastructure; data leaves your network; per-token cost |
| Open-weight models | Meta Llama, Mistral, Qwen, DeepSeek, Google Gemma families | Run on your own hardware with full control and privacy; you operate the GPUs |
| Small language models | Compact models of a few hundred million to a few billion parameters | Cheap and fast; can run on a laptop or a phone; weaker on hard tasks |
| Embedding and reranking models | Encoder models | Turn text into vectors for search; not for generation |

Model names and rankings change every few months. Choose by testing candidates on your own task with your own evaluation set, not by leaderboard position.

## Check yourself

```quiz
[
  {"q": "What does an LLM actually output at each step?", "options": ["A complete sentence", "A probability for every token in its vocabulary", "A fact from a database"], "answer": 1, "why": "One token is then chosen and the process repeats."},
  {"q": "Why might a model miscount the letters in a word?", "options": ["It cannot do arithmetic", "It sees tokens, not individual characters", "Its context window is too small"], "answer": 1, "why": "A word may be one token, so its letters are never directly visible."},
  {"q": "What does self-attention let a token do?", "options": ["Skip other tokens", "Gather information from other tokens in the context, weighted by relevance", "Change the vocabulary"], "answer": 1, "why": "Queries are matched against keys to decide how much of each value to take."},
  {"q": "You need the same structured answer every time. Which setting?", "options": ["High temperature", "Low temperature", "Maximum top-p"], "answer": 1, "why": "Low temperature concentrates probability on the most likely tokens."},
  {"q": "Why does a chat application resend the conversation on every call?", "options": ["To increase cost", "The model keeps no memory between calls; context must be in the prompt", "For encryption"], "answer": 1, "why": "The API is stateless; the context window is the model's only view of the conversation."},
  {"q": "What is hallucination?", "options": ["A network error", "Fluent output that is not supported by facts or sources", "A tokenisation bug"], "answer": 1, "why": "The model optimises for plausible continuation, not truth."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: bpe-merges
title: Byte-pair encoding merges
kind: code
level: medium
@@statement
Implement the training loop of byte-pair encoding (BPE) on characters.

1. `merge_pair(tokens, pair)`: return a new list where every **non-overlapping** occurrence of the adjacent pair `(a, b)`, scanned left to right, is replaced by the single token `a + b`.
2. `bpe_merges(text, num_merges)`: start from `tokens = list(text)`. In each round count all adjacent pairs, pick the most frequent one (ties: the **smallest pair** in normal tuple order), merge it with `merge_pair`, and record it. Stop after `num_merges` rounds or earlier when no pair occurs at least **twice**.

**Input**: `tokens` a list of strings, `pair` a tuple of two strings; `text` a string, `num_merges` an int >= 0.

**Output**: `merge_pair` returns a list; `bpe_merges` returns a tuple `(merges, tokens)`: the list of merged pairs in order and the final token list. Do not change the input list.

**Example**

```
merge_pair(["a", "a", "a"], ("a", "a"))  -> ["aa", "a"]
bpe_merges("aaabdaaabac", 10)
round 1: ("a","a") occurs 4 times     -> aa a b d aa a b a c
round 2: ("a","b") and ("aa","a") occur 2 times, ("a","b") is smaller -> aa ab d aa ab a c
round 3: ("aa","ab") occurs 2 times   -> aaab d aaab a c
round 4: no pair occurs twice, stop
-> ([("a","a"), ("a","b"), ("aa","ab")], ["aaab", "d", "aaab", "a", "c"])
```
@@starter
from collections import Counter

def merge_pair(tokens, pair):
    # your code here
    pass

def bpe_merges(text, num_merges):
    # your code here
    pass

print(bpe_merges("aaabdaaabac", 10))
@@tests
assert merge_pair(["a", "a", "a"], ("a", "a")) == ["aa", "a"], "non-overlapping, left to right"
assert merge_pair(["a", "b", "c", "a", "b"], ("a", "b")) == ["ab", "c", "ab"], "all occurrences"
assert merge_pair(["x", "y"], ("a", "b")) == ["x", "y"], "pair not present"
_toks = ["a", "b"]
merge_pair(_toks, ("a", "b"))
assert _toks == ["a", "b"], "do not change the input list"
assert bpe_merges("aaabdaaabac", 10) == ([("a", "a"), ("a", "b"), ("aa", "ab")], ["aaab", "d", "aaab", "a", "c"]), "worked example"
assert bpe_merges("aaabdaaabac", 1) == ([("a", "a")], ["aa", "a", "b", "d", "aa", "a", "b", "a", "c"]), "stops after num_merges"
assert bpe_merges("abc", 5) == ([], ["a", "b", "c"]), "no repeated pair"
assert bpe_merges("", 3) == ([], []), "empty text"
_m, _t = bpe_merges("low low low lower", 20)
assert _t[0] == "low" and len(_t) <= 6, "frequent character groups become single tokens"
assert "".join(_t) == "low low low lower", "tokens always join back to the text"
@@hint
`Counter(zip(tokens, tokens[1:]))` counts adjacent pairs. Pick the best with `min(counts, key=lambda p: (-counts[p], p))`.
@@solution
from collections import Counter

def merge_pair(tokens, pair):
    out = []
    i = 0
    while i < len(tokens):
        if i + 1 < len(tokens) and (tokens[i], tokens[i + 1]) == pair:
            out.append(tokens[i] + tokens[i + 1])
            i += 2
        else:
            out.append(tokens[i])
            i += 1
    return out

def bpe_merges(text, num_merges):
    tokens = list(text)
    merges = []
    for _ in range(num_merges):
        counts = Counter(zip(tokens, tokens[1:]))
        if not counts:
            break
        best = min(counts, key=lambda p: (-counts[p], p))
        if counts[best] < 2:
            break
        tokens = merge_pair(tokens, best)
        merges.append(best)
    return merges, tokens
````

````task
id: scaled-attention
title: Scaled dot-product attention
kind: code
level: medium
@@statement
Implement attention for **one query** in pure Python.

1. `attention_weights(query, keys)`: scores `s_i = dot(query, keys[i]) / sqrt(d)` where `d = len(query)`, then a numerically stable softmax over the scores.
2. `attend(query, keys, values)`: the weighted sum of the value vectors, `sum_i w_i * values[i]`.

**Input**: `query` a list of `d` floats; `keys` a non-empty list of lists of `d` floats; `values` a list (same length as `keys`) of equal-length float lists.

**Output**: `attention_weights` returns a list of floats summing to 1; `attend` returns a list of floats as long as one value vector. Checked within `1e-6`.

**Example**

```
query = [1, 0], keys = [[1, 0], [0, 1]], values = [[10, 0], [0, 10]]
scores  = [1/sqrt(2), 0] = [0.7071, 0]
weights = [0.6698, 0.3302]
attend  -> [6.698, 3.302]
```
@@starter
import math

def attention_weights(query, keys):
    # your code here
    pass

def attend(query, keys, values):
    # your code here
    pass

print(attention_weights([1, 0], [[1, 0], [0, 1]]))
@@tests
import math as _math
_e = _math.exp(1 / _math.sqrt(2))
_w = attention_weights([1, 0], [[1, 0], [0, 1]])
assert abs(_w[0] - _e / (_e + 1)) < 1e-9 and abs(_w[1] - 1 / (_e + 1)) < 1e-9, "scaled scores then softmax"
_o = attend([1, 0], [[1, 0], [0, 1]], [[10, 0], [0, 10]])
assert abs(_o[0] - 10 * _e / (_e + 1)) < 1e-6 and abs(_o[1] - 10 / (_e + 1)) < 1e-6, "weighted sum of values"
assert all(abs(v - 1 / 3) < 1e-9 for v in attention_weights([0, 0, 0], [[1, 2, 3], [4, 5, 6], [7, 8, 9]])), "zero query gives uniform weights"
assert abs(attention_weights([1000.0], [[1000.0], [0.0]])[0] - 1.0) < 1e-9, "stable for large scores"
assert attend([1, 1], [[3, 3]], [[1, 2, 3]]) == [1.0, 2.0, 3.0] or all(abs(a - b) < 1e-9 for a, b in zip(attend([1, 1], [[3, 3]], [[1, 2, 3]]), [1, 2, 3])), "single key returns its value"
assert abs(sum(attention_weights([0.3, -1.2], [[1, 2], [3, -4], [0, 1]])) - 1.0) < 1e-9, "weights sum to 1"
@@hint
Compute the scores, subtract their maximum before `math.exp`, normalise, then for each output position `j` sum `w[i] * values[i][j]`.
@@solution
import math

def attention_weights(query, keys):
    d = len(query)
    scores = [sum(q * k for q, k in zip(query, key)) / math.sqrt(d) for key in keys]
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]

def attend(query, keys, values):
    w = attention_weights(query, keys)
    dim = len(values[0])
    return [sum(w[i] * values[i][j] for i in range(len(values))) for j in range(dim)]
````

````task
id: attention-focus
title: Make "it" attend to "suitcase"
kind: code
level: easy
@@statement
In "The trophy didn't fit in the suitcase because **it** was too small", the word "it" should attend to "suitcase". Here the keys of the tokens are fixed and you choose the **query** for "it".

Write `make_query(keys, target, min_weight)` that returns a query vector whose attention weight on `keys[target]` is at least `min_weight`. The helper `attention_weights` (scaled dot product + softmax) is given in the starter.

**Input**: `keys`, a list of distinct **unit-length** vectors (lists of floats); `target`, an index; `min_weight`, a float in (0, 1).

**Output**: a list of floats as long as a key, with `attention_weights(query, keys)[target] >= min_weight`.

**Example**

```
keys = {"trophy": [1, 0, 0], "suitcase": [0.6, 0.8, 0], "it": [0, 0.6, 0.8]}  (in that order)
make_query(keys, 1, 0.8) -> e.g. [6.0, 8.0, 0.0]   # 10 * keys[1]
attention_weights([6, 8, 0], keys) -> about [0.09, 0.87, 0.05]
```
Pointing the query in the direction of the target key and making it longer makes the softmax sharper.
@@starter
import math

def attention_weights(query, keys):
    d = len(query)
    scores = [sum(q * k for q, k in zip(query, key)) / math.sqrt(d) for key in keys]
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]

def make_query(keys, target, min_weight):
    # your code here
    pass
@@tests
_keys = [[1.0, 0.0, 0.0], [0.6, 0.8, 0.0], [0.0, 0.6, 0.8]]
for _t in range(3):
    for _mw in (0.9, 0.99):
        _q = make_query(_keys, _t, _mw)
        assert len(_q) == 3, "query has the key dimension"
        assert attention_weights(_q, _keys)[_t] >= _mw, "target weight reaches min_weight"
_k2 = [[1.0, 0.0], [0.0, 1.0], [0.7071067811865476, 0.7071067811865476]]
assert attention_weights(make_query(_k2, 2, 0.95), _k2)[2] >= 0.95, "target between two other keys"
@@hint
Start with `query = keys[target]` and keep doubling its length until the weight is large enough.
@@solution
import math

def attention_weights(query, keys):
    d = len(query)
    scores = [sum(q * k for q, k in zip(query, key)) / math.sqrt(d) for key in keys]
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]

def make_query(keys, target, min_weight):
    scale = 1.0
    while True:
        query = [scale * v for v in keys[target]]
        if attention_weights(query, keys)[target] >= min_weight:
            return query
        scale *= 2
````

````task
id: cosine-similarity
title: Cosine similarity of embeddings
kind: code
level: easy
@@statement
Write `cosine_similarity(a, b)` and `most_similar(word, embeddings)`.

**Input**: `a`, `b` equal-length lists of floats. `embeddings` is a dict `word -> vector`; `word` is one of its keys.

**Output**
- `cosine_similarity` returns `dot(a, b) / (|a| * |b|)` as a float (checked within `1e-9`). If either vector has length 0 (all zeros) return `0.0`.
- `most_similar` returns the **other** word with the highest cosine similarity to `word`; ties go to the alphabetically first word. If there is no other word return `None`.

**Example**

```
cosine_similarity([1, 2, 3], [2, 4, 6]) -> 1.0
cosine_similarity([1, 0], [0, 1])       -> 0.0
emb = {"king": [0.9, 0.8], "queen": [0.85, 0.9], "apple": [0.1, -0.9]}
most_similar("king", emb) -> "queen"
```
@@starter
import math

def cosine_similarity(a, b):
    # your code here
    pass

def most_similar(word, embeddings):
    # your code here
    pass
@@tests
assert abs(cosine_similarity([1, 2, 3], [2, 4, 6]) - 1.0) < 1e-9, "parallel vectors"
assert abs(cosine_similarity([1, 0], [0, 1])) < 1e-9, "orthogonal vectors"
assert abs(cosine_similarity([1, 1], [-1, -1]) + 1.0) < 1e-9, "opposite vectors"
assert abs(cosine_similarity([3, 4], [4, 3]) - 0.96) < 1e-9, "known value 24/25"
assert cosine_similarity([0, 0], [1, 2]) == 0.0, "zero vector"
_emb = {"king": [0.9, 0.8], "queen": [0.85, 0.9], "apple": [0.1, -0.9]}
assert most_similar("king", _emb) == "queen", "nearest word"
assert most_similar("apple", _emb) == "queen" or most_similar("apple", _emb) == "king", "returns another word"
assert most_similar("apple", {"apple": [1, 0], "b": [0, 1], "a": [0, 1]}) == "a", "tie goes to the alphabetically first word"
assert most_similar("solo", {"solo": [1, 2]}) is None, "no other word"
@@hint
`math.sqrt(sum(x * x for x in a))` is the length. For `most_similar`, sort candidates by `(-similarity, word)`.
@@solution
import math

def cosine_similarity(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / (na * nb)

def most_similar(word, embeddings):
    target = embeddings[word]
    others = [w for w in embeddings if w != word]
    if not others:
        return None
    return min(others, key=lambda w: (-cosine_similarity(target, embeddings[w]), w))
````

````task
id: positional-encoding
title: Sinusoidal positional encoding
kind: code
level: easy
@@statement
Transformers add a position signal to each token embedding. Write `positional_encoding(pos, d_model)` using the formula from "Attention Is All You Need":

```
PE[pos][2i]     = sin(pos / 10000^(2i / d_model))
PE[pos][2i + 1] = cos(pos / 10000^(2i / d_model))
```

**Input**: `pos`, an int >= 0; `d_model`, a positive **even** int. Raise `ValueError` for an odd or non-positive `d_model`.

**Output**: a list of `d_model` floats (checked within `1e-9`).

**Example**

```
positional_encoding(0, 4) -> [0.0, 1.0, 0.0, 1.0]
positional_encoding(1, 4) -> [sin(1), cos(1), sin(1/100), cos(1/100)]
                           = [0.8415, 0.5403, 0.0100, 0.99995]
```
@@starter
import math

def positional_encoding(pos, d_model):
    # your code here
    pass

print(positional_encoding(1, 4))
@@tests
import math as _math
assert positional_encoding(0, 4) == [0.0, 1.0, 0.0, 1.0], "position 0"
_pe = positional_encoding(1, 4)
assert all(abs(a - b) < 1e-9 for a, b in zip(_pe, [_math.sin(1), _math.cos(1), _math.sin(0.01), _math.cos(0.01)])), "position 1"
assert len(positional_encoding(7, 16)) == 16, "length d_model"
_p = positional_encoding(5, 8)
assert all(abs(_p[2 * i] ** 2 + _p[2 * i + 1] ** 2 - 1) < 1e-9 for i in range(4)), "each sin/cos pair has length 1"
assert abs(positional_encoding(3, 2)[0] - _math.sin(3)) < 1e-9, "d_model 2"
for _d in (3, 0):
    try:
        positional_encoding(1, _d)
        _ok = False
    except ValueError:
        _ok = True
    assert _ok, "odd or zero d_model raises ValueError"
@@hint
For index `j`, the pair number is `i = j // 2`; compute the angle `pos / 10000 ** (2 * i / d_model)` and use `sin` for even `j`, `cos` for odd `j`.
@@solution
import math

def positional_encoding(pos, d_model):
    if d_model <= 0 or d_model % 2:
        raise ValueError("d_model must be a positive even number")
    out = []
    for j in range(d_model):
        angle = pos / 10000 ** (2 * (j // 2) / d_model)
        out.append(math.sin(angle) if j % 2 == 0 else math.cos(angle))
    return out
````

````task
id: ngram-model
title: Word model with one or two words of context
kind: code
level: medium
@@statement
Extend the "which word follows" model so it can look at the previous **two** words. Write three functions.

1. `build_ngram_model(words, order)`: for every position `i >= order`, count `words[i]` under the key `tuple(words[i - order:i])`. Return a dict `context_tuple -> {next_word: count}`.
2. `predict_next(model, context)`: `context` is a list of the last `order` words. Return the most frequent next word (ties: alphabetically first), or `None` if the context was never seen.
3. `generate(model, start, n, order)`: start from the list `start`, then repeatedly append `predict_next` of the last `order` words, at most `n` times, stopping early at `None`. Return the full list (a new list).

**Example**

```
words = "the cat sat on the mat the cat ran".split()
m1 = build_ngram_model(words, 1)
m1[("the",)]                      -> {"cat": 2, "mat": 1}
predict_next(m1, ["cat"])         -> "ran"     (sat and ran tie, ran is first alphabetically)
m2 = build_ngram_model(words, 2)
predict_next(m2, ["on", "the"])   -> "mat"
generate(m2, ["on", "the"], 3, 2) -> ["on", "the", "mat", "the", "cat"]
```
@@starter
def build_ngram_model(words, order):
    # your code here
    pass

def predict_next(model, context):
    # your code here
    pass

def generate(model, start, n, order):
    # your code here
    pass
@@tests
_words = "the cat sat on the mat the cat ran".split()
_m1 = build_ngram_model(_words, 1)
assert _m1[("the",)] == {"cat": 2, "mat": 1}, "order 1 counts"
assert predict_next(_m1, ["the"]) == "cat", "most frequent"
assert predict_next(_m1, ["cat"]) == "ran", "tie goes to the alphabetically first word"
assert predict_next(_m1, ["dog"]) is None, "unseen context"
_m2 = build_ngram_model(_words, 2)
assert _m2[("the", "cat")] == {"sat": 1, "ran": 1}, "order 2 counts"
assert predict_next(_m2, ["on", "the"]) == "mat", "two words of context"
assert generate(_m2, ["on", "the"], 3, 2) == ["on", "the", "mat", "the", "cat"], "generate with order 2"
assert generate(_m1, ["the"], 5, 1) == ["the", "cat", "ran"], "generation stops at an unseen context"
_start = ["the"]
generate(_m1, _start, 2, 1)
assert _start == ["the"], "do not change the start list"
assert build_ngram_model(["a"], 2) == {}, "text shorter than the context"
@@hint
Use `model.setdefault(ctx, {})` and `d[w] = d.get(w, 0) + 1` while building; pick with `min(d, key=lambda w: (-d[w], w))`.
@@solution
def build_ngram_model(words, order):
    model = {}
    for i in range(order, len(words)):
        ctx = tuple(words[i - order:i])
        nxt = model.setdefault(ctx, {})
        nxt[words[i]] = nxt.get(words[i], 0) + 1
    return model

def predict_next(model, context):
    counts = model.get(tuple(context))
    if not counts:
        return None
    return min(counts, key=lambda w: (-counts[w], w))

def generate(model, start, n, order):
    out = list(start)
    for _ in range(n):
        nxt = predict_next(model, out[-order:])
        if nxt is None:
            break
        out.append(nxt)
    return out
````

````task
id: temperature-sampling
title: Temperature and sampling
kind: code
level: medium
@@statement
Write two functions that show how temperature changes a language model's choices.

1. `temperature_probs(logits, temperature)`: softmax of `logit / temperature` (numerically stable). Raise `ValueError` if `temperature <= 0`.
2. `sample_index(probs, r)`: deterministic sampling. Given `r` in `[0, 1)` (normally from `random.random()`), return the first index `i` whose cumulative probability `probs[0] + ... + probs[i]` is **greater than** `r`. If float rounding means none is, return the last index.

**Output**: a list of floats summing to 1 (checked within `1e-6`); an int.

**Example**

```
temperature_probs([2, 1, 0], 1.0)  -> [0.665, 0.245, 0.090]
temperature_probs([2, 1, 0], 0.5)  -> [0.867, 0.117, 0.016]   # sharper
temperature_probs([2, 1, 0], 10.0) -> [0.367, 0.332, 0.301]   # flatter
sample_index([0.5, 0.3, 0.2], 0.65) -> 1    (cumulative 0.5, 0.8, 1.0)
```
@@starter
import math

def temperature_probs(logits, temperature):
    # your code here
    pass

def sample_index(probs, r):
    # your code here
    pass

for t in (0.1, 0.5, 1.0, 3.0):
    print(t, temperature_probs([2, 1, 0], t))
@@tests
_p = temperature_probs([2, 1, 0], 1.0)
assert all(abs(a - b) < 1e-3 for a, b in zip(_p, [0.665, 0.245, 0.090])), "T = 1 is plain softmax"
_s = temperature_probs([2, 1, 0], 0.5)
assert all(abs(a - b) < 1e-3 for a, b in zip(_s, [0.867, 0.117, 0.016])), "T = 0.5 is sharper"
assert temperature_probs([2, 1, 0], 0.01)[0] > 0.999, "tiny T is almost greedy (no overflow)"
_f = temperature_probs([2, 1, 0], 100.0)
assert max(_f) - min(_f) < 0.01, "huge T is almost uniform"
assert abs(sum(temperature_probs([5, -3, 0.5, 2], 0.7)) - 1.0) < 1e-9, "sums to 1"
try:
    temperature_probs([1, 2], 0)
    _ok = False
except ValueError:
    _ok = True
assert _ok, "temperature 0 raises ValueError"
assert sample_index([0.5, 0.3, 0.2], 0.0) == 0, "r = 0"
assert sample_index([0.5, 0.3, 0.2], 0.65) == 1, "middle"
assert sample_index([0.5, 0.3, 0.2], 0.5) == 1, "cumulative must be greater than r"
assert sample_index([0.5, 0.3, 0.2], 0.95) == 2, "last bucket"
assert sample_index([0.1, 0.2, 0.3], 0.99) == 2, "rounding / short total falls back to the last index"
@@hint
Divide each logit by the temperature first, then subtract the maximum before `math.exp`. For sampling keep a running total in a loop.
@@solution
import math

def temperature_probs(logits, temperature):
    if temperature <= 0:
        raise ValueError("temperature must be > 0")
    scaled = [v / temperature for v in logits]
    m = max(scaled)
    exps = [math.exp(v - m) for v in scaled]
    total = sum(exps)
    return [e / total for e in exps]

def sample_index(probs, r):
    cumulative = 0.0
    for i, p in enumerate(probs):
        cumulative += p
        if cumulative > r:
            return i
    return len(probs) - 1
````

````task
id: char-lm-data
title: Training data for a character-level model
kind: code
level: easy
@@statement
Before training a small character-level transformer you must turn text into numbers and (context, target) examples. Write two functions.

1. `build_vocab(text)`: a dict mapping each distinct character to an index, in **sorted** character order starting at 0.
2. `training_pairs(text, context_len, vocab)`: for every position `i` from `context_len` to `len(text) - 1`, the pair `(context_ids, target_id)` where `context_ids` is the list of ids of `text[i - context_len:i]` and `target_id` is the id of `text[i]`. Text not longer than `context_len` gives `[]`.

**Output**: a dict; a list of `(list_of_ints, int)` tuples.

**Example**

```
vocab = build_vocab("hello")             -> {"e": 0, "h": 1, "l": 2, "o": 3}
training_pairs("hello", 2, vocab)
contexts "he"->"l", "el"->"l", "ll"->"o"
-> [([1, 0], 2), ([0, 2], 2), ([2, 2], 3)]
```
@@starter
def build_vocab(text):
    # your code here
    pass

def training_pairs(text, context_len, vocab):
    # your code here
    pass
@@tests
_v = build_vocab("hello")
assert _v == {"e": 0, "h": 1, "l": 2, "o": 3}, "sorted vocabulary"
assert training_pairs("hello", 2, _v) == [([1, 0], 2), ([0, 2], 2), ([2, 2], 3)], "pairs with context 2"
assert training_pairs("hello", 1, _v) == [([1], 0), ([0], 2), ([2], 2), ([2], 3)], "context 1"
assert training_pairs("he", 2, _v) == [], "text not longer than the context"
assert build_vocab("") == {}, "empty text"
assert build_vocab("ba a") == {" ": 0, "a": 1, "b": 2}, "space is a character too"
assert len(training_pairs("abcabcabc", 3, build_vocab("abc"))) == 6, "number of pairs is len - context_len"
@@hint
`sorted(set(text))` gives the characters in order; `enumerate` gives their ids.
@@solution
def build_vocab(text):
    return {ch: i for i, ch in enumerate(sorted(set(text)))}

def training_pairs(text, context_len, vocab):
    pairs = []
    for i in range(context_len, len(text)):
        context = [vocab[c] for c in text[i - context_len:i]]
        pairs.append((context, vocab[text[i]]))
    return pairs
````

````task
id: llm-temperature-runs
title: Compare LLM outputs at two temperatures
kind: text
level: medium
@@statement
You called an LLM API ten times with the prompt `Suggest one name for a small coffee shop. Answer with the name only.`

| temperature | outputs (10 runs) |
|---|---|
| 0 | "The Daily Grind" x 9, "Daily Grind" x 1 |
| 1 | "Bean There", "The Daily Grind", "Brew Haven", "Bean There", "Morning Ritual", "The Cozy Cup", "Grind & Co.", "Brew Haven", "Little Roast", "Steam & Bean" |

**Deliverable** (8-12 sentences)
1. Explain what temperature does to the token probabilities and why T=1 gave 8 distinct names while T=0 gave almost one.
2. Explain why T=0 still produced one different answer (name at least one real cause).
3. Recommend a temperature for (a) extracting the invoice number and total from an email as JSON and (b) brainstorming 20 shop names, with reasons.
4. Say what you would log or fix in a test so results are reproducible enough to compare prompts.
@@hint
Temperature divides the logits before the softmax; T close to 0 approaches always picking the most likely token.
@@solution
Temperature divides the logits before the softmax. A low temperature makes the distribution sharper, so the most likely token wins almost every time; T=0 is treated as greedy decoding. At T=1 the model samples from its real distribution, so less likely first tokens such as "Bean" or "Brew" get picked sometimes, and once the first token differs the rest of the name differs too, which is why 8 distinct names appeared in 10 runs.

T=0 is not a strict guarantee of identical output: GPU floating-point arithmetic is not perfectly deterministic (batching and parallel reductions change the order of additions), so two tokens with almost equal scores can swap; providers may also update the model or route requests to different hardware. Here "The" and "Daily" as first tokens were probably very close.

(a) For extraction use T=0 (or very low), because there is one right answer and variation only adds errors; combine it with a JSON schema or validation. (b) For brainstorming use T around 0.8-1.0, because variety is the goal; ask for 20 names in one call to avoid duplicates across calls.

For reproducible tests, log the model version, temperature, top_p, max tokens, the full prompt and the seed (if the API supports one), run each prompt several times, and compare distributions or pass rates rather than single outputs.
@@criteria
- Explains that temperature rescales logits before the softmax: low T sharpens, high T flattens.
- Links the 8 distinct names at T=1 to sampling and the near-identical outputs at T=0 to greedy choice.
- Gives a real cause of variation at T=0 (non-deterministic floating-point/GPU computation, model updates, near-tied tokens).
- Recommends low T for extraction and higher T for brainstorming, with reasons.
- Lists concrete things to log or fix for reproducibility (model version, parameters, seed, repeated runs).
````
