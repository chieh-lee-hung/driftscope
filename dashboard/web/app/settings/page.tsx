import Sidebar from "@/app/components/sidebar";
import { DEFAULT_PROJECT_ID, getDemoProject } from "@/lib/demo-projects";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const project =
    (Array.isArray(sp.project) ? sp.project[0] : sp.project) ?? DEFAULT_PROJECT_ID;

  const { analysis } = await loadDashboardData({ project });
  const demoProject = getDemoProject(project);
  const projectName = analysis.project || demoProject.id;

  return (
    <div className="app-shell">
      <Sidebar activeProject={projectName} shouldAlert={analysis.should_alert} />

      <main className="main-area">
        <div className="main-header">
          <div className="main-header-left">
            <nav className="breadcrumb">
              <span className="bc-item">DriftScope</span>
              <span className="bc-sep">/</span>
              <span className="bc-item">{projectName}</span>
              <span className="bc-sep">/</span>
              <span className="bc-item bc-active">Settings</span>
            </nav>
          </div>
        </div>

        <div className="page-inner">
          <div className="section-divider" style={{ marginTop: 0 }}>
            <span className="section-label">OpenClaw Integration</span>
          </div>

          <div className="panel" style={{ borderLeft: "3px solid var(--orange)" }}>
            <div className="panel-header">
              <p className="panel-super" style={{ color: "var(--orange)" }}>OpenClaw · Native Integration</p>
              <p className="panel-title">Wire DriftScope into your OpenClaw agent in 3 lines</p>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Use <code style={{ background: "var(--bg)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>OpenClawInterceptor</code> to wrap your agent entrypoint and individual tool functions. DriftScope automatically captures every tool call trajectory and computes behavioral drift — no manual instrumentation needed.
            </p>
            <div className="code-block">
              <pre>
                <span className="code-keyword">from</span> <span className="code-fn">driftscope</span> <span className="code-keyword">import</span> <span className="code-fn">DriftScope</span>{"\n"}
                <span className="code-keyword">from</span> <span className="code-fn">driftscope.integrations.openclaw</span> <span className="code-keyword">import</span> <span className="code-fn">OpenClawInterceptor</span>{"\n\n"}
                <span className="code-comment"># 1. Attach observer to your OpenClaw project</span>{"\n"}
                <span className="code-fn">ds</span> = <span className="code-fn">DriftScope</span>(<span className="code-str">project=&quot;{projectName}&quot;</span>){"\n"}
                <span className="code-fn">oc</span> = <span className="code-fn">OpenClawInterceptor</span>(<span className="code-fn">ds</span>){"\n\n"}
                <span className="code-comment"># 2. Wrap the agent entrypoint — DriftScope traces the full run</span>{"\n"}
                <span className="code-keyword">@</span><span className="code-fn">oc.trace_agent</span>{"\n"}
                <span className="code-keyword">def </span><span className="code-fn">run_agent</span>(user_message: str) -{">"} str:{"\n"}
                {"    "}<span className="code-comment">...</span>{"\n\n"}
                <span className="code-comment"># 3. Wrap each tool — trajectories are recorded automatically</span>{"\n"}
                <span className="code-keyword">@</span><span className="code-fn">oc.tool</span>(<span className="code-str">&quot;search_policy&quot;</span>){"\n"}
                <span className="code-keyword">def </span><span className="code-fn">search_policy</span>(query: str) -{">"} str:{"\n"}
                {"    "}<span className="code-comment">...</span>{"\n\n"}
                <span className="code-comment"># Observer auto-detects when the tool-call path changes</span>{"\n"}
                <span className="code-comment"># → DriftScope raises alert + triggers runtime action</span>
              </pre>
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(255,140,0,0.06)", border: "1px solid rgba(255,140,0,0.2)", borderRadius: 8, fontSize: "0.82rem", color: "var(--text-2)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--orange)" }}>How it works:</strong> The interceptor hooks into OpenClaw&apos;s tool call routing. Each tool invocation is recorded as a trajectory step. After enough samples, DriftScope runs MMD-based statistical comparison and triggers conditional branching — escalating, gating, or routing — based on drift severity.
            </div>
          </div>

          <div className="section-divider">
            <span className="section-label">SDK Setup</span>
          </div>

          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Generic SDK</p>
              <p className="panel-title">Instrument any Python agent</p>
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Wrap any Python agent function with <code style={{ background: "var(--bg)", padding: "1px 6px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>@ds.trace</code> to automatically capture tool calls, outputs, and timing. DriftScope stores traces locally in SQLite and computes drift on demand.
            </p>
            <div className="code-block">
              <pre>
                <span className="code-comment"># 1. Install</span>{"\n"}
                <span className="code-keyword">pip</span> install driftscope{"\n\n"}
                <span className="code-comment"># 2. Initialise — once per agent</span>{"\n"}
                <span className="code-keyword">from</span> <span className="code-fn">driftscope</span> <span className="code-keyword">import</span> <span className="code-fn">DriftScope</span>{"\n"}
                <span className="code-fn">ds</span> = <span className="code-fn">DriftScope</span>(<span className="code-str">project=&quot;{projectName}&quot;</span>){"\n\n"}
                <span className="code-comment"># 3. Decorate your agent entrypoint</span>{"\n"}
                <span className="code-keyword">@</span><span className="code-fn">ds.trace</span>{"\n"}
                <span className="code-keyword">def </span><span className="code-fn">run_agent</span>(query: str) -{">"} str:{"\n"}
                {"    "}<span className="code-comment"># your agent logic — DriftScope records every tool call</span>{"\n"}
                {"    "}<span className="code-keyword">return</span> agent.run(query){"\n\n"}
                <span className="code-comment"># 4. Run the scenario demo</span>{"\n"}
                <span className="code-keyword">python</span> {demoProject.command.replace("python3 ", "")}
              </pre>
            </div>
          </div>

          <div className="section-divider">
            <span className="section-label">Data Sources</span>
          </div>

          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Storage</p>
              <p className="panel-title">Where data is stored</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: "0.875rem", color: "var(--text-2)" }}>
              {[
                { label: "Baseline DB", path: demoProject.baselineDb, desc: "SQLite with baseline trajectories" },
                { label: "Current DB", path: demoProject.currentDb, desc: "SQLite with current trajectories" },
                { label: "Analysis", path: demoProject.analysisJson, desc: "JSON analysis bundle read by dashboard" },
                { label: "Trajectories", path: demoProject.trajectoriesJson, desc: "JSON with raw baseline + current records" },
              ].map(({ label, path, desc }) => (
                <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "var(--bg)", borderRadius: 8 }}>
                  <div style={{ minWidth: 110, fontWeight: 600, color: "var(--text)" }}>{label}</div>
                  <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--orange)" }}>{path}</code>
                  <span style={{ color: "var(--text-3)", fontSize: "0.8rem" }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="section-divider">
            <span className="section-label">Detection</span>
          </div>

          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Algorithm</p>
              <p className="panel-title">How drift is detected</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                {
                  name: "Trajectory Drift",
                  method: "MMD (Maximum Mean Discrepancy)",
                  desc: "Measures distributional shift between baseline and current tool-call sequence embeddings. Threshold: 0.3",
                  threshold: "> 0.3 → alert",
                },
                {
                  name: "Output Drift",
                  method: "Cosine Semantic Similarity",
                  desc: "Compares final response embeddings between periods. Low output + high trajectory = Hidden Drift.",
                  threshold: "> 0.3 → elevated",
                },
                {
                  name: "Path Edit Distance",
                  method: "Normalized Levenshtein",
                  desc: "Per-trace structural diff of tool sequences. Used for scatter plot and per-query drift labeling.",
                  threshold: "shown in scatter",
                },
                {
                  name: "Tool Frequency",
                  method: "Share Delta",
                  desc: "Compares tool call frequency distribution baseline vs current. New tools (share went 0→>0) are flagged.",
                  threshold: "share_delta shown",
                },
              ].map(({ name, method, desc, threshold }) => (
                <div key={name} style={{ padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <p style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.9rem" }}>{name}</p>
                  <p style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono)", color: "var(--orange)" }}>{method}</p>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-2)", lineHeight: 1.5 }}>{desc}</p>
                  <span style={{ fontSize: "0.72rem", background: "var(--bg)", padding: "2px 8px", borderRadius: 4, color: "var(--text-3)", alignSelf: "flex-start" }}>{threshold}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="section-divider">
            <span className="section-label">Project</span>
          </div>

          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Configuration</p>
              <p className="panel-title">Active project</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-3)", width: 120 }}>Project name</span>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", background: "var(--bg)", padding: "4px 10px", borderRadius: 6 }}>{projectName}</code>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-3)", width: 120 }}>Data source</span>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", background: "var(--bg)", padding: "4px 10px", borderRadius: 6 }}>{analysis.data_source ?? "—"}</code>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-3)", width: 120 }}>Last updated</span>
                <span style={{ fontSize: "0.875rem", color: "var(--text-2)" }}>{analysis.updated_at ?? "—"}</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-3)", width: 120 }}>Alert threshold</span>
                <span style={{ fontSize: "0.875rem", color: "var(--text-2)" }}>trajectory_drift {">"} 0.3</span>
              </div>
              {demoProject.requiresOpenAI ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-3)", width: 120 }}>Environment</span>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-2)" }}>Requires <code>OPENAI_API_KEY</code></span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
