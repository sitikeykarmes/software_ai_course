---
id: ops-docker-k8s-cicd
title: Docker, Kubernetes and CI/CD
minutes: 60
---

Containers package an application with everything it needs so it runs the same on a laptop, in testing and in production. Kubernetes runs containers across many machines. CI/CD pipelines build, test and ship them automatically. Together they are how modern software reaches users.

## The problem containers solve

"It works on my machine" happens because machines differ: Python version, installed libraries, system packages, configuration. A **container image** contains the application, its dependencies and a minimal filesystem. A **container** is a running instance of an image.

| | Virtual machine | Container |
| --- | --- | --- |
| Contains | A full guest operating system | The app and its libraries; shares the host kernel |
| Size | Gigabytes | Megabytes |
| Start time | Tens of seconds | Under a second |
| Isolation | Strong (hardware virtualisation) | Process-level |

A container is an ordinary Linux process with two kernel features applied: **namespaces** give it its own view of the filesystem, network and process list; **cgroups** limit its CPU and memory.

## Writing a Dockerfile

```dockerfile
# Stage 1: install dependencies
FROM python:3.12-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: small runtime image
FROM python:3.12-slim
WORKDIR /app
COPY --from=build /install /usr/local
COPY . .
RUN useradd -m appuser
USER appuser
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Why it is written this way:

- **Layers and caching**: each instruction creates a layer, and unchanged layers are reused. Copying `requirements.txt` before the code means dependencies are reinstalled only when they change, not on every code edit.
- **Multi-stage build**: build tools stay in the first stage; the final image contains only what runs.
- **Slim base image**: fewer packages means a smaller download and fewer vulnerabilities.
- **Non-root user**: if the app is compromised, the attacker is not root in the container.
- **No secrets in the image**: pass them as environment variables at run time.
- A `.dockerignore` file keeps `.git`, `.env` and caches out of the build.

```bash
docker build -t myapi:1.0 .
docker run -d -p 8000:8000 -e DATABASE_URL=... --name api myapi:1.0
docker ps                      # running containers
docker logs -f api             # follow output
docker exec -it api sh         # a shell inside the container
docker stop api && docker rm api
docker push registry.example.com/myapi:1.0
```

Images live in a **registry** (Docker Hub, GitHub Container Registry, Amazon ECR). Tag images with a version or commit hash; `latest` tells you nothing about what is running.

## Docker Compose: several containers together

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://app:app@db:5432/app
      REDIS_URL: redis://cache:6379
    depends_on: [db, cache]
  db:
    image: postgres:16
    environment: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
    volumes: ["pgdata:/var/lib/postgresql/data"]
  cache:
    image: redis:7
volumes:
  pgdata:
```

`docker compose up` starts the whole stack. Containers on the same Compose network reach each other by service name (`db`, `cache`). A **volume** stores data outside the container so it survives when the container is replaced. A container's own filesystem is disposable; never keep data you need there.

## Kubernetes

One machine running Docker is not enough for production: machines fail, load changes, and deployments must not cause downtime. Kubernetes is a system that runs containers across a cluster and continuously makes the actual state match the state you declared.

You declare "three copies of this image, each with this much memory, reachable on this port". Kubernetes schedules them onto machines, restarts ones that crash, replaces ones on failed machines, and rolls out new versions gradually.

| Object | What it is |
| --- | --- |
| Pod | One or more containers that share a network address; the smallest deployable unit |
| Deployment | "Keep N identical pods running"; handles rolling updates and rollbacks |
| Service | A stable name and virtual IP that load-balances across a set of pods |
| Ingress | HTTP routing from outside the cluster to services, with TLS |
| ConfigMap, Secret | Configuration and sensitive values injected into pods |
| HorizontalPodAutoscaler | Changes the replica count based on CPU or custom metrics |
| StatefulSet | Pods with stable identity and storage, for databases |
| Job, CronJob | Run to completion once, or on a schedule |
| Namespace | A partition of the cluster for teams or environments |

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api }
spec:
  replicas: 3
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      containers:
        - name: api
          image: ghcr.io/me/api:1.4.2
          ports: [{ containerPort: 8000 }]
          envFrom: [{ secretRef: { name: api-secrets } }]
          readinessProbe: { httpGet: { path: /health, port: 8000 } }
          livenessProbe:  { httpGet: { path: /health, port: 8000 }, periodSeconds: 10 }
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits:   { memory: 512Mi }
---
apiVersion: v1
kind: Service
metadata: { name: api }
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: 8000 }]
```

How it works:

- The **control plane** makes decisions: the API server (everything talks to it), etcd (the cluster's state), the scheduler (which node runs each pod), and controllers (loops that fix differences between desired and actual state).
- **Worker nodes** run pods through an agent called the kubelet.
- A **readiness probe** decides whether a pod receives traffic. A **liveness probe** decides whether it is restarted.
- **Requests** are what the scheduler reserves for a pod; **limits** are the cap. A container exceeding its memory limit is killed.
- A **rolling update** starts new pods, waits for them to be ready, then stops old ones, so there is no downtime. `kubectl rollout undo` goes back.

```bash
kubectl apply -f deployment.yaml
kubectl get pods
kubectl describe pod api-7d9f...      # events explain why a pod is not starting
kubectl logs -f deploy/api
kubectl exec -it api-7d9f... -- sh
kubectl rollout status deploy/api
kubectl scale deploy/api --replicas=5
```

The control loop is the central idea. This toy version shows it:

```python run
import random

desired = {"image": "api:1.4.2", "replicas": 3}
pods = []                                           # the actual state

def reconcile():
    actions = []
    for p in [p for p in pods if p["image"] != desired["image"] or not p["healthy"]]:
        pods.remove(p)
        actions.append(f"remove {p['name']} ({'unhealthy' if not p['healthy'] else 'old image'})")
    while len(pods) < desired["replicas"]:
        name = f"api-{random.randint(1000, 9999)}"
        pods.append({"name": name, "image": desired["image"], "healthy": True})
        actions.append(f"start {name}")
    return actions or ["nothing to do"]

print("1. first run     :", reconcile())
pods[0]["healthy"] = False                           # a pod crashes
print("2. after a crash :", reconcile())
desired["image"] = "api:1.5.0"                       # a new version is declared
print("3. new version   :", reconcile())
print("4. steady state  :", reconcile())
```

Practise locally with `kind` or `minikube`. Helm packages manifests into reusable, parameterised charts. For a small product, a managed container service (Cloud Run, App Runner, Azure Container Apps) gives most of the benefit with far less to operate.

## CI/CD

- **Continuous integration (CI)**: every push is built and tested automatically, so problems are found in minutes.
- **Continuous delivery**: every change that passes is ready to deploy with one click.
- **Continuous deployment**: it is deployed automatically.

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements.txt
      - run: ruff check .
      - run: pytest --cov
      - run: docker build -t api:${{ github.sha }} .
```

A full pipeline, in order:

1. Lint and format check
2. Unit tests
3. Build the image
4. Integration tests against real dependencies
5. Security scans (dependencies, image, secrets)
6. Push the image to the registry
7. Deploy to staging and run smoke tests
8. Deploy to production, gradually
9. Watch metrics; roll back automatically on errors

Fail fast: put the quickest checks first. Keep the pipeline under ten minutes, or people stop waiting for it. GitLab CI, Jenkins, CircleCI and Azure DevOps follow the same shape.

## Deployment strategies

| Strategy | How | Trade-off |
| --- | --- | --- |
| Recreate | Stop the old version, start the new | Downtime; simplest |
| Rolling | Replace instances a few at a time | No downtime; two versions run together briefly |
| Blue-green | Run the new version beside the old, switch all traffic at once | Instant rollback; double the capacity during the switch |
| Canary | Send 1 to 5% of traffic to the new version, compare metrics, then expand | Safest; needs good monitoring |
| Feature flags | Deploy the code switched off; enable per user or percentage | Separates deploying from releasing |
| Shadow | Copy real traffic to the new version without using its responses | Tests under real load with no user impact |

Because two versions overlap during a rollout, changes must be **backward compatible**. A database change follows expand and contract: add the new column, deploy code that writes both, backfill, switch reads, and only later remove the old column.

**GitOps** keeps the desired state of the cluster in a Git repository; a tool such as Argo CD applies whatever is merged. Every change is reviewed and reversible.

## Check yourself

```quiz
[
  {"q": "Why copy `requirements.txt` and install dependencies before copying the source code in a Dockerfile?", "options": ["Docker requires that order", "The dependency layer is cached and rebuilt only when dependencies change", "It makes the image smaller"], "answer": 1, "why": "Layer caching makes rebuilds after a code change take seconds."},
  {"q": "A container is deleted and recreated. What happens to files it wrote to its own filesystem?", "options": ["They are kept", "They are lost unless they were on a volume", "They move to the image"], "answer": 1, "why": "Container filesystems are disposable; persistent data belongs on volumes or external stores."},
  {"q": "What does a Kubernetes Deployment do when a pod crashes?", "options": ["Nothing", "Starts a replacement to restore the declared replica count", "Deletes the Service"], "answer": 1, "why": "Controllers continuously reconcile actual state with desired state."},
  {"q": "What is the difference between a readiness and a liveness probe?", "options": ["They are the same", "Readiness controls whether the pod gets traffic; liveness controls whether it is restarted", "Liveness is only for databases"], "answer": 1, "why": "A pod can be alive but not ready, for example while warming up."},
  {"q": "Which strategy exposes a new version to a small share of users first?", "options": ["Recreate", "Canary", "Blue-green"], "answer": 1, "why": "A canary limits the blast radius while you compare metrics."},
  {"q": "Why must changes be backward compatible during a rolling update?", "options": ["Old and new versions serve traffic at the same time", "Kubernetes checks it", "To reduce image size"], "answer": 0, "why": "Both versions talk to the same database and to each other for a while."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: dockerfile-multistage
title: Multi-stage Dockerfile for a Python API
kind: text
level: medium
@@statement
Scenario: a FastAPI app lives in `app/main.py` (the ASGI object is `app`), its dependencies are in `requirements.txt`, and it listens on port **8000**.

**Deliverable**: the `Dockerfile` (10-20 lines) plus the commands to build it and compare image sizes.

**Requirements**
- Two stages: a `builder` stage that installs the dependencies, and a final stage that only copies the result.
- Both stages use a pinned `python:3.12-slim` base (a version tag, not `latest`).
- Copy `requirements.txt` and install **before** copying the source code, so the dependency layer is cached.
- Install without keeping the pip cache (`--no-cache-dir`).
- The container runs as a non-root user.
- Start the server with `uvicorn` bound to `0.0.0.0:8000` using the exec form (JSON array) of `CMD`.

Then write the commands that build the image as `shop-api:slim` and show its size, and say what you change to measure the non-slim image for comparison.
@@criteria
- Has two `FROM` lines, the first named (`AS builder`), the second copying from it with `COPY --from=builder`.
- Base image is pinned, e.g. `python:3.12-slim`, not `latest`.
- `requirements.txt` is copied and installed (`pip install --no-cache-dir -r requirements.txt`) before `COPY app/`.
- Creates and switches to a non-root user (`useradd`/`adduser` and `USER app`).
- `CMD` uses exec form with `uvicorn app.main:app --host 0.0.0.0 --port 8000`, and the file has `EXPOSE 8000`.
- Gives `docker build -t shop-api:slim .` and `docker images shop-api` (or `docker image ls`), and says to switch the base to `python:3.12` for the comparison.
@@solution
```
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
RUN useradd --create-home app
WORKDIR /home/app
COPY --from=builder /install /usr/local
COPY app/ ./app/
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
```
docker build -t shop-api:slim .
docker images shop-api
```
Change both `FROM` lines to `python:3.12`, build as `shop-api:full`, and compare the SIZE column; the slim image is several hundred MB smaller. Copying `requirements.txt` first means code edits do not reinstall dependencies.
````

````task
id: compose-stack
title: Compose file with API, PostgreSQL and Redis
kind: text
level: medium
@@statement
Scenario: your image is built from the `Dockerfile` in the current folder and listens on 8000. Write a `compose.yaml` (20-40 lines) with three services:

- `api`: built from `.`, host port `8000` mapped to container port `8000`, environment `DATABASE_URL=postgresql://shop:secret@db:5432/shop` and `REDIS_URL=redis://cache:6379/0`. It must start only after the database reports healthy.
- `db`: image `postgres:16`, env `POSTGRES_USER=shop`, `POSTGRES_PASSWORD=secret`, `POSTGRES_DB=shop`, data in a **named volume** `pgdata`, and a healthcheck using `pg_isready -U shop`.
- `cache`: image `redis:7-alpine`.

Then write the exact commands that **prove data survives**: start the stack, insert a row, stop and remove the containers, start again, and read the row back. Use a table `notes(text)` and `psql`.
@@criteria
- Defines exactly the services `api`, `db`, `cache` with the given images, ports and environment variables.
- `db` mounts the named volume (`pgdata:/var/lib/postgresql/data`) and a top-level `volumes: pgdata:` section exists.
- `db` has a `healthcheck` with `pg_isready` and `api` uses `depends_on` with `condition: service_healthy`.
- Proof sequence includes `docker compose up -d`, an insert through `docker compose exec db psql -U shop -d shop -c "..."`, `docker compose down`, `docker compose up -d`, and a select.
- States that `docker compose down` must be run **without** `-v`, because `-v` deletes the named volume.
@@solution
```
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://shop:secret@db:5432/shop
      REDIS_URL: redis://cache:6379/0
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: shop
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: shop
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shop"]
      interval: 5s
      retries: 10
  cache:
    image: redis:7-alpine
volumes:
  pgdata:
```
```
docker compose up -d
docker compose exec db psql -U shop -d shop -c "CREATE TABLE notes(text text); INSERT INTO notes VALUES ('hello');"
docker compose down            # no -v, the volume stays
docker compose up -d
docker compose exec db psql -U shop -d shop -c "SELECT * FROM notes;"   # still returns 'hello'
```
The row survives because it lives in the `pgdata` volume, not in the container's writable layer.
````

````task
id: ci-workflow
title: CI workflow that lints and tests on every push
kind: text
level: easy
@@statement
Write a GitHub Actions workflow file `.github/workflows/ci.yml` (12-25 lines) for a Python project.

**Requirements**
- Name: `CI`. Runs on **every push** and on pull requests.
- One job `check` on `ubuntu-latest`.
- Steps in order: checkout the code, set up Python `3.12`, install dependencies from `requirements.txt`, lint with `ruff check .`, run tests with `pytest -q`.
- Use pinned major versions for actions (`actions/checkout@v4`, `actions/setup-python@v5`).

Then answer in two sentences: you intentionally break one test and push. What do you see on GitHub, and which steps run?
@@criteria
- Has `name: CI` and `on:` with both `push` and `pull_request`.
- Defines job `check` with `runs-on: ubuntu-latest`.
- Uses `actions/checkout@v4` and `actions/setup-python@v5` with `python-version: "3.12"`.
- Installs with `pip install -r requirements.txt` and has separate `run` steps for `ruff check .` and `pytest -q`.
- The answer says the `pytest` step fails, the job and the commit get a red cross, earlier steps are green and later steps are skipped.
@@solution
```
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements.txt
      - run: ruff check .
      - run: pytest -q
```
After pushing a broken test the `pytest -q` step exits non-zero, so the job is marked failed with a red cross next to the commit and pull request, while install and lint before it are green. Any steps after a failing step are skipped.
````

````task
id: k8s-deploy
title: Deployment, Service, self-healing, rolling update, rollback
kind: text
level: hard
@@statement
Scenario: image `registry.example.com/shop-api:1.0.0` listens on port 8000 and answers `GET /healthz`. Write the manifest `shop-api.yaml` (a Deployment and a Service separated by `---`) and the commands for the experiments on a local cluster.

**Manifest requirements**
- Deployment `shop-api`, **3 replicas**, label `app: shop-api`, rolling update with `maxUnavailable: 1` and `maxSurge: 1`.
- Container port 8000, a `readinessProbe` on `/healthz`, resource requests `100m` CPU / `128Mi` memory and limits `500m` / `256Mi`.
- Service `shop-api` of type `ClusterIP`, port 80 forwarding to 8000, selecting the pods by label.

**Commands to write**
1. Apply the manifest and wait until the rollout is complete.
2. Delete one pod and watch the Deployment replace it.
3. Roll out version `1.1.0` and watch it.
4. Roll back to the previous version and check which image is in use.
@@criteria
- Deployment has `replicas: 3`, matching `selector.matchLabels` and pod template labels `app: shop-api`, and a `RollingUpdate` strategy with `maxUnavailable: 1`, `maxSurge: 1`.
- Container has `containerPort: 8000`, an HTTP `readinessProbe` on `/healthz`, and both `requests` and `limits` with the given values.
- Service is `ClusterIP` with `port: 80`, `targetPort: 8000` and `selector: app: shop-api`.
- Commands include `kubectl apply -f shop-api.yaml`, `kubectl rollout status deployment/shop-api`, and `kubectl delete pod <name>` together with `kubectl get pods -w`.
- Update uses `kubectl set image deployment/shop-api shop-api=registry.example.com/shop-api:1.1.0` (or editing the manifest) and rollback uses `kubectl rollout undo deployment/shop-api`.
@@solution
```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-api
spec:
  replicas: 3
  selector:
    matchLabels: {app: shop-api}
  strategy:
    type: RollingUpdate
    rollingUpdate: {maxUnavailable: 1, maxSurge: 1}
  template:
    metadata:
      labels: {app: shop-api}
    spec:
      containers:
        - name: shop-api
          image: registry.example.com/shop-api:1.0.0
          ports:
            - containerPort: 8000
          readinessProbe:
            httpGet: {path: /healthz, port: 8000}
          resources:
            requests: {cpu: 100m, memory: 128Mi}
            limits: {cpu: 500m, memory: 256Mi}
---
apiVersion: v1
kind: Service
metadata:
  name: shop-api
spec:
  type: ClusterIP
  selector: {app: shop-api}
  ports:
    - port: 80
      targetPort: 8000
```
```
kubectl apply -f shop-api.yaml
kubectl rollout status deployment/shop-api
kubectl get pods -w                      # in a second terminal
kubectl delete pod <pod-name>            # a replacement appears at once
kubectl set image deployment/shop-api shop-api=registry.example.com/shop-api:1.1.0
kubectl rollout status deployment/shop-api
kubectl rollout undo deployment/shop-api
kubectl get deployment shop-api -o jsonpath='{.spec.template.spec.containers[0].image}'
```
The ReplicaSet keeps the observed pod count equal to the desired 3, and the rollout history makes `undo` possible.
````

````task
id: rolling-update-sim
title: Rolling update that never drops below N healthy pods
kind: code
level: hard
@@statement
Extend the reconcile idea with a rolling update simulator: `plan_rolling_update(replicas, min_healthy, max_surge)`.

**State**: a tuple `(old, new)` = number of old-version and new-version pods. New pods become ready the moment they are created. The update starts at `(replicas, 0)` and ends at `(0, replicas)`.

**Each step does exactly one thing**, chosen by these rules in order:
1. If `old + new < replicas + max_surge` and `new < replicas`: **create** a new pod (`new += 1`).
2. Otherwise **terminate** an old pod (`old -= 1`), but only if `old > 0` and `old + new - 1 >= min_healthy`. If that is not possible the update is stuck: raise `ValueError`.

**Output**: the list of states, including the start and the end.

**Input constraints**: `replicas >= 1`, `0 <= min_healthy <= replicas`, `max_surge >= 0`.

**Example**

```
plan_rolling_update(3, 2, 1)
-> [(3, 0), (3, 1), (2, 1), (2, 2), (1, 2), (1, 3), (0, 3)]
```
@@starter
def plan_rolling_update(replicas, min_healthy, max_surge):
    # your code here
    pass
@@tests
assert plan_rolling_update(3, 2, 1) == [(3, 0), (3, 1), (2, 1), (2, 2), (1, 2), (1, 3), (0, 3)], "example"
_p = plan_rolling_update(5, 4, 2)
assert _p[0] == (5, 0) and _p[-1] == (0, 5), "start and end states"
assert all(o + n >= 4 for o, n in _p), "never below min_healthy"
assert all(o + n <= 7 for o, n in _p), "never above replicas + surge"
assert all(abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1 for a, b in zip(_p, _p[1:])), "one change per step"
_q = plan_rolling_update(3, 2, 0)
assert _q[1] == (2, 0) and _q[-1] == (0, 3) and all(o + n >= 2 for o, n in _q), "no surge: terminate first"
_stuck = False
try:
    plan_rolling_update(3, 3, 0)
except ValueError:
    _stuck = True
assert _stuck, "min_healthy == replicas with no surge is stuck"
assert plan_rolling_update(1, 0, 0) == [(1, 0), (0, 0), (0, 1)], "single replica, no guarantees"
@@hint
Loop `while (old, new) != (0, replicas)` and append the state after every step. Check the two rules in the given order.
@@solution
def plan_rolling_update(replicas, min_healthy, max_surge):
    old, new = replicas, 0
    states = [(old, new)]
    while (old, new) != (0, replicas):
        if old + new < replicas + max_surge and new < replicas:
            new += 1
        elif old > 0 and old + new - 1 >= min_healthy:
            old -= 1
        else:
            raise ValueError("update is stuck")
        states.append((old, new))
    return states
````

````task
id: validate-workflow
title: Validate a CI workflow definition
kind: code
level: medium
@@statement
A CI linter checks a parsed workflow (a Python dict, as `yaml.safe_load` would return). Write `validate_workflow(wf)` returning a **sorted list of problem strings**; an empty list means the workflow is valid. Do not modify `wf`.

**Rules and exact messages**
- No `"on"` key or an empty value: `"missing 'on'"`.
- No `"jobs"` key or an empty dict: `"missing 'jobs'"` (then nothing else is checked).
- For every job `NAME` (a dict):
  - no `"runs-on"`: `"job NAME: missing 'runs-on'"`
  - `"steps"` missing or empty: `"job NAME: no steps"`
  - step number `i` (starting at 1) with neither `"run"` nor `"uses"`: `"job NAME: step i needs 'run' or 'uses'"`
  - `"needs"` (a string or a list of strings) naming a job that does not exist: `"job NAME: unknown need 'X'"`

**Example**

```
wf = {"on": ["push"], "jobs": {"build": {"runs-on": "ubuntu-latest", "steps": [{"run": "make"}, {"name": "oops"}]}}}
validate_workflow(wf) -> ["job build: step 2 needs 'run' or 'uses'"]
```
@@starter
def validate_workflow(wf):
    # your code here
    pass
@@tests
_ok = {"on": ["push"], "jobs": {"test": {"runs-on": "ubuntu-latest", "steps": [{"uses": "actions/checkout@v4"}, {"run": "pytest"}]}}}
assert validate_workflow(_ok) == [], "valid workflow"
_wf = {"on": ["push"], "jobs": {"build": {"runs-on": "ubuntu-latest", "steps": [{"run": "make"}, {"name": "oops"}]}}}
assert validate_workflow(_wf) == ["job build: step 2 needs 'run' or 'uses'"], "step without run/uses"
assert validate_workflow({"jobs": {"a": {"runs-on": "x", "steps": [{"run": "x"}]}}}) == ["missing 'on'"], "missing on"
assert validate_workflow({"on": "push"}) == ["missing 'jobs'"], "missing jobs"
assert validate_workflow({"on": "push", "jobs": {}}) == ["missing 'jobs'"], "empty jobs"
_multi = {"on": "push", "jobs": {
    "deploy": {"steps": [], "needs": ["bild", "test"]},
    "test": {"runs-on": "x", "steps": [{"run": "t"}], "needs": "nope"},
}}
assert validate_workflow(_multi) == [
    "job deploy: missing 'runs-on'",
    "job deploy: no steps",
    "job deploy: unknown need 'bild'",
    "job test: unknown need 'nope'",
], "several problems, sorted, needs as str or list"
_copy = {"on": "push", "jobs": {"a": {"runs-on": "x", "steps": [{"run": "x"}]}}}
validate_workflow(_copy)
assert _copy == {"on": "push", "jobs": {"a": {"runs-on": "x", "steps": [{"run": "x"}]}}}, "input not modified"
@@hint
Normalise `needs` with `if isinstance(needs, str): needs = [needs]`. Collect problems in a list and `return sorted(problems)` at the end.
@@solution
def validate_workflow(wf):
    problems = []
    if not wf.get("on"):
        problems.append("missing 'on'")
    jobs = wf.get("jobs")
    if not jobs:
        problems.append("missing 'jobs'")
        return sorted(problems)
    for name, job in jobs.items():
        if not job.get("runs-on"):
            problems.append("job %s: missing 'runs-on'" % name)
        steps = job.get("steps")
        if not steps:
            problems.append("job %s: no steps" % name)
        else:
            for i, step in enumerate(steps, 1):
                if "run" not in step and "uses" not in step:
                    problems.append("job %s: step %d needs 'run' or 'uses'" % (name, i))
        needs = job.get("needs", [])
        if isinstance(needs, str):
            needs = [needs]
        for need in needs:
            if need not in jobs:
                problems.append("job %s: unknown need '%s'" % (name, need))
    return sorted(problems)
````
