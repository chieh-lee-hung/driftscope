# DriftScope OpenClaw Demo Plugin

This is the thinnest possible native OpenClaw plugin for the hackathon demo.

What it does:

- registers a real OpenClaw agent tool: `run_picnic_refund_replay`
- calls the existing Python worker that already powers the DriftScope dashboard
- keeps the current dashboard, traces, and email flow unchanged

That means the architecture becomes:

```text
OpenClaw runtime
  -> run_picnic_refund_replay tool
  -> Python refund replay worker
  -> DriftScope observer + dashboard
```

## Tool modes

- `healthy`
  - runs the same Picnic refund workflow twice without a policy change
  - dashboard ends in a normal state
- `policy_changed`
  - replays the same refund workload after the refund policy changes
  - dashboard ends in hidden drift / protected mode

## Install

Install OpenClaw first, then from the repo root:

```bash
openclaw plugins install ./openclaw-plugin
openclaw plugins enable driftscope-openclaw-demo
```

Restart the OpenClaw gateway after enabling the plugin.

## Allow the tool

Enable the tool for the agent you will use in the demo:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": ["run_picnic_refund_replay"]
        }
      }
    ]
  }
}
```

## Demo flow

1. Keep the DriftScope dashboard open at:

   `http://localhost:3000/dashboard?project=openclaw-picnic-live`

2. In OpenClaw, trigger:

   `run_picnic_refund_replay(mode="healthy")`

3. Show that the workflow stays normal.

4. Then trigger:

   `run_picnic_refund_replay(mode="policy_changed")`

5. Show hidden drift, protected mode, and observer actions.

## Honest framing

This plugin makes OpenClaw the real outer runtime host.

- OpenClaw orchestrates the tool call
- the Python worker executes the refund replay
- DriftScope observes the resulting traces and acts on drift

So the most accurate pitch is:

> OpenClaw runs the outer agent session and routes the refund replay tool.  
> DriftScope observes the resulting tool-call trajectories and intervenes when behavior drifts.
