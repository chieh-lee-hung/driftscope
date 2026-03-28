import { AutoRefresh } from "@/app/components/auto-refresh";
import { BehaviorTable } from "@/app/components/behavior-table";
import { DriftTimeline } from "@/app/components/drift-timeline";
import { ProjectTabs } from "@/app/components/project-tabs";
import { RecommendedActions } from "@/app/components/recommended-actions";
import Sidebar from "@/app/components/sidebar";
import { DEFAULT_PROJECT_ID, getDemoProject } from "@/lib/demo-projects";
import { loadDashboardData, loadTrajectoryData, type TrajectoryRecord } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

/* ─── Status config ──────────────────────────────────────────────── */
type DriftType = "normal" | "input_drift" | "hidden" | "severe";

const STATUS_CONFIG: Record<DriftType, { label: string }> = {
  normal:      { label: "Normal" },
  input_drift: { label: "Input Drift" },
  hidden:      { label: "Hidden Drift" },
  severe:      { label: "Severe Drift" },
};

/* ─── Page ─────────────────────────────────────────────────────── */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const filters = {
    project: takeFirst(sp.project) ?? DEFAULT_PROJECT_ID,
    start:   parseNum(takeFirst(sp.start)),
    end:     parseNum(takeFirst(sp.end)),
  };
  const activeProject = getDemoProject(filters.project);

  const [{ analysis }, trajectoryPayload] = await Promise.all([
    loadDashboardData(filters),
    loadTrajectoryData({ ...filters, limit: 200 }),
  ]);

  const driftType  = (analysis.drift_type ?? "normal") as DriftType;
  const status     = STATUS_CONFIG[driftType] ?? STATUS_CONFIG.normal;
  const examples   = analysis.behavior_drift_examples ?? [];
  const toolChanges = analysis.tool_frequency_changes ?? [];
  const history    = analysis.history ?? [];
  const observerEvents = analysis.observer_events ?? [];
  const historyEvent = history.find((h) => h.event_label);
  const isCollecting = analysis.status.startsWith("collecting") || analysis.status === "analysing";
  const historyContext = historyEvent?.event_label
    ? `After ${historyEvent.event_label}`
    : isCollecting
      ? "Live replay"
      : "Latest run";
  const isEmpty = analysis.status === "insufficient_data";
  const runtimeAccent =
    analysis.runtime_state === "protected" ? "accent-orange"
    : analysis.runtime_state === "escalated" ? "accent-red"
    : analysis.runtime_state === "watching" ? "accent-blue"
    : "accent-green";
  const runtimeValueClass =
    analysis.runtime_state === "protected" ? "val-orange"
    : analysis.runtime_state === "escalated" ? "val-red"
    : analysis.runtime_state === "watching" ? "val-blue"
    : "val-green";
  const runtimeDeltaClass =
    analysis.runtime_state === "protected" ? "delta-orange"
    : analysis.runtime_state === "escalated" ? "delta-red"
    : analysis.runtime_state === "watching" ? "delta-blue"
    : "delta-green";

  // Count new tools (baseline_share === 0, current_share > 0)
  const newToolCount = toolChanges.filter(
    (t) => t.baseline_share === 0 && t.current_share > 0
  ).length;

  // Sort tool changes by abs delta desc
  const sortedTools = [...toolChanges].sort(
    (a, b) => Math.abs(b.share_delta) - Math.abs(a.share_delta)
  );

  const projectName = analysis.project || activeProject.id;
  const driftedSet  = new Set((analysis.behavior_drift_examples ?? []).map((e) => e.query));

  // Per-trace scatter: path edit distance (Y) × step count growth ratio (X)
  // Deterministic per-trace jitter prevents identical traces from stacking on a single pixel.
  const baselineByQuery = new Map(trajectoryPayload.baseline.map((b) => [b.query, b]));
  const scatterPoints = trajectoryPayload.current.flatMap((curr) => {
    const base = baselineByQuery.get(curr.query);
    if (!base) return [];
    const currTools  = curr.steps.map((s) => s.tool);
    const baseTools  = base.steps.map((s) => s.tool);
    const pathDrift  = seqEditDist(currTools, baseTools);
    const stepGrowth = Math.min(
      Math.max((curr.steps.length - base.steps.length) / Math.max(base.steps.length, 1), 0), 1
    );
    // Seeded jitter so every trace has a unique stable position (no hydration mismatch)
    const jx = hashJitter(curr.id,        0.08);
    const jy = hashJitter(curr.id + 9999, 0.08);
    return [{
      pathDrift:   clamp01(pathDrift  + jy),
      outputDrift: clamp01(stepGrowth + jx),
      isDrifted:   driftedSet.has(curr.query),
    }];
  });

  return (
    <div className="app-shell">
      <Sidebar activeProject={projectName} shouldAlert={analysis.should_alert} />

      <main className="main-area">
        <div className="main-header">
          <div className="main-header-left">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <span className="bc-item">DriftScope</span>
              <span className="bc-sep">/</span>
              <span className="bc-item">{projectName}</span>
              <span className="bc-sep">/</span>
              <span className="bc-item bc-active">Overview</span>
            </nav>
            <span className={`mh-status-badge status-${driftType}`}>
              <span className="pulse" />
              {status.label}
            </span>
          </div>
          <div className="main-header-right">
            <AutoRefresh intervalMs={isCollecting ? 1000 : 5000} />
          </div>
        </div>

        <ProjectTabs activeProject={projectName} shouldAlert={analysis.should_alert} />

        {isCollecting && (
          <LiveRunBanner
            statusLabel={analysis.live_status_label}
            phaseLabel={(analysis as { phase_label?: string }).phase_label ?? "Live capture"}
            progressCompleted={analysis.progress_completed}
            progressTotal={analysis.progress_total}
            runtimeMessage={analysis.runtime_message}
          />
        )}

        {/* System context strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px", fontSize: "0.78rem", color: "var(--text-3)", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
          <span style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 10px", color: "var(--text-2)", fontWeight: 500 }}>
            🤖 Production Agent: Picnic Support
          </span>
          <span style={{ color: "var(--text-3)" }}>monitored by</span>
          <span style={{ background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.25)", borderRadius: 6, padding: "2px 10px", color: "var(--orange)", fontWeight: 500 }}>
            ◎ Observer Agent: DriftScope
          </span>
          <span style={{ color: "var(--text-3)", marginLeft: 4 }}>→ conditional branch on drift</span>
        </div>

        {/* Alert Banner */}
        {analysis.should_alert && (
          <div className={`alert-banner alert-banner-${driftType}`}>
            <div className="alert-banner-inner">
              <span className="alert-banner-icon">⚠</span>
              <span className="alert-banner-body">
                <strong>
                  {driftType === "hidden" ? "Hidden Drift detected" :
                   driftType === "severe" ? "Severe Drift detected" :
                   "Drift detected"}
                </strong>
                {" — "}
                {driftType === "hidden"
                  ? "Agent trajectory changed significantly while output remained similar. "
                  : "Agent behavior has changed significantly. "}
                <strong>{analysis.runtime_action}</strong>
                {" — "}
                <strong>{pct(analysis.behavior_drift_ratio)}</strong> of queries affected.
              </span>
              <span className="alert-banner-since">
                {history.length > 0 ? historyContext : "Active"}
              </span>
            </div>
          </div>
        )}

        <div className="page-inner">

        {/* ── Empty state ─────────────────────────────────────── */}
        {isEmpty && (
          <NoDataGuide project={projectName} />
        )}

        <div style={isEmpty ? { opacity: 0.2, pointerEvents: "none", userSelect: "none" } : undefined}>

        {/* ── Stats row ───────────────────────────────────────── */}
        <div className="stats-row">
          <StatCard
            label="Trajectory Drift"
            value={analysis.trajectory_drift.toFixed(2)}
            valueClass={analysis.trajectory_drift > 0.3 ? "val-orange" : "val-green"}
            delta={analysis.trajectory_drift > 0.3 ? "Above threshold" : "Normal"}
            deltaClass={analysis.trajectory_drift > 0.3 ? "delta-orange" : "delta-green"}
            accentClass={analysis.trajectory_drift > 0.3 ? "accent-orange" : "accent-green"}
            tooltip="How much the agent's internal execution path (tool call sequence) has changed vs. baseline. Measured via MMD on step embeddings. >0.3 triggers an alert."
          />
          <StatCard
            label="Output Drift"
            value={analysis.output_drift.toFixed(2)}
            valueClass={analysis.output_drift > 0.3 ? "val-orange" : undefined}
            delta={analysis.output_drift > 0.3 ? "Elevated" : "Normal"}
            deltaClass={analysis.output_drift > 0.3 ? "delta-orange" : "delta-green"}
            accentClass={analysis.output_drift > 0.3 ? "accent-orange" : "accent-green"}
            tooltip="Semantic similarity shift in final agent responses vs. baseline. Low output drift + high trajectory drift = Hidden Drift — the agent changed internally but outputs look the same."
          />
          <StatCard
            label="Queries Affected"
            value={pct(analysis.behavior_drift_ratio)}
            valueClass={analysis.behavior_drift_ratio > 0.2 ? "val-orange" : undefined}
            delta={`${analysis.baseline_count} → ${analysis.current_count}`}
            deltaClass="delta-muted"
            accentClass={analysis.behavior_drift_ratio > 0.2 ? "accent-orange" : undefined}
            tooltip="Percentage of current queries whose tool-call trajectory diverges significantly from the nearest baseline trace. Baseline → Current query count shown below."
          />
          <StatCard
            label="Status"
            value={status.label}
            valueClass={
              driftType === "hidden" ? "val-orange"
              : driftType === "severe" ? "val-red"
              : driftType === "input_drift" ? "val-blue"
              : "val-green"
            }
            delta={analysis.should_alert ? "Alert active" : "No alert"}
            deltaClass={analysis.should_alert ? "delta-orange" : "delta-green"}
            accentClass={
              driftType === "hidden" ? "accent-orange"
              : driftType === "severe" ? "accent-red"
              : driftType === "input_drift" ? "accent-blue"
              : "accent-green"
            }
            smallValue
            tooltip="4-quadrant classification: Normal · Input Drift (query distribution changed) · Hidden Drift (trajectory changed, output same) · Severe (both changed)."
          />
        </div>

        <div className="section-divider">
          <span className="section-label">Live Evidence</span>
        </div>

        {/* ── Chart row ───────────────────────────────────────── */}
        <div className="chart-row">

          {/* Drift Timeline */}
          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Replay</p>
              <p className="panel-title">Live Run Timeline</p>
            </div>
            <DriftTimeline history={history} />
            <p className="panel-footnote">
              Green and orange traces grow as baseline and current replay queries arrive; the policy marker shows where the silent update landed.
            </p>
          </div>


          {/* Classification Quadrant */}
          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Classification · {scatterPoints.length} traces</p>
              <p className="panel-title">Drift Quadrant</p>
            </div>
            <ClassificationQuadrant
              trajectoryDrift={analysis.trajectory_drift}
              outputDrift={analysis.output_drift}
              driftType={driftType}
              scatterPoints={scatterPoints}
            />
          </div>

        </div>

        <div className="section-divider">
          <span className="section-label">Observer Decision</span>
        </div>

        <div className="panel runtime-panel">
          <div className="panel-header">
            <p className="panel-super">Observer Agent</p>
            <p className="panel-title">Runtime Control Decision</p>
          </div>
          <div className="runtime-grid">
            <div className="runtime-block">
              <p className="runtime-label">Current state</p>
              <p className={`runtime-value ${runtimeValueClass}`}>{analysis.runtime_state}</p>
            </div>
            <div className="runtime-block">
              <p className="runtime-label">Action taken</p>
              <p className="runtime-value">{analysis.runtime_action}</p>
            </div>
            <div className="runtime-block">
              <p className="runtime-label">Trigger</p>
              <p className="runtime-copy">
                {historyEvent?.event_label
                  ? `${historyEvent.event_label} triggered observer evaluation.`
                  : isCollecting
                    ? "Observer is still collecting replay evidence."
                    : "Continuous monitoring with no intervention trigger."}
              </p>
            </div>
          </div>
          <p className="runtime-message">{analysis.runtime_message}</p>
        </div>

        <ObserverTracePanel events={observerEvents} />

        {/* ── Recommended Actions (only when drift alert is active) ── */}
        {analysis.should_alert && (
          <RecommendedActions
            project={projectName}
            runtimeAction={analysis.runtime_action}
            runtimeMessage={analysis.runtime_message}
          />
        )}

        <div className="section-divider">
          <span className="section-label">Evidence</span>
        </div>

        {/* ── Detail row ──────────────────────────────────────── */}
        <div className="detail-row">

          {/* Tool Usage Shift */}
          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Root Cause Signal</p>
              <p className="panel-title">Tool Usage Shift</p>
            </div>
            {sortedTools.length === 0 ? (
              <EmptyState message="No tool frequency data available." />
            ) : (
              <ToolBarChart changes={sortedTools} />
            )}
          </div>

          {/* Behavior Events */}
          <div className="panel">
            <div className="panel-header">
              <p className="panel-super">Evidence</p>
              <p className="panel-title">
                Behavior Events
                <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-3)", marginLeft: 8 }}>
                  {examples.length} found
                </span>
              </p>
            </div>
            <BehaviorTable examples={examples} />
          </div>

        </div>

        </div>{/* end faded wrapper */}

      </div>
      </main>
    </div>
  );
}

/* ─── NoDataGuide ───────────────────────────────────────────────── */
function NoDataGuide({ project }: { project: string }) {
  const demoProject = getDemoProject(project);

  return (
    <div className="no-data-guide">
      <div className="ndg-icon">◎</div>
      <h3 className="ndg-title">No traces yet for <code>{demoProject.label}</code></h3>
      <p className="ndg-desc">
        {demoProject.description}
      </p>
      <div className="ndg-steps">
        <div className="ndg-step">
          <span className="ndg-step-label">Run this scenario</span>
          <code className="ndg-step-cmd">{demoProject.command}</code>
        </div>
        {demoProject.followupCommand ? (
          <div className="ndg-step">
            <span className="ndg-step-label">Then trigger drift</span>
            <code className="ndg-step-cmd">{demoProject.followupCommand}</code>
          </div>
        ) : null}
        <div className="ndg-step">
          <span className="ndg-step-label">What should happen</span>
          <code className="ndg-step-cmd">
            {demoProject.mode === "openai"
              ? "Dashboard fills in live on the healthy run, then the same agent project flips into hidden drift after the policy-change run"
              : "Observer agent should surface hidden drift and route the workflow into review mode"}
          </code>
        </div>
      </div>
      {demoProject.requiresOpenAI && (
        <p className="ndg-note">
          Make sure <code>OPENAI_API_KEY</code> is set before running.
        </p>
      )}
      <p className="ndg-note" style={{ color: "#1d4ed8", background: "#eff6ff", borderColor: "#bfdbfe" }}>
        After the run, check the Overview page for the observer decision and the runtime action taken for this agent.
      </p>
    </div>
  );
}

function LiveRunBanner({
  statusLabel,
  phaseLabel,
  progressCompleted,
  progressTotal,
  runtimeMessage,
}: {
  statusLabel: string;
  phaseLabel: string;
  progressCompleted: number;
  progressTotal: number;
  runtimeMessage: string;
}) {
  const pct = progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0;

  return (
    <div className="live-run-banner">
      <div className="live-run-copy">
        <span className="live-run-pill">Live run</span>
        <div>
          <p className="live-run-title">{statusLabel || "Observer is collecting traces"}</p>
          <p className="live-run-desc">{phaseLabel} · {runtimeMessage}</p>
        </div>
      </div>
      <div className="live-run-metrics">
        <span>{progressCompleted}/{progressTotal || "?"} traces</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

function ObserverTracePanel({
  events,
}: {
  events: Array<{
    id: string;
    timestamp: number;
    stage: string;
    title: string;
    detail: string;
    status: string;
  }>;
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <p className="panel-super">Observer Agent</p>
        <p className="panel-title">DriftScope Trace</p>
      </div>
      {events.length === 0 ? (
        <EmptyState message="Observer trace will appear here as DriftScope monitors the refund workflow." />
      ) : (
        <div className="observer-trace-list">
          {[...events].slice(-8).reverse().map((event) => (
            <div key={event.id} className="observer-trace-item">
              <div className={`observer-trace-dot observer-${event.status}`} />
              <div className="observer-trace-copy">
                <div className="observer-trace-meta">
                  <strong>{event.title}</strong>
                  <span>{new Date(event.timestamp * 1000).toLocaleTimeString("en-GB")}</span>
                </div>
                <p>{event.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── StatCard ──────────────────────────────────────────────────── */
function StatCard({
  label,
  value,
  valueClass,
  delta,
  deltaClass,
  smallValue,
  accentClass,
  tooltip,
}: {
  label: string;
  value: string;
  valueClass?: string;
  delta: string;
  deltaClass: string;
  smallValue?: boolean;
  accentClass?: string;
  tooltip?: string;
}) {
  return (
    <div className={`stat-card${accentClass ? ` ${accentClass}` : ""}`}>
      <p className="stat-label">
        {label}
        {tooltip && (
          <span className="stat-info" data-tooltip={tooltip}>?</span>
        )}
      </p>
      <p
        className={`stat-value${valueClass ? ` ${valueClass}` : ""}`}
        style={smallValue ? { fontSize: "1.1rem" } : undefined}
      >
        {value}
      </p>
      <span className={`stat-delta ${deltaClass}`}>{delta}</span>
    </div>
  );
}

/* ─── ClassificationQuadrant ────────────────────────────────────── */
function ClassificationQuadrant({
  trajectoryDrift,
  outputDrift,
  driftType,
  scatterPoints,
}: {
  trajectoryDrift: number;
  outputDrift: number;
  driftType: DriftType;
  scatterPoints: Array<{ pathDrift: number; outputDrift: number; isDrifted: boolean }>;
}) {
  const W = 500, H = 300;
  const PL = 44, PR = 16, PT = 16, PB = 40;
  const pw = W - PL - PR;
  const ph = H - PT - PB;

  const mx = PL + 0.5 * pw;
  const my = PT + 0.5 * ph;

  const toX = (v: number) => PL + Math.min(Math.max(v, 0), 1) * pw;
  const toY = (v: number) => PT + (1 - Math.min(Math.max(v, 0), 1)) * ph;

  // Aggregate position: mean of all scatter points (same axis space as individual dots)
  const aggXVal = scatterPoints.length > 0
    ? scatterPoints.reduce((s, p) => s + p.outputDrift, 0) / scatterPoints.length
    : outputDrift;
  const aggYVal = scatterPoints.length > 0
    ? scatterPoints.reduce((s, p) => s + p.pathDrift, 0) / scatterPoints.length
    : trajectoryDrift;
  const aggX = toX(aggXVal);
  const aggY = toY(aggYVal);

  const aggColor =
    driftType === "hidden" ? "var(--orange)"
    : driftType === "severe" ? "var(--red)"
    : driftType === "input_drift" ? "var(--blue)"
    : "var(--green)";

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
  const xTicks = [0, 0.25, 0.5, 0.75, 1.0];

  const driftedCount  = scatterPoints.filter((p) => p.isDrifted).length;
  const normalCount   = scatterPoints.length - driftedCount;
  const scenarioNote =
    normalCount === 0 && driftedCount > 0
      ? "No normal current traces appear in this replay because the same 6 refund queries were rerun after the policy update, so every current trace falls into the drifted bucket."
      : normalCount > 0 && driftedCount > 0
        ? "This replay contains a mix of stable and drifted current traces."
        : "Current traces remain within the normal range for this replay.";

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="quadrant-chart"
        role="img"
        aria-label="Drift classification quadrant"
      >
        {/* Quadrant zones */}
        <rect x={PL}  y={PT}  width={pw/2} height={ph/2} className="quad-normal" />
        <rect x={mx}  y={PT}  width={pw/2} height={ph/2} className="quad-input" />
        <rect x={PL}  y={my}  width={pw/2} height={ph/2} className="quad-hidden" />
        <rect x={mx}  y={my}  width={pw/2} height={ph/2} className="quad-severe" />

        {/* Dividing lines */}
        <line x1={mx} y1={PT} x2={mx} y2={PT + ph} className="quad-divider" />
        <line x1={PL} y1={my} x2={PL + pw} y2={my} className="quad-divider" />

        {/* Zone labels */}
        <text x={PL + pw*0.25} y={PT + ph*0.10} textAnchor="middle" fontSize="10" fill="var(--green)" opacity="0.7" fontFamily="var(--font-sans)" fontWeight="600">Normal</text>
        <text x={PL + pw*0.75} y={PT + ph*0.10} textAnchor="middle" fontSize="10" fill="var(--blue)" opacity="0.7" fontFamily="var(--font-sans)" fontWeight="600">Expanded</text>
        <text x={PL + pw*0.25} y={PT + ph*0.92} textAnchor="middle" fontSize="10" fill="var(--orange)" opacity="0.9" fontFamily="var(--font-sans)" fontWeight="600">Rerouted</text>
        <text x={PL + pw*0.75} y={PT + ph*0.92} textAnchor="middle" fontSize="10" fill="var(--red)" opacity="0.9" fontFamily="var(--font-sans)" fontWeight="600">Diverged</text>

        {/* Y axis */}
        {yTicks.map((v) => {
          const y = toY(v);
          return (
            <g key={`yt-${v}`}>
              <line x1={PL - 4} y1={y} x2={PL} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={PL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-sans)">{v}</text>
            </g>
          );
        })}

        {/* X axis */}
        {xTicks.map((v) => {
          const x = toX(v);
          return (
            <g key={`xt-${v}`}>
              <line x1={x} y1={PT + ph} x2={x} y2={PT + ph + 4} stroke="var(--border)" strokeWidth="1" />
              <text x={x} y={PT + ph + 14} textAnchor="middle" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-sans)">{v}</text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={PL + pw / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-sans)">Step Growth Ratio →</text>
        <text x={10} y={PT + ph / 2} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="var(--font-sans)" transform={`rotate(-90, 10, ${PT + ph / 2})`}>
          Path Edit Distance ↑
        </text>

        {/* Individual trace dots — normal (gray) */}
        {scatterPoints.filter((p) => !p.isDrifted).map((pt, i) => (
          <circle key={`n-${i}`} cx={toX(pt.outputDrift)} cy={toY(pt.pathDrift)} r={3.5} fill="#a1a1aa" opacity={0.55} />
        ))}

        {/* Individual trace dots — drifted (orange, on top) */}
        {scatterPoints.filter((p) => p.isDrifted).map((pt, i) => (
          <circle key={`d-${i}`} cx={toX(pt.outputDrift)} cy={toY(pt.pathDrift)} r={3.5} fill="var(--orange)" opacity={0.65} />
        ))}

        {/* Aggregate state dot — halo + core (drawn last, always on top) */}
        <circle cx={aggX} cy={aggY} r="14" fill={aggColor} opacity="0.15" />
        <circle cx={aggX} cy={aggY} r="9"  fill={aggColor} opacity="0.25" />
        <circle cx={aggX} cy={aggY} r="5"  fill={aggColor} />
        <text x={aggX} y={aggY - 18} textAnchor="middle" fontSize="8" fill={aggColor} fontFamily="var(--font-sans)" fontWeight="700">AVG</text>
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: "0.72rem", color: "var(--text-3)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#a1a1aa", marginRight: 5, verticalAlign: "middle", opacity: 0.7 }} />Normal ({normalCount})</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--orange)", marginRight: 5, verticalAlign: "middle", opacity: 0.8 }} />Drifted ({driftedCount})</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: aggColor, marginRight: 5, verticalAlign: "middle" }} />Aggregate</span>
      </div>
      <p className="panel-footnote" style={{ marginTop: 10 }}>
        {scenarioNote}
      </p>
    </div>
  );
}

/* ─── ToolBarChart ──────────────────────────────────────────────── */
function ToolBarChart({
  changes,
}: {
  changes: Array<{
    tool: string;
    baseline_share: number;
    current_share: number;
    share_delta: number;
  }>;
}) {
  const maxShare = Math.max(
    ...changes.flatMap((c) => [c.baseline_share, c.current_share]),
    0.01
  );

  return (
    <div className="tool-chart-wrap">
      {changes.map((item) => {
        const isNew  = item.baseline_share === 0 && item.current_share > 0;
        const isUp   = item.share_delta >= 0;
        const baseW  = Math.round((item.baseline_share / maxShare) * 100);
        const currW  = Math.round((item.current_share  / maxShare) * 100);

        return (
          <div className="tool-bar-row" key={item.tool}>
            <span className="tool-bar-name">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.tool}
              </span>
              {isNew && <span className="tool-new-badge">new</span>}
            </span>
            <div className="tool-bars-group">
              <div className="tool-bar-track" title={`Baseline: ${pct(item.baseline_share)}`}>
                <div className="tool-bar-fill-base" style={{ width: `${baseW}%` }} />
              </div>
              <div className="tool-bar-track" title={`Current: ${pct(item.current_share)}`}>
                <div
                  className={`tool-bar-fill-curr ${isUp ? "curr-up" : "curr-down"}`}
                  style={{ width: `${currW}%` }}
                />
              </div>
            </div>
            <span className={`tool-delta-badge ${isUp ? "up" : "down"}`}>
              {item.share_delta > 0 ? "+" : ""}{pct(item.share_delta)}
            </span>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: "0.72rem", color: "var(--text-3)" }}>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 4, background: "#d4d4d8", borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
          Baseline
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 4, background: "var(--orange)", borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
          Current
        </span>
      </div>
    </div>
  );
}

/* ─── EmptyState ────────────────────────────────────────────────── */
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ color: "var(--text-3)", fontSize: "0.85rem", padding: "20px 0", textAlign: "center" }}>
      {message}
    </div>
  );
}

/* ─── PathSankey — Split Timeline (bifurcating flow) ─────────────── */
function PathSankey({
  baseline,
  current,
  driftedQueries,
}: {
  baseline: TrajectoryRecord[];
  current: TrajectoryRecord[];
  driftedQueries: Set<string>;
}) {
  if (baseline.length === 0 && current.length === 0) return <EmptyState message="No path data." />;

  const W = 920, H = 280;
  const PL = 12, PR = 12, PT = 70, PB = 40;
  const pw = W - PL - PR, ph = H - PT - PB;
  const NW = 10, NH = 40;

  // Group traces
  const basePaths     = baseline.map((r) => r.steps.map((s) => s.tool));
  const normalTraces  = current.filter((r) => !driftedQueries.has(r.query));
  const driftedTraces = current.filter((r) => driftedQueries.has(r.query));
  const normalCount   = normalTraces.length;
  const driftedCount  = driftedTraces.length;
  const totalCurrent  = normalCount + driftedCount;

  // Most common path in a group
  function mostCommon(paths: string[][]): string[] {
    if (paths.length === 0) return [];
    const freq = new Map<string, { path: string[]; n: number }>();
    paths.forEach((p) => { const k = p.join("\x00"); const e = freq.get(k); if (e) e.n++; else freq.set(k, { path: p, n: 1 }); });
    return [...freq.values()].sort((a, b) => b.n - a.n)[0].path;
  }

  const repBase    = mostCommon(basePaths);
  const repNormal  = mostCommon(normalTraces.length > 0 ? normalTraces.map((r) => r.steps.map((s) => s.tool)) : basePaths);
  const repDrifted = mostCommon(driftedTraces.length > 0 ? driftedTraces.map((r) => r.steps.map((s) => s.tool)) : repNormal.map((t) => [t]));

  // Common prefix of all three representative paths
  let prefixLen = 0;
  const minLen = Math.min(repBase.length, repNormal.length, repDrifted.length);
  while (prefixLen < minLen && repBase[prefixLen] === repNormal[prefixLen] && repBase[prefixLen] === repDrifted[prefixLen]) prefixLen++;
  if (prefixLen === 0) prefixLen = 1;

  const prefix      = repNormal.slice(0, prefixLen);
  const normalTail  = repNormal.slice(prefixLen);
  const driftedTail = repDrifted.slice(prefixLen);

  // Column layout: prefix tools, then tail tools (max of both tails)
  const tailCols   = Math.max(normalTail.length, driftedTail.length, 1);
  const totalCols  = prefix.length + tailCols;
  const colX = (col: number) => PL + (col / Math.max(totalCols - 1, 1)) * pw;

  const midY     = PT + ph * 0.50;
  const normalY  = PT + ph * 0.22;
  const driftedY = PT + ph * 0.78;

  const baseToolSet = new Set(basePaths.flat());
  const lastPrefixX = colX(prefixLen - 1) + NW;
  const firstTailX  = colX(prefixLen);

  // Fork line thickness proportional to share
  const maxThick = 18, minThick = 3;
  const normalThick  = minThick + (normalCount  / Math.max(totalCurrent, 1)) * (maxThick - minThick);
  const driftedThick = minThick + (driftedCount / Math.max(totalCurrent, 1)) * (maxThick - minThick);

  // Short label helper
  const shortLabel = (t: string) => t
    .replace("search_knowledge_base", "search_kb")
    .replace("check_order_status",    "check_order")
    .replace("check_seller_type",     "check_seller")
    .replace("verify_photo_evidence", "verify_photo")
    .replace("escalate_to_human",     "escalate");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Agent path bifurcation"
      >
        {/* Section labels */}
        <text x={colX(Math.floor((prefix.length - 1) / 2)) + NW / 2} y={PT - 48}
          textAnchor="middle" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-sans)" fontWeight="600" letterSpacing="0.06em">
          COMMON PREFIX — ALL TRACES
        </text>
        {totalCurrent > 0 && (
          <text x={(firstTailX + (PL + pw)) / 2} y={PT - 48}
            textAnchor="middle" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-sans)" fontWeight="600" letterSpacing="0.06em">
            DIVERGES HERE
          </text>
        )}

        {/* Divider line at fork */}
        <line x1={lastPrefixX + 6} y1={PT - 36} x2={lastPrefixX + 6} y2={PT + ph + 8}
          stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />

        {/* ── Prefix links ───────────────────────────────────── */}
        {prefix.map((_, i) => {
          if (i >= prefix.length - 1) return null;
          const x1 = colX(i) + NW, x2 = colX(i + 1), mx = (x1 + x2) / 2;
          return <path key={`pl-${i}`} d={`M${x1},${midY} C${mx},${midY} ${mx},${midY} ${x2},${midY}`}
            stroke="#a1a1aa" strokeWidth={12} fill="none" strokeLinecap="round" opacity={0.25} />;
        })}

        {/* ── Fork: last prefix → normal branch ─────────────── */}
        <path
          d={`M${lastPrefixX},${midY} C${lastPrefixX + 55},${midY} ${firstTailX - 30},${normalY} ${firstTailX},${normalY}`}
          stroke="#a1a1aa" strokeWidth={normalThick} fill="none" strokeLinecap="round" opacity={0.35}
        />
        {/* Fork: last prefix → drifted branch */}
        <path
          d={`M${lastPrefixX},${midY} C${lastPrefixX + 55},${midY} ${firstTailX - 30},${driftedY} ${firstTailX},${driftedY}`}
          stroke="var(--orange)" strokeWidth={driftedThick} fill="none" strokeLinecap="round" opacity={0.7}
        />

        {/* Branch labels (above nodes, to right of fork) */}
        <text x={firstTailX} y={normalY - NH / 2 - 12}
          fontSize="9.5" fill="var(--text-2)" fontFamily="var(--font-sans)" fontWeight="600">
          {Math.round((normalCount / Math.max(totalCurrent, 1)) * 100)}% — same path ({normalCount} traces)
        </text>
        <text x={firstTailX} y={driftedY - NH / 2 - 12}
          fontSize="9.5" fill="var(--orange)" fontFamily="var(--font-sans)" fontWeight="700">
          {Math.round((driftedCount / Math.max(totalCurrent, 1)) * 100)}% — drifted ({driftedCount} traces)
        </text>

        {/* ── Normal tail links ──────────────────────────────── */}
        {normalTail.map((_, i) => {
          if (i >= normalTail.length - 1) return null;
          const x1 = colX(prefixLen + i) + NW, x2 = colX(prefixLen + i + 1), mx = (x1 + x2) / 2;
          return <path key={`nl-${i}`} d={`M${x1},${normalY} C${mx},${normalY} ${mx},${normalY} ${x2},${normalY}`}
            stroke="#a1a1aa" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.25} />;
        })}

        {/* ── Drifted tail links ─────────────────────────────── */}
        {driftedTail.map((_, i) => {
          if (i >= driftedTail.length - 1) return null;
          const x1 = colX(prefixLen + i) + NW, x2 = colX(prefixLen + i + 1), mx = (x1 + x2) / 2;
          return <path key={`dl-${i}`} d={`M${x1},${driftedY} C${mx},${driftedY} ${mx},${driftedY} ${x2},${driftedY}`}
            stroke="var(--orange)" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.5} />;
        })}

        {/* ── Prefix nodes (center row) ──────────────────────── */}
        {prefix.map((tool, i) => {
          const x = colX(i), lbl = shortLabel(tool);
          return (
            <g key={`pn-${i}`}>
              <rect x={x} y={midY - NH / 2} width={NW} height={NH} rx={3} fill="#71717a" />
              <text x={x + NW / 2} y={midY - NH / 2 - 8} textAnchor="middle"
                fontSize="8.5" fill="var(--text-2)" fontFamily="var(--font-mono)">{lbl}</text>
            </g>
          );
        })}

        {/* ── Normal tail nodes (upper row) ─────────────────── */}
        {normalTail.map((tool, i) => {
          const x = colX(prefixLen + i), lbl = shortLabel(tool);
          return (
            <g key={`nn-${i}`}>
              <rect x={x} y={normalY - NH / 2} width={NW} height={NH} rx={3} fill="#71717a" />
              <text x={x + NW / 2} y={normalY - NH / 2 - 8} textAnchor="middle"
                fontSize="8.5" fill="var(--text-2)" fontFamily="var(--font-mono)">{lbl}</text>
            </g>
          );
        })}

        {/* ── Drifted tail nodes (lower row) ────────────────── */}
        {driftedTail.map((tool, i) => {
          const x = colX(prefixLen + i);
          const isNew  = !baseToolSet.has(tool);
          const fill   = isNew ? "var(--orange)" : "#71717a";
          const lblCol = isNew ? "var(--orange)" : "var(--text-2)";
          const lbl    = shortLabel(tool);
          return (
            <g key={`dn-${i}`}>
              <rect x={x} y={driftedY - NH / 2} width={NW} height={NH} rx={3} fill={fill} />
              {isNew && <rect x={x - 2} y={driftedY - NH / 2 - 2} width={NW + 4} height={NH + 4} rx={4}
                fill="none" stroke="var(--orange)" strokeWidth="1" opacity="0.45" />}
              <text x={x + NW / 2} y={driftedY - NH / 2 - 8} textAnchor="middle"
                fontSize="8.5" fill={lblCol} fontFamily="var(--font-mono)" fontWeight={isNew ? "700" : "400"}>{lbl}</text>
              {isNew && <text x={x + NW / 2} y={driftedY - NH / 2 - 19} textAnchor="middle"
                fontSize="7" fill="var(--orange)" fontFamily="var(--font-sans)" fontWeight="800" letterSpacing="0.08em">NEW</text>}
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: "0.72rem", color: "var(--text-3)" }}>
        <span>
          <span style={{ display: "inline-block", width: 24, height: 3, background: "#a1a1aa", borderRadius: 2, marginRight: 5, verticalAlign: "middle", opacity: 0.6 }} />
          Baseline ({baseline.length})
        </span>
        <span>
          <span style={{ display: "inline-block", width: 24, height: 3, background: "#a1a1aa", borderRadius: 2, marginRight: 5, verticalAlign: "middle", opacity: 0.4 }} />
          Current — Same path ({normalCount})
        </span>
        <span>
          <span style={{ display: "inline-block", width: 24, height: 3, background: "var(--orange)", borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />
          Current — Drifted ({driftedCount})
        </span>
        {driftedTail.some((t) => !baseToolSet.has(t)) && (
          <span style={{ color: "var(--orange)", fontWeight: 600 }}>■ New tools</span>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function pct(v: number) { return `${Math.round(v * 100)}%`; }
function takeFirst(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }
function parseNum(v: string | undefined) {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Normalized Levenshtein edit distance on string arrays (0 = identical, 1 = completely different). */
function seqEditDist(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  if (m === 0 && n === 0) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n] / Math.max(m, n, 1);
}

/** Deterministic per-trace jitter: integer hash → stable pseudo-random offset in [-scale/2, scale/2]. */
function hashJitter(n: number, scale: number): number {
  const x = Math.sin(n * 127.1 + 3.4) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * scale;
}
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
