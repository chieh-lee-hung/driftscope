# DriftScope — Demo Product Spec

**Version:** v0.9  
**Last updated:** 2026-03-28  
**Author:** Chieh-Lee Hung

---

## 1. What DriftScope Is

DriftScope is a **runtime safety layer for production AI agents**.

It focuses on a failure mode that most observability tools miss:

> **The agent did not crash, but it quietly stopped behaving the way you intended.**

In practice, this means:

- infrastructure metrics can stay green
- customer-facing answers can still look normal
- but the agent's internal tool path can drift

DriftScope detects that hidden behavior change by monitoring:

- **Output Drift**: what the agent says
- **Trajectory Drift**: how the agent gets there

The key product claim is:

> DriftScope catches **hidden drift**: low output change, high internal path change.

---

## 2. Problem

Existing agent monitoring tools mostly answer:

- Is the system slow?
- Is it expensive?
- Did it error?
- Did the model output change?

They usually do **not** answer:

- Is the agent still following the same internal workflow?
- Did a policy change silently reroute the agent's decision path?
- Did a prompt or model change alter tool usage without obvious output regressions?

This matters because many real agent failures are silent:

### Example A: Policy / knowledge update

A refund policy document is updated with extra verification rules.

- no code change
- no deployment
- no hard fail
- traditional observability stays green

But now the refund agent starts taking extra internal verification steps.

### Example B: Prompt or orchestration tweak

An engineer modifies a system prompt or workflow edge case.

- the agent still answers the customer
- but 30% of requests now follow a different internal route

### Example C: Silent provider behavior shift

The same model name behaves differently after an upstream change.

- answers still look acceptable
- tool usage changes underneath

DriftScope is designed to catch these cases.

---

## 3. Core Insight

The most dangerous class of agent regressions is:

## Hidden Drift

This is when:

- the final answer still looks normal
- but the internal decision path has changed

This is why DriftScope always evaluates two dimensions together:

| Dimension | Meaning |
|---|---|
| Output Drift | Did the final answer change? |
| Trajectory Drift | Did the tool path / workflow behavior change? |

This creates four states:

| Output Drift | Trajectory Drift | Meaning |
|---|---|---|
| Low | Low | Normal |
| High | Low | Input / output shift |
| Low | High | **Hidden Drift** |
| High | High | Severe Drift |

DriftScope is strongest in the third case.

---

## 4. Product Positioning

DriftScope is **not** a replacement for LangSmith, Arize, or infrastructure monitoring.

It is the missing layer for:

- behavioral monitoring
- trajectory-level drift detection
- runtime safety decisions

The most accurate one-line positioning is:

> DriftScope is an observer layer for production agents that detects hidden behavioral drift from live tool-call trajectories.

For demo and hackathon framing:

> A production agent does the work. DriftScope watches it and acts when it drifts.

---

## 5. Current Demo Story

The strongest demo story in this repo is:

## Picnic-style Refund Support Agent

Scenario:

- a grocery support agent handles damaged-order refund requests
- at first, the workflow is healthy
- then the refund policy is silently updated
- the final customer answer stays effectively the same
- but the internal workflow now takes extra verification steps
- DriftScope detects the hidden drift and moves the workflow into protected mode

This is the core demo message:

> LangSmith can tell you when the agent crashes. DriftScope tells you when it quietly stops behaving the same way.

---

## 6. System Architecture

Current demo architecture:

```text
Refund requests
    ↓
Picnic-style refund workflow
    ↓
Tool calls / tool results
    ↓
DriftScope capture layer
    ↓
Embeddings + drift analysis
    ↓
Runtime decision
    ↓
Dashboard + alerts + owner notification attempt
```

Conceptual roles:

- **Production Agent**: the refund support workflow
- **Observer Layer**: DriftScope
- **Operator Console**: the dashboard

Important clarification:

- the current filmed demo is **Python-first and dashboard-first**
- there is also an **OpenClaw integration path / plugin experiment** in this repo
- but the most reliable demo path is still the Python runner + live dashboard flow

So for submissions and video, the safest wording is:

> The refund workflow is designed around an OpenClaw-style orchestration surface, and DriftScope acts as the observer layer.

That is more accurate than claiming the entire public demo is already running end-to-end on official OpenClaw runtime.

---

## 7. Detection Method

DriftScope currently combines several signals:

### 7.1 Output Drift

Compares baseline outputs and current outputs with embeddings and drift statistics.

Purpose:

- catch semantic output changes
- distinguish visible answer changes from hidden behavioral changes

### 7.2 Trajectory Drift

Compares baseline and current trajectories:

- tool sequence
- number of steps
- workflow shape
- embedded trajectory semantics

Purpose:

- detect changes in internal decision path

### 7.3 Per-trace Path Comparison

Per request, DriftScope compares:

- baseline tool sequence
- current tool sequence

Using:

- normalized edit distance
- step growth ratio

This powers the Drift Quadrant and trace-level examples.

### 7.4 Behavior Drift Ratio

Measures:

- how many current queries are matched to similar baseline queries
- but still show internal path divergence

Example:

- `2 / 6 = 33%`
- `6 / 6 = 100%`

This is what the `Queries Affected` stat represents.

---

## 8. Runtime Decision Layer

DriftScope does not only compute drift scores.

It also produces a runtime decision:

- `healthy`
- `monitoring_only`
- `protected`
- `review_mode_enabled`

In the hidden drift scenario, the key runtime action is:

> **Review mode enabled**

Meaning:

- autonomous behavior should no longer be blindly trusted
- a human/operator review step is recommended before continuing

This is what makes DriftScope feel like a runtime safety product instead of only an analytics dashboard.

---

## 9. Dashboard Design

The dashboard is the operator console for DriftScope.

Its job is not only to visualize data, but to tell a clear story:

1. Did drift happen?
2. What kind of drift is it?
3. What evidence supports that?
4. What did the observer do?

### Current key panels

#### Stat cards

Show:

- Trajectory Drift
- Output Drift
- Queries Affected
- New Tools
- Status
- Runtime Action

#### Drift Quadrant

Shows:

- low output / low trajectory = normal
- low output / high trajectory = hidden drift

This is one of the most important demo visuals.

#### Live Run Timeline

This was updated from synthetic history to a real replay timeline.

It now grows from:

- `B1, B2, ...` baseline traces
- `Policy` marker
- `C1, C2, ...` current replay traces

Meaning:

- the lines grow as the demo runs
- the chart reflects replay progress instead of fake multi-day history

#### Observer Trace

This panel explains what DriftScope itself did:

- baseline captured
- current traces compared
- analysis started
- hidden drift detected
- review mode enabled
- owner notification attempted

This makes the product feel like an active observer, not only a passive charting tool.

---

## 10. Current Demo Scripts

These are the relevant scripts in the repo now:

### Main recorded demo

```bash
python3 demo/openclaw_picnic_demo.py
```

This is the best script for a filmed demo because it:

- starts with healthy baseline behavior
- applies a silent policy change
- replays the same type of refund workload
- ends in hidden drift
- updates the dashboard in the same project

### Deterministic backup demo

```bash
python3 demo/simulated_dashboard_demo.py
```

Use this if:

- external APIs are unreliable
- you need a guaranteed fallback recording

### Internal verification demos

These are still useful, but they are not the preferred public demo entrypoint:

```bash
python3 demo/openai_normal_demo.py
python3 demo/openai_hidden_drift_demo.py
```

They are best treated as:

- lower-level verification scripts
- internal scenario runners

---

## 11. Current Demo Flow

Recommended video flow:

### Step 1: Start empty

Reset state:

```bash
source scripts/reset_demo_state.sh
```

Start dashboard:

```bash
cd dashboard/web
npm run dev
```

Open:

```text
http://localhost:3000/dashboard?project=openclaw-picnic-live
```

The dashboard should start empty.

### Step 2: Run the demo

In another terminal:

```bash
source scripts/load_dashboard_env.sh
python3 demo/openclaw_picnic_demo.py
```

### Step 3: Watch the sequence

The story should unfold like this:

1. healthy refund workflow
2. baseline traces arrive
3. policy update appears
4. current replay diverges
5. trajectory drift rises
6. output drift stays low
7. hidden drift is detected
8. review mode is enabled

---

## 12. What to Say in the Demo

The clearest framing is:

> DriftScope is a runtime safety layer for production agents. In this demo, I am showing a Picnic-style refund support workflow. A silent policy update changes the internal tool path without significantly changing the final customer answer. DriftScope detects that hidden drift and moves the workflow into protected mode before more customers are affected.

Recommended short explanation of the two key metrics:

- **Output Drift** = did the final answer change?
- **Trajectory Drift** = did the internal workflow path change?

Recommended explanation of hidden drift:

> Hidden drift means the answer still looks normal, but the way the agent got there has changed.

---

## 13. Current OpenClaw Status

There is now an OpenClaw plugin experiment in this repo:

- `openclaw-plugin/`
- `scripts/run_picnic_refund_replay.sh`

This work demonstrates:

- a real plugin entry
- a real OpenClaw load path
- a tool intended to trigger the refund replay

However, for the purposes of the current demo:

- the official OpenClaw runtime path is **not yet the most reliable public demo path**
- the **recommended recording path remains the Python live runner**

So the most accurate statement today is:

> DriftScope is designed to plug into OpenClaw-style workflows, and an OpenClaw plugin path exists in the repo, but the stable public demo uses the Python refund replay runner and live dashboard.

---

## 14. Current Strengths

What is already strong:

- the hidden drift concept is clear and defensible
- the refund scenario is realistic and easy to understand
- the dashboard shows trajectory drift separately from output drift
- the Live Run Timeline now reflects real replay progress
- the Observer Trace gives the product a strong runtime-safety feel
- the project tells a strong story about production agent trust

---

## 15. Current Limitations

Things that are still intentionally demo-level:

### 15.1 Email delivery

Owner notification depends on provider configuration.

If email delivery fails in demo:

- DriftScope still records the notification attempt
- the observer trace still proves that notification is part of the workflow

### 15.2 OpenClaw public path

An OpenClaw plugin exists, but the safest demo path is still not the official OpenClaw agent route.

### 15.3 Single-machine architecture

This repo is a local prototype:

- local SQLite
- local dashboard
- local scripts

It is intentionally not a cloud production deployment.

### 15.4 Demo-oriented refund worker

The refund workflow is packaged to make the replay deterministic and easy to film.

That is appropriate for a hackathon demo.

---

## 16. Submission Positioning

The best Track 1 framing is:

> DriftScope is a runtime safety layer for agentic systems. It observes live tool-call trajectories, detects hidden behavioral drift, and conditionally routes risky workflows into protected mode.

The safest business framing is:

> Picnic-style refund support workflow + observer layer for hidden drift detection.

The safest OpenClaw framing is:

> designed around an OpenClaw-style orchestration surface, with an experimental OpenClaw plugin path in the repo.

---

## 17. Final Product Summary

DriftScope is strongest when presented as:

- a production agent safety product
- a hidden-drift detector
- an observer layer that acts before customer issues escalate

The most important sentence in the entire project is:

> DriftScope does not just tell you whether your agent is alive. It tells you whether your agent is still behaving the way you intended.

