---
id: ops-linux-git
title: The command line, Linux and Git
minutes: 50
---

Servers run Linux, and every team shares code through Git. Daily fluency in both is assumed in any software role. On a Windows laptop you can practise most of this in Git Bash, PowerShell or WSL; the commands below note the differences that matter.

## Why the command line

A terminal lets you automate, combine small tools, and work on machines that have no screen. Everything you do in production (deploying, reading logs, restarting a service) happens there.

## Files and navigation

| Task | Linux / macOS / Git Bash | PowerShell |
| --- | --- | --- |
| Where am I | `pwd` | `pwd` |
| List files with details | `ls -la` | `ls` or `dir` |
| Change directory | `cd path`, `cd ..`, `cd ~` | same |
| Create a folder | `mkdir -p a/b` | `mkdir a\b` |
| Copy, move, delete | `cp`, `mv`, `rm`, `rm -r dir` | `cp`, `mv`, `rm` |
| Show a file | `cat file`, `less file` | `cat file`, `more file` |
| First or last lines | `head -20 f`, `tail -20 f`, `tail -f app.log` | `Get-Content f -Tail 20 -Wait` |
| Find text in files | `grep -rn "error" .` | `Select-String -Path *.log -Pattern error` |
| Find files by name | `find . -name "*.py"` | `Get-ChildItem -Recurse -Filter *.py` |
| Disk usage | `df -h`, `du -sh *` | `Get-PSDrive` |

## Pipes and redirection

The Unix idea: small programs that do one thing, connected by pipes. The output of one becomes the input of the next.

```bash
cat access.log | grep " 500 " | wc -l                         # how many server errors
cut -d' ' -f1 access.log | sort | uniq -c | sort -rn | head    # top client IPs
grep -c "NG" station4.log > ng_count.txt                       # > overwrites, >> appends
python report.py 2> errors.log                                 # 2> redirects error output
```

The same analysis in Python, which is often clearer for anything beyond one line:

```python run
from collections import Counter

log = """10.0.0.5 GET /api/orders 200
10.0.0.9 GET /api/orders 500
10.0.0.5 POST /api/orders 201
10.0.0.7 GET /api/stock 500
10.0.0.5 GET /api/stock 200"""

lines = [l.split() for l in log.splitlines()]
print("server errors:", sum(1 for l in lines if l[3].startswith("5")))
print("top clients  :", Counter(l[0] for l in lines).most_common(2))
```

## Permissions

`ls -l` shows something like `-rwxr-x--- 1 deploy www 4096 app.sh`. The nine letters are read, write and execute for the **owner**, the **group**, and **others**.

- As numbers: read = 4, write = 2, execute = 1. So `chmod 750 app.sh` means owner 7 (rwx), group 5 (r-x), others 0.
- `chown user:group file` changes ownership.
- `sudo command` runs as the administrator (root). Use it deliberately.
- Private keys and secret files should be `600`: only the owner can read them.

## Processes and services

| Task | Command |
| --- | --- |
| List processes | `ps aux`, `top`, `htop` (Windows: Task Manager, `Get-Process`) |
| Stop a process politely, then forcibly | `kill -15 PID`, `kill -9 PID` |
| Run in the background | `command &`, `nohup command &` |
| Which process holds a port | `ss -tlnp` or `lsof -i :8000` (Windows: `netstat -ano`) |
| Manage a service | `systemctl status nginx`, `systemctl restart nginx`, `journalctl -u nginx -f` |
| Scheduled jobs | `crontab -e` (Windows: Task Scheduler) |

`kill -15` (SIGTERM) asks a process to shut down cleanly; a well-written server finishes in-flight requests first. `kill -9` cannot be handled and may lose work.

## Environment variables and remote access

```bash
export DATABASE_URL="postgresql://app:secret@db:5432/app"     # Linux, Git Bash
echo $DATABASE_URL
$env:DATABASE_URL = "..."                                      # PowerShell
```

Configuration and secrets reach programs through environment variables, read in Python with `os.environ["DATABASE_URL"]`. A `.env` file holds them for local development and is never committed.

`ssh user@host` opens a shell on a remote machine. Use key pairs (`ssh-keygen`), not passwords: the private key stays on your machine and the public key goes into the server's `~/.ssh/authorized_keys`. `scp` and `rsync` copy files.

## A little shell scripting

```bash
#!/usr/bin/env bash
set -euo pipefail                      # stop on errors, unset variables and failed pipes

BACKUP_DIR="/backups/$(date +%F)"
mkdir -p "$BACKUP_DIR"
for db in orders inventory; do
  pg_dump "$db" | gzip > "$BACKUP_DIR/$db.sql.gz"
  echo "backed up $db"
done
```

When a script grows past twenty lines or needs real logic, write it in Python.

## Git: the model

Git stores **snapshots** of your project called commits. Each commit records its parent, so history forms a graph. A **branch** is a movable label pointing at a commit. `HEAD` is the commit you currently have checked out.

Three places a change can be:

| Place | Meaning | Move it forward with |
| --- | --- | --- |
| Working directory | Files as you edited them | `git add` |
| Staging area (index) | What the next commit will contain | `git commit` |
| Repository | Committed history | `git push` (to share) |

## Git: the daily workflow

```bash
git clone https://github.com/you/project.git
git switch -c feature/rate-limit        # create and move to a new branch

# ...edit files...
git status                              # what changed
git diff                                # exactly how
git add -p                              # stage chosen hunks
git commit -m "Add token bucket limiter to API middleware"

git fetch origin                        # get others' work
git rebase origin/main                  # replay my commits on top of the latest main
git push -u origin feature/rate-limit   # then open a pull request
```

A good commit is small, does one thing, and has a message that says why. "Fix bug" tells a future reader nothing; "Reject orders with zero quantity before reserving stock" does.

## Merge and rebase

- **Merge** joins two branches with a merge commit. History shows exactly what happened, including the parallel work.
- **Rebase** rewrites your commits so they sit on top of the target branch, giving a straight line. Never rebase commits that others have already pulled; you would rewrite history they depend on.
- **Squash merge** combines a branch's commits into one on the main branch. Common for pull requests.

**Conflicts** happen when two branches change the same lines. Git marks the file:

```
<<<<<<< HEAD
timeout = 30
=======
timeout = 10
>>>>>>> feature/faster-timeouts
```

Edit the file to the correct final content, remove the markers, `git add` it, and continue (`git merge --continue` or `git rebase --continue`).

## Undoing things

| Situation | Command |
| --- | --- |
| Discard changes to a file | `git restore file` |
| Unstage a file | `git restore --staged file` |
| Fix the last commit message or add a forgotten file | `git commit --amend` |
| Undo a commit that is already pushed | `git revert <sha>` (creates a new commit that reverses it) |
| Move a local branch back, keeping the changes | `git reset --soft HEAD~1` |
| Throw away local commits and changes | `git reset --hard origin/main` (destructive) |
| Find a commit you thought was lost | `git reflog` |
| Put changes aside temporarily | `git stash`, later `git stash pop` |

## More Git tools

- `git log --oneline --graph --all`: see the shape of history.
- `git blame file`: who last changed each line, and in which commit.
- `git bisect`: binary search through history for the commit that introduced a bug. You mark one good and one bad commit; Git checks out the midpoint and you say good or bad until it finds the culprit.
- `git cherry-pick <sha>`: copy one commit onto the current branch.
- `git tag v1.4.0`: name a release.
- `.gitignore`: files Git should never track, such as `.env`, `__pycache__/`, `node_modules/`, build output, and for this project `progress.json`.

## Team workflow

1. `main` is always deployable.
2. Work happens on short-lived branches, one per change.
3. Open a **pull request**. Automated checks run (lint, tests, build).
4. A teammate reviews: correctness, clarity, tests, security.
5. Merge, and the branch is deleted. Deployment follows automatically or on a release.

This is **trunk-based development**. Long-lived branches drift and produce painful merges. Never commit secrets; if one is pushed, treat it as leaked and rotate it immediately, because rewriting history does not remove copies already cloned.

## Check yourself

```quiz
[
  {"q": "What does `chmod 640 file` allow?", "options": ["Everyone can read and write", "Owner reads and writes, group reads, others nothing", "Owner executes only"], "answer": 1, "why": "6 = read + write, 4 = read, 0 = none."},
  {"q": "What does the pipe in `grep error app.log | wc -l` do?", "options": ["Writes to a file", "Sends grep's output to wc as its input", "Runs both in parallel on the file"], "answer": 1, "why": "Pipes connect one program's output to the next program's input."},
  {"q": "A commit with a bug is already pushed and used by teammates. How do you undo it safely?", "options": ["`git reset --hard` and force-push", "`git revert <sha>`", "Delete the repository"], "answer": 1, "why": "Revert adds a new commit that reverses the change without rewriting shared history."},
  {"q": "What is a Git branch?", "options": ["A copy of the whole project folder", "A movable pointer to a commit", "A remote server"], "answer": 1, "why": "Branches are cheap labels, which is why creating one is instant."},
  {"q": "Why prefer `kill -15` to `kill -9`?", "options": ["It is faster", "It lets the process shut down cleanly", "It works on more systems"], "answer": 1, "why": "SIGTERM can be handled; SIGKILL cannot, so work in progress may be lost."},
  {"q": "You accidentally committed an API key and pushed it. What must you do?", "options": ["Delete the file in a new commit", "Rotate the key immediately; it must be considered leaked", "Nothing, the repo is private"], "answer": 1, "why": "History and clones keep the old value."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests** (code tasks) or **AI review** (written tasks).

````task
id: terminal-workday
title: A day of project work in the terminal
kind: text
level: easy
@@statement
Scenario: your project is in `~/shop-api` (a Python API with a virtual environment in `.venv/`, sources in `app/`, tests in `tests/`). You must work **only in the terminal**. Write the exact command (one line each, no GUI) for each of these seven jobs:

1. List all files in `app/` recursively, at most two levels deep (or with sizes in human-readable form).
2. Find every `TODO` in `.py` files under the project, with file name and line number, ignoring `.venv/`.
3. Count the total number of lines in all `.py` files under `app/`.
4. Create the branch `fix/login-timeout` and switch to it in one command.
5. Stage only `app/auth.py` and commit it with the message `Raise login timeout to 30s`.
6. Show the last 5 commits as one line each, with a branch graph.
7. Show only the lines you changed in `app/auth.py` that are not yet staged.

**Deliverable**: a numbered list of 7 commands. Add one short phrase per command saying what the key flag does.
@@criteria
- Job 2 uses recursive grep with line numbers (`grep -rn "TODO"` or `rg -n`) and excludes `.venv` (`--exclude-dir=.venv`, a glob, or a pipe through `grep -v`).
- Job 3 counts lines with `wc -l` over the files found (for example `find app -name "*.py" | xargs wc -l`).
- Job 4 uses `git switch -c fix/login-timeout` or `git checkout -b fix/login-timeout`.
- Job 5 stages that single path (`git add app/auth.py`) and commits with `-m` and the exact message.
- Job 6 uses `git log --oneline --graph -5` (or `-n 5`, flags in any order).
- Job 7 is `git diff app/auth.py` (not `--staged`) and the answer explains that plain `git diff` shows unstaged changes.
@@solution
```
1. find app -maxdepth 2 | sort            # or: tree -L 2 app ; ls -lhR app  (-h human sizes, -R recursive)
2. grep -rn "TODO" --include="*.py" --exclude-dir=.venv .    # -r recurse, -n line numbers
3. find app -name "*.py" | xargs wc -l    # wc -l counts lines, the last row is the total
4. git switch -c fix/login-timeout        # -c creates and switches
5. git add app/auth.py && git commit -m "Raise login timeout to 30s"
6. git log --oneline --graph -5           # --oneline one line per commit
7. git diff app/auth.py                   # without --staged: working tree vs index
```
Each command is a single copy-pasteable line. Prefer small tools joined by pipes, and stage by path rather than with `git add .`.
````

````task
id: log-stats
title: Answer three questions about an access log
kind: code
level: medium
@@statement
Write `analyze_log(text)` that answers three questions about a web-server access log given as one string (one request per line).

**Line format** (similar to nginx):
`IP - - [timestamp] "METHOD /path HTTP/1.1" STATUS BYTES`

**Input**: `text`, a string with any number of lines. Lines that do not match the format (blank lines, garbage) are skipped. The starter gives you a regex `LINE` for one line.

**Output**: a dict with exactly these keys:
- `"top_ip"`: the IP with the most requests. Ties: the alphabetically smaller IP. `None` if there are no valid lines.
- `"errors_5xx"`: how many requests had a status from 500 to 599.
- `"top_path"`: the most requested path (without the query string `?...`). Ties: alphabetically smaller. `None` if there are no valid lines.

**Example**

```
10.0.0.1 - - [10/Oct/2026:13:55:36 +0000] "GET /a?x=1 HTTP/1.1" 200 10
10.0.0.2 - - [10/Oct/2026:13:55:37 +0000] "GET /a HTTP/1.1" 502 0
10.0.0.1 - - [10/Oct/2026:13:55:38 +0000] "POST /b HTTP/1.1" 200 5

-> {"top_ip": "10.0.0.1", "errors_5xx": 1, "top_path": "/a"}
```
@@starter
import re
from collections import Counter

LINE = re.compile(r'^(\S+) \S+ \S+ \[[^\]]*\] "(\S+) (\S+) [^"]*" (\d{3}) ')

def analyze_log(text):
    # your code here
    pass
@@tests
_log = (
    '10.0.0.1 - - [10/Oct/2026:13:55:36 +0000] "GET /a?x=1 HTTP/1.1" 200 10\n'
    '10.0.0.2 - - [10/Oct/2026:13:55:37 +0000] "GET /a HTTP/1.1" 502 0\n'
    '10.0.0.1 - - [10/Oct/2026:13:55:38 +0000] "POST /b HTTP/1.1" 200 5\n'
)
assert analyze_log(_log) == {"top_ip": "10.0.0.1", "errors_5xx": 1, "top_path": "/a"}, "example"
assert analyze_log("") == {"top_ip": None, "errors_5xx": 0, "top_path": None}, "empty log"
_noisy = "garbage line\n\n" + _log + "another bad line 500\n"
assert analyze_log(_noisy) == analyze_log(_log), "malformed lines are skipped"
_tie = (
    '9.9.9.9 - - [t] "GET /z HTTP/1.1" 500 1\n'
    '1.1.1.1 - - [t] "GET /m HTTP/1.1" 503 1\n'
)
assert analyze_log(_tie) == {"top_ip": "1.1.1.1", "errors_5xx": 2, "top_path": "/m"}, "ties are alphabetical"
_edge = '1.1.1.1 - - [t] "GET /x HTTP/1.1" 499 1\n1.1.1.1 - - [t] "GET /x HTTP/1.1" 600 1\n'
assert analyze_log(_edge)["errors_5xx"] == 0, "only 500-599 count"
@@hint
Use `LINE.match(line)` on each line and collect IPs and paths into two `Counter`s. Pick the winner with `min(counter, key=lambda k: (-counter[k], k))`. Cut the query with `path.split("?")[0]`.
@@solution
import re
from collections import Counter

LINE = re.compile(r'^(\S+) \S+ \S+ \[[^\]]*\] "(\S+) (\S+) [^"]*" (\d{3}) ')

def analyze_log(text):
    ips, paths = Counter(), Counter()
    errors = 0
    for line in text.splitlines():
        m = LINE.match(line)
        if not m:
            continue
        ips[m.group(1)] += 1
        paths[m.group(3).split("?")[0]] += 1
        if 500 <= int(m.group(4)) <= 599:
            errors += 1
    def best(c):
        return min(c, key=lambda k: (-c[k], k)) if c else None
    return {"top_ip": best(ips), "errors_5xx": errors, "top_path": best(paths)}
````

````task
id: log-pipes
title: The same three questions with shell pipes
kind: text
level: medium
@@statement
The file `access.log` has one request per line:

```
10.0.0.1 - - [10/Oct/2026:13:55:36 +0000] "GET /a?x=1 HTTP/1.1" 200 10
```

Fields separated by spaces: `$1` is the IP, `$7` the path, `$9` the status code.

Write **three pipelines** (each one line made of several commands joined with `|`):

1. The 3 IPs with the most requests, each with its count, highest first.
2. The number of requests with a 5xx status.
3. The 5 most requested paths **without** their query string.

**Deliverable**: three pipelines, plus one sentence per pipeline naming what each stage does.
@@criteria
- Pipeline 1 extracts the IP column (`awk '{print $1}'` or `cut -d' ' -f1`), then `sort`, `uniq -c`, `sort -rn` and `head -3` (or `-n 3`).
- The answer sorts before `uniq -c` and explains that `uniq` only merges adjacent equal lines.
- Pipeline 2 filters the status with a pattern such as `awk '$9 ~ /^5/'` and counts lines (`wc -l` or `grep -c`).
- Pipeline 3 removes the query string (for example `cut -d'?' -f1` or `sed 's/?.*//'`) before counting.
- Pipeline 3 ends with `sort | uniq -c | sort -rn | head -5` or equivalent.
@@solution
```
1. awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -3
2. awk '$9 ~ /^5/' access.log | wc -l
3. awk '{print $7}' access.log | cut -d'?' -f1 | sort | uniq -c | sort -rn | head -5
```
`awk` picks a column, `sort` puts equal lines next to each other (required by `uniq`), `uniq -c` counts each run, `sort -rn` orders by count numerically and descending, and `head` keeps the top rows. `cut -d'?' -f1` keeps the text before the `?`.
````

````task
id: merge-vs-rebase
title: Resolve one conflict with merge and with rebase
kind: text
level: medium
@@statement
Scenario: a new repository has `main` with a file `config.py` whose line 3 is `TIMEOUT = 5`. Two branches start from that commit:

- `feature/a` changes line 3 to `TIMEOUT = 10`
- `feature/b` changes line 3 to `TIMEOUT = 30`

**Deliverable**: two complete command sequences.

A. **Merge**: from `main`, merge `feature/a` (fast-forward), then merge `feature/b`, hit the conflict, resolve it by keeping `TIMEOUT = 30`, and finish.

B. **Rebase**: starting again from the original state, with `main` already containing `feature/a`, put `feature/b` on top of `main` with a rebase, hit the conflict, resolve it with `TIMEOUT = 30`, and finish with a fast-forward merge into `main`.

For each sequence show the conflict markers you will see in `config.py` and the commands that follow the editing step.
@@criteria
- Merge sequence: `git switch main`, `git merge feature/a`, `git merge feature/b`, edit the file, `git add config.py`, `git commit` (or `git merge --continue`).
- Shows the conflict markers `<<<<<<< HEAD`, `=======` and `>>>>>>> feature/b` with the two values between them, and says they must be removed.
- Rebase sequence: `git switch feature/b`, `git rebase main`, edit the file, `git add config.py`, `git rebase --continue` (not `git commit`).
- Finishes the rebase path with `git switch main` and `git merge --ff-only feature/b` (or equivalent).
- Mentions `git merge --abort` / `git rebase --abort`, or explains that rebase rewrites the commits of `feature/b`.
@@solution
```
# A. merge
git switch main
git merge feature/a            # fast-forward
git merge feature/b            # CONFLICT in config.py
# config.py now contains:
# <<<<<<< HEAD
# TIMEOUT = 10
# =======
# TIMEOUT = 30
# >>>>>>> feature/b
# edit: keep only  TIMEOUT = 30
git add config.py
git commit                      # or: git merge --continue

# B. rebase (main already contains feature/a)
git switch feature/b
git rebase main                 # CONFLICT in config.py, same markers
# edit: keep only  TIMEOUT = 30
git add config.py
git rebase --continue
git switch main
git merge --ff-only feature/b
```
Merge records a merge commit and keeps both histories; rebase replays the commits of `feature/b` on top of `main`, rewriting them into a straight history. `git merge --abort` / `git rebase --abort` return to the state before the command.
````

````task
id: bisect-sim
title: Find the first bad commit (bisect logic)
kind: code
level: medium
@@statement
`git bisect` is a binary search over commits. Implement the same logic: `first_bad_commit(commits, is_bad)`.

**Input**
- `commits`: a non-empty list of commit ids ordered **oldest to newest**. Assume that once a commit is bad all newer commits are bad too, and that the **newest commit is bad**.
- `is_bad(commit)`: a function returning `True` if the bug is present in that commit. Calling it is expensive.

**Output**: the id of the **first** (oldest) bad commit. Call `is_bad` at most `ceil(log2(len(commits)))` times (binary search, not a linear scan).

**Example**

```
commits = ["c1", "c2", "c3", "c4", "c5"]
first_bad_commit(commits, lambda c: c >= "c4")   -> "c4"
```
@@starter
def first_bad_commit(commits, is_bad):
    # your code here
    pass
@@tests
_ids = ["c%02d" % i for i in range(1, 11)]
_calls = []
def _bad(c):
    _calls.append(c)
    return c >= "c07"
assert first_bad_commit(_ids, _bad) == "c07", "bug introduced at c07"
assert len(_calls) <= 4, "binary search needs at most 4 checks for 10 commits"
assert first_bad_commit(["x"], lambda c: True) == "x", "single commit"
assert first_bad_commit(["a", "b"], lambda c: True) == "a", "first of two is bad"
assert first_bad_commit(["a", "b"], lambda c: c == "b") == "b", "second of two"
_big = list(range(1000))
_n = []
assert first_bad_commit(_big, lambda c: _n.append(c) or c >= 613) == 613, "large history"
assert len(_n) <= 10, "log2(1000) is about 10 checks"
@@hint
Keep `lo = 0` and `hi = len(commits) - 1` (the newest is known bad). While `lo < hi`, test the middle: if bad, `hi = mid`, else `lo = mid + 1`.
@@solution
def first_bad_commit(commits, is_bad):
    lo, hi = 0, len(commits) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if is_bad(commits[mid]):
            hi = mid
        else:
            lo = mid + 1
    return commits[lo]
````

````task
id: bisect-commands
title: Bisect a planted bug with git commands
kind: text
level: medium
@@statement
Scenario: in repository `calc/` the tag `v1.0` is known good and `HEAD` is bad: `python -m pytest tests/test_total.py` passes at `v1.0` and fails now, 12 commits later (you planted the bug 5 commits back). Let git find the guilty commit.

**Deliverable**: the exact commands for

1. Starting a bisect and marking the good and bad ends.
2. Marking each tested commit by hand (show both answers).
3. The automatic version that runs the test itself, using `git bisect run`.
4. Reading the result and returning to your original branch.

Also state how many commits git tests at most for these 12 commits, and why.
@@criteria
- Starts with `git bisect start`, then `git bisect bad` (HEAD) and `git bisect good v1.0` (or `git bisect start HEAD v1.0`).
- Shows both manual markers `git bisect good` and `git bisect bad` after testing a checked-out commit.
- Automatic version: `git bisect run python -m pytest tests/test_total.py` (exit 0 = good, non-zero = bad).
- Explains that git prints "<hash> is the first bad commit" and that the session ends with `git bisect reset`.
- States at most 4 tests (log2 of 12, rounded up) because each test halves the range.
@@solution
```
git bisect start
git bisect bad                 # HEAD is bad
git bisect good v1.0           # v1.0 is good
# git checks out a middle commit; run the test, then answer:
git bisect good                # test passed here
git bisect bad                 # test failed here
# automatic:
git bisect run python -m pytest tests/test_total.py
# git prints "<hash> is the first bad commit"
git bisect reset               # back to the original branch
```
Each step halves the remaining range, so 12 commits need at most ceil(log2(12)) = 4 tests. `git bisect run` reads the exit code: 0 means good, 1-127 (except 125) means bad.
````

````task
id: backup-retention
title: Which backup archives to delete
kind: code
level: easy
@@statement
A backup script creates one archive per day named `backup-YYYY-MM-DD.tar.gz`. Write two functions for its logic.

1. `archive_name(day)`: `day` is a `datetime.date`. Return the file name, e.g. `date(2026, 11, 3)` gives `"backup-2026-11-03.tar.gz"`.
2. `archives_to_delete(filenames, today, keep_days=7)`: `filenames` is a list of strings (a folder listing), `today` a `datetime.date`. Return a **sorted list** of the names that are **older than `keep_days` days**, i.e. `(today - archive_date).days > keep_days`.

Rules: ignore every file that does not match the pattern exactly (such as `notes.txt`, `backup-...tar.gz.bak`, or an impossible date like month 13). Archives dated in the future are kept. Do not modify the input list.

**Example**

```
archives_to_delete(["backup-2026-11-05.tar.gz", "backup-2026-11-06.tar.gz", "notes.txt"], date(2026, 11, 13))
-> ["backup-2026-11-05.tar.gz"]      # 8 days old is deleted, 7 days old is kept
```
@@starter
import re
from datetime import date

def archive_name(day):
    pass

def archives_to_delete(filenames, today, keep_days=7):
    pass
@@tests
_today = date(2026, 11, 13)
assert archive_name(date(2026, 11, 3)) == "backup-2026-11-03.tar.gz", "zero padded name"
_files = ["backup-2026-11-06.tar.gz", "backup-2026-11-05.tar.gz", "backup-2026-10-01.tar.gz", "notes.txt",
          "backup-2026-13-45.tar.gz", "backup-2026-11-20.tar.gz", "backup-2026-11-05.tar.gz.bak"]
_copy = list(_files)
assert archives_to_delete(_files, _today) == ["backup-2026-10-01.tar.gz", "backup-2026-11-05.tar.gz"], "sorted old archives only"
assert _files == _copy, "input not modified"
assert archives_to_delete([], _today) == [], "empty listing"
assert archives_to_delete(_files, _today, keep_days=30) == ["backup-2026-10-01.tar.gz"], "custom retention"
assert archives_to_delete(["backup-2026-11-06.tar.gz"], _today) == [], "exactly 7 days old is kept"
@@hint
Match with `re.fullmatch(r"backup-(\d{4})-(\d{2})-(\d{2})\.tar\.gz", name)`, build a `date(...)` inside `try/except ValueError`, and compare `(today - d).days`.
@@solution
import re
from datetime import date

PATTERN = re.compile(r"backup-(\d{4})-(\d{2})-(\d{2})\.tar\.gz")

def archive_name(day):
    return "backup-%s.tar.gz" % day.isoformat()

def archives_to_delete(filenames, today, keep_days=7):
    old = []
    for name in filenames:
        m = PATTERN.fullmatch(name)
        if not m:
            continue
        try:
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            continue
        if (today - d).days > keep_days:
            old.append(name)
    return sorted(old)
````

````task
id: backup-script
title: Backup shell script with 7-day cleanup
kind: text
level: medium
@@statement
Write a Bash script `backup.sh` that backs up the folder `/srv/app/data` into the folder `/var/backups/app` as a dated archive and removes old ones.

**Requirements**
- Archive name: `backup-YYYY-MM-DD.tar.gz` for today's date (for example `backup-2026-11-13.tar.gz`).
- Create the target folder if it does not exist.
- Stop at the first error, and fail on unset variables and failed pipes.
- After a successful backup, delete archives in `/var/backups/app` **older than 7 days** that match `backup-*.tar.gz` only.
- Print one line with the archive name when done.
- Also give the one-line `crontab` entry that runs it every day at 02:30.

**Length**: 8-15 lines.
@@criteria
- Starts with a shebang (`#!/usr/bin/env bash` or `#!/bin/bash`) and `set -euo pipefail`.
- Builds the name with `$(date +%F)` or `date +%Y-%m-%d` and creates the archive with `tar -czf`.
- Uses `mkdir -p` for the target and quotes variables (`"$DEST"`).
- Deletes with `find /var/backups/app -name 'backup-*.tar.gz' -mtime +7 -delete` (or `-exec rm`), restricted by name pattern.
- Crontab line is `30 2 * * * /path/backup.sh` with the correct field order (minute, hour, ...).
@@solution
```
#!/usr/bin/env bash
set -euo pipefail

SRC=/srv/app/data
DEST=/var/backups/app
NAME="backup-$(date +%F).tar.gz"

mkdir -p "$DEST"
tar -czf "$DEST/$NAME" -C "$SRC" .
find "$DEST" -name 'backup-*.tar.gz' -mtime +7 -delete
echo "created $NAME"
```
Crontab: `30 2 * * * /usr/local/bin/backup.sh`. `set -euo pipefail` makes a failed `tar` stop the script before any old backup is deleted.
````
