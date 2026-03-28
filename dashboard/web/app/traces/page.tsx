import Sidebar from "@/app/components/sidebar";
import { ProjectTabs } from "@/app/components/project-tabs";
import { TimeRangePicker } from "@/app/components/time-range-picker";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { TracesTable } from "@/app/components/traces-table";
import { DEFAULT_PROJECT_ID, getDemoProject } from "@/lib/demo-projects";
import { loadDashboardData, loadTrajectoryData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function TracesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const project = (Array.isArray(sp.project) ? sp.project[0] : sp.project) ?? DEFAULT_PROJECT_ID;
  const start   = parseNum(Array.isArray(sp.start) ? sp.start[0] : sp.start);
  const end     = parseNum(Array.isArray(sp.end)   ? sp.end[0]   : sp.end);

  const [{ analysis }, { baseline, current }] = await Promise.all([
    loadDashboardData({ project, start, end }),
    loadTrajectoryData({ project, start, end, limit: 100 }),
  ]);

  const projectName = analysis.project || getDemoProject(project).id;
  const driftType   = (analysis.drift_type ?? "normal") as "normal" | "input_drift" | "hidden" | "severe";

  // Build set of drifted query strings for cross-reference
  const driftedQueries = new Set(
    (analysis.behavior_drift_examples ?? []).map((e) => e.query)
  );

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
              <span className="bc-item bc-active">Traces</span>
            </nav>
          </div>
          <div className="main-header-right">
            <TimeRangePicker project={projectName} />
            <AutoRefresh />
          </div>
        </div>

        <ProjectTabs activeProject={projectName} shouldAlert={analysis.should_alert} />

        <div className="page-inner">
          {/* Summary row */}
          <div className="traces-summary">
            <div className="traces-stat">
              <span className="traces-stat-n">{baseline.length}</span>
              <span className="traces-stat-label">Baseline traces</span>
            </div>
            <div className="traces-stat">
              <span className="traces-stat-n">{current.length}</span>
              <span className="traces-stat-label">Current traces</span>
            </div>
            <div className="traces-stat">
              <span className="traces-stat-n" style={{ color: "var(--orange)" }}>
                {driftedQueries.size}
              </span>
              <span className="traces-stat-label">Drifted queries</span>
            </div>
            <div className="traces-stat">
              <span className={`traces-stat-badge status-${driftType}`}>
                {driftType === "hidden" ? "Hidden Drift"
                 : driftType === "severe" ? "Severe Drift"
                 : driftType === "input_drift" ? "Input Drift"
                 : "Normal"}
              </span>
            </div>
          </div>

          <div className="runtime-next-step traces-runtime-note">
            <span className="runtime-next-label">Observer decision</span>
            <span className="runtime-next-copy">
              <strong>{analysis.runtime_action}</strong>
              {" — "}
              {analysis.recommended_next_step}
            </span>
          </div>

          {/* Traces table */}
          <div className="section-divider"><span className="section-label">All traces</span></div>
          <div className="panel">
            <TracesTable
              baseline={baseline}
              current={current}
              driftedQueries={[...driftedQueries]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function parseNum(v: string | undefined) {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
