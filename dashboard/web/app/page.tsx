import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { DEMO_PROJECTS } from "@/lib/demo-projects";

type ProjectStatus = {
  hasData: boolean;
  updatedAt: string | null;
};

export default async function LandingPage() {
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
          <a href="#scenarios" className="lp-nav-link">Picnic Demo</a>
          <a href="#architecture" className="lp-nav-link">Architecture</a>
          <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-sm">
            Open Observer →
          </Link>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-badge">Track 1 · Agentic Systems · OpenClaw Integration</div>
        <h1 className="lp-hero-title">
          Agents that watch agents.
          <br />
          <span className="lp-hero-accent">And act when they drift.</span>
        </h1>
        <p className="lp-hero-sub">
          DriftScope is a two-agent system: a Picnic support agent handles customer queries, and an observer agent watches its tool-call trajectory in real time. When the observer detects silent behavioral drift, it triggers conditional branching — gating refunds, escalating to review, or switching to safe mode.
        </p>
        <div className="lp-hero-cta">
          <a href="#scenarios" className="lp-btn-primary">See the Picnic demo →</a>
          <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-ghost">Open Observer Console</Link>
        </div>

        <div className="lp-observer-strip">
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">Production Agent</span>
            <h3>Picnic Support Agent</h3>
            <p>Handles customer refund queries using Picnic&apos;s policy, order, and verification tools.</p>
          </div>
          <div className="lp-observer-arrow">→</div>
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">Observer Agent</span>
            <h3>DriftScope Monitor</h3>
            <p>Intercepts every tool call, embeds trajectories, and runs MMD to detect hidden behavioral drift.</p>
          </div>
          <div className="lp-observer-arrow">→</div>
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">Conditional Branch</span>
            <h3>Runtime Decision</h3>
            <p>Drift low → continue. Drift detected → gate refunds, escalate, or switch to protected mode.</p>
          </div>
        </div>

        <div className="lp-terminal">
          <div className="lp-terminal-bar">
            <span className="lp-dot lp-dot-red" />
            <span className="lp-dot lp-dot-yellow" />
            <span className="lp-dot lp-dot-green" />
            <span className="lp-terminal-title">python3 demo/openai_hidden_drift_demo.py</span>
          </div>
          <div className="lp-terminal-body">
            <div className="lp-tl lp-tl-dim">── Phase 1 — Baseline with GPT-4o-mini</div>
            <div className="lp-tl lp-tl-ok">01 ✓ ███░░░ search_policy → check_order → process_refund</div>
            <div className="lp-tl lp-tl-dim">── Policy updated, no code deploy</div>
            <div className="lp-tl lp-tl-drift">02 ! █████░ search_policy → check_order → check_seller_type → verify_photo_evidence → process_refund</div>
            <div className="lp-tl lp-tl-result">Trajectory Drift : <span className="lp-tl-hl">0.62</span> ↑ above threshold</div>
            <div className="lp-tl lp-tl-result">Output Drift : 0.01 ✓ still normal</div>
            <div className="lp-tl lp-tl-result">Classification : <span className="lp-tl-hl">Hidden Drift</span></div>
            <div className="lp-tl lp-tl-event">Observer action : route refunds to review mode</div>
          </div>
        </div>
      </section>

      <section className="lp-demos" id="scenarios">
        <div className="lp-section-inner">
          <p className="lp-section-super">Picnic Support Agent · Three runtime states</p>
          <h2 className="lp-section-title">Same agent. Three scenarios. One observer decides.</h2>
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
                        {project.outcome === "normal" ? "Normal" : "Hidden Drift"}
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
            <p className="lp-section-super">OpenClaw Integration · Multi-Agent Architecture</p>
            <h2 className="lp-section-title lp-sdk-title">Wire any agent with DriftScope via OpenClaw</h2>
            <p className="lp-sdk-desc">
              Use <code>OpenClawInterceptor</code> to attach the observer to your OpenClaw agent in 3 lines. Every tool call is routed through DriftScope automatically — no changes to agent logic. When drift exceeds the threshold, the observer triggers conditional branching: normal flow, protected mode, or escalation.
            </p>
            <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-primary" style={{ display: "inline-block", marginTop: 20 }}>
              Open Observer Console →
            </Link>
          </div>
          <div className="lp-sdk-code">
            <div className="lp-code-block">
              <div className="lp-code-bar">
                <span className="lp-code-filename">openclaw_integration.py</span>
              </div>
              <pre className="lp-code-pre">{`from driftscope import DriftScope
from driftscope.integrations.openclaw import OpenClawInterceptor

# 1. Attach observer to your OpenClaw project
ds = DriftScope(project="picnic-support")
oc = OpenClawInterceptor(ds)

# 2. Wrap the agent entrypoint
@oc.trace_agent
def run_agent(user_message: str) -> str:
    ...

# 3. Wrap each tool — trajectories recorded automatically
@oc.tool("search_policy")
def search_policy(query: str) -> str:
    ...

# Observer detects path change → triggers runtime action
# drift detected → "Refunds gated — human review required"`}</pre>
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
          <p className="lp-footer-copy">Two agents. One detects. One protects.</p>
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
