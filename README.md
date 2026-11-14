# Software & AI Engineering Course

A local, interactive learning site. 40 lessons from Python and data structures through system design to LLMs, RAG and agents, with runnable code, quizzes, simulators and progress tracking.

It needs **only Python 3.8 or newer**. There is nothing to install: no pip packages, no Node.js, no database.

## Run it

```
python app.py
```

Your browser opens at `http://127.0.0.1:8000/`. Leave the terminal window open while you study; press Ctrl+C to stop.

| Command | What it does |
| --- | --- |
| `python app.py` | Start the course and open the browser |
| `python app.py --port 9000` | Use another port (the app also moves to the next free port by itself) |
| `python app.py --no-browser` | Start without opening a browser |
| `python app.py --check` | Validate every lesson, quiz and runnable example, then exit |
| `python app.py --check --browser` | The same, running the code the way the hosted site does |
| `python app.py --build site` | Write the hosted version into `site/` (see "Host it online") |

On some systems the command is `python3` or `py` instead of `python`.

## What is inside

```
app.py               the whole server: standard library only
content/
  course.json        modules and the order of lessons
  NN-lesson-id.md    one Markdown file per lesson
static/
  index.html         the page shell
  styles.css         styling, light and dark themes
  app.js             Markdown renderer, navigation, search, quizzes, progress
  sims.js            interactive simulators
  hosted.js, hosted.css, pyworker.js, pyruntime.py
                     used only by the hosted version: Python in the browser, browser storage, Settings
deploy/              optional tutor proxy for the hosted version (Cloudflare Worker)
.github/workflows/   publishes the hosted version to GitHub Pages
progress.json        created when you first tick something; your saved progress
```

## How the interactive parts work

- **Run buttons**: the editable Python blocks are sent to `app.py`, which runs them with your own Python in a separate process, in a temporary folder, with a 10-second limit. If you have installed packages such as NumPy, your code can import them.
- **Quizzes, checkboxes and completed lessons** are saved to `progress.json`. Delete that file to start again. Copy it to another machine to carry your progress over.
- **Simulators** (binary search, sorting, token bucket, consistent hashing, LRU cache, capacity estimator) run in the browser.
- **Search** covers the full text of every lesson.

## Python Lab (the separate Python portal)

Open `http://127.0.0.1:8000/python`, or use the **Python Lab** link in the top bar of the course. It is a second site inside the same app, with its own look and navigation:

- **Learn**: 20 lessons in 7 units, from variables and loops to generators, decorators, type hints and concurrency. Every example is editable and runs with Ctrl+Enter.
- **Problems**: every exercise in one list, with search and filters for difficulty, status and topic.
- **Workspace**: the statement on the left; on the right an editor with line numbers, syntax colouring and automatic indentation. **Run** tries the first sample cases, **Submit** runs every test case and shows, per case, the input, your output and the expected output.

Files:

```
content/python/track.json    units and the order of lessons
content/python/NN-name.md    one lesson per file; ids start with "py-"
static/python.html, py.css, py.js
```

Lessons use the same Markdown and the same `task` blocks as the main course. To reuse an exercise of the main course instead of writing a new one, reference it:

`````
````task
ref: python-core/word-frequencies
````
`````

A referenced exercise has one progress key, so solving it or typing a draft in either place shows up in both. The three problem-set lessons are built entirely from references to the data structures lessons. Course exercises that are available in the lab show an **Open in Python Lab** link.

`python app.py --check` also validates the lab: every reference must resolve, every reference solution must be accepted by the judge, and starters must fail.

## Practice windows and the AI tutor

- Under every **Practice** heading, each task has an **Open the editor** button. It opens an editor (Python code or a written answer) with **Run**, **Run tests**, **Check my answer**, **Hint** and **Explain the error**. Code runs locally exactly like the lesson examples; your draft is saved in `progress.json`. A passing check ticks the task for you.
- The **Tutor** button (bottom right) opens a chat that knows which lesson you are reading. Runnable code blocks also have an **Explain** button.
- The tutor is **off by default**: no request leaves the app until you enable a backend. Set an environment variable before starting:

| Backend | PowerShell | Where your code and questions go |
| --- | --- | --- |
| Local model | `$env:COURSE_LLM="ollama"; python app.py` | Only to Ollama on 127.0.0.1 (needs Ollama installed; default model `llama3.2`) |
| Groq (`openai/gpt-oss-120b`) | `$env:COURSE_LLM="groq"; $env:GROQ_API_KEY="..."; python app.py` | To Groq's servers. Check company policy first |
| Anthropic API | `$env:COURSE_LLM="anthropic"; $env:ANTHROPIC_API_KEY="..."; python app.py` | To Anthropic's servers. Check company policy first |

Instead of typing these each time, put them in the `.env` file next to `app.py` (for example `GROQ_API_KEY=...`). Real environment variables take priority over `.env`, and `.env` is listed in `.gitignore`. Never share that file.

`COURSE_LLM_MODEL` overrides the model name. The API key is read from the environment only and is never written to a file or sent to the browser. With `ollama`, the server refuses any host other than this machine.

## Host it online

`python app.py --build site` writes a folder of plain files (`site/`) that any static host can serve, for free, with no server of your own. In the hosted version:

| Part | Local (`python app.py`) | Hosted (`site/`) |
| --- | --- | --- |
| Running code, tests, Submit | Your Python, on your machine | Python 3.12 inside the visitor's browser ([Pyodide](https://pyodide.org)), in a background worker with the same 10-second limit. Nothing runs on a server |
| Progress and drafts | `progress.json` | The browser's storage. **Settings > Export / Import** moves it to another device |
| Tutor | `COURSE_LLM` and `.env` | Groq (`openai/gpt-oss-120b`): each visitor pastes their own key in **Settings**, or you run the optional tutor proxy so nobody needs a key |

The first Run downloads Python (about 10 MB, then cached by the browser), so the hosted site needs internet access. Packages such as NumPy are downloaded the first time a program imports them.

What a browser cannot do: threads take turns instead of running at the same time, and network sockets (`socket`, `http.server`, `urllib` downloads) and `subprocess` are unavailable. Most threading examples still work. The few that open sockets explain this in their output and work in the local version. `python app.py --check --browser` runs every example and solution the way the hosted site does and lists anything that would fail there.

### Option 1: GitHub Pages (automatic)

1. Put this folder in a GitHub repository. `.env`, `progress.json` and `site/` are in `.gitignore`, so your key and progress are not uploaded. Check with `git status` before the first push.
2. In the repository: **Settings > Pages > Source: GitHub Actions**.
3. Push to `main`. `.github/workflows/pages.yml` builds the site and publishes it at `https://<your-name>.github.io/<repository>/`. Every later push updates it.

### Option 2: drag and drop (Netlify, Cloudflare Pages)

Run `python app.py --build site`, then drag the `site` folder onto Netlify Drop (app.netlify.com/drop) or a new Cloudflare Pages project. Rebuild and upload again after editing lessons.

To try the built site on your own machine first: `python -m http.server 8080 --bind 127.0.0.1 -d site`, then open `http://127.0.0.1:8080/`. Opening `index.html` as a file does not work, because browsers do not start a Python worker from `file://`.

### The tutor online

The hosted site is public files, so it must never contain your API key. `--build` does not read `.env`. There are two ways:

- **Each visitor's own key (default).** Settings has a field for a Groq API key. It is kept only in that browser and sent only to `api.groq.com`. Fine when the site is mainly for you.
- **A tutor proxy (nobody needs a key).** `deploy/tutor-proxy.js` is a small Cloudflare Worker (free plan) that keeps your Groq key as a secret and answers only your site:
  1. In `deploy/wrangler.toml`, set `ALLOWED_ORIGINS` to your site's address, for example `https://your-name.github.io`.
  2. From the `deploy` folder: `npx wrangler secret put GROQ_API_KEY`, then `npx wrangler deploy`. Note the `https://....workers.dev` address it prints.
  3. Build with `python app.py --build site --tutor-proxy https://course-tutor.<you>.workers.dev`. On GitHub Pages, add that address as the repository variable `TUTOR_PROXY_URL` (**Settings > Secrets and variables > Actions > Variables**) instead.

  Anyone who finds the site can use the tutor, and so spend your Groq quota. The proxy allows 20 requests per minute per visitor; also set a usage limit for the key in the Groq console.

## Safety notes

- The server listens on `127.0.0.1` only, so other machines on the network cannot reach it.
- Every write request must carry a random token that is issued to the page when it loads, so other websites open in your browser cannot make the server run code.
- Code you run through the page runs with your own user account's permissions, exactly as if you had typed `python file.py`. Do not paste code you do not understand.

## Editing and adding lessons

Lessons are plain Markdown and are re-read on every page load, so edit a file and refresh the browser.

A lesson file starts with a header:

```
---
id: my-lesson
title: My lesson title
minutes: 30
---
```

Then add its `id` to a module in `content/course.json`.

Special blocks:

| Block | Meaning |
| --- | --- |
| ` ```python run ` | An editable Python example with Run and Reset buttons |
| ` ```quiz ` | A JSON list of questions: `{"q": "...", "options": ["..."], "answer": 0, "why": "..."}` |
| ` ```sim ` | One simulator name: `binary-search`, `sorting`, `token-bucket`, `hash-ring`, `lru-cache`, `estimator` |
| ` ````task ` | A practice task with a statement, starter code, tests, hint and solution (see below) |
| `- [ ] text` | A practice checkbox that is saved |
| `[text](#lesson-id)` | A link to another lesson |

### Practice tasks

Under a `## Practice` heading, write each exercise as a `task` block fenced with **four** backticks (so the statement can contain normal three-backtick examples). Header lines come first, then `@@sections`:

```
id: word-frequencies          unique within the lesson; the saved progress key
title: Most common words
kind: code                    code (runs Python) or text (a written answer)
level: easy                   easy, medium or hard (optional)
@@statement                   the problem: exact name, Input, Output, Example
@@starter                     code the learner starts with (code tasks)
@@tests                       plain assert lines (optional but recommended); they run after the learner's code
@@hint                        one nudge
@@solution                    reference solution (code) or model answer (text)
@@criteria                    "- " bullets: what a good written answer covers (required for text tasks)
```

"Run tests" runs the learner's code plus `@@tests` locally and ticks the task when everything passes. "AI review" (optional, needs the tutor) judges code and written answers against the statement and criteria. See the Practice section of `content/02-python-core.md` for a complete example.

`python app.py --check` runs every reference solution against its tests, and confirms that the starter code does **not** already pass. Use `--check --lesson python-core` to check one lesson.

Run `python app.py --check` after editing. It reports unclosed code blocks, invalid quiz JSON, broken lesson links, and runnable examples that fail.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The browser did not open | Open `http://127.0.0.1:8000/` yourself; the terminal prints the exact address |
| "Could not reach the course server" on Run | The terminal running `app.py` was closed. Start it again and reload the page |
| The port is in use | The app picks the next free port automatically; use the address it prints |
| A page shows "Content error" | A lesson file or `course.json` is malformed. Run `python app.py --check` |
| External links do not open | They need internet access and may be blocked on a company network. The lessons themselves work offline |
