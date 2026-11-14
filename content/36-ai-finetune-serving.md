---
id: ai-finetune-serving
title: Fine-tuning, quantisation and model serving
minutes: 50
---

Fine-tune last. First try a better prompt, then few-shot examples, then retrieval, then a stronger model. Fine-tune when you need a consistent style or format, a narrow skill, lower cost through a smaller model, or behaviour that prompts cannot produce. This lesson covers how fine-tuning works, how models are shrunk, and how they are served.

## When to fine-tune

| Need | Best tool |
| --- | --- |
| The model lacks facts about your documents | RAG |
| The model needs up-to-date information | RAG or tools |
| The output format or tone is inconsistent | Better prompt and examples first; then fine-tuning |
| A narrow task repeated millions of times, cost matters | Fine-tune a small model |
| A specialised skill: your code style, a domain's jargon, a classification scheme | Fine-tuning |
| Data must not leave your network | A self-hosted open-weight model, possibly fine-tuned |

Fine-tuning teaches **behaviour**. It is an unreliable way to add **facts**, and every fact update would need retraining.

## Kinds of fine-tuning

| Method | What changes | Cost | Use |
| --- | --- | --- | --- |
| Full fine-tuning | Every weight | High; a full copy of the model per task | Rare for large models |
| LoRA | Small added matrices; the base model is frozen | Low; adapters are a few megabytes | The standard approach |
| QLoRA | LoRA on a 4-bit quantised base model | Fits on a single consumer GPU | Fine-tuning on limited hardware |
| Provider fine-tuning | You upload data to an API provider | No infrastructure | Hosted models |

## How LoRA works

A weight matrix W of size d × d has millions of entries. LoRA freezes W and learns two thin matrices: B of size d × r and A of size r × d, where the **rank** r is small, such as 8 or 16. The effective weight becomes W + B·A. You train well under 1% of the parameters. Afterwards the adapter can be merged into W, or kept separate and swapped per task.

```python run
d = 4096                       # width of one weight matrix in a mid-size model
layers_adapted = 48            # how many matrices get an adapter

full = d * d * layers_adapted
for r in (4, 8, 16, 64):
    lora = (d * r + r * d) * layers_adapted
    print(f"rank {r:2}: {lora:>12,} trainable parameters = {lora / full:.2%} of full fine-tuning ({full:,})")

# The mechanics on a tiny example: W + B @ A
W = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
B = [[0.5], [0.0], [-0.2]]     # 3 x 1
A = [[1.0, 2.0, 0.0]]          # 1 x 3   -> rank 1
delta = [[B[i][0] * A[0][j] for j in range(3)] for i in range(3)]
adapted = [[W[i][j] + delta[i][j] for j in range(3)] for i in range(3)]
print("adapted weight matrix:", adapted)
```

The intuition: adapting a model to a new task changes its weights in a small number of directions, so a low-rank update captures most of what is needed.

## The fine-tuning process

1. **Build the dataset**: a few hundred to a few thousand high-quality examples in chat format (system, user, assistant). Quality and consistency matter far more than volume. Every example is a demonstration of exactly what you want.
2. **Split**: hold out a test set the model never trains on.
3. **Build the evaluation first** and measure the untuned model with a good prompt. That is your baseline, and sometimes it turns out to be good enough.
4. **Train**: choose the rank, the learning rate (around 1e-4 to 2e-4 for LoRA) and the epochs (1 to 3). Watch validation loss; rising validation loss while training loss falls is overfitting.
5. **Evaluate** against the baseline on the held-out set, and read the outputs.
6. **Deploy** the adapter or the merged model, with monitoring.

```python run
import json, random
random.seed(0)

# Task: turn free-text defect notes into a fixed JSON record.
raw = [("scratch on left door panel, about 3 cm", {"defect": "scratch", "location": "left door", "severity": "minor"}),
       ("deep dent rear bumper", {"defect": "dent", "location": "rear bumper", "severity": "major"}),
       ("paint run near fuel cap, small", {"defect": "paint run", "location": "fuel cap", "severity": "minor"}),
       ("windshield crack spreading from corner", {"defect": "crack", "location": "windshield", "severity": "critical"}),
       ("misaligned hood gap 4mm", {"defect": "misalignment", "location": "hood", "severity": "major"})]

SYSTEM = "Convert the inspection note into JSON with keys defect, location, severity."
examples = [{"messages": [{"role": "system", "content": SYSTEM},
                          {"role": "user", "content": note},
                          {"role": "assistant", "content": json.dumps(label)}]} for note, label in raw]

random.shuffle(examples)
split = int(len(examples) * 0.8)
train, test = examples[:split], examples[split:]
print("one training line (JSONL):")
print(json.dumps(train[0]))
print(f"\n{len(train)} training examples, {len(test)} held out. A real dataset needs hundreds, checked for consistency.")
```

With the Hugging Face libraries, the training code is short:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model

base = AutoModelForCausalLM.from_pretrained("<base-model>", device_map="auto")
tokenizer = AutoTokenizer.from_pretrained("<base-model>")

config = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                    target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")
model = get_peft_model(base, config)
model.print_trainable_parameters()          # typically under 1% of the total
# then train with the Hugging Face Trainer, or TRL's SFTTrainer, on the JSONL dataset
```

Tools: Hugging Face `transformers`, `peft`, `datasets` and `trl`; Unsloth and Axolotl wrap these for faster and simpler runs. The Hugging Face Hub hosts models, datasets and demos.

Related techniques:

- **Distillation**: train a small model on a large model's outputs to get most of the quality at a fraction of the cost.
- **Preference tuning** (such as DPO): train on pairs of better and worse answers.
- **Fine-tuning embedding models and rerankers** on your own data, which often improves a RAG system more than fine-tuning the generator.
- **Synthetic data**: use a strong model to draft training examples, then review them by hand.

## Quantisation

Weights are normally stored as 16-bit floating-point numbers. **Quantisation** stores them in 8 or 4 bits. Memory shrinks, inference often speeds up, and quality drops slightly at 8-bit and noticeably but usually acceptably at 4-bit.

```python run
def memory_gb(parameters_billion, bits):
    return parameters_billion * 1e9 * bits / 8 / 1e9

print("model size   16-bit    8-bit    4-bit")
for params in (1, 3, 8, 32, 70):
    print(f"{params:>3}B params  {memory_gb(params, 16):6.1f} GB {memory_gb(params, 8):6.1f} GB {memory_gb(params, 4):6.1f} GB")

# What quantisation does to numbers: map floats onto a small set of integer levels
weights = [-0.82, -0.11, 0.03, 0.47, 0.95]
lo, hi, levels = min(weights), max(weights), 2 ** 4 - 1           # 4 bits -> 16 levels
quantised = [round((w - lo) / (hi - lo) * levels) for w in weights]
restored = [lo + q / levels * (hi - lo) for q in quantised]
print("\noriginal :", weights)
print("4-bit ints:", quantised)
print("restored :", [round(x, 2) for x in restored], " small rounding error")
```

Add memory for the context being processed; long contexts and large batches need considerably more than the weights alone.

Formats you will see: **GGUF** (for llama.cpp and Ollama; runs on CPUs and Apple silicon as well as GPUs), **AWQ** and **GPTQ** (GPU serving), and **bitsandbytes** (loading in 4-bit for QLoRA).

## Serving models

| Option | What it is | Use |
| --- | --- | --- |
| Ollama, llama.cpp, LM Studio | Run quantised models locally with one command | Development; private or offline use; edge devices |
| vLLM | A high-throughput GPU server with an OpenAI-compatible API | Production self-hosting |
| Hugging Face TGI, NVIDIA Triton and NIM | Production inference servers | Enterprise deployments |
| ONNX Runtime, TensorRT, OpenVINO | Optimised runtimes for classical and vision models | Low-latency inference; edge and industrial PCs |
| Managed endpoints | Bedrock, Vertex AI, Azure AI Foundry; fast open-model hosts such as Groq and Together | No GPU operations |

Ollama exposes an OpenAI-compatible API on your own machine, so the client code from [the LLM APIs lesson](#ai-llm-apis) works by changing one line:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:11434/v1", api_key="not-needed")
resp = client.chat.completions.create(model="<local-model-name>", messages=[{"role": "user", "content": "Hello"}])
```

### What decides serving performance

- **Throughput** is total tokens per second across all users. **Latency** is how long one user waits, measured as time to first token and tokens per second after that.
- **Batching**: a GPU processes many requests together almost as fast as one. Servers such as vLLM add new requests to the running batch continuously. Larger batches raise throughput and can raise each user's latency.
- **KV caching** reuses computation for the tokens already processed.
- **Context length** and output length drive both cost and time.
- **Quantisation** and smaller models trade quality for speed.

```python run
def simulate(batch_size, tokens_per_request=200, single_stream_tps=40, batch_efficiency=0.85):
    # each added stream slows the others a little, yet total throughput rises
    per_stream = single_stream_tps * (batch_efficiency ** (batch_size ** 0.5 - 1))
    total = per_stream * batch_size
    return per_stream, total, tokens_per_request / per_stream

print("batch  tokens/s per user  total tokens/s  seconds per answer")
for b in (1, 4, 16, 64):
    per, total, secs = simulate(b)
    print(f"{b:5}  {per:17.1f}  {total:14.0f}  {secs:18.1f}")
```

The numbers are illustrative; the shape is what matters. Measure your own model on your own hardware with a load test.

## Self-host or use an API?

| | API | Self-hosted |
| --- | --- | --- |
| Effort to start | Minutes | Days to weeks |
| Cost at low volume | Low | High, because GPUs sit idle |
| Cost at very high, steady volume | High | Can be lower |
| Data stays inside your network | No, unless a private deployment | Yes |
| Quality ceiling | The strongest models available | The best open-weight models |
| Customisation | Limited | Full |
| Operations | None | GPUs, scaling, upgrades, monitoring |

Data-sensitive settings such as manufacturing plants, banks and hospitals often self-host small models for the privacy row alone. A common pattern is hybrid: a small local model for routine and sensitive work, an API model for the hard cases.

## Serving classical and vision models

The same principles apply to non-LLM models: export to an optimised format (ONNX), serve behind an API (FastAPI, BentoML, Triton), batch requests, and monitor latency and accuracy. On a factory line the model often runs on an industrial PC or edge GPU beside the camera, because the network round trip to a data centre is too slow or too unreliable for a decision that must be made within a cycle time.

## Check yourself

```quiz
[
  {"q": "Your assistant does not know your company's policies. What should you try before fine-tuning?", "options": ["Nothing; fine-tune immediately", "RAG over the policy documents", "A larger context window only"], "answer": 1, "why": "Missing facts are a retrieval problem; fine-tuning is unreliable for adding facts."},
  {"q": "What does LoRA train?", "options": ["Every weight in the model", "Small low-rank matrices added to frozen weights", "Only the tokeniser"], "answer": 1, "why": "The base model is frozen, so the adapter is tiny and cheap to train."},
  {"q": "A model has 8 billion parameters. Roughly how much memory do its weights need at 4-bit?", "options": ["About 4 GB", "About 16 GB", "About 64 GB"], "answer": 0, "why": "8 × 10⁹ × 4 bits ÷ 8 = 4 GB, plus memory for the context."},
  {"q": "Why does batching raise throughput on a GPU?", "options": ["It uses less electricity", "A GPU processes many requests in parallel almost as fast as one", "It shortens the prompts"], "answer": 1, "why": "Parallel hardware is wasted on one request at a time."},
  {"q": "When is self-hosting clearly justified?", "options": ["Whenever you want the newest model", "When data must stay in your network, or volume is very high and steady", "For a weekend prototype"], "answer": 1, "why": "Privacy and scale are the strong reasons; otherwise an API is simpler."},
  {"q": "What is the first thing to build when starting a fine-tuning project?", "options": ["The training script", "An evaluation set and a prompted baseline", "A user interface"], "answer": 1, "why": "Without a baseline you cannot tell whether fine-tuning helped."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: find-conflicting-examples
title: Find inconsistent training examples
kind: code
level: easy
@@statement
Before fine-tuning, check that the training set is consistent. Write `find_conflicts(examples)`.

**Input**: `examples` is a list of `(input_text, output_text)` tuples.

**Output**: a sorted list of input texts that appear more than once with **different** outputs. Compare inputs after `strip()` and `lower()`, and compare outputs after `strip()` only. The returned strings are the normalised inputs, each reported once. The same input with the same output repeated is not a conflict. Empty input gives `[]`.

**Example**

```
find_conflicts([("Total 5 EUR", "5"), ("total 5 eur ", "5.00"), ("Hi", "x"), ("Hi", "x")])
-> ["total 5 eur"]
```
@@starter
def find_conflicts(examples):
    # your code here
    pass
@@tests
assert find_conflicts([("Total 5 EUR", "5"), ("total 5 eur ", "5.00"), ("Hi", "x"), ("Hi", "x")]) == ["total 5 eur"], "case and space normalised"
assert find_conflicts([]) == [], "empty"
assert find_conflicts([("a", "1"), ("b", "2")]) == [], "no duplicates"
assert find_conflicts([("b", "1"), ("b", "2"), ("a", "1"), ("a", "2")]) == ["a", "b"], "sorted"
assert find_conflicts([("a", " 1"), ("a", "1 ")]) == [], "outputs are stripped"
assert find_conflicts([("a", "1"), ("a", "2"), ("a", "3")]) == ["a"], "reported once"
@@hint
Build a dict from normalised input to a `set` of outputs; conflicts are the keys whose set has more than one element.
@@solution
def find_conflicts(examples):
    seen = {}
    for text, out in examples:
        seen.setdefault(text.strip().lower(), set()).add(out.strip())
    return sorted(k for k, v in seen.items() if len(v) > 1)
````

````task
id: split-examples
title: Train, validation and test split
kind: code
level: easy
@@statement
Write `split_examples(examples, train=0.7, val=0.15)` that splits a dataset deterministically.

**Input**: `examples` a list of any items; `train` and `val` fractions (the remainder is the test set).

**Output**: a tuple `(train_list, val_list, test_list)`. Do not shuffle; keep the original order. With `n = len(examples)`, the training set is the first `int(n * train)` items, the validation set the next `int(n * val)` items, and the test set everything left. The input list must not be modified. Empty input gives three empty lists.

**Example**

```
split_examples(list(range(10)))
-> ([0, 1, 2, 3, 4, 5, 6], [7], [8, 9])
```
(`int(10*0.7)=7`, `int(10*0.15)=1`)
@@starter
def split_examples(examples, train=0.7, val=0.15):
    # your code here
    pass
@@tests
assert split_examples(list(range(10))) == ([0, 1, 2, 3, 4, 5, 6], [7], [8, 9]), "10 items"
assert split_examples([]) == ([], [], []), "empty"
_x = list(range(40))
_tr, _va, _te = split_examples(_x)
assert (len(_tr), len(_va), len(_te)) == (28, 6, 6), "40 items give 28/6/6"
assert _tr + _va + _te == _x, "order kept and nothing lost"
assert split_examples([1, 2, 3, 4], train=0.5, val=0.25) == ([1, 2], [3], [4]), "custom fractions"
assert _x == list(range(40)), "input unchanged"
@@hint
Compute `a = int(n * train)` and `b = a + int(n * val)`, then slice at `a` and `b`.
@@solution
def split_examples(examples, train=0.7, val=0.15):
    n = len(examples)
    a = int(n * train)
    b = a + int(n * val)
    return list(examples[:a]), list(examples[a:b]), list(examples[b:])
````

````task
id: lora-parameter-count
title: LoRA parameter arithmetic
kind: code
level: easy
@@statement
A LoRA adapter on a weight matrix of shape `d_out x d_in` adds two small matrices `A (r x d_in)` and `B (d_out x r)`, so `r * (d_in + d_out)` trainable parameters. Write two functions.

1. `lora_total(layers, hidden, rank, n_targets)`: total LoRA parameters when each of `n_targets` square `hidden x hidden` matrices in each of `layers` layers gets an adapter of the given `rank`.
2. `trainable_percent(lora, base)`: `lora / base * 100` rounded to 3 decimals; `0.0` if `base` is 0.

**Output**: an `int` and a `float`.

**Example**

```
lora_total(32, 4096, 8, 4) -> 8388608
trainable_percent(8388608, 7_000_000_000) -> 0.12
```
(rank 8, 4 targets, 32 layers: 32 * 4 * 8 * (4096 + 4096))
@@starter
def lora_total(layers, hidden, rank, n_targets):
    pass

def trainable_percent(lora, base):
    pass
@@tests
assert lora_total(32, 4096, 8, 4) == 8388608, "rank 8"
assert lora_total(32, 4096, 32, 4) == 33554432, "rank 32 is 4x rank 8"
assert lora_total(0, 4096, 8, 4) == 0, "no layers"
assert lora_total(1, 10, 2, 1) == 40, "tiny model: 2 * (10 + 10)"
assert trainable_percent(8388608, 7000000000) == 0.12, "percent of a 7B model"
assert trainable_percent(5, 0) == 0.0, "zero base"
assert isinstance(lora_total(2, 8, 2, 2), int), "int result"
@@hint
Per matrix it is `rank * (hidden + hidden)`; multiply by `layers * n_targets`.
@@solution
def lora_total(layers, hidden, rank, n_targets):
    return layers * n_targets * rank * (hidden + hidden)

def trainable_percent(lora, base):
    if base == 0:
        return 0.0
    return round(lora / base * 100, 3)
````

````task
id: quantise-error
title: Quantise to n bits and measure the error
kind: code
level: medium
@@statement
Extend a symmetric quantiser to any bit width. Write two functions.

1. `quantise(values, bits)`: with `levels = 2 ** (bits - 1) - 1` and `scale = max(abs(v)) / levels`, replace each value by `round(v / scale) * scale` (the dequantised value). If `values` is empty or all zeros, return a list of `0.0` of the same length.
2. `mean_abs_error(values, bits)`: the mean of `abs(original - quantised)`; `0.0` for empty input.

**Input**: `values` list of floats; `bits` integer >= 2.

**Output**: a list of floats, and a float.

**Example**

```
quantise([2.0, -2.0, 0.0], 8)  -> [2.0, -2.0, 0.0]   (up to float rounding)
mean_abs_error([0.3, -0.7, 1.0], 8) < mean_abs_error([0.3, -0.7, 1.0], 4)  -> True
```
@@starter
def quantise(values, bits):
    pass

def mean_abs_error(values, bits):
    pass
@@tests
def _close(a, b):
    return abs(a - b) < 1e-9
_q = quantise([2.0, -2.0, 0.0], 8)
assert len(_q) == 3 and _close(_q[0], 2.0) and _close(_q[1], -2.0) and _close(_q[2], 0.0), "extremes survive"
assert quantise([], 8) == [], "empty"
assert quantise([0.0, 0.0], 4) == [0.0, 0.0], "all zeros"
_v = [0.3, -0.7, 1.0, 0.123, -0.456]
assert mean_abs_error(_v, 8) < mean_abs_error(_v, 4), "more bits, smaller error"
assert mean_abs_error([], 8) == 0.0, "empty error"
assert mean_abs_error(_v, 8) < 0.005, "8-bit error is tiny"
@@hint
Quantise to integers with `round(v / scale)`, then multiply back by `scale`. Guard the division when the maximum is 0.
@@solution
def quantise(values, bits):
    if not values or max(abs(v) for v in values) == 0:
        return [0.0 for _ in values]
    levels = 2 ** (bits - 1) - 1
    scale = max(abs(v) for v in values) / levels
    return [round(v / scale) * scale for v in values]

def mean_abs_error(values, bits):
    if not values:
        return 0.0
    q = quantise(values, bits)
    return sum(abs(a - b) for a, b in zip(values, q)) / len(values)
````

````task
id: load-test-summary
title: Summarise a load test
kind: code
level: medium
@@statement
Write `summarize_load(latencies_ms, duration_s)` to turn raw load-test measurements into throughput and latency percentiles.

**Input**: `latencies_ms` is a list of per-request latencies in milliseconds; `duration_s` the wall-clock length of the test in seconds (a positive number).

**Output**: a dict with
- `"requests_per_s"`: `len(latencies_ms) / duration_s`.
- `"mean_ms"`: the average latency.
- `"p50_ms"`, `"p95_ms"`: percentiles by the **nearest-rank** method: sort ascending, take index `ceil(p / 100 * n) - 1`.

For empty input, every value is `0.0`. Do not sort the input list in place.

**Example**

```
summarize_load([10, 20, 30, 40], 2)
-> {"requests_per_s": 2.0, "mean_ms": 25.0, "p50_ms": 20, "p95_ms": 40}
```
@@starter
import math

def summarize_load(latencies_ms, duration_s):
    # your code here
    pass
@@tests
assert summarize_load([10, 20, 30, 40], 2) == {"requests_per_s": 2.0, "mean_ms": 25.0, "p50_ms": 20, "p95_ms": 40}, "four requests"
assert summarize_load([], 5) == {"requests_per_s": 0.0, "mean_ms": 0.0, "p50_ms": 0.0, "p95_ms": 0.0}, "empty"
assert summarize_load([7], 1) == {"requests_per_s": 1.0, "mean_ms": 7.0, "p50_ms": 7, "p95_ms": 7}, "single"
_l = list(range(100, 0, -1))
_o = summarize_load(_l, 10)
assert _o["p50_ms"] == 50 and _o["p95_ms"] == 95, "unsorted input, 100 values"
assert _l[0] == 100, "input not sorted in place"
@@hint
Sort a copy, then write a small helper that returns `s[math.ceil(p / 100 * n) - 1]`.
@@solution
import math

def summarize_load(latencies_ms, duration_s):
    n = len(latencies_ms)
    if n == 0:
        return {"requests_per_s": 0.0, "mean_ms": 0.0, "p50_ms": 0.0, "p95_ms": 0.0}
    s = sorted(latencies_ms)
    def pct(p):
        return s[math.ceil(p / 100 * n) - 1]
    return {"requests_per_s": n / duration_s, "mean_ms": sum(s) / n, "p50_ms": pct(50), "p95_ms": pct(95)}
````

````task
id: breakeven-selfhost
title: Self-host or API break-even
kind: code
level: easy
@@statement
Write `breakeven_requests(fixed_monthly, self_per_req, api_per_req)` that returns the smallest number of requests per month at which self-hosting (for example with Ollama on your own GPU) costs no more than an API.

**Input**: all three are integers in **cents** (or any whole unit): the fixed monthly cost of the GPU server, the extra cost per request when self-hosting, and the API cost per request.

**Output**: an int or `None`. Self-host total = `fixed_monthly + n * self_per_req`; API total = `n * api_per_req`. Return the smallest integer `n >= 0` with self-host total <= API total. If `fixed_monthly` is 0, return `0`. Otherwise, if `api_per_req <= self_per_req` (self-hosting never catches up), return `None`.

**Example**

```
breakeven_requests(100000, 1, 3) -> 50000    # 100000 + n <= 3n  ->  n >= 50000
breakeven_requests(100000, 3, 3) -> None
```
@@starter
def breakeven_requests(fixed_monthly, self_per_req, api_per_req):
    # your code here
    pass
@@tests
assert breakeven_requests(100000, 1, 3) == 50000, "exact division"
assert breakeven_requests(100001, 1, 3) == 50001, "rounds up"
assert breakeven_requests(100000, 3, 3) is None, "never cheaper"
assert breakeven_requests(100000, 5, 3) is None, "self-host dearer per request"
assert breakeven_requests(0, 1, 3) == 0, "no fixed cost"
assert breakeven_requests(0, 3, 3) == 0, "no fixed cost and equal prices"
assert breakeven_requests(10, 0, 1) == 10, "free per request"
@@hint
Rearrange to `n * (api - self) >= fixed` and round the division up with integer arithmetic: `-(-fixed // diff)`.
@@solution
def breakeven_requests(fixed_monthly, self_per_req, api_per_req):
    if fixed_monthly == 0:
        return 0
    diff = api_per_req - self_per_req
    if diff <= 0:
        return None
    return -(-fixed_monthly // diff)
````

````task
id: qlora-plan
title: Plan a fine-tune and its baseline
kind: text
level: medium
@@statement
Scenario: you want a small open-weight model (3B parameters) to extract `{vendor, date, total, currency}` from 2,000 supplier emails. You have 40 hand-labelled examples now and can label 160 more. A prompted large model currently scores 82% exact-match on 100 held-out emails; the target is 92% at a quarter of the cost.

**Deliverable**: a plan of 250 to 400 words covering:
1. Dataset: how you reach 200 examples, the train/validation/test split in exact counts, and two consistency checks you run on the labels.
2. Method: why QLoRA, with a rank and the rough number of trainable parameters or memory you expect on a free 16 GB GPU.
3. Evaluation: the exact metric, the baseline you compare against, and what result makes you ship, keep prompting, or collect more data.
4. One risk (for example leakage between train and test) and how you avoid it.
@@solution
Dataset: label 160 more emails to reach 200. Split 140 train, 20 validation, 40 test; the existing 100 held-out emails used for the 82% baseline stay untouched as the final test set, so the 40 test emails are only for quick iteration. Checks: run a script that finds the same input with different outputs, and normalise formats (dates to YYYY-MM-DD, totals as numbers, ISO currency codes). Have a second person relabel 20 examples and compute agreement.

Method: QLoRA keeps the 3B base weights in 4-bit (about 2 GB) and trains rank-16 adapters on the attention matrices, roughly 10 to 15 million trainable parameters (well under 1% of the model), which fits a free 16 GB GPU with batch size 4 and sequence length 1,024. Train 2 to 3 epochs and watch validation loss.

Evaluation: the metric is exact match per field and for the whole record, on the 100 held-out emails, using the same scoring script as the baseline. Ship if whole-record exact match is at least 92% and the cost per email is a quarter or less. If it lands between 82% and 92%, add examples for the failing field types and retrain; if it is below the prompted baseline, stop fine-tuning and keep the large model.

Risk: leakage, such as the same vendor template or a duplicated email appearing in both train and test. Deduplicate by normalised text and split by vendor so the test vendors are unseen.
@@criteria
- States exact split counts that add up to the data available (for example 140/20/40) and keeps a test set untouched.
- Names two label consistency checks such as conflict detection, format normalisation or double labelling.
- Explains QLoRA with a rank and a plausible memory or trainable parameter figure.
- Defines a concrete metric, the prompted baseline (82%) and a decision rule tied to the 92% target and cost.
- Names a risk such as leakage or duplicates and a specific mitigation.
````
