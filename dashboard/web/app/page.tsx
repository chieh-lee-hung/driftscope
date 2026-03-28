import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { DEMO_PROJECTS } from "@/lib/demo-projects";

type ProjectStatus = {
  hasData: boolean;
  updatedAt: string | null;
};

export default async function LandingPage() {
  const primaryDemo = DEMO_PROJECTS.find((project) => project.mode === "openai") ?? DEMO_PROJECTS[0];
  const statuses = await Promise.all(
    DEMO_PROJECTS.map(async (project) => [project.id, await getProjectStatus(project.id)] as const)
  );
  const statusMap = Object.fromEntries(statuses);

  return (
    <div className="lp-root">
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <span className="lp-nav-icon">◎</span>
          <span className="lp-nav-name">DriftScope</span>
        </div>
        <div className="lp-nav-links">
          <a href="#scenarios" className="lp-nav-link">Live Demo</a>
          <a href="#architecture" className="lp-nav-link">Architecture</a>
          <Link href={primaryDemo.dashboardPath} className="lp-btn-sm">
            Open Observer →
          </Link>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-badge">OpenClaw MCP Plugin · Behavioral Drift Detection for Agentic Systems</div>
        <h1 className="lp-hero-title">
          OpenClaw builds the agent.
          <br />
          <span className="lp-hero-accent">DriftScope keeps it honest.</span>
        </h1>
        <p className="lp-hero-sub">
          Drop DriftScope into any OpenClaw workflow via its MCP plugin interface. It hooks into OpenClaw&apos;s tool call events, tracks behavioral trajectories, and triggers conditional branching when the agent silently starts reasoning differently — before your users notice.
        </p>
        <div className="lp-hero-cta">
          <a href="#scenarios" className="lp-btn-primary">See the live refund demo →</a>
          <Link href={primaryDemo.dashboardPath} className="lp-btn-ghost">Open Observer Console</Link>
        </div>

        <div className="lp-observer-strip">
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">Your OpenClaw Agent</span>
            <h3>Picnic Support Agent</h3>
            <p>Handles customer refund queries. Runs tools via OpenClaw&apos;s orchestration and routing layer.</p>
          </div>
          <div className="lp-observer-arrow">→</div>
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">DriftScope MCP Plugin</span>
            <h3>Hooks into tool_result events</h3>
            <p>Every tool call is intercepted via OpenClaw&apos;s hook system. Trajectories are embedded and compared with MMD.</p>
          </div>
          <div className="lp-observer-arrow">→</div>
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">Conditional Branch</span>
            <h3>Observer acts</h3>
            <p>No drift → continue. Hidden drift detected → gate refunds, notify the owner, and switch the workflow into protected mode.</p>
          </div>
        </div>

        <div className="lp-terminal">
          <div className="lp-terminal-bar">
            <span className="lp-dot lp-dot-red" />
            <span className="lp-dot lp-dot-yellow" />
            <span className="lp-dot lp-dot-green" />
            <span className="lp-terminal-title">Picnic support agent · OpenClaw + DriftScope MCP plugin</span>
          </div>
          <div className="lp-terminal-body">
            <div className="lp-tl lp-tl-dim">── Picnic policy update deployed (no code change)</div>
            <div className="lp-tl lp-tl-ok">baseline  search_policy → check_order → process_refund  ✓ 3 steps</div>
            <div className="lp-tl lp-tl-drift">current   search_policy → check_order → check_seller_type → verify_photo → process_refund  ! 5 steps</div>
            <div className="lp-tl lp-tl-result">Trajectory Drift : <span className="lp-tl-hl">0.58</span> — above threshold 0.40</div>
            <div className="lp-tl lp-tl-result">Output Drift     : 0.00 — customer answers identical</div>
            <div className="lp-tl lp-tl-result">Classification   : <span className="lp-tl-hl">Hidden Drift</span></div>
            <div className="lp-tl lp-tl-event">Observer → conditional branch → Refunds gated · human review required</div>
          </div>
        </div>
      </section>

      <section className="lp-demos" id="scenarios">
        <div className="lp-section-inner">
          <p className="lp-section-super">Picnic Support Agent · Guided + live production replay</p>
          <h2 className="lp-section-title">Start with the walkthrough, then watch the same live refund agent drift.</h2>
          <div className="lp-demo-grid lp-demo-grid-3">
            {DEMO_PROJECTS.map((project) => {
              const status = statusMap[project.id];
              const readyLabel = status.hasData ? "Agent data ready" : "No traces yet";
              const updatedLabel = status.updatedAt
                ? new Date(status.updatedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Run the script to generate traces";

              return (
                <div
                  key={project.id}
                  className={`lp-demo-card ${
                    project.outcome === "hidden"
                      ? "lp-demo-card-drift"
                      : project.mode === "openai"
                        ? "lp-demo-card-highlight"
                        : ""
                  }`}
                >
                  <div className="lp-demo-header">
                    <div
                    className={`lp-demo-dot ${
                        project.outcome === "hidden"
                          ? "lp-dot-orange"
                          : project.mode === "openai"
                            ? "lp-dot-blue"
                            : "lp-dot-green"
                      }`}
                    />
                    <span className="lp-demo-tag">
                      {project.mode === "openai" ? "Real OpenAI agent" : "Simulated agent"} · {readyLabel}
                    </span>
                  </div>
                  <h3 className="lp-demo-title">{project.label}</h3>
                  <p className="lp-demo-tagline">{project.tagline}</p>
                  <p className="lp-demo-desc">{project.description}</p>
                  <div className="lp-demo-stats">
                    <span className="lp-demo-stat">
                      <span className="lp-stat-label">Expected classification</span>
                      <span className={`lp-stat-val ${project.outcome === "normal" ? "lp-val-ok" : "lp-val-warn"}`}>
                        {project.outcome === "normal" ? "Normal" : project.mode === "openai" ? "Normal → Hidden Drift" : "Hidden Drift"}
                      </span>
                    </span>
                    <span className="lp-demo-stat">
                      <span className="lp-stat-label">Observer action</span>
                      <span className={`lp-stat-val ${project.outcome === "hidden" ? "lp-val-warn" : ""}`}>
                        {project.outcome === "normal" ? "Monitoring only" : "Refunds gated — human review"}
                      </span>
                    </span>
                    <span className="lp-demo-stat">
                      <span className="lp-stat-label">Last update</span>
                      <span className="lp-stat-val">{updatedLabel}</span>
                    </span>
                  </div>
                  <div className="lp-demo-footer" style={{ display: "block" }}>
                    <code className="lp-demo-cmd" style={{ display: "block", marginBottom: 12 }}>{project.command}</code>
                    {project.followupCommand ? (
                      <code className="lp-demo-cmd" style={{ display: "block", marginBottom: 12 }}>
                        then {project.followupCommand}
                      </code>
                    ) : null}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link href={project.dashboardPath} className="lp-btn-primary lp-btn-sm2">
                        Open Agent →
                      </Link>
                      {project.requiresOpenAI ? (
                        <span className="lp-btn-ghost lp-btn-sm2" style={{ pointerEvents: "none" }}>
                          needs OPENAI_API_KEY
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="lp-demo-inner-divider" />
                  <div className="lp-code-block" style={{ marginTop: 0 }}>
                    <div className="lp-code-bar">
                      <span className="lp-code-filename">Expected trace path</span>
                    </div>
                    <pre className="lp-code-pre" style={{ minHeight: 150 }}>
                      {project.terminalPreview.join("\n")}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-sdk" id="architecture">
        <div className="lp-section-inner lp-sdk-inner">
          <div className="lp-sdk-text">
            <p className="lp-section-super">MCP Plugin · 3 lines to add to any OpenClaw agent</p>
            <h2 className="lp-section-title lp-sdk-title">Plug in. OpenClaw does the rest.</h2>
            <p className="lp-sdk-desc">
              <code>OpenClawInterceptor</code> hooks into OpenClaw&apos;s tool call routing layer. Every <code>tool_result</code> event is captured automatically — no changes to your agent logic, no extra latency. DriftScope runs MMD-based drift detection in the background and triggers conditional branching when behavior shifts.
            </p>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, fontSize: "0.82rem", color: "#a1a1aa" }}>
              <span>✓ Works with any OpenClaw workflow</span>
              <span>✓ Zero changes to agent code</span>
              <span>✓ Conditional branch: continue / protect / escalate</span>
            </div>
            <Link href={primaryDemo.dashboardPath} className="lp-btn-primary" style={{ display: "inline-block", marginTop: 24 }}>
              Open Observer Console →
            </Link>
          </div>
          <div className="lp-sdk-code">
            <div className="lp-code-block">
              <div className="lp-code-bar">
                <span className="lp-code-filename">picnic_agent_with_driftscope.py</span>
              </div>
              <pre className="lp-code-pre">{`from driftscope import DriftScope
from driftscope.integrations.openclaw import OpenClawInterceptor

ds = DriftScope(project="picnic-support")
oc = OpenClawInterceptor(ds)  # hooks into OpenClaw tool_result events

# Your existing OpenClaw agent — unchanged
@oc.trace_agent
def run_agent(user_message: str) -> str:
    ...

# Your existing tools — DriftScope records every call
@oc.tool("search_policy")
def search_policy(query: str) -> str: ...

@oc.tool("check_order")
def check_order(order_id: str) -> str: ...

@oc.tool("process_refund")
def process_refund(order_id: str) -> str: ...

# When trajectory drift > 0.40:
# → Observer triggers conditional branch
# → runtime_action: "Refunds gated — human review required"`}</pre>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-nav-icon">◎</span>
            <span>DriftScope</span>
            <span className="lp-footer-version">v0.6 · hackathon demo</span>
          </div>
          <p className="lp-footer-copy">OpenClaw builds the agent. DriftScope keeps it honest.</p>
        </div>
      </footer>
    </div>
  );
}

async function getProjectStatus(projectId: string): Promise<ProjectStatus> {
  const analysisPath = path.join(process.cwd(), "public", "data", projectId, "analysis.json");
  try {
    const stat = await fs.stat(analysisPath);
    return {
      hasData: true,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {
      hasData: false,
      updatedAt: null,
    };
  }
}
