---
id: ai-deep-learning
title: Deep learning
minutes: 60
---

A neural network is a stack of simple layers whose weights are adjusted by gradient descent until its outputs match the examples. Deep learning wins where the input is raw and high-dimensional: images, audio, text. This lesson builds a network from nothing, then shows the same thing in PyTorch and the main architectures.

## From one neuron to a network

A **neuron** computes a weighted sum of its inputs plus a bias, then applies an **activation function**. A **layer** is many neurons side by side, which is a matrix multiplication: `y = f(W·x + b)`. A network stacks layers so that later ones combine the patterns found by earlier ones.

Why activation functions are essential: without them, stacked layers collapse into a single linear function, no matter how many you stack. The non-linearity is what lets a network learn curves.

| Activation | Formula | Used for |
| --- | --- | --- |
| ReLU | max(0, x) | The default in hidden layers |
| GELU | A smooth variant of ReLU | Transformers |
| Sigmoid | 1 / (1 + e⁻ˣ), output between 0 and 1 | Binary output probabilities |
| Tanh | Output between -1 and 1 | Some recurrent networks |
| Softmax | Turns a vector of scores into probabilities that sum to 1 | Multi-class output |

## A network from scratch

XOR (output 1 when exactly one input is 1) cannot be learned by any single straight line, so logistic regression fails on it. A network with one hidden layer learns it. This code does the forward pass, backpropagation and updates by hand:

```python run
import math, random
random.seed(1)

X = [[0, 0], [0, 1], [1, 0], [1, 1]]
Y = [0, 1, 1, 0]
H = 4                                                   # hidden neurons
sigmoid = lambda z: 1 / (1 + math.exp(-z))

W1 = [[random.uniform(-1, 1) for _ in range(2)] for _ in range(H)]   # input -> hidden
b1 = [0.0] * H
W2 = [random.uniform(-1, 1) for _ in range(H)]                        # hidden -> output
b2 = 0.0
lr = 0.5

def forward(x):
    hidden = [math.tanh(W1[j][0] * x[0] + W1[j][1] * x[1] + b1[j]) for j in range(H)]
    out = sigmoid(sum(W2[j] * hidden[j] for j in range(H)) + b2)
    return hidden, out

for epoch in range(4001):
    loss = 0.0
    for x, y in zip(X, Y):
        hidden, out = forward(x)                         # 1. forward pass
        loss += -(y * math.log(out) + (1 - y) * math.log(1 - out))   # 2. cross-entropy loss
        d_out = out - y                                  # 3. backward pass: chain rule, layer by layer
        for j in range(H):
            d_hidden = d_out * W2[j] * (1 - hidden[j] ** 2)          # derivative of tanh
            W2[j] -= lr * d_out * hidden[j]              # 4. update weights against the gradient
            W1[j][0] -= lr * d_hidden * x[0]
            W1[j][1] -= lr * d_hidden * x[1]
            b1[j] -= lr * d_hidden
        b2 -= lr * d_out
    if epoch % 1000 == 0:
        print(f"epoch {epoch:4}: loss {loss:.4f}")

for x in X:
    print(x, "->", round(forward(x)[1], 3))
```

Those four numbered steps are the whole of deep learning. Frameworks automate step 3 (**automatic differentiation**) and run the arithmetic on GPUs.

## Training vocabulary

| Term | Meaning |
| --- | --- |
| Loss function | One number for how wrong the predictions are. Cross-entropy for classification; mean squared error for regression |
| Backpropagation | Applying the chain rule backwards through the layers to get every weight's gradient |
| Optimiser | Uses gradients to update weights. SGD is the plain version; Adam and AdamW adapt the step per parameter and are the defaults |
| Epoch | One full pass over the training data |
| Batch | The examples processed in one step; gradients are averaged over the batch |
| Learning rate | The step size. Too high diverges, too low crawls |
| Scheduler | Changes the learning rate during training: warm-up, then decay |
| Weight initialisation | Starting values chosen so that signals neither explode nor vanish |
| Batch norm, layer norm | Rescale activations to stabilise training |
| Dropout | Randomly zero some activations during training to reduce overfitting |
| Residual connection | Add a layer's input to its output so gradients flow through very deep networks |
| Vanishing or exploding gradients | Gradients shrink or grow through many layers. Fixed by ReLU, normalisation, residual connections, gradient clipping |
| Early stopping | Stop when validation loss stops improving |

## The same thing in PyTorch

PyTorch is the dominant framework in research and industry. Install with `pip install torch torchvision`.

```python
import torch
from torch import nn
from torch.utils.data import DataLoader

device = "cuda" if torch.cuda.is_available() else "cpu"

model = nn.Sequential(
    nn.Flatten(),
    nn.Linear(28 * 28, 256), nn.ReLU(), nn.Dropout(0.2),
    nn.Linear(256, 10),                      # 10 class scores (logits)
).to(device)

loss_fn = nn.CrossEntropyLoss()
optimiser = torch.optim.AdamW(model.parameters(), lr=1e-3)

for epoch in range(5):
    model.train()
    for x, y in DataLoader(train_ds, batch_size=64, shuffle=True):
        x, y = x.to(device), y.to(device)
        loss = loss_fn(model(x), y)          # forward pass and loss
        optimiser.zero_grad()
        loss.backward()                      # backpropagation, done for you
        optimiser.step()                     # update the weights

    model.eval()
    correct = 0
    with torch.no_grad():                    # no gradients needed for evaluation
        for x, y in DataLoader(val_ds, batch_size=256):
            correct += (model(x.to(device)).argmax(1) == y.to(device)).sum().item()
    print(epoch, correct / len(val_ds))
```

Every deep learning program, including training a large language model, is this loop with a bigger model and more data. What to understand in PyTorch: **tensors** and their shapes; `autograd`; `nn.Module` for defining models; `Dataset` and `DataLoader` for feeding data; moving tensors to the GPU; `model.train()` and `model.eval()` modes; saving and loading with `state_dict`.

## Architectures

| Architecture | Key idea | Used for |
| --- | --- | --- |
| MLP (fully connected) | Every input connects to every neuron | Tabular data; final layers of other networks |
| CNN (convolutional) | Small filters slide across the image and detect local patterns; deeper layers detect larger shapes | Images: classification, detection, segmentation |
| RNN, LSTM, GRU | Process a sequence step by step, carrying a memory | Older text and time-series models; largely replaced by transformers |
| Transformer | Attention lets every position look at every other position | Text, and now images, audio and video. [Next lesson](#ai-transformers-llms) |
| Autoencoder, VAE | Compress to a small code and reconstruct | Anomaly detection, representation learning |
| GAN | A generator and a discriminator compete | Image generation; an older approach |
| Diffusion model | Learn to remove noise step by step; generate by denoising pure noise | Image, video and audio generation |

### How a convolution works

A filter is a small grid of weights. Slide it over the image; at each position multiply and add. The result is high where the image matches the filter's pattern. This filter detects vertical edges:

```python run
image = [[0, 0, 0, 9, 9, 9],
         [0, 0, 0, 9, 9, 9],
         [0, 0, 0, 9, 9, 9],
         [0, 0, 0, 9, 9, 9]]            # dark on the left, bright on the right
kernel = [[-1, 0, 1],
          [-1, 0, 1],
          [-1, 0, 1]]                   # responds where brightness increases left to right

def convolve(img, k):
    out = []
    for r in range(len(img) - 2):
        row = []
        for c in range(len(img[0]) - 2):
            row.append(sum(img[r + i][c + j] * k[i][j] for i in range(3) for j in range(3)))
        out.append(row)
    return out

for row in convolve(image, kernel):
    print(row)                          # large values exactly where the edge is
```

A CNN learns its filters instead of having them hand-written. Early layers learn edges and colours, middle layers textures and parts, late layers whole objects. **Pooling** shrinks the image between layers. Because the same filter is used everywhere, a CNN needs far fewer weights than a fully connected network and recognises a pattern wherever it appears.

## Computer vision tasks

| Task | Output | Typical models |
| --- | --- | --- |
| Classification | One label per image | ResNet, EfficientNet, Vision Transformer |
| Object detection | Boxes with labels | The YOLO family for real-time use |
| Segmentation | A label for every pixel | U-Net, Mask R-CNN, Segment Anything |
| Anomaly detection | Whether this differs from normal | Autoencoders, PatchCore |
| OCR and document understanding | Text and structure | Specialised models and multimodal LLMs |

Example: a camera station checks that the correct component is fitted. A detector locates the components; its classes or a second classifier identify the type; a rule flags a wrong or missing part. The hard work is the data: consistent lighting and camera position, enough examples of each fault, labels you trust, and a validation set taken from the real line on different days. When defect examples are rare, anomaly detection trained only on good parts is often the better approach.

## Transfer learning

Training from scratch needs enormous data. Instead, take a model pretrained on a large dataset, replace its final layer, and fine-tune on your few hundred or few thousand examples. This is the normal way to do applied vision and language work.

```python
from torch import nn
from torchvision import models

net = models.resnet18(weights="DEFAULT")       # pretrained on ImageNet
for p in net.parameters():
    p.requires_grad = False                    # freeze the backbone
net.fc = nn.Linear(net.fc.in_features, 2)      # new head for two classes: OK / NG
# train only net.fc first; then optionally unfreeze later layers with a small learning rate
```

**Data augmentation** creates varied training examples (flips, crops, rotations, brightness changes), which reduces overfitting. Only use augmentations that could occur in reality: do not flip images if orientation matters.

## Debugging a network that will not learn

1. **Overfit one batch first.** If the model cannot drive the loss to near zero on eight examples, there is a bug.
2. Check shapes at every layer.
3. Check that inputs are normalised and labels are aligned with inputs.
4. Try a learning rate ten times lower and ten times higher.
5. Compare training and validation loss: both high means underfitting or a bug; training low and validation high means overfitting.
6. Look at the examples the model gets wrong; mislabelled data is common.

## Hardware and efficiency

GPUs run large matrix multiplications in parallel, giving speed-ups of ten to a hundred times over a CPU. What to know: CUDA (NVIDIA's GPU programming layer that PyTorch uses), GPU memory limits and what sets them (model size, batch size, input size), **mixed-precision** training (16-bit floats for speed and memory), **gradient accumulation** to simulate a larger batch, and exporting to ONNX for faster inference on servers and edge devices.

## Check yourself

```quiz
[
  {"q": "Why does a network need non-linear activation functions?", "options": ["To run faster", "Without them, any number of layers equals one linear function", "To use less memory"], "answer": 1, "why": "Stacked linear maps are still linear; non-linearity lets the network model curves."},
  {"q": "What does backpropagation compute?", "options": ["The predictions", "The gradient of the loss with respect to every weight", "The learning rate"], "answer": 1, "why": "It applies the chain rule backwards so the optimiser knows how to change each weight."},
  {"q": "Why can a CNN recognise a part anywhere in the image with relatively few weights?", "options": ["It memorises every position", "The same small filter is applied at every position", "It uses bigger layers"], "answer": 1, "why": "Weight sharing gives translation tolerance and parameter efficiency."},
  {"q": "You have 600 labelled images for a new inspection task. Best approach?", "options": ["Train a large network from scratch", "Fine-tune a pretrained model", "Use k-means"], "answer": 1, "why": "Transfer learning reuses features learned from millions of images."},
  {"q": "A new model's loss does not decrease at all. What is the first debugging step?", "options": ["Buy a bigger GPU", "Try to overfit a single small batch", "Add more layers"], "answer": 1, "why": "If it cannot memorise a few examples, the problem is a bug, not capacity."},
  {"q": "What does dropout do?", "options": ["Speeds up inference", "Randomly disables activations in training to reduce overfitting", "Removes bad data"], "answer": 1, "why": "It prevents the network from relying on any single neuron."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: single-neuron
title: A single sigmoid neuron
kind: code
level: easy
@@statement
Write `neuron(inputs, weights, bias)` that computes the output of one neuron with a sigmoid activation.

**Input**: `inputs` and `weights`, equal-length lists of floats; `bias`, a float.

**Output**: a float `sigmoid(z)` where `z = sum(w * x) + bias` and `sigmoid(z) = 1 / (1 + e^-z)` (checked within `1e-9`). It must not crash for very large `|z|` (for example `z = -1000` or `z = 1000`): return a value very close to 0 or 1 instead of raising `OverflowError`. Empty inputs give `sigmoid(bias)`.

**Example**

```
neuron([1.0, 2.0], [0.5, -0.25], 0.0)  -> z = 0.5 - 0.5 = 0 -> 0.5
neuron([1.0], [2.0], 1.0)              -> z = 3 -> 0.9525741...
```
@@starter
import math

def neuron(inputs, weights, bias):
    # your code here
    pass

print(neuron([1.0, 2.0], [0.5, -0.25], 0.0))
@@tests
import math as _math
assert abs(neuron([1.0, 2.0], [0.5, -0.25], 0.0) - 0.5) < 1e-9, "z = 0 gives 0.5"
assert abs(neuron([1.0], [2.0], 1.0) - 1 / (1 + _math.exp(-3))) < 1e-9, "z = 3"
assert abs(neuron([], [], 0.0) - 0.5) < 1e-9, "empty inputs"
assert abs(neuron([1.0], [-1000.0], 0.0)) < 1e-9, "very negative z does not overflow"
assert abs(neuron([1.0], [1000.0], 0.0) - 1.0) < 1e-9, "very positive z does not overflow"
assert abs(neuron([2.0], [1.0], -2.0) - 0.5) < 1e-9, "bias shifts the output"
@@hint
For negative `z` use `e = math.exp(z); return e / (1 + e)`, which never overflows; for positive `z` use `1 / (1 + math.exp(-z))`.
@@solution
import math

def neuron(inputs, weights, bias):
    z = sum(w * x for w, x in zip(weights, inputs)) + bias
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)
````

````task
id: softmax-cross-entropy
title: Softmax and cross-entropy
kind: code
level: medium
@@statement
Write two functions used at the output of every classifier.

1. `softmax(logits)`: turn scores into probabilities. It must be **numerically stable**: subtract `max(logits)` before taking `exp`.
2. `cross_entropy(probs, target)`: the loss `-ln(probs[target])`, where `target` is the index of the correct class. If the probability is 0 use `1e-12` instead.

**Input**: `logits`, a non-empty list of floats; `probs`, a list of probabilities; `target`, an int index.

**Output**: `softmax` returns a list of floats that sums to 1; `cross_entropy` returns a float. Checked within `1e-6`.

**Example**

```
softmax([1.0, 1.0])               -> [0.5, 0.5]
softmax([1000.0, 1000.0])         -> [0.5, 0.5]       (no overflow)
cross_entropy([0.7, 0.2, 0.1], 0) -> -ln(0.7) = 0.35667...
```
@@starter
import math

def softmax(logits):
    # your code here
    pass

def cross_entropy(probs, target):
    # your code here
    pass

print(softmax([2.0, 1.0, 0.1]))
@@tests
_p = softmax([2.0, 1.0, 0.1])
assert abs(sum(_p) - 1.0) < 1e-9, "probabilities sum to 1"
assert all(abs(a - b) < 1e-6 for a, b in zip(_p, [0.659001, 0.242433, 0.098566])), "known values"
assert all(abs(v - 0.5) < 1e-9 for v in softmax([1000.0, 1000.0])), "stable for large logits"
assert all(abs(v - 1 / 3) < 1e-9 for v in softmax([5, 5, 5])), "equal scores"
assert abs(softmax([-1000.0, 0.0])[1] - 1.0) < 1e-9, "very negative logit"
assert abs(cross_entropy([0.7, 0.2, 0.1], 0) - 0.35667494393873245) < 1e-9, "loss for the right class"
assert abs(cross_entropy([0.7, 0.2, 0.1], 2) - 2.302585092994046) < 1e-9, "loss for an unlikely class"
assert cross_entropy([1.0, 0.0], 1) > 20, "zero probability is clipped, not an error"
assert abs(cross_entropy([1.0, 0.0], 0)) < 1e-9, "perfect prediction has no loss"
@@hint
`m = max(logits)`, `exps = [math.exp(v - m) for v in logits]`, then divide by `sum(exps)`.
@@solution
import math

def softmax(logits):
    m = max(logits)
    exps = [math.exp(v - m) for v in logits]
    total = sum(exps)
    return [e / total for e in exps]

def cross_entropy(probs, target):
    p = probs[target]
    if p <= 0:
        p = 1e-12
    return -math.log(p)
````

````task
id: backprop-step
title: One backprop step for a neuron
kind: code
level: medium
@@statement
Do one gradient-descent step for a single sigmoid neuron trained with **binary cross-entropy**.

Write `train_step(weights, bias, x, y, lr)`.

**Input**: `weights` (list of floats), `bias` (float), `x` (one input list, same length as `weights`), `y` (the label, `0` or `1`), `lr` (learning rate).

**Output**: a tuple `(new_weights, new_bias)` (checked within `1e-9`).
- Forward: `p = sigmoid(sum(w_i * x_i) + bias)`.
- For this loss and activation the error signal simplifies to `err = p - y`. Gradients: `dw_i = err * x_i`, `db = err`.
- Update: `w_i = w_i - lr * dw_i`, `bias = bias - lr * db`.
- Return **new** values; do not change the `weights` list you were given.

**Example**

```
train_step([0.0, 0.0], 0.0, [1.0, 2.0], 1, 0.1)
p = 0.5, err = -0.5, dw = [-0.5, -1.0], db = -0.5
-> ([0.05, 0.1], 0.05)
```
@@starter
import math

def train_step(weights, bias, x, y, lr):
    # your code here
    pass

print(train_step([0.0, 0.0], 0.0, [1.0, 2.0], 1, 0.1))
@@tests
import math as _math
_w, _b = train_step([0.0, 0.0], 0.0, [1.0, 2.0], 1, 0.1)
assert all(abs(a - c) < 1e-9 for a, c in zip(_w, [0.05, 0.1])) and abs(_b - 0.05) < 1e-9, "worked example"
_w, _b = train_step([0.0, 0.0], 0.0, [1.0, 2.0], 0, 0.1)
assert all(abs(a - c) < 1e-9 for a, c in zip(_w, [-0.05, -0.1])) and abs(_b + 0.05) < 1e-9, "label 0 pushes weights down"
_orig = [0.3, -0.2]
_w, _b = train_step(_orig, 0.1, [1.0, 1.0], 1, 0.5)
assert _orig == [0.3, -0.2], "input weights must not be changed"
_p = 1 / (1 + _math.exp(-(0.3 - 0.2 + 0.1)))
assert abs(_w[0] - (0.3 - 0.5 * (_p - 1))) < 1e-9 and abs(_b - (0.1 - 0.5 * (_p - 1))) < 1e-9, "uses err = p - y"
_wt, _bt = train_step([0.5, -0.5], 0.0, [2.0, 1.0], 1, 0.3)
_before = 1 / (1 + _math.exp(-(0.5 * 2 - 0.5 * 1)))
_after = 1 / (1 + _math.exp(-(_wt[0] * 2 + _wt[1] * 1 + _bt)))
assert _after > _before, "the prediction moves toward the label"
assert train_step([1.0], 0.0, [0.0], 1, 0.0) == ([1.0], 0.0), "lr 0 changes nothing"
@@hint
Compute `p` first, then `err = p - y`, and build the new weights with a list comprehension over `zip(weights, x)`.
@@solution
import math

def train_step(weights, bias, x, y, lr):
    z = sum(w * xi for w, xi in zip(weights, x)) + bias
    p = 1 / (1 + math.exp(-z))
    err = p - y
    new_w = [w - lr * err * xi for w, xi in zip(weights, x)]
    new_b = bias - lr * err
    return new_w, new_b
````

````task
id: train-logic-gate
title: Train a neuron on a truth table
kind: code
level: hard
@@statement
Use the one-neuron step from the previous task to learn a logic gate. Write `train_neuron(data, lr, epochs)` and `predict(weights, bias, x)`.

**Input**: `data`, a list of `([x1, x2], label)` pairs (a truth table); `lr` a float; `epochs` an int >= 0.

**Output**: `train_neuron` returns a tuple `(weights, bias)`. Start from `weights = [0.0, 0.0]` and `bias = 0.0`. For each epoch go through `data` **in the given order** and do one sigmoid + binary cross-entropy step per example (`err = p - y`, `w -= lr * err * x`, `b -= lr * err`). `predict` returns `1` when the neuron output is `>= 0.5`, else `0`.

**Example**

```
AND = [([0,0],0), ([0,1],0), ([1,0],0), ([1,1],1)]
w, b = train_neuron(AND, 0.5, 2000)
[predict(w, b, x) for x, _ in AND] -> [0, 0, 0, 1]
```
Try XOR as well: a single neuron cannot learn it (that is why we need a hidden layer).
@@starter
import math

def train_neuron(data, lr, epochs):
    # your code here
    pass

def predict(weights, bias, x):
    # your code here
    pass
@@tests
_AND = [([0, 0], 0), ([0, 1], 0), ([1, 0], 0), ([1, 1], 1)]
_OR = [([0, 0], 0), ([0, 1], 1), ([1, 0], 1), ([1, 1], 1)]
_NAND = [([0, 0], 1), ([0, 1], 1), ([1, 0], 1), ([1, 1], 0)]
_XOR = [([0, 0], 0), ([0, 1], 1), ([1, 0], 1), ([1, 1], 0)]
for _name, _table in (("AND", _AND), ("OR", _OR), ("NAND", _NAND)):
    _w, _b = train_neuron(_table, 0.5, 2000)
    assert [predict(_w, _b, x) for x, _ in _table] == [y for _, y in _table], "learns " + _name
_w, _b = train_neuron(_XOR, 0.5, 2000)
assert sum(predict(_w, _b, x) == y for x, y in _XOR) <= 3, "XOR is not linearly separable: one neuron cannot get all 4 right"
_w0, _b0 = train_neuron(_AND, 0.5, 0)
assert list(_w0) == [0.0, 0.0] and _b0 == 0.0, "zero epochs gives the starting values"
_w1, _b1 = train_neuron(_AND, 0.5, 1)
assert len(_w1) == 2 and _b1 < 0, "one epoch on AND pushes the bias down"
assert predict([1.0, 1.0], -1.5, [1, 1]) == 1 and predict([1.0, 1.0], -1.5, [1, 0]) == 0, "predict threshold"
@@hint
Loop `for _ in range(epochs)` and inside it `for x, y in data`, updating `weights` and `bias` the same way as in the backprop-step task.
@@solution
import math

def _sigmoid(z):
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)

def train_neuron(data, lr, epochs):
    weights = [0.0, 0.0]
    bias = 0.0
    for _ in range(epochs):
        for x, y in data:
            p = _sigmoid(sum(w * xi for w, xi in zip(weights, x)) + bias)
            err = p - y
            weights = [w - lr * err * xi for w, xi in zip(weights, x)]
            bias -= lr * err
    return weights, bias

def predict(weights, bias, x):
    z = sum(w * xi for w, xi in zip(weights, x)) + bias
    return 1 if _sigmoid(z) >= 0.5 else 0
````

````task
id: xor-experiment-reading
title: Explain XOR training experiments
kind: text
level: medium
@@statement
You train a network with one hidden layer (tanh) on XOR (4 examples) for 5000 steps and record the final loss and accuracy:

| run | hidden units | learning rate | final loss | accuracy |
|---|---|---|---|---|
| A | 1 | 0.5 | 0.69 | 50-75% |
| B | 2 | 0.5 | 0.02 | 100% |
| C | 8 | 0.5 | 0.001 | 100% |
| D | 8 | 0.05 | 0.35 | 100% |
| E | 8 | 5 | 0.69 or NaN | 50% |

**Deliverable** (8-12 sentences)
1. Explain run A: why one hidden unit cannot solve XOR (mention linear separability).
2. Explain B versus C and what more hidden units buy you.
3. Explain D and E: what a too-small and a too-large learning rate do to the loss.
4. Say what you would try first if your own network's loss stayed at 0.69 for a binary problem, in 3 ordered steps.
@@hint
A loss of 0.69 is `ln 2`: the loss of always predicting 0.5 for a two-class problem.
@@solution
A: XOR is not linearly separable: no single straight line separates (0,1) and (1,0) from (0,0) and (1,1). One hidden unit gives the output layer a single feature (one line in the input plane), so the network still behaves like a linear classifier and gets at best 3 of 4 points. The loss 0.69 = ln 2 is the loss of predicting 0.5 for everything.

B and C: two hidden units are the minimum to carve the plane into the needed regions (one line acting like OR, one like AND), and the loss reaches about zero. Eight units make training easier and faster because more random starts contain a useful pair of features, but they add parameters and give no better accuracy on 4 examples.

D: with a rate of 0.05 the steps are tiny, so after 5000 steps the loss is still 0.35: the predictions are on the right side of 0.5 but not yet confident; it needs more steps. E: with a rate of 5 each update overshoots, the loss bounces or blows up to NaN, and tanh units saturate so their gradients become near zero, leaving the net stuck at 0.69.

If a binary loss stays at 0.69: (1) check the data and labels (correct labels, features not constant, inputs scaled), (2) lower the learning rate by 10 times and check that the model can overfit a tiny batch of 4-8 examples, (3) increase capacity or check for dead or saturated units and the weight initialisation.
@@criteria
- Explains that XOR is not linearly separable and one hidden unit leaves the model effectively linear.
- Identifies 0.69 as ln 2, the loss of a constant 0.5 prediction.
- Explains that more hidden units help (B, C) although 2 are enough in principle.
- Explains slow learning with a small rate (D) and overshoot, divergence or saturation with a large rate (E).
- Gives a concrete ordered debugging plan for a loss stuck at 0.69.
````

````task
id: conv-kernels
title: Edge and blur kernels
kind: code
level: medium
@@statement
A convolution layer slides a small kernel over an image. The helper `conv2d(image, kernel)` is already written for you in the starter code ("valid" mode, no padding, no flipping: it multiplies and sums at each position).

Write two kernel builders.

1. `horizontal_edge_kernel()`: a 3x3 kernel (list of 3 rows) that responds to **horizontal edges**. It must give a **positive** response where the image is dark above and bright below, `0` on flat areas and `0` on purely vertical edges. Use the rows `-1, -1, -1`, then `0, 0, 0`, then `1, 1, 1`.
2. `box_blur_kernel(n)`: an n x n kernel where every value is `1 / (n * n)`, so the values sum to 1.

**Output**: lists of lists of numbers (floats for the blur, checked within `1e-9`).

**Example**

```
image (dark top, bright bottom)      conv2d(image, horizontal_edge_kernel())
[[0,0,0,0],                          [[27, 27],     # windows that contain the edge
 [0,0,0,0],                           [27, 27],
 [9,9,9,9],                           [0, 0]]       # fully bright window: no edge
 [9,9,9,9],
 [9,9,9,9]]                          (5 x 4 image -> 3 x 2 output)
```
@@starter
def conv2d(image, kernel):
    kh, kw = len(kernel), len(kernel[0])
    out = []
    for i in range(len(image) - kh + 1):
        row = []
        for j in range(len(image[0]) - kw + 1):
            row.append(sum(image[i + a][j + b] * kernel[a][b] for a in range(kh) for b in range(kw)))
        out.append(row)
    return out

def horizontal_edge_kernel():
    # your code here
    pass

def box_blur_kernel(n):
    # your code here
    pass
@@tests
_img = [[0, 0, 0, 0], [0, 0, 0, 0], [9, 9, 9, 9], [9, 9, 9, 9], [9, 9, 9, 9]]
_k = horizontal_edge_kernel()
assert len(_k) == 3 and all(len(r) == 3 for r in _k), "3x3 kernel"
assert conv2d(_img, _k) == [[27, 27], [27, 27], [0, 0]], "positive where dark is above bright, 0 on the bright part"
_flat = [[5] * 4 for _ in range(4)]
assert conv2d(_flat, _k) == [[0, 0], [0, 0]], "flat image gives no response"
_vert = [[0, 0, 9, 9] for _ in range(4)]
assert conv2d(_vert, _k) == [[0, 0], [0, 0]], "vertical edge gives no response to a horizontal kernel"
_b = box_blur_kernel(3)
assert len(_b) == 3 and all(len(r) == 3 for r in _b), "blur is n x n"
assert abs(sum(sum(r) for r in _b) - 1.0) < 1e-9, "blur sums to 1"
assert all(abs(v - 1 / 9) < 1e-9 for r in _b for v in r), "every value is 1/9"
assert box_blur_kernel(1) == [[1.0]], "1x1 blur"
assert all(abs(v - 5) < 1e-9 for r in conv2d(_flat, box_blur_kernel(2)) for v in r), "blurring a flat image changes nothing"
@@hint
The edge kernel is three hard-coded rows; the blur can be built with `[[1 / (n * n)] * n for _ in range(n)]`.
@@solution
def conv2d(image, kernel):
    kh, kw = len(kernel), len(kernel[0])
    out = []
    for i in range(len(image) - kh + 1):
        row = []
        for j in range(len(image[0]) - kw + 1):
            row.append(sum(image[i + a][j + b] * kernel[a][b] for a in range(kh) for b in range(kw)))
        out.append(row)
    return out

def horizontal_edge_kernel():
    return [[-1, -1, -1], [0, 0, 0], [1, 1, 1]]

def box_blur_kernel(n):
    return [[1 / (n * n)] * n for _ in range(n)]
````

````task
id: param-counts
title: Count MLP and CNN parameters
kind: code
level: easy
@@statement
Comparing an MLP and a CNN starts with counting their parameters. Write two functions.

1. `mlp_param_count(layer_sizes)`: for a fully connected network, each layer from `a` to `b` units has `a * b` weights plus `b` biases. `layer_sizes` is a list with at least 2 sizes (input, hidden..., output).
2. `conv_param_count(in_channels, out_channels, kernel_size)`: a square-kernel convolution has `out_channels * (in_channels * kernel_size^2 + 1)` parameters (one bias per output channel).

**Output**: ints. `mlp_param_count` raises `ValueError` if fewer than 2 sizes are given.

**Example**

```
mlp_param_count([784, 128, 10]) = (784*128 + 128) + (128*10 + 10) = 101770
conv_param_count(1, 8, 3)        = 8 * (1*9 + 1) = 80
```
@@starter
def mlp_param_count(layer_sizes):
    # your code here
    pass

def conv_param_count(in_channels, out_channels, kernel_size):
    # your code here
    pass
@@tests
assert mlp_param_count([784, 128, 10]) == 101770, "MNIST MLP"
assert mlp_param_count([2, 2, 1]) == 9, "XOR network: 6 + 3"
assert mlp_param_count([3, 4]) == 16, "one layer"
assert conv_param_count(1, 8, 3) == 80, "first conv layer"
assert conv_param_count(8, 16, 3) == 1168, "second conv layer"
assert conv_param_count(3, 1, 1) == 4, "1x1 convolution"
try:
    mlp_param_count([5])
    _ok = False
except ValueError:
    _ok = True
assert _ok, "needs at least two sizes"
@@hint
Loop over `zip(layer_sizes, layer_sizes[1:])` and add `a * b + b` each time.
@@solution
def mlp_param_count(layer_sizes):
    if len(layer_sizes) < 2:
        raise ValueError("need at least 2 layer sizes")
    return sum(a * b + b for a, b in zip(layer_sizes, layer_sizes[1:]))

def conv_param_count(in_channels, out_channels, kernel_size):
    return out_channels * (in_channels * kernel_size * kernel_size + 1)
````

````task
id: resnet-error-analysis
title: Evaluate a fine-tuned classifier
kind: text
level: medium
@@statement
You fine-tuned a pretrained ResNet to recognise **damaged** vs **intact** parcels from photos. On 50 test images (25 damaged, 25 intact) it gives: 18 damaged predicted damaged, 7 damaged predicted intact, 4 intact predicted damaged, 21 intact predicted intact. You look at the 11 wrong images and notice that 6 of the 7 missed damaged parcels are dark photos taken in a van, and 3 of the 4 false alarms show parcels wrapped in shiny plastic.

**Deliverable** (8-12 sentences)
1. Compute precision and recall for the class "damaged" (with the arithmetic) and the accuracy.
2. Say which error matters more for a company that refunds customers for damage, and why.
3. Interpret the wrong images: the likely cause for each pattern and one fix for each (data, augmentation or threshold).
4. Say why 50 test images are too few to trust these numbers, and what you would do about it.
@@hint
Precision = TP / (TP + FP) with TP = 18; recall = TP / (TP + FN).
@@solution
Precision (damaged) = 18 / (18 + 4) = 0.82. Recall = 18 / (18 + 7) = 0.72. Accuracy = (18 + 21) / 50 = 0.78.

Missing a damaged parcel (false negative) means a damaged item goes out and costs a refund and an angry customer, while a false alarm costs a manual re-check. So recall matters more, and I would lower the decision threshold, accepting a lower precision.

6 of 7 misses are dark van photos: the training set probably lacks low-light images. Fix: collect or augment darker photos (brightness and contrast jitter) and report accuracy on that slice. 3 of 4 false alarms are shiny plastic, where reflections look like creases: add more intact-plastic examples as hard negatives. The other 2 errors (1 miss, 1 false alarm) may be noise or label mistakes; check those labels by hand.

50 images give very wide error bars (recall rests on 25 positives, so one image moves it by 4 points). I would collect several hundred more test images covering all lighting conditions, report a confidence interval, and keep the test set untouched while improving the model.
@@criteria
- Computes precision 0.82, recall 0.72 and accuracy 0.78 with correct counts.
- Argues which error costs more and links it to the threshold or recall.
- Links the dark-photo misses and the shiny-plastic false alarms to causes and gives a concrete fix for each.
- Mentions checking the remaining errors for label noise.
- Explains that 50 images is too small (wide uncertainty) and proposes more data or intervals.
````

````task
id: iou-boxes
title: Intersection over union for boxes
kind: code
level: medium
@@statement
Object detectors such as YOLO are scored by how much a predicted box overlaps the true box. Write `iou(a, b)`.

**Input**: two boxes `(x1, y1, x2, y2)` with `x1 < x2` and `y1 < y2` (top-left and bottom-right corners).

**Output**: a float, `intersection_area / union_area`, where `union = area_a + area_b - intersection` (checked within `1e-9`). Boxes that do not overlap (or only touch at an edge) give `0.0`.

**Example**

```
iou((0, 0, 2, 2), (1, 1, 3, 3))
intersection = 1 * 1 = 1, union = 4 + 4 - 1 = 7  -> 0.142857...
iou((0, 0, 2, 2), (0, 0, 2, 2)) -> 1.0
```
@@starter
def iou(a, b):
    # your code here
    pass

print(iou((0, 0, 2, 2), (1, 1, 3, 3)))
@@tests
assert abs(iou((0, 0, 2, 2), (1, 1, 3, 3)) - 1 / 7) < 1e-9, "partial overlap"
assert iou((0, 0, 2, 2), (0, 0, 2, 2)) == 1.0, "identical boxes"
assert iou((0, 0, 1, 1), (5, 5, 6, 6)) == 0.0, "far apart"
assert iou((0, 0, 1, 1), (1, 0, 2, 1)) == 0.0, "touching edges"
assert abs(iou((0, 0, 4, 4), (1, 1, 2, 2)) - 1 / 16) < 1e-9, "box inside a bigger box"
assert abs(iou((0, 0, 2, 2), (1, 0, 3, 2)) - 1 / 3) < 1e-9, "half overlap in one direction"
assert abs(iou((1, 1, 3, 3), (0, 0, 2, 2)) - 1 / 7) < 1e-9, "symmetric"
@@hint
The overlap width is `min(x2a, x2b) - max(x1a, x1b)`; if it or the height is `<= 0` the intersection is 0.
@@solution
def iou(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    inter = w * h
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter)
````
