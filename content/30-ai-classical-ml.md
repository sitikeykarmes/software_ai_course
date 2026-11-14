---
id: ai-classical-ml
title: Classical machine learning
minutes: 65
---

Machine learning fits a function to examples instead of hand-writing rules. For tables of business data, classical models, gradient-boosted trees above all, remain the standard choice and often beat neural networks. This lesson builds three algorithms from scratch so you see what "learning" means, then covers the workflow and the mistakes that matter.

## Kinds of learning

| Type | Data | Goal | Example |
| --- | --- | --- | --- |
| Supervised: classification | Inputs with category labels | Predict the category | Defect or no defect; spam or not |
| Supervised: regression | Inputs with numeric labels | Predict a number | Price, demand, time to failure |
| Unsupervised | Inputs only | Find structure | Customer segments, anomaly detection |
| Self-supervised | Inputs only; labels are made from the data itself | Learn representations | Predicting the next token, as in LLMs |
| Reinforcement | Actions and rewards | Learn a strategy | Games, robotics, tuning recommendations |

Vocabulary: **features** are the inputs (columns); the **label** or **target** is what you predict; a **model** has **parameters** it learns and **hyperparameters** you choose; **training** fits the parameters; **inference** uses them.

## The workflow

1. Define the problem and the metric that reflects the real cost of mistakes.
2. Collect and clean data; explore it.
3. Split it into **train**, **validation** and **test** sets.
4. Build a simple **baseline**.
5. Engineer features, try stronger models, tune hyperparameters.
6. Analyse errors: which cases fail and why.
7. Deploy, monitor, retrain.

The split matters because a model can memorise. You fit on the training set, make choices using the validation set, and report once on the test set, which the model and you have never used for decisions.

## Algorithm 1: k-nearest neighbours, from scratch

To classify a new point, find the k most similar training points and take a vote. There is no training step at all.

```python run
import math, random
from collections import Counter
random.seed(3)

def make_part(defective):
    # features: (vibration, temperature)
    if defective:
        return (random.gauss(7.5, 1.2), random.gauss(88, 6)), 1
    return (random.gauss(4.0, 1.0), random.gauss(70, 5)), 0

data = [make_part(i % 4 == 0) for i in range(400)]
random.shuffle(data)
train, test = data[:300], data[300:]

def predict(x, k=5):
    nearest = sorted(train, key=lambda item: math.dist(item[0], x))[:k]
    return Counter(label for _, label in nearest).most_common(1)[0][0]

correct = sum(predict(x) == y for x, y in test)
print(f"accuracy on unseen parts: {correct / len(test):.0%}")
print("new part (6.8 vibration, 85 C) ->", "DEFECT" if predict((6.8, 85)) else "ok")
```

Its weaknesses teach two general lessons. Distances are distorted when features have different scales (temperature dominates vibration here), so **scale features**. And prediction is slow because it compares against every stored example.

## Algorithm 2: logistic regression, from scratch

Logistic regression computes a weighted sum of the features and squashes it through a **sigmoid** into a probability between 0 and 1. Training adjusts the weights by gradient descent to make the predicted probabilities match the labels.

```python run
import math, random
random.seed(3)

def make_part(defective):
    if defective:
        return [random.gauss(7.5, 1.2), random.gauss(88, 6)], 1
    return [random.gauss(4.0, 1.0), random.gauss(70, 5)], 0

data = [make_part(i % 4 == 0) for i in range(600)]
random.shuffle(data)
train, test = data[:450], data[450:]

# Standardise features using TRAINING statistics only (using test data here would be leakage)
means = [sum(x[j] for x, _ in train) / len(train) for j in range(2)]
stds = [math.sqrt(sum((x[j] - means[j]) ** 2 for x, _ in train) / len(train)) for j in range(2)]
scale = lambda x: [(x[j] - means[j]) / stds[j] for j in range(2)]

sigmoid = lambda z: 1 / (1 + math.exp(-z))
w, b, lr = [0.0, 0.0], 0.0, 0.5

for epoch in range(200):
    gw, gb = [0.0, 0.0], 0.0
    for x, y in train:
        xs = scale(x)
        p = sigmoid(w[0] * xs[0] + w[1] * xs[1] + b)
        for j in range(2):
            gw[j] += (p - y) * xs[j]               # gradient of the log loss
        gb += p - y
    w = [w[j] - lr * gw[j] / len(train) for j in range(2)]
    b -= lr * gb / len(train)

def prob(x):
    xs = scale(x)
    return sigmoid(w[0] * xs[0] + w[1] * xs[1] + b)

tp = sum(1 for x, y in test if prob(x) >= 0.5 and y == 1)
fp = sum(1 for x, y in test if prob(x) >= 0.5 and y == 0)
fn = sum(1 for x, y in test if prob(x) < 0.5 and y == 1)
tn = sum(1 for x, y in test if prob(x) < 0.5 and y == 0)
print(f"weights: vibration {w[0]:.2f}, temperature {w[1]:.2f}, bias {b:.2f}")
print(f"confusion matrix: TP={tp} FP={fp} FN={fn} TN={tn}")
print(f"accuracy {(tp + tn) / len(test):.0%}  precision {tp / (tp + fp):.0%}  recall {tp / (tp + fn):.0%}")
print(f"P(defect) for (6.8, 85): {prob([6.8, 85]):.2f}")
```

The weights are interpretable: a larger positive weight means that feature pushes the prediction towards "defect". Logistic regression is the baseline every classifier should be compared against.

## Algorithm 3: a decision tree split, from scratch

A decision tree asks a sequence of yes/no questions. It learns by choosing, at each step, the question that best separates the classes. "Best" is measured by **impurity**: how mixed the labels are in each resulting group.

```python run
def gini(labels):
    if not labels:
        return 0.0
    p = sum(labels) / len(labels)
    return 2 * p * (1 - p)               # 0 = pure group, 0.5 = evenly mixed

def best_split(rows, feature_names):
    best = None
    for j, name in enumerate(feature_names):
        for threshold in sorted({r[0][j] for r in rows}):
            left = [y for x, y in rows if x[j] <= threshold]
            right = [y for x, y in rows if x[j] > threshold]
            score = (len(left) * gini(left) + len(right) * gini(right)) / len(rows)
            if best is None or score < best[0]:
                best = (score, name, threshold, len(left), len(right))
    return best

rows = [((3.9, 68), 0), ((4.2, 71), 0), ((4.8, 75), 0), ((5.1, 69), 0), ((6.9, 84), 1),
        ((7.4, 90), 1), ((8.0, 86), 1), ((4.4, 88), 0), ((7.1, 72), 1), ((3.5, 74), 0)]
score, name, threshold, n_left, n_right = best_split(rows, ["vibration", "temperature"])
print(f"best first question: is {name} <= {threshold}?  ({n_left} parts go left, {n_right} go right, impurity {score:.3f})")
```

A full tree repeats this on each side until groups are pure or a depth limit is reached. One tree overfits easily; combining many trees fixes that.

## The algorithms you should know

| Algorithm | Idea | Strengths | Limits |
| --- | --- | --- | --- |
| Linear regression | A weighted sum fits a line | Fast, interpretable | Only linear relationships |
| Logistic regression | Weighted sum through a sigmoid gives a probability | Strong classification baseline | Linear decision boundary |
| k-nearest neighbours | Vote among the most similar examples | No training; simple | Slow predictions; poor with many features |
| Decision tree | A sequence of if-then splits | Interpretable; handles mixed data | Overfits alone |
| Random forest | Average many trees trained on random samples and feature subsets | Robust; little tuning | Larger and slower than one tree |
| Gradient boosting (XGBoost, LightGBM, CatBoost) | Add trees one at a time, each correcting the errors so far | Usually the best on tabular data | More tuning; can overfit |
| Support vector machine | Find the widest margin between classes; kernels handle curves | Good on small, clean data | Slow on large data |
| Naive Bayes | Bayes' rule assuming independent features | Very fast; good text baseline | A crude assumption |
| k-means | Assign points to the nearest of k centres; move the centres; repeat | Simple clustering | Must choose k; assumes round clusters |
| PCA | Project onto the directions of greatest variance | Compression, visualisation | Linear only |
| Isolation forest | Anomalies are separated by few random splits | Unsupervised anomaly detection | Threshold needs tuning |

**Ensembles** combine models. **Bagging** (random forest) trains models independently on random samples and averages them, reducing variance. **Boosting** trains them in sequence, each focusing on what the previous ones got wrong, reducing bias.

## Underfitting and overfitting

- **Underfitting** (high bias): the model is too simple. Poor on training data and on new data.
- **Overfitting** (high variance): the model memorised noise. Excellent on training data, poor on new data.

The signal is the gap: training accuracy 99%, validation accuracy 80% means overfitting.

Fixes for overfitting: more data; a simpler model; **regularisation** (L2 shrinks weights; L1 pushes some to exactly zero, selecting features); limiting tree depth; early stopping; dropout in neural networks.

**Cross-validation** gives a more reliable estimate than one split: divide the training data into k folds, train on k-1 and validate on the remaining one, rotate, and average. Use a time-ordered split for time series, never a random one.

## Data leakage

Leakage means information that would not be available at prediction time reaches the model during training. It is the most common serious mistake, and it produces excellent offline scores and a model that fails in production.

- Scaling or imputing using statistics from the whole dataset, including the test set.
- Random splits on time-ordered data, so the model trains on the future.
- A feature that is only known after the outcome, such as "refund issued" when predicting fraud.
- The same customer, machine or patient in both training and test sets.

Rule: split first, then fit every preprocessing step on the training portion only. A scikit-learn `Pipeline` enforces this.

## Metrics

For classification, start with the **confusion matrix**: true positives (TP), false positives (FP), true negatives (TN), false negatives (FN).

| Metric | Formula | Use when |
| --- | --- | --- |
| Accuracy | (TP + TN) / all | Classes are balanced |
| Precision | TP / (TP + FP) | A false alarm is costly |
| Recall | TP / (TP + FN) | A miss is costly |
| F1 | Harmonic mean of precision and recall | You need one number for imbalanced data |
| ROC-AUC | Probability that a random positive scores above a random negative | Comparing models across thresholds |
| PR-AUC | Area under the precision-recall curve | Positives are rare |

The **threshold** trades precision against recall, and you choose it from the costs:

```python run
import random
random.seed(5)

# model scores: defective parts tend to score higher, with overlap
scored = [(random.betavariate(5, 2), 1) for _ in range(50)] + [(random.betavariate(2, 5), 0) for _ in range(950)]

print("threshold  precision  recall  missed defects  false alarms")
for threshold in (0.3, 0.5, 0.7):
    tp = sum(1 for s, y in scored if s >= threshold and y == 1)
    fp = sum(1 for s, y in scored if s >= threshold and y == 0)
    fn = sum(1 for s, y in scored if s < threshold and y == 1)
    print(f"  {threshold:.1f}       {tp / (tp + fp):6.0%}   {tp / (tp + fn):6.0%}       {fn:3}            {fp:3}")

always_ok = sum(1 for _, y in scored if y == 0) / len(scored)
print(f"\na model that always says 'good' is {always_ok:.0%} accurate and catches nothing")
```

In visual quality inspection, letting a defective part through usually costs far more than re-checking a good one, so you choose a low threshold for very high recall and accept more false alarms.

For regression: **MAE** (average absolute error, in the target's own units), **RMSE** (penalises large errors more), **R²** (share of variance explained).

## The same workflow with scikit-learn

In real projects you use a library. Install with `pip install scikit-learn pandas`.

```python
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

df = pd.read_csv("parts.csv")
X, y = df.drop(columns="defect"), df["defect"]
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

pre = ColumnTransformer([
    ("num", StandardScaler(), ["temp", "pressure", "cycle_time"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["machine", "shift"]),
])
model = Pipeline([("pre", pre), ("clf", HistGradientBoostingClassifier(class_weight="balanced"))])

print(cross_val_score(model, X_train, y_train, cv=5, scoring="recall").mean())
model.fit(X_train, y_train)
print(classification_report(y_test, model.predict(X_test)))
```

The `Pipeline` fits preprocessing on training folds only, which prevents leakage. `stratify=y` keeps the class ratio the same in both splits.

## Practical topics

- **Imbalanced data**: class weights, resampling, threshold tuning, and the right metric.
- **Hyperparameter tuning**: grid search, random search, Bayesian optimisation (Optuna).
- **Explainability**: feature importance, SHAP values, partial dependence plots. Required for trust and for regulated uses.
- **Time series**: lag features, rolling statistics, seasonality; models from ARIMA and Prophet to gradient boosting on lag features.
- **Recommenders**: collaborative filtering, matrix factorisation, two-tower models.
- **Unsupervised evaluation**: with no labels, judge clusters by whether they are useful to the business.

## Check yourself

```quiz
[
  {"q": "Training accuracy is 99% and validation accuracy is 78%. What is happening?", "options": ["Underfitting", "Overfitting", "Data leakage"], "answer": 1, "why": "A large gap means the model memorised training data and does not generalise."},
  {"q": "You scale features using the mean of the whole dataset, then split. What is wrong?", "options": ["Nothing", "Test-set information leaked into training", "Scaling is unnecessary"], "answer": 1, "why": "Fit preprocessing on the training set only."},
  {"q": "Missing a cancer case is far worse than a false alarm. Which metric matters most?", "options": ["Precision", "Recall", "Accuracy"], "answer": 1, "why": "Recall measures the share of real positives that are caught."},
  {"q": "For a table of customer data predicting churn, which model is usually the strongest starting point after a baseline?", "options": ["A large neural network", "Gradient-boosted trees", "k-means"], "answer": 1, "why": "Boosted trees dominate on tabular data."},
  {"q": "Why keep a separate test set that is used only once?", "options": ["To save time", "Choices made on validation data bias its score; the test set gives an honest estimate", "It is required by Python"], "answer": 1, "why": "Every decision you make using a dataset leaks a little of it into the model."},
  {"q": "How does a random forest reduce overfitting compared with one tree?", "options": ["It uses deeper trees", "It averages many trees trained on different random samples and features", "It removes features"], "answer": 1, "why": "Averaging cancels out the individual trees' quirks."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: min-max-scale
title: Min-max feature scaling
kind: code
level: easy
@@statement
Distance-based models such as k-nearest neighbours are dominated by the feature with the biggest range. Write `min_max_scale(rows)` to put every feature on the same 0 to 1 scale.

**Input**: `rows`, a non-empty list of equal-length lists of numbers (one row per example, one column per feature).

**Output**: a new list of rows where each value `v` of a column becomes `(v - col_min) / (col_max - col_min)`. If a column is constant (max equals min) all its values become `0.0`. Do not change the input.

**Example**

```
min_max_scale([[20, 30000], [30, 90000], [40, 60000]])
-> [[0.0, 0.0], [0.5, 1.0], [1.0, 0.5]]
```
@@starter
def min_max_scale(rows):
    # your code here
    pass

print(min_max_scale([[20, 30000], [30, 90000], [40, 60000]]))
@@tests
assert min_max_scale([[20, 30000], [30, 90000], [40, 60000]]) == [[0.0, 0.0], [0.5, 1.0], [1.0, 0.5]], "two columns"
assert min_max_scale([[5], [5], [5]]) == [[0.0], [0.0], [0.0]], "constant column"
assert min_max_scale([[1, 2]]) == [[0.0, 0.0]], "single row"
assert min_max_scale([[0, 10], [10, 10]]) == [[0.0, 0.0], [1.0, 0.0]], "constant column next to a varying one"
_data = [[1, 2], [3, 4]]
min_max_scale(_data)
assert _data == [[1, 2], [3, 4]], "do not change the input"
@@hint
Compute `lows = [min(col) for col in zip(*rows)]` and `highs` the same way, then build the new rows.
@@solution
def min_max_scale(rows):
    cols = list(zip(*rows))
    lows = [min(c) for c in cols]
    highs = [max(c) for c in cols]
    out = []
    for row in rows:
        new = []
        for v, lo, hi in zip(row, lows, highs):
            new.append(0.0 if hi == lo else (v - lo) / (hi - lo))
        out.append(new)
    return out
````

````task
id: knn-predict
title: k-nearest-neighbours classifier
kind: code
level: medium
@@statement
Write `knn_predict(train_x, train_y, query, k)` that predicts a label by majority vote of the `k` closest training points.

**Input**: `train_x`, a list of feature lists; `train_y`, the labels (strings or ints) in the same order; `query`, one feature list; `k`, an integer >= 1.

**Output**: the winning label.
- Distance is Euclidean (`sqrt(sum((a - b)^2))`).
- Order points by `(distance, index)` so equal distances are resolved by the earlier training point, and take the first `k` (or all points if `k` is larger).
- The label with the most votes wins. If labels are tied, the label whose **nearest** voter is closest wins (the first one in the sorted order).

**Example**

```
train_x = [[1, 1], [2, 1], [8, 8], [9, 8]]
train_y = ["a", "a", "b", "b"]
knn_predict(train_x, train_y, [1.5, 1], 3)  -> "a"      # neighbours a, a, then b
knn_predict(train_x, train_y, [8.5, 8], 1)  -> "b"
```

Try it on unscaled data such as `[age, income]` and then on `min_max_scale` output from the previous task: the income column decides everything until you scale.
@@starter
import math

def knn_predict(train_x, train_y, query, k):
    # your code here
    pass

print(knn_predict([[1, 1], [2, 1], [8, 8], [9, 8]], ["a", "a", "b", "b"], [1.5, 1], 3))
@@tests
_x = [[1, 1], [2, 1], [8, 8], [9, 8]]
_y = ["a", "a", "b", "b"]
assert knn_predict(_x, _y, [1.5, 1], 3) == "a", "majority of 3"
assert knn_predict(_x, _y, [8.5, 8], 1) == "b", "1-NN"
assert knn_predict(_x, _y, [5, 5], 100) in ("a", "b"), "k larger than data uses all points"
assert knn_predict(_x, _y, [1.9, 1], 4) == "a", "tie 2-2 is won by the label of the nearest point"
assert knn_predict([[0], [10]], [1, 2], [4], 2) == 1, "tie, nearest voter wins"
assert knn_predict([[3]], ["only"], [100], 1) == "only", "single training point"
_copy = [list(r) for r in _x]
knn_predict(_x, _y, [1, 1], 2)
assert _x == _copy, "do not change the training data"
@@hint
Make `ranked = sorted((distance, i) for i, row in enumerate(train_x))`, take `ranked[:k]`, count labels, and for ties keep the label that appears first in `ranked`.
@@solution
import math

def knn_predict(train_x, train_y, query, k):
    ranked = sorted(
        (math.sqrt(sum((a - b) ** 2 for a, b in zip(row, query))), i)
        for i, row in enumerate(train_x)
    )
    nearest = ranked[:k]
    votes = {}
    first_seen = {}
    for pos, (_, i) in enumerate(nearest):
        label = train_y[i]
        votes[label] = votes.get(label, 0) + 1
        first_seen.setdefault(label, pos)
    return min(votes, key=lambda lab: (-votes[lab], first_seen[lab]))
````

````task
id: classification-metrics
title: Accuracy, precision, recall and F1
kind: code
level: easy
@@statement
Write `classification_metrics(y_true, y_pred)` for a binary problem where the positive class is `1`.

**Input**: two equal-length lists of 0/1 values.

**Output**: a dict `{"accuracy": a, "precision": p, "recall": r, "f1": f}` of floats (checked within `1e-9`).
- `accuracy = correct / total`, `precision = TP / (TP + FP)`, `recall = TP / (TP + FN)`, `f1 = 2 * p * r / (p + r)`.
- Any division by zero gives `0.0` for that metric (empty input gives all `0.0`).

**Example**

```
y_true = [1, 1, 1, 0, 0, 0, 0, 0]
y_pred = [1, 1, 0, 1, 0, 0, 0, 0]      # TP=2, FN=1, FP=1, TN=4
-> {"accuracy": 0.75, "precision": 0.6667, "recall": 0.6667, "f1": 0.6667}   (shown rounded)
```
@@starter
def classification_metrics(y_true, y_pred):
    # your code here
    pass

print(classification_metrics([1, 1, 1, 0, 0, 0, 0, 0], [1, 1, 0, 1, 0, 0, 0, 0]))
@@tests
_m = classification_metrics([1, 1, 1, 0, 0, 0, 0, 0], [1, 1, 0, 1, 0, 0, 0, 0])
assert abs(_m["accuracy"] - 0.75) < 1e-9, "accuracy"
assert abs(_m["precision"] - 2 / 3) < 1e-9 and abs(_m["recall"] - 2 / 3) < 1e-9, "precision and recall"
assert abs(_m["f1"] - 2 / 3) < 1e-9, "f1"
_n = classification_metrics([0, 0, 0], [0, 0, 0])
assert _n == {"accuracy": 1.0, "precision": 0.0, "recall": 0.0, "f1": 0.0}, "no positives at all"
_o = classification_metrics([1, 0, 0, 0], [1, 1, 1, 1])
assert abs(_o["recall"] - 1.0) < 1e-9 and abs(_o["precision"] - 0.25) < 1e-9, "predict everything positive"
assert classification_metrics([], []) == {"accuracy": 0.0, "precision": 0.0, "recall": 0.0, "f1": 0.0}, "empty input"
assert abs(classification_metrics([1, 1], [0, 0])["f1"]) < 1e-9, "never predicting positive"
@@hint
Count TP, FP, FN and TN in one loop over `zip(y_true, y_pred)`, then divide only when the denominator is not 0.
@@solution
def classification_metrics(y_true, y_pred):
    tp = fp = fn = tn = 0
    for t, p in zip(y_true, y_pred):
        if t == 1 and p == 1:
            tp += 1
        elif t == 0 and p == 1:
            fp += 1
        elif t == 1 and p == 0:
            fn += 1
        else:
            tn += 1
    total = tp + fp + fn + tn
    accuracy = (tp + tn) / total if total else 0.0
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {"accuracy": accuracy, "precision": precision, "recall": recall, "f1": f1}
````

````task
id: threshold-sweep
title: Precision and recall by threshold
kind: code
level: medium
@@statement
A classifier such as logistic regression outputs probabilities. The threshold decides which become positive. Write `threshold_sweep(y_true, probs, thresholds)`.

**Input**: `y_true` a list of 0/1 labels; `probs` a list of probabilities (same length); `thresholds` a list of floats.

**Output**: a list with one tuple `(threshold, precision, recall)` per threshold, in the given order. A sample is predicted positive when `prob >= threshold`. If `TP + FP` is 0 the precision is `1.0` (nothing wrong was predicted); if `TP + FN` is 0 the recall is `0.0`.

**Example**

```
y_true = [1, 1, 0, 1, 0, 0]
probs  = [0.9, 0.6, 0.55, 0.4, 0.3, 0.1]
threshold_sweep(y_true, probs, [0.5, 0.35])
-> [(0.5, 0.6667, 0.6667), (0.35, 0.75, 1.0)]    # lowering the threshold: recall up
```
@@starter
def threshold_sweep(y_true, probs, thresholds):
    # your code here
    pass

print(threshold_sweep([1, 1, 0, 1, 0, 0], [0.9, 0.6, 0.55, 0.4, 0.3, 0.1], [0.5, 0.35]))
@@tests
_y = [1, 1, 0, 1, 0, 0]
_p = [0.9, 0.6, 0.55, 0.4, 0.3, 0.1]
_r = threshold_sweep(_y, _p, [0.5, 0.35])
assert _r[0][0] == 0.5 and abs(_r[0][1] - 2 / 3) < 1e-9 and abs(_r[0][2] - 2 / 3) < 1e-9, "threshold 0.5"
assert _r[1][0] == 0.35 and abs(_r[1][1] - 0.75) < 1e-9 and abs(_r[1][2] - 1.0) < 1e-9, "threshold 0.35"
assert threshold_sweep(_y, _p, [0.95]) == [(0.95, 1.0, 0.0)], "nothing predicted positive"
_eq = threshold_sweep(_y, _p, [0.9])
assert abs(_eq[0][1] - 1.0) < 1e-9 and abs(_eq[0][2] - 1 / 3) < 1e-9, "prob equal to threshold counts as positive"
assert threshold_sweep(_y, _p, []) == [], "no thresholds"
assert threshold_sweep([0, 0], [0.9, 0.8], [0.5]) == [(0.5, 0.0, 0.0)], "no real positives"
@@hint
For each threshold build `preds = [1 if p >= t else 0 for p in probs]`, then count TP, FP and FN.
@@solution
def threshold_sweep(y_true, probs, thresholds):
    out = []
    for t in thresholds:
        tp = fp = fn = 0
        for y, p in zip(y_true, probs):
            pred = 1 if p >= t else 0
            if pred == 1 and y == 1:
                tp += 1
            elif pred == 1 and y == 0:
                fp += 1
            elif pred == 0 and y == 1:
                fn += 1
        precision = tp / (tp + fp) if (tp + fp) else 1.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        out.append((t, precision, recall))
    return out
````

````task
id: decision-tree
title: Recursive decision tree with a depth limit
kind: code
level: hard
@@statement
Build a tiny decision tree for **one numeric feature**.

Write `fit_tree(xs, ys, max_depth)` and `predict_tree(tree, x)`.

**Input**: `xs` a list of numbers, `ys` the labels (ints), `max_depth` an int >= 0.

**Tree format**: a leaf is `{"leaf": label}`; an inner node is `{"threshold": t, "left": tree, "right": tree}` where `left` takes `x <= t` and `right` takes `x > t`.

**Rules**
- Make a leaf (label = most common label, ties go to the smallest label) when `max_depth == 0`, when all labels are equal, or when all `xs` are equal.
- Otherwise try every midpoint between consecutive **distinct sorted** x values as a threshold, and pick the one with the lowest weighted Gini impurity `(nl * gini(left) + nr * gini(right)) / n`, where `gini = 1 - sum(p_c^2)`. On ties keep the **smallest** threshold (only replace when better by more than `1e-12`).
- Build both sides recursively with `max_depth - 1`.

**Example**

```
fit_tree([1, 2, 3, 10, 11, 12], [0, 0, 0, 1, 1, 1], 1)
-> {"threshold": 6.5, "left": {"leaf": 0}, "right": {"leaf": 1}}
predict_tree(tree, 4) -> 0
```
@@starter
def fit_tree(xs, ys, max_depth):
    # your code here
    pass

def predict_tree(tree, x):
    # your code here
    pass
@@tests
_t = fit_tree([1, 2, 3, 10, 11, 12], [0, 0, 0, 1, 1, 1], 1)
assert _t == {"threshold": 6.5, "left": {"leaf": 0}, "right": {"leaf": 1}}, "perfect split"
assert predict_tree(_t, 4) == 0 and predict_tree(_t, 6.5) == 0 and predict_tree(_t, 7) == 1, "prediction"
assert fit_tree([1, 2, 3], [1, 1, 1], 3) == {"leaf": 1}, "pure node is a leaf"
assert fit_tree([1, 2, 3, 4], [0, 1, 1, 1], 0) == {"leaf": 1}, "depth 0 is a majority leaf"
assert fit_tree([1, 2], [0, 1], 0) == {"leaf": 0}, "majority tie goes to the smallest label"
_deep = fit_tree([1, 2, 3, 4], [0, 1, 1, 0], 2)
assert _deep == {"threshold": 1.5, "left": {"leaf": 0},
                 "right": {"threshold": 3.5, "left": {"leaf": 1}, "right": {"leaf": 0}}}, "depth 2"
assert [predict_tree(_deep, v) for v in (1, 2, 3, 4)] == [0, 1, 1, 0], "depth 2 fits the training data"
_shallow = fit_tree([1, 2, 3, 4], [0, 1, 1, 0], 1)
assert "threshold" in _shallow and "leaf" in _shallow["left"] and "leaf" in _shallow["right"], "depth limit respected"
assert fit_tree([5, 5, 5], [0, 1, 1], 2) == {"leaf": 1}, "identical x values cannot be split"
@@hint
Write a helper `gini(labels)` and a loop over the midpoints. After picking the best threshold, split the data with `x <= t` and recurse.
@@solution
def _majority(ys):
    counts = {}
    for y in ys:
        counts[y] = counts.get(y, 0) + 1
    return min(counts, key=lambda c: (-counts[c], c))

def _gini(ys):
    n = len(ys)
    counts = {}
    for y in ys:
        counts[y] = counts.get(y, 0) + 1
    return 1 - sum((c / n) ** 2 for c in counts.values())

def fit_tree(xs, ys, max_depth):
    if max_depth == 0 or len(set(ys)) == 1 or len(set(xs)) == 1:
        return {"leaf": _majority(ys)}
    values = sorted(set(xs))
    best_t, best_score = None, None
    for a, b in zip(values, values[1:]):
        t = (a + b) / 2
        left = [y for x, y in zip(xs, ys) if x <= t]
        right = [y for x, y in zip(xs, ys) if x > t]
        score = (len(left) * _gini(left) + len(right) * _gini(right)) / len(ys)
        if best_score is None or score < best_score - 1e-12:
            best_t, best_score = t, score
    left_x = [x for x in xs if x <= best_t]
    left_y = [y for x, y in zip(xs, ys) if x <= best_t]
    right_x = [x for x in xs if x > best_t]
    right_y = [y for x, y in zip(xs, ys) if x > best_t]
    return {"threshold": best_t,
            "left": fit_tree(left_x, left_y, max_depth - 1),
            "right": fit_tree(right_x, right_y, max_depth - 1)}

def predict_tree(tree, x):
    while "leaf" not in tree:
        tree = tree["left"] if x <= tree["threshold"] else tree["right"]
    return tree["leaf"]
````

````task
id: standardize-no-leak
title: Scale without leaking test data
kind: code
level: medium
@@statement
Standardising with the mean and spread of the **whole** dataset leaks information from the test set into training. Write `standardize_train_test(train, test)` that learns the scaling **only from the training data**.

**Input**: `train` and `test`, non-empty lists of numbers (one feature).

**Output**: a tuple `(train_scaled, test_scaled)` of lists. Both use `(v - mean) / std` with the `mean` and the population standard deviation `std = sqrt(sum((v - mean)^2) / n)` of **train only**. If `std` is 0 use `1.0` instead. Inputs are not changed. Values are checked within `1e-9`.

**Example**

```
standardize_train_test([2, 4, 6], [10])
mean = 4, std = sqrt(8/3) = 1.63299...
-> ([-1.2247, 0.0, 1.2247], [3.6742])     # the test value is not centred: it is far from the training mean
```
@@starter
import math

def standardize_train_test(train, test):
    # your code here
    pass

print(standardize_train_test([2, 4, 6], [10]))
@@tests
import math as _math
_tr, _te = standardize_train_test([2, 4, 6], [10])
_std = _math.sqrt(8 / 3)
assert all(abs(a - b) < 1e-9 for a, b in zip(_tr, [-2 / _std, 0.0, 2 / _std])), "train scaled"
assert abs(_te[0] - 6 / _std) < 1e-9, "test uses the TRAIN mean and std"
assert abs(sum(_tr)) < 1e-9, "train has mean 0"
_tr2, _te2 = standardize_train_test([5, 5, 5], [7, 5])
assert _tr2 == [0.0, 0.0, 0.0] and _te2 == [2.0, 0.0], "constant train column uses std 1"
assert abs(sum(_te)) > 1, "test mean is NOT zero (zero would suggest it was scaled with its own stats)"
_a, _b = [1, 3], [2]
standardize_train_test(_a, _b)
assert _a == [1, 3] and _b == [2], "inputs not changed"
@@hint
Compute `mean` and `std` from `train` in one place, then apply the same two numbers to both lists.
@@solution
import math

def standardize_train_test(train, test):
    n = len(train)
    mean = sum(train) / n
    std = math.sqrt(sum((v - mean) ** 2 for v in train) / n)
    if std == 0:
        std = 1.0
    return [(v - mean) / std for v in train], [(v - mean) / std for v in test]
````

````task
id: k-fold-indices
title: Cross-validation folds
kind: code
level: medium
@@statement
Write `k_fold_indices(n, k)` that splits the row numbers `0..n-1` into `k` contiguous folds for cross-validation.

**Input**: `n` (number of rows) and `k` (number of folds), with `2 <= k <= n`; otherwise raise `ValueError`.

**Output**: a list of `k` tuples `(train_idx, test_idx)` of sorted lists. Fold `i` uses its block as `test_idx` and every other row as `train_idx`. The first `n % k` folds get one extra row (sizes differ by at most 1).

**Example**

```
k_fold_indices(5, 2)
-> [([3, 4], [0, 1, 2]), ([0, 1, 2], [3, 4])]
```
@@starter
def k_fold_indices(n, k):
    # your code here
    pass

print(k_fold_indices(5, 2))
@@tests
assert k_fold_indices(5, 2) == [([3, 4], [0, 1, 2]), ([0, 1, 2], [3, 4])], "5 rows, 2 folds"
_f = k_fold_indices(6, 3)
assert [t for _, t in _f] == [[0, 1], [2, 3], [4, 5]], "equal folds"
_g = k_fold_indices(10, 4)
assert [len(t) for _, t in _g] == [3, 3, 2, 2], "sizes differ by at most 1"
for _train, _test in _g:
    assert sorted(_train + _test) == list(range(10)) and not set(_train) & set(_test), "train and test are disjoint and complete"
assert sorted(i for _, t in _g for i in t) == list(range(10)), "each row is tested exactly once"
for _args in ((5, 1), (3, 4)):
    try:
        k_fold_indices(*_args)
        _ok = False
    except ValueError:
        _ok = True
    assert _ok, "invalid k raises ValueError"
@@hint
Fold size is `n // k` plus 1 for the first `n % k` folds. Keep a running `start` index.
@@solution
def k_fold_indices(n, k):
    if k < 2 or k > n:
        raise ValueError("need 2 <= k <= n")
    base, extra = divmod(n, k)
    folds = []
    start = 0
    for i in range(k):
        size = base + (1 if i < extra else 0)
        test = list(range(start, start + size))
        train = [j for j in range(n) if j < start or j >= start + size]
        folds.append((train, test))
        start += size
    return folds
````

````task
id: read-confusion-matrix
title: Read a fraud confusion matrix
kind: text
level: medium
@@statement
A fraud model scores 1000 card payments. Real fraud is 60 of them. The confusion matrix at threshold 0.5 is:

| | predicted fraud | predicted ok |
|---|---|---|
| **actual fraud** | TP = 40 | FN = 20 |
| **actual ok** | FP = 10 | TN = 930 |

A reviewer costs 5 EUR per flagged payment (right or wrong). A missed fraud costs 200 EUR.

**Deliverable** (6-10 sentences)
1. Compute accuracy, precision and recall, with the arithmetic.
2. Explain why accuracy looks excellent yet is a poor way to judge this model (give the accuracy of a model that always says "ok").
3. Compute the total cost at this threshold, and say whether you would lower or raise the threshold and what you expect to happen to precision and recall.
@@hint
Cost = (TP + FP) * 5 + FN * 200. Compare it with the cost of never flagging anything.
@@solution
Accuracy = (40 + 930) / 1000 = 0.97. Precision = 40 / (40 + 10) = 0.80: 4 in 5 flagged payments are fraud. Recall = 40 / (40 + 20) = 0.667: a third of the fraud is missed.

Because only 6% of payments are fraud, a model that always says "ok" scores 940 / 1000 = 0.94 accuracy while catching no fraud at all. So 0.97 is only 3 points above a useless baseline; precision and recall on the rare class say far more.

Cost now = (40 + 10) * 5 + 20 * 200 = 250 + 4000 = 4250 EUR. Never flagging costs 60 * 200 = 12,000 EUR. A missed fraud costs 40 times more than a review, so I would lower the threshold: recall goes up (fewer FN, each saving 200 EUR), precision goes down (more FP, each costing 5 EUR). It pays as long as each extra fraud found costs fewer than 40 extra false alarms.
@@criteria
- Computes accuracy 0.97, precision 0.80 and recall about 0.67 with the formulas.
- Notes the always-"ok" baseline gets 0.94 accuracy and explains class imbalance.
- Computes the cost 4250 EUR correctly (250 for reviews plus 4000 for misses).
- Recommends lowering the threshold, based on the 200 vs 5 EUR cost ratio.
- States the expected direction: recall up, precision down.
````

````task
id: leakage-diagnosis
title: Diagnose a leakage bug
kind: text
level: medium
@@statement
**Scenario**: a hospital team predicts "will this patient be readmitted within 30 days". Their cross-validated accuracy is 99%, but in a pilot on new patients it drops to 71%. The features are: `age`, `num_prior_visits`, `diagnosis_code`, `days_until_next_visit`, and `mean_lab_value`, where `mean_lab_value` was computed over the **whole dataset** before the data was split into folds.

**Deliverable** (6-10 sentences)
1. Identify the two leaks (name each and say why it leaks).
2. Explain why the cross-validation score is inflated but the pilot is not.
3. Give the corrected procedure, in order, as a short numbered list (split first, then ...).
4. Say which single check would have caught this (for example a feature importance or a "too good to be true" check).
@@hint
Ask for each feature: would I know this value at the moment of prediction, and was it computed using rows from the validation fold?
@@solution
1. `days_until_next_visit` is target leakage: a patient with a short gap to the next visit is almost by definition readmitted, and that information is only known after the prediction time. `mean_lab_value` computed on the whole dataset is preprocessing leakage: each validation row influenced the statistic that is then used to transform it.
2. In cross-validation the leaky feature is present with the answer baked in, so the model reads the label almost directly and gets 99%. In the pilot the future visit is unknown, and the lab statistics come only from past data, so the real accuracy of 71% shows up.
3. (1) Define the prediction moment and drop every feature not known then, including `days_until_next_visit`. (2) Split into train and test (by patient, and by time if possible). (3) Fit every preprocessing step such as means and scalers on the training part only. (4) Do cross-validation with these steps inside each fold. (5) Evaluate once on the untouched test set.
4. A feature-importance check would show `days_until_next_visit` dominating, and a 99% score on a hard medical problem should itself be treated as a warning.
@@criteria
- Names target leakage from `days_until_next_visit` (information from after the prediction time).
- Names preprocessing leakage from `mean_lab_value` computed on all data before the split.
- Explains why validation is inflated and the pilot exposes the real performance.
- Gives a corrected ordered procedure: define features at prediction time, split first, fit preprocessing on train only, evaluate on held-out data.
- Names a concrete check that would catch it (importance ranking, suspiciously high score, time-based split).
````

````task
id: workplace-ml-framing
title: Frame an ML problem
kind: text
level: medium
@@statement
**Scenario**: a delivery company wants to predict which parcels will arrive late. It has 200,000 past deliveries; 8% were late. A late parcel costs 15 EUR in refunds. Calling the customer in advance (to reschedule) costs 2 EUR per call and avoids the refund in 60% of calls on parcels that would be late.

**Deliverable** (a one-page style answer, about 10 lines)
1. The **label**: its exact definition and the moment of prediction.
2. Four **features** (name them) and one feature you must NOT use, with the reason.
3. The **metric** you optimise and why accuracy is not good enough.
4. The **cost of each error type** in EUR per parcel (false positive call, missed late parcel) and a rule for choosing the threshold.
5. The **baseline** you compare with.
@@hint
A false positive wastes 2 EUR. A missed late parcel loses the refund that a call would have saved with probability 0.6.
@@solution
1. Label: `late = 1` if the parcel is delivered after the promised date; predicted at the time the parcel leaves the depot, with only information available then.
2. Features: distance to the address, parcel weight, day of week and hour of dispatch, and the late-rate of the driver's route over the last 4 weeks. Not allowed: `delivery_attempts_count` or the actual delivery time, which are only known after the fact (leakage).
3. With 8% late, always predicting "on time" scores 92% accuracy, so I use precision and recall on the late class (or the expected cost), and the PR curve.
4. False positive: 2 EUR wasted on a call. Missed late parcel: the 15 * 0.6 = 9 EUR refund that the call would have saved. A call pays off when `p * 9 > 2`, i.e. probability of late above 2/9 = 0.22, so I use about 0.22 as the threshold instead of 0.5.
5. Baseline: always "on time" (zero calls, all refunds) and a simple rule such as "call when the route's recent late-rate is above 20%".
@@criteria
- Defines the label precisely and fixes the prediction moment.
- Lists at least four sensible features and one leakage feature to avoid with a reason.
- Rejects accuracy because of the 8% class imbalance and names a better metric.
- Gives the cost of both error types with numbers (2 EUR and 9 EUR, or 15 EUR with justification) and derives a threshold from them.
- Proposes a simple baseline for comparison.
````
