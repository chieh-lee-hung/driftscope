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
        <div className="lp-hero-badge">Unsupervised Behavioral Monitoring for AI Agents</div>
        <h1 className="lp-hero-title">
          Catch the behavior change
          <br />
          <span className="lp-hero-accent">before your users do.</span>
        </h1>
        <p className="lp-hero-sub">
          DriftScope monitors both output drift and trajectory drift so you can spot silent agent behavior changes
          that latency, cost, and error metrics will miss. Start from an empty agent workspace, run a built-in demo,
          and show real traces, real analysis, and a believable operator workflow.
        </p>
        <div className="lp-hero-cta">
          <a href="#scenarios" className="lp-btn-primary">Choose a demo agent</a>
          <Link href={DEMO_PROJECTS[0].dashboardPath} className="lp-btn-ghost">Open empty agent view</Link>
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
          </div>
        </div>
      </section>

      <section className="lp-problem" id="workflow">
        <div className="lp-section-inner">
          <p className="lp-section-super">How It Works</p>
          <h2 className="lp-section-title">The demo flow mirrors a real monitoring workflow</h2>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-body">
                <h3>Start from an empty agent</h3>
                <p>Each built-in agent starts with no traces and no charts. The dashboard tells you exactly which script to run next.</p>
                <code className="lp-code">/dashboard?project=&lt;agent&gt;</code>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-body">
                <h3>Run the agent script in terminal</h3>
                <p>The backend records baseline and current traces, computes drift analysis, and exports fresh dashboard data for the chosen agent.</p>
                <code className="lp-code">python3 demo/&lt;agent-demo&gt;.py</code>
              </div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-body">
                <h3>Refresh and inspect the evidence</h3>
                <p>Use one product surface to show healthy behavior, silent hidden drift, and trace-level evidence for what actually changed.</p>
                <code className="lp-code">stable agent vs drifted agent, same monitoring product</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-demos" id="scenarios">
        <div className="lp-section-inner">
          <p className="lp-section-super">Demo Agents</p>
          <h2 className="lp-section-title">Three agents, one product story</h2>
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
                  <p className="lp-demo-desc">{project.description}</p>
                  <div className="lp-demo-stats">
                    <span className="lp-demo-stat">
                      <span className="lp-stat-label">Expected classification</span>
                      <span className={`lp-stat-val ${project.outcome === "normal" ? "lp-val-ok" : "lp-val-warn"}`}>
                        {project.outcome === "normal" ? "Normal" : "Hidden Drift"}
                      </span>
                    </span>
                    <span className="lp-demo-stat">
                      <span className="lp-stat-label">Execution mode</span>
                      <span className="lp-stat-val">{project.mode === "openai" ? "real API" : "mock pipeline"}</span>
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
            <p className="lp-section-super">Why this works for a hackathon demo</p>
            <h2 className="lp-section-title lp-sdk-title">One product, three believable operating states</h2>
            <p className="lp-sdk-desc">
              The guided agent proves the operator workflow. The stable OpenAI agent proves the system stays calm when behavior is healthy.
              The drifted OpenAI agent proves DriftScope catches the subtle hidden drift that ordinary observability misses.
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
