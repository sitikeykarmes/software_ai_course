---
id: start-here
title: How to use this course
minutes: 10
---

This course takes you from programming fundamentals to designing large systems and building AI applications. It is written to be read in order, and every lesson has the same parts.

## What is inside each lesson

- **Explanation** of the idea in plain words, starting from why it exists.
- **Code** you can read, and Python examples with a **Run** button. They execute on your own machine through the course server, so you can edit them and run again.
- **Real systems**: where the idea is used in production software.
- **Simulators** for ideas that are easier to see than to read, such as binary search, sorting, rate limiting and consistent hashing.
- **A quiz** to check understanding.
- **Practice tasks** with checkboxes. Your ticks, quiz scores and completed lessons are saved in `progress.json` next to `app.py`.

Try the runner now. Change the name and press Run.

```python run
name = "engineer"
print("Hello,", name)
print("2 ** 10 =", 2 ** 10)
```

## The roles this prepares you for

| Role | What you do most days | Modules that matter most |
| --- | --- | --- |
| Software Engineer / SDE (backend) | Build and run APIs and services, design data models, fix production issues | Python, DSA, CS fundamentals, Backend, System design, Shipping |
| Full-stack engineer | Backend plus the browser side | The above plus Frontend |
| AI Engineer | Build products on existing models: RAG, agents, evals, serving | Python, Backend, Shipping, then the AI module from Transformers onward |
| ML Engineer | Train, tune and deploy models; data and training pipelines | Python, Databases, Shipping, then all of the AI module |
| Data Scientist | Analysis, experiments, models that support decisions | Databases, Maths and data, Classical ML |

An AI engineer is a software engineer who also knows models. Job descriptions for that role list software engineering, applied ML, data and deployment together, so do not skip the first half of the course to reach the AI lessons sooner.

## The order to study in

1. **Python in depth**. Everything else is written in it.
2. **Data structures and algorithms**. Study a little every day from now until you are hired; it is the entry test for most software roles.
3. **Computer science fundamentals**, then **Backend engineering**. Build one real service by hand while you read these.
4. **Shipping and running software**. Put that service in Docker, test it, deploy it.
5. **System design**. This module is long and is where engineers are separated from coders.
6. **AI and machine learning**. Start the maths and classical ML lessons early and slowly, an hour or two a week, because they take time to settle.
7. **Projects, interviews and resources** at the end, and whenever you need to plan.

## How to study so that it sticks

- **Type, do not paste.** Retype each example, change something, predict the output, then run it.
- **Explain aloud.** After a lesson, explain the main idea in two minutes without looking. Where you get stuck is what to re-read.
- **Use AI tools as a reviewer.** Write the code yourself first. Then ask an assistant to critique it, explain an error, or quiz you. If you cannot explain a line in your own project, treat that as a gap.
- **Build while reading.** The practice tasks add up to real projects. A deployed project you can explain line by line is worth more than any certificate.
- **Come back.** Re-take a lesson's quiz a week later. If you score lower, re-read it.

## What this course cannot do

It explains concepts at the depth an interviewer or a senior colleague expects, with enough detail to build from. It cannot replace the hours of building, and a few areas change every few months: cloud service details, framework APIs, model names. When you build, check the official documentation for exact syntax. The Resources lesson lists the best places for that.

```quiz
[
  {"q": "You finished reading a lesson. What is the best next step?", "options": ["Start the next lesson immediately", "Explain the main idea aloud and do the practice tasks", "Ask an AI tool to summarise it"], "answer": 1, "why": "Recall and practice are what turn reading into skill."},
  {"q": "Why should an aspiring AI engineer study backend and system design?", "options": ["They are not needed for AI roles", "AI products are software systems; models are one component inside them", "Only to pass coding rounds"], "answer": 1, "why": "Most of the work in an AI product is retrieval, APIs, data, deployment, cost and reliability."}
]
```
