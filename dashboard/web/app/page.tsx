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
          <a href="#scenarios" className="lp-nav-link">Demo Agents</a>
          <a href="#workflow" className="lp-nav-link">How it works</a>
          <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-sm">
            Open Demo Console →
          </Link>
        </div>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-badge">Runtime Safety Layer for Agentic Systems</div>
        <h1 className="lp-hero-title">
          Detect silent agent drift
          <br />
          <span className="lp-hero-accent">before it reaches customers.</span>
        </h1>
        <p className="lp-hero-sub">
          DriftScope acts as an observer agent for production agents. It watches live tool trajectories, separates
          hidden behavioral drift from normal input change, and triggers runtime protection when a support agent quietly
          stops behaving the way you intended.
        </p>
        <div className="lp-hero-cta">
          <a href="#scenarios" className="lp-btn-primary">Choose a demo agent</a>
          <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-ghost">Open empty agent view</Link>
        </div>

        <div className="lp-observer-strip">
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">1. Observe</span>
            <h3>Capture live tool paths</h3>
            <p>Intercept tool calls and build a trajectory for every production query.</p>
          </div>
          <div className="lp-observer-arrow">→</div>
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">2. Detect</span>
            <h3>Spot hidden drift</h3>
            <p>Compare current behavior to baseline and catch silent path changes.</p>
          </div>
          <div className="lp-observer-arrow">→</div>
          <div className="lp-observer-card">
            <span className="lp-observer-kicker">3. Act</span>
            <h3>Trigger protection</h3>
            <p>Escalate, gate, or route risky workflows before silent failures spread.</p>
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

      <section className="lp-problem" id="workflow">
        <div className="lp-section-inner">
          <p className="lp-section-super">How It Works</p>
          <h2 className="lp-section-title">The demo flow mirrors a real runtime control loop</h2>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-body">
                <h3>Start from an empty agent workspace</h3>
                <p>Each demo agent starts with no traces and no analysis. The UI tells you which script to run so the observer layer can begin recording behavior.</p>
                <code className="lp-code">/dashboard?project=&lt;agent&gt;</code>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-body">
                <h3>Run the production agent twice</h3>
                <p>The pipeline records baseline and current trajectories, computes drift, and exports runtime evidence for the chosen agent scenario.</p>
                <code className="lp-code">python3 demo/&lt;agent-demo&gt;.py</code>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-body">
                <h3>Inspect evidence and runtime action</h3>
                <p>Use one surface to show healthy behavior, hidden drift, and the observer decision that gates or escalates risky workflows.</p>
                <code className="lp-code">observe → detect → branch into safe mode</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-demos" id="scenarios">
        <div className="lp-section-inner">
          <p className="lp-section-super">Demo Agents</p>
          <h2 className="lp-section-title">Three runtime states, one observer system</h2>
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
                      <span className="lp-stat-val">
                        {project.outcome === "normal" ? "Monitor only" : "Review mode"}
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

      <section className="lp-sdk">
        <div className="lp-section-inner lp-sdk-inner">
          <div className="lp-sdk-text">
            <p className="lp-section-super">Why this fits Track 1</p>
            <h2 className="lp-section-title lp-sdk-title">A production agent plus an observer agent</h2>
            <p className="lp-sdk-desc">
              DriftScope is not just a dashboard. It acts like an observer agent layered on top of a production support agent:
              it captures tool routes, detects hidden drift, and conditionally triggers protection when behavior changes silently.
              That is the agentic control loop we want to show.
            </p>
            <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-primary" style={{ display: "inline-block", marginTop: 20 }}>
              Start with the guided agent →
            </Link>
          </div>
          <div className="lp-sdk-code">
            <div className="lp-code-block">
              <div className="lp-code-bar">
                <span className="lp-code-filename">driftscope.py</span>
              </div>
              <pre className="lp-code-pre">{`from driftscope import DriftScope

ds = DriftScope(project="my-real-agent")

@ds.trace
def run_agent(query: str) -> str:
    result = agent.run(query)
    return result

# inside your tools
ds.record_tool_call("search_kb", {"query": query}, kb_result)`}</pre>
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
          <p className="lp-footer-copy">Monitor how agents answer and how they got there.</p>
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
