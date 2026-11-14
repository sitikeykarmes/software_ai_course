---
id: career-projects-plan
title: Projects and a study plan
minutes: 30
---

Three or four deep projects that you built, deployed, measured and can explain line by line are worth more than any number of certificates. Each project below is chosen to exercise specific modules of this course, and each can start on a laptop with only Python.

## Rules for every project

- **Write the core yourself** before using an AI assistant. Then use the assistant to review, to explain errors and to suggest tests.
- **Start with the standard library**, the way this course's own `app.py` does. Add a framework when you understand what it replaces.
- **Measure something**: latency, cost, accuracy, recall. Numbers are what you talk about in interviews.
- **Write a README** with the architecture, the trade-offs you chose, how to run it, and the numbers.
- **Keep it in Git** with small commits and meaningful messages.
- **Deploy it** somewhere reachable when you can.
- **Workplace code is usually confidential.** Rebuild the idea on public or synthetic data for your portfolio, and describe the workplace version only in general terms.

## Project 1: a backend from scratch

**Build**: a URL shortener or a task API.

| Stage | What you add | Lessons |
| --- | --- | --- |
| 1 | HTTP API with the standard library, SQLite storage, validation, consistent errors | [APIs](#be-apis), [Databases](#be-databases) |
| 2 | Sign-up and login: hashed passwords, signed tokens, ownership checks | [Authentication](#be-auth) |
| 3 | An in-memory cache with TTL, a token-bucket rate limiter, a background worker thread | [Caching and queues](#be-cache-queues), [Building blocks](#sd-building-blocks) |
| 4 | Unit tests with fakes; structured logs with request IDs; p95 latency report | [Testing and observability](#ops-quality) |
| 5 | Rewrite in FastAPI with PostgreSQL and Redis; Docker; CI; deploy | [Docker and CI/CD](#ops-docker-k8s-cicd), [Cloud](#ops-cloud) |

**Numbers to report**: requests per second on your machine; p50 and p95 latency with and without the cache; test coverage.

## Project 2: make a real-time system production-grade

**Build**: take a chat or collaboration application (a multi-agent group chat is ideal) and make it survive scale and failure.

- Durable message storage with per-conversation ordering.
- Authentication and per-user rate limits.
- A registry and pub/sub bus so several server instances can share WebSocket connections.
- A queue in front of slow model calls, so they never block the socket loop.
- Tracing for every request; a load test; a regression eval suite around any model-based evaluator.

**Lessons**: [Worked designs 2](#sd-cases-2), [Architecture patterns](#sd-patterns), [Evals](#ai-evals-ops).

**Numbers to report**: concurrent connections handled; message delivery latency; behaviour when one instance is killed.

## Project 3: retrieval with measured quality

**Build**: a question-answering assistant over a set of documents you choose (public manuals, standards, course notes).

- An ingestion pipeline: parse, chunk, index, with metadata.
- Keyword and vector retrieval combined; a reranking step.
- Answers with citations and a tested "I don't know" path.
- Per-user document permissions enforced at retrieval.
- A 50-question evaluation set with known relevant passages.

**Lessons**: [RAG](#ai-rag), [LLM APIs](#ai-llm-apis), [Evals](#ai-evals-ops).

**Numbers to report**: recall@5 and MRR before and after each improvement; faithfulness rate; cost and latency per answer. A table showing each change and its effect is the most persuasive thing you can show an AI engineering interviewer.

## Project 4: an agent with tools you wrote

**Build**: an agent that does a real multi-step job, such as monitoring stock and drafting purchase orders, or triaging support tickets.

- The agent loop written by hand first, then rebuilt with a framework.
- An MCP server you wrote over a real database or API.
- Human approval before any action that changes data.
- Step and cost limits; a full trace of every run.
- Twenty test tasks with expected tool calls and outcomes.

**Lessons**: [Agents](#ai-agents), [Evals](#ai-evals-ops).

**Numbers to report**: task success rate; average steps and cost per task; which failure modes you found and fixed.

## Project 5: machine learning end to end

**Build**: a model on a public tabular or image dataset, taken all the way to a service.

- Exploration and a written data summary.
- A baseline, then a stronger model, with a proper split and no leakage.
- Error analysis: which cases fail and why.
- The model served behind an API with input validation.
- A drift monitor comparing live inputs with the training data.

**Lessons**: [Maths and data](#ai-maths-data), [Classical ML](#ai-classical-ml), [Deep learning](#ai-deep-learning), [Evals and MLOps](#ai-evals-ops).

**Numbers to report**: precision and recall at your chosen threshold and why you chose it; inference latency.

## Project 6: fine-tune a small model

**Build**: a small open-weight model fine-tuned with QLoRA on a narrow task, compared against a prompted baseline on a held-out set, and served locally.

**Lessons**: [Fine-tuning and serving](#ai-finetune-serving).

**Numbers to report**: baseline against fine-tuned accuracy; tokens per second; memory used.

## A study plan beside a full-time job

This assumes 10 to 12 hours a week. Adjust the pace and keep the order.

| Phase | Duration | Focus | Output |
| --- | --- | --- | --- |
| 1 | Months 1 to 2 | Python in depth; Git and the command line; SQL. DSA daily, 30 to 45 minutes, continuing through every phase | 60 solved problems; SQL practice set |
| 2 | Months 3 to 4 | Operating systems, networking, APIs, authentication, databases, testing | Project 1, stages 1 to 4 |
| 3 | Months 5 to 6 | Caching, queues, Docker, CI/CD, cloud, observability | Project 1 deployed and load tested |
| 4 | Months 7 to 8 | System design: one written design a week. LLM APIs, RAG, evals | Project 3 with its evaluation table |
| 5 | Months 9 to 10 | Agents, LangGraph, MCP; architecture patterns | Projects 2 and 4 |
| 6 | Months 11 to 12 | Classical ML and deep learning practice; fine-tuning; mock interviews | Projects 5 and 6; interview-ready |

Run the maths and ML theory lessons as a slow thread from the first month, an hour or two a week. That material also carries over directly to a computer science or AI master's programme.

## A weekly routine that works

- [ ] Five DSA problems, one of them timed.
- [ ] Six to eight hours building the current project.
- [ ] One lesson re-read, with its practice tasks done and its quiz retaken.
- [ ] One system design written out in full.
- [ ] A short written note on what you learned this week. These notes become interview material.

## How to tell that you are ready

You can, without notes:

- Solve a medium DSA problem in 25 minutes while explaining your thinking.
- Explain what happens between typing a URL and seeing a page.
- Explain indexes, transactions and isolation with examples.
- Design a URL shortener, a chat system and a news feed in 35 minutes each.
- Explain how an LLM generates text, how RAG works and where it fails, and how you would evaluate one.
- Walk through each of your projects: why each decision, what broke, what you measured, what you would change.

## Presenting a non-software background

An electronics degree with a digitalisation role in automotive operations is a real advantage for teams working on industrial AI, computer vision, IoT and manufacturing software, provided the resume shows engineering and not only coordination.

- Lead with what you personally built and measured.
- Write each point as problem, what you did, and a result with a number.
- Put deployed project links and a clean GitHub profile at the top.
- Name the domain knowledge: quality processes, plant constraints, how operators actually use systems. Few software candidates have it.

```quiz
[
  {"q": "What makes a portfolio project persuasive to an interviewer?", "options": ["The number of technologies listed", "Measured results and decisions you can explain", "A long README copied from a template"], "answer": 1, "why": "Numbers and reasoning show engineering judgment."},
  {"q": "You built something valuable at work. How should it appear in your portfolio?", "options": ["Upload the company code", "Rebuild the idea on public or synthetic data and describe the original in general terms", "Do not mention it"], "answer": 1, "why": "Employer code and data are normally confidential."},
  {"q": "How should DSA practice fit into the plan?", "options": ["All in the final month", "A little every day throughout", "Skip it for AI roles"], "answer": 1, "why": "Problem-solving fluency builds slowly and fades without practice."}
]
```
