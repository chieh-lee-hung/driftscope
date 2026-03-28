# DriftScope — Pitch & Q&A Guide
## Hackaway Amsterdam 2026 · Track 1: Agentic Systems

---

## 一句話 Pitch

> **DriftScope is a runtime safety layer that watches AI agent behavior from the inside — not the output, the trajectory.**

---

## 90 秒 Pitch 逐字稿（英文）

> Today I'm showing DriftScope — a runtime safety layer for production AI agents.
>
> The scenario is a Picnic refund support agent, designed to integrate with OpenClaw-style orchestration.
>
> Here's the problem it solves: when you deploy an agent, you monitor the outputs. But outputs can look completely fine even when the agent's internal behavior has fundamentally changed. We call this hidden drift.
>
> [指 dashboard] Here's what it looks like. Trajectory drift: 0.58. Output drift: near zero. The agent is internally routing every refund request through two extra verification steps — `check_seller_type` and `verify_photo_evidence` — that were never part of the original workflow. The customer still gets approved. LangSmith stays green. But the agent is doing something completely different.
>
> DriftScope catches this. It measures tool-call trajectories using Maximum Mean Discrepancy — the same mathematical signal used in domain adaptation research. When drift is detected, the observer branches: it switches the workflow into protected mode, gates autonomous refunds, creates a Notion task, and notifies the owner by email. That's a full conditional branch, triggered by trajectory signal.
>
> The integration is a real OpenClaw plugin — `definePluginEntry` and `api.registerTool`. Three lines of instrumentation in your agent. The observer does the rest.
>
> That's DriftScope. When your agent quietly stops behaving the way you intended — we catch it before it becomes a customer problem.

---

## 90 秒 Pitch 逐字稿（中文）

> 我今天 demo 的是 DriftScope — 一個給 production AI agents 用的 runtime safety layer。
>
> 情境是 Picnic 退款客服 agent，整個 workflow 是朝 OpenClaw-style orchestration 整合方式設計的。
>
> 它解決的問題是：你部署 agent 之後，你在監控 outputs。但 outputs 看起來完全正常，不代表 agent 的內部行為沒有根本性地改變。我們叫這個 hidden drift。
>
> [指 dashboard] 這就是它長什麼樣。Trajectory drift: 0.58。Output drift: 接近零。Agent 已經在每一個退款請求裡多走了兩個額外的 verification step — check_seller_type 跟 verify_photo_evidence — 但這兩個 step 從來不在原本的 workflow 裡。客戶還是拿到退款。LangSmith 還是綠的。但 agent 已經在做完全不一樣的事。
>
> DriftScope 抓住了這件事。它用 Maximum Mean Discrepancy 測量 tool-call trajectories。當 drift 被偵測到，observer 觸發 conditional branch：把 workflow 切進 protected mode、擋住自動退款、建立 Notion task、寄 email 通知 owner。這是一個完整的 conditional branch，由 trajectory signal 觸發的。
>
> 整合方式是一個真正的 OpenClaw plugin — definePluginEntry 跟 api.registerTool。你的 agent 裡面三行 instrumentation。Observer 做完剩下的事。
>
> 這就是 DriftScope。當你的 agent 悄悄不再照你原本預期的方式行為 — 我們在它變成客戶問題之前就抓住它。

---

## 核心概念速查表

| 概念 | 你講的話 |
|------|---------|
| Hidden drift | Output 沒變，trajectory 變了。LangSmith 看的是 output，我們看的是路徑。 |
| Trajectory | Agent 在回答一個問題的過程中，按順序 call 了哪些 tool，這個順序就是 trajectory。 |
| MMD | Maximum Mean Discrepancy。把 trajectory 轉成 embedding，然後測量兩個分布之間的距離。是 domain adaptation 常用的方法。 |
| Observer agent | DriftScope 本身有自己的 decision logic：drift < 0.3 → pass through；drift ≥ 0.3 → conditional branch。所以它是 agent，不只是 monitoring tool。 |
| Conditional branch | Drift 觸發之後，系統自動：1) 切 protected mode，2) 建 Notion task，3) 寄 email。不需要人工介入。 |
| OpenClaw plugin | `definePluginEntry` + `api.registerTool`。官方 plugin SDK 的真實用法。 |

---

## Q&A 準備

---

### Track 1 相關

**Q: "How is this multi-agent? I only see one agent running."**

> There are two agents. Agent one is the Picnic support agent — it handles customer refunds. Agent two is DriftScope's observer — it runs alongside the production agent, monitors tool-call trajectories, and makes its own decisions. The observer has its own conditional branching logic: if trajectories stay within baseline, it passes through silently. If drift exceeds the threshold, it switches to protected mode and triggers downstream actions. Two agents, independent decision loops, one conditional branch between them.

**Q: "Where exactly is the conditional branching?"**

> It's in the observer. After each run, DriftScope computes trajectory drift using MMD. That number gets classified: Normal / Input Drift / Hidden Drift / Severe. The classification drives a branch: Normal → monitoring only, no intervention. Hidden Drift → protected mode, refunds gated, Notion task created, email sent. The branch is automatic and recorded in the observer trace.

**Q: "Is DriftScope actually an agent, or just a monitoring tool?"**

> It's an observer agent. A monitoring tool is passive — it records and alerts. An observer agent has its own reasoning loop and acts autonomously. DriftScope computes drift, classifies behavior, makes a runtime decision, and executes actions. In this demo it creates a Notion task and sends an email without any human trigger. That's autonomous action, not passive monitoring.

**Q: "What does OpenClaw do in this architecture?"**

> OpenClaw is the outer runtime host and orchestration layer. The `run_picnic_refund_replay` tool is registered as a real OpenClaw plugin using `definePluginEntry` and `api.registerTool` from the official plugin SDK. When the OpenClaw agent receives the instruction, it routes the call through its gateway to our plugin. The plugin triggers the Python refund worker, DriftScope observes the resulting traces, and returns a structured summary back to the OpenClaw session. So OpenClaw orchestrates the outer session; DriftScope observes the inner trajectory.

---

### Technical 相關

**Q: "What is MMD and why use it for drift detection?"**

> MMD — Maximum Mean Discrepancy — is a statistical test that measures the distance between two distributions without assuming a specific distribution shape. We embed each tool-call trajectory as a vector, then compare the distribution of baseline embeddings versus current embeddings. If the distributions have shifted, MMD gives us a non-zero score. It's the same method used in domain adaptation in ML research — it's mathematically well-founded and doesn't require labeled data or predefined rules.

**Q: "How is this different from LangSmith or Langfuse?"**

> LangSmith traces outputs and latency. It will tell you if your agent's final answer changed, or if it crashed. It cannot tell you if the agent is taking a completely different internal path to get to the same answer. That's the gap. DriftScope watches trajectories — the sequence of tool calls — not outputs. Hidden drift is exactly the scenario where output-only monitoring fails: same answer, different behavior, different risk profile, different cost. That's what we detect.

**Q: "What's the false positive rate? Can this fire incorrectly?"**

> There's a threshold — currently 0.3 — below which we don't alert. Normal variance in tool call sequences (e.g. slight reordering) won't cross that threshold. We also require a minimum sample size before running analysis. In practice, the signal we're looking for — entirely new tools appearing, or a systematic change in path length across all queries — is a strong signal with low false positive rates. You can also tune the threshold per project.

**Q: "What's the instrumentation overhead?"**

> The instrumentation is two decorators: `@oc.trace_agent` on the agent entry point, `@oc.tool(name)` on each tool function. That's it. The recording is synchronous and local — tool calls write to a local SQLite database. The analysis runs offline after the run, not in the hot path. So latency impact on production requests is negligible.

---

### Business 相關

**Q: "Why Picnic?"**

> Picnic is a great scenario because it's a real-world case where silent policy changes are likely. E-commerce platforms update refund policies frequently. When a policy changes, the agent's knowledge base changes, and it starts taking different internal paths — but customer-facing answers stay similar. That's exactly when hidden drift is most dangerous: the system looks healthy, but the agent is behaving in ways you haven't validated. Picnic also happens to be one of the tracks at this hackathon, which made it a natural fit.

**Q: "Does this require changing my existing agent code?"**

> Three lines. You add `@oc.trace_agent` to your agent entry point and `@oc.tool(name)` to each tool function. That's the full instrumentation. The OpenClaw plugin takes care of everything else. No changes to your agent logic, no changes to your prompts, no changes to your infrastructure.

**Q: "Can this work in real-time, not just in replay?"**

> Yes. The demo uses a replay to make the story clear and reproducible. But DriftScope can run continuously in production: as new trajectories come in, they're compared against a rolling baseline. When drift exceeds the threshold, the branch fires. The dashboard already has an auto-refresh mode that polls for new data. The architecture supports streaming — it's just a design choice to use batch analysis in the demo for clarity.

---

### Honest framing 相關

**Q: "Is this running on the official OpenClaw runtime right now?"**

> The plugin is registered using the official OpenClaw plugin SDK — `definePluginEntry` and `api.registerTool`. When triggered through the OpenClaw agent, OpenClaw routes the call through its gateway to our plugin. The Python refund worker that DriftScope monitors is invoked by the plugin. So OpenClaw is genuinely in the outer orchestration path. What we haven't done is rewrite the refund agent's internal tool calls as native OpenClaw-embedded tools — that would be the next step for a full production integration.

**Q: "How mature is this? Is it production-ready?"**

> The core algorithm — MMD on trajectory embeddings — is solid and mathematically grounded. The Python SDK, SQLite storage, and dashboard are functional for the demo. For production, you'd want to replace SQLite with a time-series store, add proper authentication, and handle higher throughput. This is a hackathon prototype that demonstrates the key technical concept. The algorithm works; the production hardening is the remaining work.

---

## 最後一句備用 (如果評審追問 OpenClaw)

> The honest framing is: DriftScope is designed as an observer plugin for OpenClaw-style orchestration. The plugin manifest, the `definePluginEntry` registration, and the `api.registerTool` call are all using the real OpenClaw plugin SDK. OpenClaw routes the outer session. DriftScope observes the inner trajectory. That's the architecture.

---

## 開場最穩的兩句話

EN: **"This is DriftScope — a runtime safety layer for production AI agents. It catches hidden drift: when your agent quietly changes internal behavior without changing its output."**

ZH: **「這是 DriftScope，一個給 production AI agents 用的 runtime safety layer。它抓的是 hidden drift：agent 悄悄改變了內部行為，但 output 表面上看起來還是正常的。」**
