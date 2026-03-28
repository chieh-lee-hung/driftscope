# DriftScope Demo Narrative — Hackaway Amsterdam 2026

**Pitch:** "OpenClaw builds the agent. DriftScope keeps it honest."
**Time:** ~3 min demo (fits inside a 5-min slot)

---

## Part 1 — Show the Code (30 sec) · "This is a real plugin"

Open `driftscope/integrations/openclaw.py` in your editor.

**Say:**
> "DriftScope ships as an OpenClaw plugin. Three lines and your agent is monitored.
> This is the interceptor — `OpenClawInterceptor`. It hooks into tool_result events,
> the same hook OpenClaw uses for its own middleware. Two decorators:
> `@oc.trace_agent` wraps the agent entrypoint, `@oc.tool(...)` wraps each tool.
> That's the entire integration surface."

Point to:
- `class OpenClawInterceptor` — the real class
- `def trace_agent(self, func)` — hooks the agent
- `def tool(self, name)` — hooks each tool, calls `ds.record_tool_call` after every result

---

## Part 2 — Run It Live (90 sec) · "Watch it intercept right now"

```bash
python3 demo/openclaw_live_quick.py
```

**While it runs, narrate:**
> "Now I'll actually run it. No mock, no fake output — the interceptor is live.
> Three Picnic refund queries, three tool_result events each."

**As `⚡ tool_result → search_policy` appears:**
> "There — tool_result event fired. DriftScope intercepted it, logged the result,
> embedded it. That's the plugin working."

**When it finishes:**
> "Nine events captured, trajectory fingerprinted, embeddings stored.
> The observer now has a behavioral signature for this agent."

**Then:**
> "A full drift analysis needs 12 queries across two phases — takes a couple minutes.
> I've already run that. Here's what it looks like when complete."

---

## Part 3 — Show the Dashboard (60 sec) · "Here's what drift looks like"

Open: **http://localhost:3000**
Select: **"Picnic Support — Guided"** (always pre-loaded, no key needed)

**Say:**
> "This is a Picnic support agent — handles refund requests.
> A PM updated the refund policy. No code change, no deployment.
> LangSmith stayed green — customer answers were identical."

Point to the **four-quadrant chart**:
> "Output drift: zero. Customers got the same answers.
> But trajectory drift: 0.58. The agent started calling two extra tools —
> `check_seller_type`, `verify_photo_evidence` — on every single request."

Point to the **Observer banner** (orange / protected):
> "DriftScope's observer caught it. Conditional branch triggered.
> Runtime action: refunds gated, human review required.
> The production agent is now protected — automatically."

**Closing line:**
> "That's the OpenClaw plugin model: your agent runs, DriftScope watches.
> When behavior shifts — even silently — the observer acts."

---

## If asked about Track 1 (Multi-agent / Conditional Branching)

> "This is a two-agent system. Agent one: Picnic support — production agent,
> answers customers. Agent two: DriftScope observer — monitors tool trajectories.
> The observer has a conditional branch: normal behavior → pass through.
> Drift detected → gate refunds, require human review.
> That's exactly the architecture Track 1 describes."

---

## Quick Reference

| Step | Command / URL | Time |
|------|--------------|------|
| Show plugin code | Open `driftscope/integrations/openclaw.py` | 30 sec |
| Run live demo | `python3 demo/openclaw_live_quick.py` | ~8 sec |
| Show dashboard | `http://localhost:3000` → Picnic Support — Guided | 60 sec |

**Backup if live script fails:** Skip to Part 3 directly. The pre-loaded data always works.
