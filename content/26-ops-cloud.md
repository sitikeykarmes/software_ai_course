---
id: ops-cloud
title: Cloud computing
minutes: 45
---

A cloud provider rents you computing resources by the hour or by the request, so you can start small, grow on demand and pay for what you use. Learn one provider well. AWS has the largest job market; Azure is common in large enterprises; Google Cloud is strong in data and AI. The concepts transfer directly between them.

## Service models

| Model | You manage | Provider manages | Example |
| --- | --- | --- | --- |
| IaaS (infrastructure) | Operating system, runtime, application | Hardware, virtualisation, network | EC2 virtual machines |
| PaaS / managed containers | Application and configuration | OS, scaling, patching | App Runner, Cloud Run, Azure App Service |
| FaaS (serverless functions) | Function code | Everything else | Lambda, Azure Functions |
| SaaS | Nothing | Everything | Gmail, Salesforce |

Moving down the table you give up control and gain time. A small team should use the most managed option that meets its needs.

## Regions and availability zones

A **region** is a geographic area, such as Mumbai (`ap-south-1`). Each region has several isolated data centres called **availability zones**. Running in two or more zones protects against one data centre failing; running in two regions protects against a regional outage and puts servers nearer to distant users. Region choice also depends on latency to your users, price, and laws about where data may be stored.

## Core services across the three clouds

| Need | AWS | Azure | Google Cloud |
| --- | --- | --- | --- |
| Virtual machines | EC2 | Virtual Machines | Compute Engine |
| Object storage | S3 | Blob Storage | Cloud Storage |
| Managed SQL | RDS, Aurora | Azure SQL, Database for PostgreSQL | Cloud SQL, AlloyDB |
| NoSQL | DynamoDB | Cosmos DB | Firestore, Bigtable |
| Functions | Lambda | Functions | Cloud Functions |
| Containers | ECS, EKS, App Runner | AKS, Container Apps | GKE, Cloud Run |
| Private network | VPC | Virtual Network | VPC |
| Identity and access | IAM | Entra ID, RBAC | IAM |
| DNS | Route 53 | Azure DNS | Cloud DNS |
| CDN | CloudFront | Front Door | Cloud CDN |
| Queues and events | SQS, SNS, EventBridge, MSK | Service Bus, Event Hubs | Pub/Sub |
| Monitoring | CloudWatch | Monitor | Cloud Monitoring |
| Secrets | Secrets Manager | Key Vault | Secret Manager |
| Models and ML | Bedrock, SageMaker | Azure AI Foundry, Azure ML | Vertex AI |
| Data warehouse | Redshift | Synapse, Fabric | BigQuery |

## Cloud networking

- A **VPC** (virtual private cloud) is your own private network with an address range such as `10.0.0.0/16`.
- **Subnets** divide it. A **public subnet** has a route to the internet through an internet gateway. A **private subnet** does not.
- **Security groups** are firewalls attached to resources. They list which sources may reach which ports.
- A **NAT gateway** lets machines in private subnets make outbound calls (updates, external APIs) without being reachable from outside.

The standard three-tier layout:

```
internet
   |
[ load balancer ]         public subnets, in two availability zones
   |
[ app servers ]           private subnets; security group allows port 8000 only from the load balancer
   |
[ database, cache ]       private subnets; security group allows 5432 only from the app servers
```

Nothing but the load balancer is exposed. Each layer accepts traffic only from the layer above it.

## Identity and access management

IAM answers "who can do what to which resource".

- **Users** are people, ideally signing in through single sign-on with multi-factor authentication.
- **Roles** are identities for services, with temporary credentials. A virtual machine or function assumes a role; no access keys are stored in code or on disk.
- **Policies** are documents that allow or deny actions on resources.
- **Least privilege**: grant only what is needed. `s3:GetObject` on one bucket, not `s3:*` on everything.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::my-app-uploads/*"
  }]
}
```

A policy check is simple to reason about:

```python run
import fnmatch

policy = [
    {"effect": "Allow", "actions": ["s3:GetObject", "s3:PutObject"], "resource": "bucket/uploads/*"},
    {"effect": "Deny",  "actions": ["s3:*"],                         "resource": "bucket/uploads/private/*"},
]

def is_allowed(action, resource):
    allowed = False
    for rule in policy:
        if any(fnmatch.fnmatch(action, a) for a in rule["actions"]) and fnmatch.fnmatch(resource, rule["resource"]):
            if rule["effect"] == "Deny":
                return False                 # an explicit deny always wins
            allowed = True
    return allowed                           # no matching allow means denied by default

for action, resource in [("s3:GetObject", "bucket/uploads/a.png"), ("s3:DeleteObject", "bucket/uploads/a.png"),
                         ("s3:GetObject", "bucket/uploads/private/keys.txt"), ("s3:GetObject", "bucket/other/b.png")]:
    print(f"{action:16} {resource:36} -> {'ALLOW' if is_allowed(action, resource) else 'DENY'}")
```

Two rules to remember: everything is denied unless allowed, and an explicit deny overrides any allow.

## Compute choices

| Option | Best for | Watch out for |
| --- | --- | --- |
| Virtual machines | Full control, special software, steady load | You patch and scale them |
| Managed containers | Most web services and APIs | Less control over the host |
| Kubernetes | Many services and a platform team | Significant operational effort |
| Functions | Event handlers, scheduled jobs, spiky traffic | Cold starts, time limits, statelessness |
| GPUs | Model training and inference | Cost; availability |

Pricing models: **on-demand** (pay per second, no commitment), **reserved or savings plans** (commit for one to three years for a large discount), **spot** (spare capacity at a steep discount that can be taken back at short notice, suitable for batch jobs).

## Storage choices

| Type | What it is | Use for |
| --- | --- | --- |
| Object storage (S3) | Files addressed by key, effectively unlimited, very durable | Uploads, backups, static sites, data lakes, model files |
| Block storage (EBS) | A virtual disk attached to one machine | Database files, operating system disks |
| File storage (EFS) | A shared network file system | Several machines needing the same files |
| Archive (Glacier) | Very cheap, slow to retrieve | Long-term retention |

A **presigned URL** grants temporary permission to upload or download one object, so files travel directly between the browser and storage. Signing works like this:

```python run
import hashlib, hmac, time

SECRET = b"storage-service-secret"

def presign(method, key, expires_in=300):
    expires = int(time.time()) + expires_in
    signature = hmac.new(SECRET, f"{method}:{key}:{expires}".encode(), hashlib.sha256).hexdigest()[:24]
    return f"https://storage.example.com/{key}?expires={expires}&sig={signature}"

def verify(method, key, expires, sig):
    if int(expires) < time.time():
        return "rejected: expired"
    expected = hmac.new(SECRET, f"{method}:{key}:{expires}".encode(), hashlib.sha256).hexdigest()[:24]
    return "accepted" if hmac.compare_digest(sig, expected) else "rejected: bad signature"

url = presign("PUT", "uploads/user7/report.pdf")
print(url)
query = dict(p.split("=") for p in url.split("?")[1].split("&"))
print(verify("PUT", "uploads/user7/report.pdf", query["expires"], query["sig"]))
print(verify("PUT", "uploads/user8/other.pdf", query["expires"], query["sig"]))     # tampered path
```

## Managed databases

A managed database (RDS, Cloud SQL) handles backups, patching, replication and failover for you. Turn on automated backups with point-in-time recovery, run a standby in a second availability zone, keep it in private subnets, and encrypt it at rest. Operating your own database on virtual machines is rarely worth it.

## Infrastructure as code

Clicking in a console cannot be reviewed, repeated or rolled back. Terraform (also OpenTofu, Pulumi, CloudFormation, Bicep) describes infrastructure in files kept in Git.

```hcl
resource "aws_s3_bucket" "uploads" {
  bucket = "my-app-uploads"
}

resource "aws_db_instance" "main" {
  engine              = "postgres"
  instance_class      = "db.t4g.micro"
  allocated_storage   = 20
  username            = "app"
  password            = var.db_password
  multi_az            = true
  skip_final_snapshot = false
}
```

`terraform plan` shows what would change; `terraform apply` makes it so. The tool records what it created in a **state file**, kept remotely and locked so two people cannot apply at once. The whole environment can be recreated from the files, and staging can be an exact smaller copy of production.

## Three ways to deploy your API

| Path | Steps | When |
| --- | --- | --- |
| One virtual machine | Launch it, install Docker, run Compose, Nginx with TLS in front | To learn how the pieces fit; lowest cost |
| Managed containers | Push the image to a registry; point App Runner, Cloud Run or ECS Fargate at it; attach a managed database | Most small and mid-size products |
| Kubernetes | EKS, GKE or AKS; manifests or Helm; an ingress controller | Many services and a platform team |

## The well-architected checklist

Every provider publishes the same five or six pillars. Use them to review any design.

- **Reliability**: multiple zones, automated backups that you have tested restoring, health checks, autoscaling.
- **Security**: least privilege, encryption in transit and at rest, private networks, secrets in a secret manager, audit logs.
- **Performance**: the right instance types, caching, CDN, load testing.
- **Cost**: right-sizing, autoscaling down, storage tiers, reserved capacity for steady load.
- **Operations**: infrastructure as code, CI/CD, monitoring, alerts, runbooks.
- **Sustainability**: use only what you need.

## Cost and safety habits

- Set a **billing alarm** on the first day.
- Tag every resource with its owner and project.
- Delete what you are not using. NAT gateways, idle load balancers, unattached disks and GPUs are the usual surprise charges.
- Data leaving the cloud (egress) costs money; data entering is usually free.
- Enable multi-factor authentication on the root account and do not use it for daily work.
- Never commit access keys. Use roles.
- Do not make storage buckets public unless they hold only public content.

## Check yourself

```quiz
[
  {"q": "Where should the database sit in a three-tier cloud network?", "options": ["In a public subnet with a public IP", "In a private subnet reachable only from the app servers", "On the load balancer"], "answer": 1, "why": "Nothing but the load balancer needs to be reachable from the internet."},
  {"q": "How should an application on a virtual machine get permission to read a storage bucket?", "options": ["Access keys in the source code", "An IAM role attached to the machine", "A public bucket"], "answer": 1, "why": "Roles provide temporary credentials with nothing to leak in code."},
  {"q": "An IAM policy has an Allow and a matching explicit Deny. Result?", "options": ["Allowed", "Denied", "Depends on order"], "answer": 1, "why": "An explicit deny always overrides an allow."},
  {"q": "Why deploy across two availability zones?", "options": ["Lower latency for all users", "The service survives the failure of one data centre", "It is cheaper"], "answer": 1, "why": "Zones are isolated from each other's failures."},
  {"q": "What is the main benefit of infrastructure as code?", "options": ["Faster servers", "Infrastructure changes are reviewed, repeatable and reversible", "No need for monitoring"], "answer": 1, "why": "The environment is defined in version-controlled files instead of manual clicks."},
  {"q": "A nightly batch job can be interrupted and restarted. Which pricing model saves most?", "options": ["On-demand", "Spot instances", "Reserved for three years"], "answer": 1, "why": "Spot capacity is heavily discounted in exchange for possible interruption."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: three-tier-network
title: Three-tier network design with security groups
kind: text
level: medium
@@statement
Scenario: the API `shop-api` (port 8000) has a load balancer, application servers and a PostgreSQL database. Design its network in a region with **two availability zones** (`a` and `b`).

**Deliverable** (a table, list or ASCII diagram, plus the rules):
1. One VPC with CIDR `10.0.0.0/16`.
2. Six `/24` subnets: two **public**, two **private-app**, two **private-data** (one of each per zone), with their CIDRs, and what runs in each type.
3. The security groups `alb-sg`, `app-sg`, `db-sg` with their **inbound** rules (port, protocol, source). Use security group references as sources wherever possible.
4. The route that lets the app servers download packages without being reachable from the internet (name the component and the subnet it lives in).
5. One sentence: which tier may talk to which, and what is blocked.
@@criteria
- VPC `10.0.0.0/16` with six non-overlapping `/24` subnets, two per tier, spread over both zones.
- Load balancer in the public subnets, app servers in private-app, database in private-data with no public IP.
- `alb-sg`: inbound TCP 443 (optionally 80) from `0.0.0.0/0`.
- `app-sg`: inbound TCP 8000 only from `alb-sg`; `db-sg`: inbound TCP 5432 only from `app-sg`.
- Mentions a NAT gateway in a public subnet (private route `0.0.0.0/0 -> NAT`) and an internet gateway for the public subnets.
@@solution
```
VPC 10.0.0.0/16
  public       10.0.1.0/24 (a)  10.0.2.0/24 (b)    load balancer, NAT gateway
  private-app  10.0.11.0/24 (a) 10.0.12.0/24 (b)   shop-api servers
  private-data 10.0.21.0/24 (a) 10.0.22.0/24 (b)   PostgreSQL

alb-sg  inbound: TCP 443 from 0.0.0.0/0 (and TCP 80 for the redirect)
app-sg  inbound: TCP 8000 from alb-sg
db-sg   inbound: TCP 5432 from app-sg
Routes: public       0.0.0.0/0 -> internet gateway
        private-app  0.0.0.0/0 -> NAT gateway (in a public subnet)
        private-data no internet route
```
Traffic flows internet -> ALB -> app -> database only. The database cannot be reached from the internet or the load balancer, and the app servers can reach out through NAT while nobody outside can reach them.
````

````task
id: iam-evaluator
title: Evaluate an IAM-style policy
kind: code
level: medium
@@statement
Write `is_allowed(statements, action, resource)` that decides whether a request is permitted, like a cloud IAM engine.

**Input**
- `statements`: a list of dicts `{"effect": "Allow" or "Deny", "actions": [patterns], "resources": [patterns]}`.
- `action`: e.g. `"s3:GetObject"`; `resource`: e.g. `"arn:aws:s3:::shop-uploads/a.png"`.
- In a pattern, `*` matches any run of characters (including none, including `/` and `:`). Every other character matches only itself.

**Output**: `True` or `False`.
- A statement *matches* when at least one action pattern matches `action` **and** at least one resource pattern matches `resource`.
- Default is **deny**. The request is allowed only if some `Allow` statement matches **and** no `Deny` statement matches (explicit deny always wins).

**Example**

```
st = [{"effect": "Allow", "actions": ["s3:Get*"], "resources": ["arn:aws:s3:::logs/*"]}]
is_allowed(st, "s3:GetObject", "arn:aws:s3:::logs/a.txt")   -> True
is_allowed(st, "s3:PutObject", "arn:aws:s3:::logs/a.txt")   -> False
```
@@starter
import re

def is_allowed(statements, action, resource):
    # your code here
    pass
@@tests
_pol = [
    {"effect": "Allow", "actions": ["s3:GetObject", "s3:ListBucket"],
     "resources": ["arn:aws:s3:::shop-uploads", "arn:aws:s3:::shop-uploads/*"]},
    {"effect": "Deny", "actions": ["s3:*"], "resources": ["arn:aws:s3:::shop-uploads/secret/*"]},
]
_b = "arn:aws:s3:::shop-uploads"
assert is_allowed(_pol, "s3:GetObject", _b + "/a.png") is True, "allowed read"
assert is_allowed(_pol, "s3:ListBucket", _b) is True, "list the bucket itself"
assert is_allowed(_pol, "s3:PutObject", _b + "/a.png") is False, "no allow for put (default deny)"
assert is_allowed(_pol, "s3:GetObject", _b + "/secret/key.pem") is False, "explicit deny wins"
assert is_allowed(_pol, "s3:GetObject", "arn:aws:s3:::other/a.png") is False, "other bucket"
assert is_allowed([], "s3:GetObject", _b) is False, "no statements means deny"
_wild = [{"effect": "Allow", "actions": ["*"], "resources": ["*"]}]
assert is_allowed(_wild, "ec2:StopInstances", "arn:aws:ec2:eu-west-1:1:instance/i-1") is True, "wildcard allow"
assert is_allowed(_wild + [{"effect": "Deny", "actions": ["ec2:Stop*"], "resources": ["*"]}], "ec2:StopInstances", "x") is False, "deny beats wildcard allow"
assert is_allowed([{"effect": "Allow", "actions": ["s3:Get*"], "resources": ["a.b"]}], "s3:GetObject", "axb") is False, "dot is literal"
@@hint
Turn a pattern into a regex with `re.escape(p).replace(r"\*", ".*")` and use `re.fullmatch`. Track two booleans, `allowed` and `denied`, while looping over the statements.
@@solution
import re

def _match(pattern, text):
    regex = re.escape(pattern).replace(r"\*", ".*")
    return re.fullmatch(regex, text) is not None

def is_allowed(statements, action, resource):
    allowed = denied = False
    for st in statements:
        if any(_match(p, action) for p in st["actions"]) and any(_match(p, resource) for p in st["resources"]):
            if st["effect"] == "Deny":
                denied = True
            elif st["effect"] == "Allow":
                allowed = True
    return allowed and not denied
````

````task
id: least-privilege-policy
title: Least-privilege policy for one bucket and one queue
kind: text
level: medium
@@statement
Scenario: the API (account `123456789012`, region `eu-west-1`) must

- read and write objects in the S3 bucket `shop-uploads` (`GetObject`, `PutObject`) and list the bucket,
- send messages to the SQS queue `shop-jobs`, and receive and delete messages from it.

**Deliverable**: one IAM policy document in JSON (`"Version": "2012-10-17"`). Use full ARNs, no `*` in `Action`, and never `*` as the whole `Resource`. Then two sentences: why `ListBucket` is in a separate statement, and which action the API is deliberately **not** allowed.
@@criteria
- Valid JSON with `Version` and `Statement`; each statement has `Effect: Allow`, `Action` and `Resource`.
- Object actions are exactly `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::shop-uploads/*`.
- `s3:ListBucket` is a separate statement on the bucket ARN `arn:aws:s3:::shop-uploads` (no `/*`), with the explanation that listing applies to the bucket, not to objects.
- SQS actions are `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage` on `arn:aws:sqs:eu-west-1:123456789012:shop-jobs`.
- States that `s3:DeleteObject` (and any admin action) is intentionally missing.
@@solution
```
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
     "Resource": "arn:aws:s3:::shop-uploads/*"},
    {"Effect": "Allow", "Action": ["s3:ListBucket"],
     "Resource": "arn:aws:s3:::shop-uploads"},
    {"Effect": "Allow", "Action": ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
     "Resource": "arn:aws:sqs:eu-west-1:123456789012:shop-jobs"}
  ]
}
```
`ListBucket` acts on the bucket itself, so its resource is the bucket ARN without `/*`, while Get/Put act on objects. The API cannot delete objects, so a bug or a leaked key cannot wipe the bucket.
````

````task
id: cost-and-alarm
title: Monthly cost estimate and billing alarm
kind: code
level: easy
@@statement
Write two functions for budgeting a small cloud setup.

**1. `monthly_cost(vm_count, vm_hourly, db_hourly, storage_gb, egress_gb)`**
- A month is **730 hours**. VMs cost `vm_count * vm_hourly * 730`; the database costs `db_hourly * 730`.
- Storage costs **0.10** per GB.
- Outgoing traffic: the first **100 GB are free**; every GB above costs **0.09**.
- Return the total as a float **rounded to 2 decimals**.

**2. `billing_alarm(daily_costs, budget, days_in_month)`**
- `daily_costs` is the list of costs so far this month (one number per day passed).
- Projected month = `sum(daily_costs) * days_in_month / len(daily_costs)`.
- Return `True` if the projection is **strictly greater** than `budget`. Empty list: `False`.

**Example**

```
monthly_cost(2, 0.05, 0.10, 100, 300)   -> 174.0     (73 + 73 + 10 + 18)
billing_alarm([10, 10, 11], 300, 30)    -> True      (projection 310)
```
@@starter
def monthly_cost(vm_count, vm_hourly, db_hourly, storage_gb, egress_gb):
    pass

def billing_alarm(daily_costs, budget, days_in_month):
    pass
@@tests
assert monthly_cost(2, 0.05, 0.10, 100, 300) == 174.0, "example"
assert monthly_cost(1, 0.02, 0, 0, 50) == 14.6, "egress under the free tier"
assert monthly_cost(1, 0.0416, 0.0, 20, 100) == 32.37, "rounding to 2 decimals"
assert monthly_cost(0, 0.05, 0.10, 0, 0) == 73.0, "database only"
assert monthly_cost(1, 0, 0, 0, 101) == 0.09, "one GB above the free tier"
assert billing_alarm([10, 10, 11], 300, 30) is True, "projection above budget"
assert billing_alarm([10, 10, 10], 300, 30) is False, "equal to budget is not an alarm"
assert billing_alarm([], 100, 30) is False, "no data yet"
assert billing_alarm([5, 5], 150, 31) is True, "31 day month"
@@hint
Free egress: `billable = max(0, egress_gb - 100)`. For the alarm, multiply before dividing so the equal-to-budget case stays exactly `300.0`.
@@solution
def monthly_cost(vm_count, vm_hourly, db_hourly, storage_gb, egress_gb):
    hours = 730
    total = vm_count * vm_hourly * hours + db_hourly * hours
    total += storage_gb * 0.10
    total += max(0, egress_gb - 100) * 0.09
    return round(total, 2)

def billing_alarm(daily_costs, budget, days_in_month):
    if not daily_costs:
        return False
    projected = sum(daily_costs) * days_in_month / len(daily_costs)
    return projected > budget
````

````task
id: autoscale-decision
title: Autoscaling decision for a managed container service
kind: code
level: medium
@@statement
A managed container service scales your API on CPU. Implement its decision: `desired_replicas(current, cpu_percent, target_percent, min_replicas, max_replicas)`.

**Input**: integers. `current >= 1` is the running replica count, `cpu_percent` the average CPU use, `target_percent > 0` the wanted average.

**Output**: the new replica count (int).
- If `cpu_percent` is within 10% of the target, i.e. `abs(cpu_percent - target_percent) * 10 <= target_percent`, keep `current`.
- Otherwise use `ceil(current * cpu_percent / target_percent)`.
- Always clamp the result into `[min_replicas, max_replicas]`.

**Example**

```
desired_replicas(4, 90, 60, 2, 10)   -> 6     (4 * 90 / 60 = 6)
desired_replicas(4, 63, 60, 2, 10)   -> 4     (within 10%, no change)
desired_replicas(4, 10, 60, 2, 10)   -> 2     (would be 1, minimum is 2)
```
@@starter
import math

def desired_replicas(current, cpu_percent, target_percent, min_replicas, max_replicas):
    # your code here
    pass
@@tests
assert desired_replicas(4, 90, 60, 2, 10) == 6, "scale up"
assert desired_replicas(4, 63, 60, 2, 10) == 4, "inside tolerance"
assert desired_replicas(4, 10, 60, 2, 10) == 2, "clamped to the minimum"
assert desired_replicas(4, 300, 60, 2, 10) == 10, "clamped to the maximum"
assert desired_replicas(4, 70, 60, 2, 10) == 5, "round up: 4.67 becomes 5"
assert desired_replicas(4, 54, 60, 2, 10) == 4, "exactly 10% below the target is tolerated"
assert desired_replicas(1, 0, 60, 1, 5) == 1, "zero load keeps the minimum"
assert desired_replicas(12, 60, 60, 2, 10) == 10, "no scaling, but current is above the max"
@@hint
Check the tolerance with integers only, then use `math.ceil`. Clamp with `max(min_replicas, min(max_replicas, value))`.
@@solution
import math

def desired_replicas(current, cpu_percent, target_percent, min_replicas, max_replicas):
    if abs(cpu_percent - target_percent) * 10 <= target_percent:
        value = current
    else:
        value = math.ceil(current * cpu_percent / target_percent)
    return max(min_replicas, min(max_replicas, value))
````

````task
id: vm-https-deploy
title: Deploy on one VM with a domain and HTTPS
kind: text
level: hard
@@statement
Scenario: you have a fresh cloud account and an Ubuntu 24.04 VM with public IP `203.0.113.10`. Your domain is `api.example.com`. The API is the Docker image `ghcr.io/example/shop-api:1.0.0` listening on port 8000.

**Deliverable**: an ordered runbook of 8-12 steps with exact commands or settings, covering in this order:
1. The **billing alarm** (monthly budget 20 USD, notify at 80%) **before** creating anything.
2. Firewall / security group rules for the VM.
3. The DNS record.
4. Installing Docker and running the container so it restarts after a reboot, bound to localhost only.
5. A reverse proxy that obtains and renews an HTTPS certificate automatically (Caddy, or nginx + certbot) and forwards to the container.
6. A check that proves it works, with the exact command.
@@criteria
- Billing budget/alarm is step 1, with 20 USD and the 80% threshold.
- Security group allows inbound 80 and 443 from anywhere and 22 only from your own IP; port 8000 is not opened to the internet.
- DNS: an `A` record `api.example.com -> 203.0.113.10`.
- Container started with a restart policy and localhost binding, e.g. `docker run -d --restart unless-stopped -p 127.0.0.1:8000:8000 ghcr.io/example/shop-api:1.0.0`.
- Reverse proxy forwards `api.example.com` to `localhost:8000` and gets TLS automatically (for Caddy: `reverse_proxy localhost:8000` in the site block).
- Verification with `curl -I https://api.example.com/` (or `/healthz`) returning 200 with a valid certificate.
@@solution
```
1. Billing: create a budget of 20 USD/month with an alert at 80% (16 USD) to your email.
2. Security group: inbound TCP 80 and 443 from 0.0.0.0/0, TCP 22 from <your-ip>/32, nothing else.
3. DNS: A record api.example.com -> 203.0.113.10 (TTL 300).
4. ssh ubuntu@203.0.113.10
   sudo apt update && sudo apt install -y docker.io
   sudo docker run -d --name shop-api --restart unless-stopped -p 127.0.0.1:8000:8000 ghcr.io/example/shop-api:1.0.0
5. sudo apt install -y caddy
   /etc/caddy/Caddyfile:
     api.example.com {
         reverse_proxy localhost:8000
     }
   sudo systemctl reload caddy
6. curl -I https://api.example.com/healthz     # HTTP/2 200, valid certificate
```
Caddy requests and renews the Let's Encrypt certificate itself once DNS points at the VM and ports 80/443 are open. The API is reachable only through the proxy because it listens on 127.0.0.1.
````

````task
id: terraform-private-db
title: Terraform for a managed database in private subnets
kind: text
level: hard
@@statement
Scenario: you move to managed services and recreate the data layer as code. Write `main.tf` (25-50 lines) for AWS region `eu-west-1`:

- a VPC `10.0.0.0/16`,
- two **private** subnets `10.0.21.0/24` (`eu-west-1a`) and `10.0.22.0/24` (`eu-west-1b`),
- an `aws_db_subnet_group` using both,
- a security group allowing TCP 5432 only from `10.0.11.0/24` (the app subnet where the container service runs),
- an `aws_db_instance` PostgreSQL 16, class `db.t3.micro`, 20 GB, **not publicly accessible**, with the password from a **sensitive variable** `db_password` (never written in the file).

Then write the commands for: first creation, previewing changes, destroying everything, and bringing it all back with one command without prompts.
@@criteria
- Declares `provider "aws"` with region `eu-west-1`, an `aws_vpc` with the right CIDR, and two `aws_subnet` resources in different availability zones.
- Has an `aws_db_subnet_group` referencing both subnet ids and an `aws_security_group` with ingress 5432 from `10.0.11.0/24`.
- `aws_db_instance` uses engine `postgres` version 16, `db.t3.micro`, `allocated_storage = 20`, `publicly_accessible = false`, and the subnet group and security group.
- Password comes from `var.db_password` declared with `sensitive = true` (passed via `TF_VAR_db_password` or a git-ignored tfvars file).
- Commands: `terraform init`, `terraform plan`, `terraform apply`, `terraform destroy`, and `terraform apply -auto-approve` for the one-command recreation.
@@solution
```
provider "aws" { region = "eu-west-1" }

variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }

resource "aws_subnet" "data_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.21.0/24"
  availability_zone = "eu-west-1a"
}
resource "aws_subnet" "data_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.22.0/24"
  availability_zone = "eu-west-1b"
}

resource "aws_db_subnet_group" "data" {
  subnet_ids = [aws_subnet.data_a.id, aws_subnet.data_b.id]
}

resource "aws_security_group" "db" {
  vpc_id = aws_vpc.main.id
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.11.0/24"]
  }
}

resource "aws_db_instance" "db" {
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  username               = "shop"
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.data.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  skip_final_snapshot    = true
}
```
```
export TF_VAR_db_password='...'
terraform init
terraform plan
terraform apply
terraform destroy
terraform apply -auto-approve      # everything is back from the same file
```
The state file records what exists, so `plan` shows only differences and `destroy` removes exactly what was created.
````
