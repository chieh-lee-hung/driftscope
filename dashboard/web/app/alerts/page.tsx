import Link from "next/link";
import Sidebar from "@/app/components/sidebar";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { AcknowledgeButton } from "@/app/components/acknowledge-button";
import { ProjectTabs } from "@/app/components/project-tabs";
import { DEFAULT_PROJECT_ID, getDemoProject } from "@/lib/demo-projects";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const project = (Array.isArray(sp.project) ? sp.project[0] : sp.project) ?? DEFAULT_PROJECT_ID;

  const { analysis } = await loadDashboardData({ project });

  const projectName = analysis.project || getDemoProject(project).id;
  const driftType   = (analysis.drift_type ?? "normal") as "normal" | "input_drift" | "hidden" | "severe";
  const history     = analysis.history ?? [];
  const historyEvent = history.find((h) => h.event_label);

  const firstAlertDate = historyEvent?.date;

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
              <span className="bc-item bc-active">Alerts</span>
            </nav>
          </div>
          <div className="main-header-right">
            <AutoRefresh />
          </div>
        </div>

        <ProjectTabs activeProject={projectName} shouldAlert={analysis.should_alert} />

        <div className="page-inner">
          {/* Summary */}
          <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 0 }}>
            <div className="stat-card accent-orange">
              <p className="stat-label">Active Alerts</p>
              <p className="stat-value val-orange">{analysis.should_alert ? "1" : "0"}</p>
              <span className="stat-delta delta-orange">{analysis.should_alert ? "Requires attention" : "All clear"}</span>
            </div>
            <div className="stat-card">
              <p className="stat-label">Last Triggered</p>
              <p className="stat-value" style={{ fontSize: "1.2rem" }}>{firstAlertDate ?? "—"}</p>
              <span className="stat-delta delta-muted">{firstAlertDate ? "First detection" : "No alerts yet"}</span>
            </div>
            <div className="stat-card">
              <p className="stat-label">Queries Affected</p>
              <p className="stat-value val-orange">
                {Math.round(analysis.behavior_drift_ratio * 100)}%
              </p>
              <span className="stat-delta delta-muted">
                {analysis.current_count} current traces
              </span>
            </div>
          </div>

          <div className="section-divider"><span className="section-label">Alert inbox</span></div>

          {/* Alert cards or empty state */}
          {!analysis.should_alert ? (
            <div className="alerts-empty">
              <div className="alerts-empty-icon">✓</div>
              <p className="alerts-empty-title">No active alerts</p>
              <p className="alerts-empty-sub">Agent behavior is within normal parameters.</p>
            </div>
          ) : (
            <div className="alert-card-list">
              <div className={`alert-card alert-card-${driftType}`}>
                {/* Card header */}
                <div className="ac-header">
                  <div className="ac-header-left">
                    <span className="ac-id">DRIFT-001</span>
                    <span className={`ac-severity status-${driftType}`}>
                      {driftType === "hidden" ? "Hidden Drift"
                       : driftType === "severe" ? "Severe Drift"
                       : driftType === "input_drift" ? "Input Drift"
                       : "Normal"}
                    </span>
                  </div>
                  <div className="ac-header-right">
                    <span className="ac-since">
                      {firstAlertDate ? `Since ${firstAlertDate}` : "Active"}
                    </span>
                    <span className="ac-status-dot" />
                  </div>
                </div>

                {/* Description */}
                <p className="ac-description">
                  {driftType === "hidden"
                    ? "Agent trajectory changed significantly while output remained semantically similar. The internal decision path is different from the established baseline — a potential sign of knowledge base update, prompt modification, or model change."
                    : "Agent behavior has deviated significantly from its baseline. Both the execution path and output semantics have changed."}
                </p>

                {/* Metrics row */}
                <div className="ac-metrics">
                  <div className="ac-metric">
                    <span className="ac-metric-label">Trajectory Drift</span>
                    <span className="ac-metric-val val-orange">{analysis.trajectory_drift.toFixed(3)}</span>
                  </div>
                  <div className="ac-metric">
                    <span className="ac-metric-label">Output Drift</span>
                    <span className="ac-metric-val">{analysis.output_drift.toFixed(3)}</span>
                  </div>
                  <div className="ac-metric">
                    <span className="ac-metric-label">Queries Affected</span>
                    <span className="ac-metric-val val-orange">
                      {Math.round(analysis.behavior_drift_ratio * 100)}%
                    </span>
                  </div>
                  <div className="ac-metric">
                    <span className="ac-metric-label">New Tools</span>
                    <span className="ac-metric-val">
                      {(analysis.tool_frequency_changes ?? []).filter((t) => t.baseline_share === 0 && t.current_share > 0).length}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="ac-actions">
                  <Link
                    href={`/traces?project=${projectName}`}
                    className="ac-btn ac-btn-primary"
                  >
                    View affected traces →
                  </Link>
                  <Link
                    href={`/dashboard?project=${projectName}`}
                    className="ac-btn ac-btn-secondary"
                  >
                    Open overview
                  </Link>
                  <AcknowledgeButton alertId="DRIFT-001" />
                </div>
              </div>
            </div>
          )}

          {/* Alert history */}
          {history.length > 0 && (
            <>
              <div className="section-divider"><span className="section-label">History</span></div>
              <div className="panel">
                <div className="panel-header">
                  <p className="panel-title">Drift score over time</p>
                </div>
                <table className="alert-history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Trajectory Drift</th>
                      <th>Output Drift</th>
                      <th>Event</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice().reverse().map((h) => {
                      const alert = h.trajectory_drift >= 0.3 && analysis.should_alert;
                      return (
                        <tr key={h.date}>
                          <td>{h.date}</td>
                          <td>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: alert ? "var(--orange)" : "var(--text)" }}>
                              {h.trajectory_drift.toFixed(3)}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>
                              {h.output_drift.toFixed(3)}
                            </span>
                          </td>
                          <td>{h.event_label ?? "—"}</td>
                          <td>
                            <span className={`tt-status-badge ${alert ? "tt-status-drifted" : "tt-status-normal"}`}>
                              {alert ? "Alert" : "Normal"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
