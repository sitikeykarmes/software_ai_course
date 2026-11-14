---
id: ai-maths-data
title: Maths and data foundations for AI
minutes: 65
---

Four areas of maths sit under all of machine learning: linear algebra, calculus, probability and statistics. You need them at a working level: enough to read a model's description and understand what it computes. Every example here runs in plain Python so you can see the mechanics; in real work NumPy does the same things thousands of times faster.

## Linear algebra

### Vectors

A vector is a list of numbers. A row of a table is a vector of features. A sentence embedding is a vector of about a thousand numbers. An image is a very long vector of pixel values.

```python run
import math

def dot(a, b):
    return sum(x * y for x, y in zip(a, b))

def norm(a):
    return math.sqrt(dot(a, a))

def cosine(a, b):
    return dot(a, b) / (norm(a) * norm(b))

# Each document as counts of the words [gearbox, oil, leak, invoice, payment]
doc_a = [3, 2, 1, 0, 0]       # maintenance report
doc_b = [2, 3, 2, 0, 0]       # another maintenance report
doc_c = [0, 0, 0, 4, 3]       # finance email

print("dot(a, b)       =", dot(doc_a, doc_b))
print("length of a     =", round(norm(doc_a), 2))
print("cosine(a, b)    =", round(cosine(doc_a, doc_b), 3), " similar topics")
print("cosine(a, c)    =", round(cosine(doc_a, doc_c), 3), " unrelated")
```

- The **dot product** multiplies matching entries and adds them up. It is large when two vectors point the same way.
- The **norm** is a vector's length.
- **Cosine similarity** is the dot product divided by both lengths: 1 means the same direction, 0 means unrelated, -1 means opposite. Semantic search ranks documents with exactly this.

### Matrices

A matrix is a grid of numbers. Multiplying a vector by a matrix transforms it. One layer of a neural network is `output = activation(W·x + b)`: a matrix multiplication, an added bias, and a simple function.

```python run
def matvec(W, x):
    return [sum(w * xi for w, xi in zip(row, x)) for row in W]

def matmul(A, B):
    cols = list(zip(*B))
    return [[sum(a * b for a, b in zip(row, col)) for col in cols] for row in A]

W = [[0.5, -1.0, 0.0],
     [2.0,  0.0, 1.0]]         # 2 outputs from 3 inputs
x = [4.0, 1.0, 3.0]
print("W·x =", matvec(W, x))

rotate = [[0, -1], [1, 0]]     # rotate 90 degrees
scale = [[2, 0], [0, 2]]       # double the size
print("rotate then scale =", matmul(scale, rotate), "->", matvec(matmul(scale, rotate), [1, 0]))
```

Shapes must agree: an (m × n) matrix times an (n × p) matrix gives (m × p). Shape errors are the most common bug in deep learning code.

Also know these words:

- **Transpose**: swap rows and columns.
- **Identity matrix**: leaves vectors unchanged. **Inverse**: undoes a transformation.
- **Eigenvectors**: directions a matrix only stretches. Principal component analysis finds them to compress data.
- **Singular value decomposition** and **low rank**: a big matrix approximated by the product of two thin ones. This is the idea behind LoRA fine-tuning.
- **Tensor**: an array with any number of dimensions. A batch of colour images is a 4-dimensional tensor.

## Calculus

- A **derivative** says how much the output changes for a tiny change in the input: the slope.
- A **gradient** is the vector of derivatives with respect to every parameter. It points in the direction of steepest increase.
- **Gradient descent** moves the parameters a small step in the opposite direction, to reduce the error, and repeats.
- The **chain rule** gives the derivative of nested functions as a product of each one's derivative. Backpropagation is the chain rule applied through a network's layers.

Fit a straight line to data by gradient descent, from scratch:

```python run
xs = [1, 2, 3, 4, 5, 6]
ys = [52, 58, 69, 73, 85, 88]          # e.g. machine temperature against load

w, b, lr = 0.0, 0.0, 0.02              # start anywhere; lr is the learning rate (step size)
for step in range(3001):
    preds = [w * x + b for x in xs]
    errors = [p - y for p, y in zip(preds, ys)]
    loss = sum(e * e for e in errors) / len(xs)                  # mean squared error
    grad_w = 2 * sum(e * x for e, x in zip(errors, xs)) / len(xs)   # d(loss)/dw
    grad_b = 2 * sum(errors) / len(xs)                             # d(loss)/db
    w -= lr * grad_w
    b -= lr * grad_b
    if step in (0, 10, 100, 1000, 3000):
        print(f"step {step:4}: loss {loss:9.2f}  w {w:6.2f}  b {b:6.2f}")

print(f"prediction for x=7: {w * 7 + b:.1f}")
```

This loop (predict, measure the loss, compute gradients, step) is how every neural network is trained, including large language models. Only the size changes. Try a learning rate of 0.2 and watch it diverge; that is why the learning rate is the most important setting.

## Probability

- A **random variable** takes values with certain probabilities. Its **distribution** describes them.
- **Expectation** is the long-run average; **variance** is the spread; **standard deviation** is its square root.
- Common distributions: **normal** (the bell curve; measurement noise), **Bernoulli and binomial** (yes/no events; defects in a batch), **Poisson** (counts per interval; breakdowns per week), **uniform** (all values equally likely).
- **Conditional probability** P(A given B) is the probability of A once you know B happened.
- **Independence**: knowing B tells you nothing about A.

### Bayes' rule

Bayes' rule updates a belief when evidence arrives: P(A given B) = P(B given A) × P(A) ÷ P(B).

```python run
def chance_defective_given_flagged(prevalence, sensitivity, false_positive_rate):
    true_flags = sensitivity * prevalence
    false_flags = false_positive_rate * (1 - prevalence)
    return true_flags / (true_flags + false_flags)

# 1% of parts are defective. The test catches 95% of defects and wrongly flags 5% of good parts.
print(f"flagged part is truly defective: {chance_defective_given_flagged(0.01, 0.95, 0.05):.0%}")
print(f"if defects were 20% of parts   : {chance_defective_given_flagged(0.20, 0.95, 0.05):.0%}")
```

Only about 16% of flagged parts are truly defective, because good parts are so much more common that their 5% of false alarms outnumber the real defects. This is why accuracy is misleading for rare events and why precision and recall exist.

## Statistics

### Describing data

```python run
import statistics as st

cycle_times = [41, 40, 42, 39, 41, 43, 40, 41, 95, 42, 40, 41]      # one outlier: a stoppage

print("mean  :", round(st.mean(cycle_times), 1), " pulled up by the outlier")
print("median:", st.median(cycle_times), " robust to it")
print("stdev :", round(st.stdev(cycle_times), 1))
qs = st.quantiles(cycle_times, n=4)
print("quartiles:", qs, "| IQR:", qs[2] - qs[0])
```

Use the median and percentiles when data has outliers or a long tail, which describes most real data: latencies, incomes, repair times.

**Correlation** measures how two variables move together, from -1 to 1. It does not show that one causes the other. Ice cream sales and drownings both rise in summer.

### Sampling and confidence

You almost never see the whole population. A **sample** gives an estimate, and the **central limit theorem** says that averages of samples are roughly normally distributed, which lets you put error bars on the estimate. A **95% confidence interval** is a range that would contain the true value in 95% of repeated samples.

### Hypothesis tests and A/B tests

To test whether a change had an effect: assume it had none (the **null hypothesis**), then ask how likely the observed difference would be under that assumption. That likelihood is the **p-value**. A small one, conventionally under 0.05, is evidence against "no effect".

A simulation makes the idea concrete without formulas:

```python run
import random
random.seed(1)

# A/B test: did the new checkout page raise conversion?
control = [1] * 200 + [0] * 1800          # 10.0% of 2,000 users converted
variant = [1] * 245 + [0] * 1755          # 12.25% of 2,000

observed = sum(variant) / len(variant) - sum(control) / len(control)

# Permutation test: if the page made no difference, the labels are arbitrary. Shuffle them and see
# how often chance alone produces a difference at least this large.
pooled = control + variant
extreme, trials = 0, 600
for _ in range(trials):
    random.shuffle(pooled)
    diff = sum(pooled[:2000]) / 2000 - sum(pooled[2000:]) / 2000
    if diff >= observed:
        extreme += 1

print(f"observed lift: {observed:.2%}")
print(f"p-value      : {extreme / trials:.3f}  ->", "unlikely to be chance" if extreme / trials < 0.05 else "could easily be chance")
```

Rules for honest experiments: decide the sample size and the metric before starting; randomise who sees which version; do not stop early because the result looks good; a statistically significant difference can still be too small to matter.

## The Python data stack

These libraries are the standard tools. Install them when you can (`pip install numpy pandas matplotlib`).

```python
import numpy as np
import pandas as pd

a = np.array([[1.0, 2.0], [3.0, 4.0]])
print(a.shape, a.T, a @ a, a.mean(axis=0))        # vectorised: no Python loops

df = pd.read_csv("orders.csv", parse_dates=["created_at"])
df.info()                                          # column types and missing values
df.describe()                                      # summary statistics
df = df.drop_duplicates().dropna(subset=["amount"])
df["month"] = df["created_at"].dt.to_period("M")

monthly = (df[df["status"] == "paid"]
           .groupby(["month", "region"])["amount"]
           .agg(["count", "sum", "mean"])
           .reset_index())
top = df.merge(customers, on="customer_id").nlargest(10, "amount")
```

- **NumPy**: fast arrays and vectorised maths.
- **pandas**: tables in memory: filter, group, join, reshape. Polars is a faster alternative.
- **Matplotlib, Seaborn, Plotly**: charts.
- **Jupyter**: notebooks for exploration. Move finished logic into modules with tests.

The same group-and-aggregate in the standard library, to show there is nothing hidden:

```python run
import csv, io
from collections import defaultdict

raw = """region,status,amount
west,paid,1200
west,paid,800
south,pending,450
south,paid,2300
west,cancelled,150
south,paid,990"""

groups = defaultdict(list)
for row in csv.DictReader(io.StringIO(raw)):
    if row["status"] == "paid":
        groups[row["region"]].append(float(row["amount"]))
for region, amounts in groups.items():
    print(f"{region:6} count={len(amounts)} sum={sum(amounts):7.0f} mean={sum(amounts) / len(amounts):7.1f}")
```

## Exploratory data analysis, in order

1. Understand what each column means and where the data came from.
2. Check size, types, missing values and duplicates.
3. Look at each variable's distribution (histogram) and outliers (box plot).
4. Look at relationships: scatter plots, correlations, comparisons between groups.
5. Write down questions and surprises before building any model.

Most of the time in real data work goes to steps 1 and 2. A model trained on wrongly understood data is confidently wrong.

## Cleaning and feature engineering

- **Missing values**: drop the rows, fill with a median or a category such as "unknown", or add an "is missing" flag. Choose deliberately; the reason data is missing often carries information.
- **Outliers**: find out whether they are errors or real events before removing them.
- **Scaling**: many models need numeric columns on similar scales. Standardise (subtract the mean, divide by the standard deviation) or normalise to 0–1.
- **Categories**: one-hot encode (one yes/no column per category) or use target or ordinal encoding.
- **Dates**: extract hour, weekday, month, "is holiday", time since the last event.
- **Aggregates**: counts and averages over a window, such as "defects on this machine in the last 7 days".

For classical machine learning, good features usually matter more than the choice of algorithm.

## Data engineering basics

- **ETL and ELT**: extract from sources, transform, load into a warehouse. ELT loads first and transforms inside the warehouse with SQL (dbt is the common tool).
- **Batch and streaming**: nightly jobs, or continuous processing with Kafka and Flink or Spark Structured Streaming.
- **Orchestration**: Airflow, Dagster and Prefect schedule pipelines as graphs of tasks, with retries.
- **Spark**: distributed processing for data too large for one machine.
- **Storage**: a **data lake** holds raw files in object storage, typically Parquet, a compressed columnar format. A **warehouse** holds modelled tables. A **lakehouse** (Delta Lake, Iceberg) combines them.
- **Data quality**: schema checks, null and range checks, freshness alerts. Bad data flows downstream silently unless you test for it.

## Check yourself

```quiz
[
  {"q": "Two embedding vectors have a cosine similarity of 0.95. What does that suggest?", "options": ["The texts are unrelated", "The texts are close in meaning", "The vectors have the same length"], "answer": 1, "why": "Cosine measures direction; near 1 means pointing the same way."},
  {"q": "In gradient descent, what happens if the learning rate is far too high?", "options": ["Training is slow but safe", "The steps overshoot and the loss grows or oscillates", "Nothing"], "answer": 1, "why": "Each update jumps past the minimum."},
  {"q": "A test for a rare defect flags a part. Why might the part still probably be fine?", "options": ["The test is broken", "Good parts are so common that their false alarms outnumber true detections", "Defects cannot be detected"], "answer": 1, "why": "This is Bayes' rule with a low base rate."},
  {"q": "Latency data has a few extreme values. Which summary is more representative?", "options": ["Mean", "Median and percentiles", "Maximum"], "answer": 1, "why": "They are not dragged by outliers."},
  {"q": "A p-value of 0.03 means:", "options": ["There is a 3% chance the change works", "If there were no real effect, a difference this large would appear about 3% of the time", "The effect is large"], "answer": 1, "why": "It measures surprise under the null hypothesis, not effect size."},
  {"q": "Shapes (3 × 4) and (4 × 2) are multiplied. What is the result's shape?", "options": ["(3 × 2)", "(4 × 4)", "They cannot be multiplied"], "answer": 0, "why": "Inner dimensions must match and disappear; outer dimensions remain."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: matrix-ops
title: Transpose and multiply matrices
kind: code
level: medium
@@statement
Implement two functions on matrices stored as lists of rows, **without NumPy**.

1. `transpose(m)`: swap rows and columns.
2. `matmul(a, b)`: matrix product, where `result[i][j] = sum(a[i][k] * b[k][j])`.

**Input**: `m`, `a`, `b` are non-empty rectangular lists of lists of numbers. `a` is n x k and `b` must be k x p.

**Output**: a new list of lists. The inputs must not be changed. `matmul` raises `ValueError` when the inner sizes differ (columns of `a` is not rows of `b`).

**Example**

```
transpose([[1, 2, 3], [4, 5, 6]])      -> [[1, 4], [2, 5], [3, 6]]
matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]])
-> [[1*5+2*7, 1*6+2*8], [3*5+4*7, 3*6+4*8]] = [[19, 22], [43, 50]]
```
@@starter
def transpose(m):
    # your code here
    pass

def matmul(a, b):
    # your code here
    pass

print(matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]]))
@@tests
assert transpose([[1, 2, 3], [4, 5, 6]]) == [[1, 4], [2, 5], [3, 6]], "2x3 transpose"
assert transpose([[7]]) == [[7]], "1x1"
assert transpose([[1, 2, 3]]) == [[1], [2], [3]], "row becomes column"
assert matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]]) == [[19, 22], [43, 50]], "2x2 product"
assert matmul([[1, 2, 3]], [[1], [2], [3]]) == [[14]], "row times column"
assert matmul([[1, 0], [0, 1]], [[9, 8], [7, 6]]) == [[9, 8], [7, 6]], "identity"
_a = [[1, 2], [3, 4]]
matmul(_a, _a)
transpose(_a)
assert _a == [[1, 2], [3, 4]], "inputs must not be changed"
try:
    matmul([[1, 2]], [[1, 2]])
    _raised = False
except ValueError:
    _raised = True
assert _raised, "shape mismatch must raise ValueError"
@@hint
`[list(row) for row in zip(*m)]` is a transpose. For the product, take row `i` of `a` and column `j` of `b` (a row of `transpose(b)`) and sum the pairwise products.
@@solution
def transpose(m):
    return [list(row) for row in zip(*m)]

def matmul(a, b):
    if len(a[0]) != len(b):
        raise ValueError("inner sizes differ")
    bt = transpose(b)
    return [[sum(x * y for x, y in zip(row, col)) for col in bt] for row in a]
````

````task
id: gradient-descent
title: Gradient descent on one variable
kind: code
level: easy
@@statement
Write `gradient_descent(grad, x0, lr, steps)` that minimises a function of one variable, given its derivative.

**Input**: `grad`, a function returning the derivative at `x`; `x0`, the starting value; `lr`, the learning rate; `steps`, how many updates to do (an integer >= 0).

**Output**: the final `x` as a float. Each step is `x = x - lr * grad(x)`. With `steps = 0` return `x0`. Tests compare with a tolerance of `1e-6`.

**Example**

```
f(x) = (x - 3)^2, so grad(x) = 2 * (x - 3)
gradient_descent(lambda x: 2 * (x - 3), 0.0, 0.1, 1)  -> 0 - 0.1 * (2 * -3) = 0.6
gradient_descent(lambda x: 2 * (x - 3), 0.0, 0.1, 100) -> about 3.0
```
@@starter
def gradient_descent(grad, x0, lr, steps):
    # your code here
    pass

print(gradient_descent(lambda x: 2 * (x - 3), 0.0, 0.1, 100))
@@tests
_g = lambda x: 2 * (x - 3)
assert abs(gradient_descent(_g, 0.0, 0.1, 1) - 0.6) < 1e-9, "one step"
assert abs(gradient_descent(_g, 0.0, 0.1, 200) - 3.0) < 1e-6, "converges to the minimum at 3"
assert gradient_descent(_g, 5.0, 0.1, 0) == 5.0, "zero steps returns x0"
assert abs(gradient_descent(lambda x: 2 * x, 5.0, 0.1, 10) - 5 * 0.8 ** 10) < 1e-9, "x^2 shrinks by 0.8 per step"
assert abs(gradient_descent(lambda x: 2 * x, 5.0, 1.0, 10) - 5.0) < 1e-9, "lr=1 on x^2 jumps between 5 and -5"
assert gradient_descent(lambda x: 2 * x, 5.0, 1.1, 10) > 30, "lr=1.1 on x^2 diverges"
@@hint
Use a plain `for _ in range(steps)` loop and update `x` each time.
@@solution
def gradient_descent(grad, x0, lr, steps):
    x = x0
    for _ in range(steps):
        x = x - lr * grad(x)
    return x
````

````task
id: learning-rate-observations
title: Interpret learning-rate experiments
kind: text
level: medium
@@statement
You minimise `f(x) = x^2` (gradient `2x`) by gradient descent starting at `x = 5`, and record `x` after 10 steps for four learning rates:

| learning rate | x after 10 steps |
|---|---|
| 0.01 | 4.09 |
| 0.1 | 0.54 |
| 1.0 | 5.00 |
| 1.1 | 30.96 |

**Deliverable** (6-10 sentences)
1. Show that each update multiplies `x` by `(1 - 2 * lr)` and use it to explain every row of the table.
2. Say which learning rate you would pick and why, and what you would change for the 0.01 case if you could not raise the rate.
3. Predict `x` after 10 steps for a start of `x = -5` with `lr = 0.1`, and say whether the starting point changes whether the method converges on this function.
@@hint
Write the update as `x_new = x - lr * 2x = x * (1 - 2 * lr)` and look at the size and sign of that factor.
@@solution
Each step is `x - lr * 2x = (1 - 2*lr) * x`, so after 10 steps `x` is multiplied by `(1 - 2*lr)^10`. For 0.01 the factor is 0.98, and 0.98^10 = 0.817, so 5 becomes 4.09: it moves the right way but far too slowly. For 0.1 the factor is 0.8, 0.8^10 = 0.107 and 5 becomes 0.54: good progress. For 1.0 the factor is -1, so x jumps between 5 and -5 forever and never settles. For 1.1 the factor is -1.2, with absolute value above 1, so x grows (1.2^10 = 6.19, giving 30.96): it diverges.

I would use 0.1 (or a value near 0.5, where the factor is 0 on this particular function), since it converges quickly and stays stable. If the rate for the 0.01 case must stay small, I would run many more steps (about 10 times as many) or use momentum or an adaptive optimiser.

Starting from -5 with lr 0.1 gives -5 * 0.107 = -0.54. The start does not change convergence here: the factor does not depend on x, so the method converges from any start whenever |1 - 2*lr| < 1, that is 0 < lr < 1. (For non-convex functions the start does matter because of local minima.)
@@criteria
- Derives the update factor `1 - 2*lr` and applies it ten times (powers of that factor).
- Explains the four rows: slow (0.01), good (0.1), oscillating with factor -1 (1.0), diverging with factor of magnitude above 1 (1.1).
- Chooses a sensible learning rate and justifies it with stability and speed.
- Predicts about -0.54 for the start at -5 and notes the symmetric behaviour.
- States the convergence condition 0 < lr < 1 for this function, or that the start does not matter here.
````

````task
id: mean-variance-correlation
title: Mean, variance and correlation
kind: code
level: medium
@@statement
Write three functions from scratch, without the `statistics` module.

- `mean(xs)`: the average.
- `variance(xs)`: the **population** variance, `sum((x - mean)^2) / n`.
- `correlation(xs, ys)`: Pearson correlation, `cov / (std_x * std_y)` where `cov = sum((x - mx) * (y - my)) / n`.

**Input**: lists of numbers. `xs` and `ys` have equal length.

**Output**: floats (checked with a tolerance of `1e-9`). For an empty list `mean` and `variance` raise `ValueError`. `correlation` returns `None` when either list has zero variance (a constant list).

**Example**

```
mean([2, 4, 6])                      -> 4.0
variance([2, 4, 6])                  -> (4 + 0 + 4) / 3 = 2.666666...
correlation([1, 2, 3], [2, 4, 6])    -> 1.0
correlation([1, 2, 3], [3, 2, 1])    -> -1.0
```
@@starter
import math

def mean(xs):
    pass

def variance(xs):
    pass

def correlation(xs, ys):
    pass

print(mean([2, 4, 6]), variance([2, 4, 6]))
@@tests
assert abs(mean([2, 4, 6]) - 4.0) < 1e-9, "mean"
assert abs(mean([5]) - 5.0) < 1e-9, "mean of one value"
assert abs(variance([2, 4, 6]) - 8 / 3) < 1e-9, "population variance"
assert abs(variance([7, 7, 7])) < 1e-9, "constant list has variance 0"
assert abs(correlation([1, 2, 3], [2, 4, 6]) - 1.0) < 1e-9, "perfect positive"
assert abs(correlation([1, 2, 3], [3, 2, 1]) + 1.0) < 1e-9, "perfect negative"
assert abs(correlation([1, 2, 3, 4], [1, 3, 2, 4]) - 0.8) < 1e-9, "partial correlation"
assert correlation([1, 1, 1], [1, 2, 3]) is None, "zero variance gives None"
for _f in (mean, variance):
    try:
        _f([])
        _ok = False
    except ValueError:
        _ok = True
    assert _ok, "empty list must raise ValueError"
@@hint
Compute the two means first, then one pass for the covariance and one for each variance. Compare the variances with 0 before dividing.
@@solution
import math

def mean(xs):
    if not xs:
        raise ValueError("empty")
    return sum(xs) / len(xs)

def variance(xs):
    m = mean(xs)
    return sum((x - m) ** 2 for x in xs) / len(xs)

def correlation(xs, ys):
    vx, vy = variance(xs), variance(ys)
    if vx == 0 or vy == 0:
        return None
    mx, my = mean(xs), mean(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / len(xs)
    return cov / math.sqrt(vx * vy)
````

````task
id: two-feature-regression
title: Linear regression with two features
kind: code
level: hard
@@statement
Fit `y = b0 + b1 * x1 + b2 * x2` by least squares with the **normal equations**, solved by Gaussian elimination (no NumPy).

Write `fit_two_features(x1s, x2s, ys)`.

**Input**: three lists of equal length >= 3 (the features are not perfectly correlated).

**Output**: a tuple `(b0, b1, b2)` of floats (checked within `1e-6`).

The normal equations are `A * b = c` where, with `n` points,

```
A = [[n,     S1,    S2   ],     S1 = sum(x1), S2 = sum(x2)
     [S1,    S11,   S12  ],     S11 = sum(x1*x1), S12 = sum(x1*x2), S22 = sum(x2*x2)
     [S2,    S12,   S22  ]]
c = [sum(y), sum(x1*y), sum(x2*y)]
```

**Example**

```
x1s = [1, 2, 3, 4], x2s = [1, 0, 2, 1], ys = [6, 5, 13, 12]    # y = 1 + 2*x1 + 3*x2
fit_two_features(x1s, x2s, ys) -> (1.0, 2.0, 3.0)
```
@@starter
def fit_two_features(x1s, x2s, ys):
    # your code here
    pass

print(fit_two_features([1, 2, 3, 4], [1, 0, 2, 1], [6, 5, 13, 12]))
@@tests
_b = fit_two_features([1, 2, 3, 4], [1, 0, 2, 1], [6, 5, 13, 12])
assert all(abs(u - v) < 1e-6 for u, v in zip(_b, (1.0, 2.0, 3.0))), "recover y = 1 + 2*x1 + 3*x2"
_b = fit_two_features([0, 1, 0, 1, 2], [0, 0, 1, 1, 3], [5, 7, 4, 6, 6])
assert all(abs(u - v) < 1e-6 for u, v in zip(_b, (5.0, 2.0, -1.0))), "y = 5 + 2*x1 - 1*x2"
_x1, _x2, _y = [1, 2, 3, 4, 5], [2, 1, 4, 3, 5], [3.1, 3.9, 7.2, 7.8, 10.9]
_b = fit_two_features(_x1, _x2, _y)
_res = [_b[0] + _b[1] * a + _b[2] * c - t for a, c, t in zip(_x1, _x2, _y)]
assert abs(sum(_res)) < 1e-6, "residuals of a least-squares fit with intercept sum to 0"
assert abs(sum(r * a for r, a in zip(_res, _x1))) < 1e-6, "residuals are orthogonal to x1"
assert abs(sum(r * c for r, c in zip(_res, _x2))) < 1e-6, "residuals are orthogonal to x2"
assert isinstance(_b, tuple) and len(_b) == 3, "return a tuple of 3"
@@hint
Build the 3x3 matrix and the 3-vector, then do forward elimination with partial pivoting (swap in the row with the largest pivot) and back substitution.
@@solution
def fit_two_features(x1s, x2s, ys):
    n = len(ys)
    s1, s2 = sum(x1s), sum(x2s)
    s11 = sum(a * a for a in x1s)
    s12 = sum(a * b for a, b in zip(x1s, x2s))
    s22 = sum(b * b for b in x2s)
    m = [
        [n, s1, s2, sum(ys)],
        [s1, s11, s12, sum(a * y for a, y in zip(x1s, ys))],
        [s2, s12, s22, sum(b * y for b, y in zip(x2s, ys))],
    ]
    m = [[float(v) for v in row] for row in m]
    for col in range(3):
        pivot = max(range(col, 3), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(col + 1, 3):
            f = m[r][col] / m[col][col]
            for c in range(col, 4):
                m[r][c] -= f * m[col][c]
    b = [0.0] * 3
    for r in (2, 1, 0):
        b[r] = (m[r][3] - sum(m[r][c] * b[c] for c in range(r + 1, 3))) / m[r][r]
    return tuple(b)
````

````task
id: bayes-posterior
title: Bayes rule for a medical test
kind: code
level: easy
@@statement
Write `posterior(prior, sensitivity, false_positive_rate)`: the probability that a person really has the condition **given a positive test**.

**Input**: three floats between 0 and 1. `prior` is the share of people with the condition, `sensitivity` is P(positive | condition), `false_positive_rate` is P(positive | no condition).

**Output**: a float, `P(condition | positive) = prior * sens / (prior * sens + (1 - prior) * fpr)`. If the positive test can never happen (the denominator is 0) return `0.0`.

**Example**

```
posterior(0.01, 0.9, 0.05) = 0.009 / (0.009 + 0.0495) = 0.1538...
posterior(0.01, 0.9, 0.01) = 0.009 / (0.009 + 0.0099) = 0.4761...
```
A better test (lower false positive rate) raises the posterior a lot.
@@starter
def posterior(prior, sensitivity, false_positive_rate):
    # your code here
    pass

print(posterior(0.01, 0.9, 0.05))
@@tests
assert abs(posterior(0.01, 0.9, 0.05) - 0.009 / 0.0585) < 1e-9, "5% false positives"
assert abs(posterior(0.01, 0.9, 0.01) - 0.009 / 0.0189) < 1e-9, "1% false positives"
assert abs(posterior(0.5, 0.8, 0.2) - 0.8) < 1e-9, "balanced prior"
assert posterior(0.0, 0.9, 0.0) == 0.0, "zero denominator"
assert abs(posterior(1.0, 0.7, 0.3) - 1.0) < 1e-9, "everybody is sick"
@@hint
Compute the numerator (true positives) and the denominator (all positives) separately, and check the denominator before dividing.
@@solution
def posterior(prior, sensitivity, false_positive_rate):
    true_pos = prior * sensitivity
    all_pos = true_pos + (1 - prior) * false_positive_rate
    if all_pos == 0:
        return 0.0
    return true_pos / all_pos
````

````task
id: profile-column
title: Profile one data column
kind: code
level: medium
@@statement
The first EDA step is to look at each column. Write `profile_column(values)` for a column that may contain missing entries (`None`).

**Input**: a list of numbers and `None`.

**Output**: a dict with exactly these keys:
- `"count"`: number of non-missing values
- `"missing"`: number of `None`
- `"min"`, `"max"`: smallest and largest non-missing value
- `"mean"`: average of the non-missing values
- `"median"`: middle value (average of the two middle values for an even count)

If there are no non-missing values, `min`, `max`, `mean` and `median` are `None`. Do not change the input.

**Example**

```
profile_column([4, None, 1, 3, None])
-> {"count": 3, "missing": 2, "min": 1, "max": 4, "mean": 2.6666666..., "median": 3}
```
@@starter
def profile_column(values):
    # your code here
    pass

print(profile_column([4, None, 1, 3, None]))
@@tests
_p = profile_column([4, None, 1, 3, None])
assert _p["count"] == 3 and _p["missing"] == 2, "count and missing"
assert _p["min"] == 1 and _p["max"] == 4, "min and max"
assert abs(_p["mean"] - 8 / 3) < 1e-9, "mean ignores None"
assert _p["median"] == 3, "odd count median"
assert profile_column([1, 2, 3, 10])["median"] == 2.5, "even count median"
_e = profile_column([None, None])
assert _e == {"count": 0, "missing": 2, "min": None, "max": None, "mean": None, "median": None}, "all missing"
assert profile_column([]) == {"count": 0, "missing": 0, "min": None, "max": None, "mean": None, "median": None}, "empty list"
_v = [3, None, 1]
profile_column(_v)
assert _v == [3, None, 1], "do not change the input"
@@hint
Build `clean = [v for v in values if v is not None]`, then use `sorted(clean)` for the median.
@@solution
def profile_column(values):
    clean = sorted(v for v in values if v is not None)
    missing = len(values) - len(clean)
    if not clean:
        return {"count": 0, "missing": missing, "min": None, "max": None, "mean": None, "median": None}
    n = len(clean)
    if n % 2:
        median = clean[n // 2]
    else:
        median = (clean[n // 2 - 1] + clean[n // 2]) / 2
    return {"count": n, "missing": missing, "min": clean[0], "max": clean[-1],
            "mean": sum(clean) / n, "median": median}
````

````task
id: ab-sample-size
title: A/B test sample size
kind: code
level: easy
@@statement
A common rule of thumb (80% power, 5% significance) for comparing two conversion rates is: users **per group** `n = 16 * p * (1 - p) / d^2`, where `p` is the baseline rate and `d` the smallest absolute change worth detecting. Round **up**.

Write `sample_size_per_group(p, d)`.

**Input**: `p` a float in (0, 1), `d` a float > 0.

**Output**: an `int`, the rounded-up value. Raise `ValueError` if `p` is not in (0, 1) or `d <= 0`.

**Example**

```
sample_size_per_group(0.10, 0.01) = 16 * 0.10 * 0.90 / 0.0001 = 14400
sample_size_per_group(0.20, 0.05) = 16 * 0.16 / 0.0025 = 1024
```
Halving `d` multiplies the sample size by 4.
@@starter
import math

def sample_size_per_group(p, d):
    # your code here
    pass

print(sample_size_per_group(0.10, 0.01))
@@tests
assert sample_size_per_group(0.10, 0.01) == 14400, "10% baseline, +1 point"
assert sample_size_per_group(0.20, 0.05) == 1024, "20% baseline, +5 points"
assert sample_size_per_group(0.5, 0.03) == 4445, "rounds up (4444.4 -> 4445)"
assert isinstance(sample_size_per_group(0.1, 0.01), int), "returns an int"
for _args in ((0.0, 0.1), (1.0, 0.1), (0.5, 0.0), (0.5, -0.1)):
    try:
        sample_size_per_group(*_args)
        _ok = False
    except ValueError:
        _ok = True
    assert _ok, "invalid arguments must raise ValueError"
@@hint
Use `math.ceil`. Beware of float noise: round the raw value to 9 decimals before `ceil`, so 14400.000000000002 does not become 14401.
@@solution
import math

def sample_size_per_group(p, d):
    if not (0 < p < 1) or d <= 0:
        raise ValueError("bad arguments")
    raw = 16 * p * (1 - p) / (d * d)
    return int(math.ceil(round(raw, 9)))
````

````task
id: ab-test-design
title: Design an A/B test
kind: text
level: medium
@@statement
**Scenario**: an online shop has a 10% checkout conversion rate and 2000 visitors a day. You want to test a new one-page checkout. A change of less than 1 percentage point is not worth the engineering cost.

**Deliverable** (a short plan with the 5 headings below, 1-3 sentences each)
1. **Primary metric**, plus one guardrail metric that must not get worse (give a concrete threshold).
2. **Sample size**: use `n = 16 * p * (1 - p) / d^2` per group, show the calculation with these numbers, and convert it to days of traffic when visitors are split 50/50.
3. **Stopping rule**: when exactly you stop, and why you do not stop early when the result looks good after day 3.
4. **Randomisation**: the unit you randomise on and how you keep a user in the same group.
5. **Decision rule**: what result makes you ship, and what makes you keep the old checkout.
@@hint
The calculation is 16 * 0.1 * 0.9 / 0.01^2. Remember that each group gets only half of the daily visitors.
@@solution
1. Primary metric: checkout conversion (orders / visitors who start checkout). Guardrail: average order value must not drop by more than 2%, and the page error rate must stay below 0.5%.
2. n = 16 * 0.1 * 0.9 / 0.0001 = 14,400 per group, 28,800 in total. At 2000 visitors a day with a 50/50 split each group gets 1000 a day, so 14.4 days; I plan 3 full weeks (21 days) to cover every weekday equally.
3. Fix the end date at 21 days before starting and analyse once at the end. Looking daily and stopping at the first significant result inflates false positives (peeking), and early results are noisy and weekday-dependent.
4. Randomise by user id (a cookie id for anonymous visitors) using a hash of the id modulo 2, so the same user always sees the same variant, and check that the two groups have a similar size (sample ratio check).
5. Ship if the conversion difference is at least +1 point with a confidence interval that excludes 0 and no guardrail is breached; otherwise keep the old checkout.
@@criteria
- Names a clear primary metric and a guardrail with a concrete threshold.
- Computes 14,400 per group and converts it to about 14-15 days (or rounds up to full weeks) using 1000 visitors per group per day.
- Gives a stopping rule fixed in advance and explains the problem with peeking.
- Randomises by user (not by page view) with a stable assignment such as a hash of the id.
- Gives a decision rule that uses the minimum effect of 1 point and the guardrail.
````
