"use client";

import { Fragment, useState } from "react";
import type { TrajectoryRecord } from "@/lib/dashboard-data";

type Tab = "current" | "baseline";

type Props = {
  baseline: TrajectoryRecord[];
  current:  TrajectoryRecord[];
  driftedQueries: string[];
};

export function TracesTable({ baseline, current, driftedQueries }: Props) {
  const [tab, setTab]       = useState<Tab>("current");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "drifted" | "normal">("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<{ tab: Tab; id: number } | null>(null);

  const driftedSet = new Set(driftedQueries);
  const records = tab === "current" ? current : baseline;

  const filtered = records.filter((r) => {
    const matchSearch = search === "" || r.query.toLowerCase().includes(search.toLowerCase());
    const isDrifted = tab === "current" && driftedSet.has(r.query);
    const matchFilter =
      filter === "all" ? true :
      filter === "drifted" ? isDrifted :
      !isDrifted;
    return matchSearch && matchFilter;
  });

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const detailRecord = detailId
    ? (detailId.tab === "current" ? current : baseline).find((r) => r.id === detailId.id) ?? null
    : null;

  // For drifted current traces: find matching baseline trace by query text
  const baselineMatch = detailRecord && detailId?.tab === "current" && driftedSet.has(detailRecord.query)
    ? baseline.find((b) => b.query === detailRecord.query) ?? null
    : null;

  return (
    <div className="tt-wrap">
      {/* Tabs + controls */}
      <div className="tt-toolbar">
        <div className="tt-tabs">
          <button
            className={`tt-tab${tab === "current" ? " tt-tab-active" : ""}`}
            onClick={() => { setTab("current"); setFilter("all"); }}
          >
            Current
            <span className="tt-tab-count">{current.length}</span>
          </button>
          <button
            className={`tt-tab${tab === "baseline" ? " tt-tab-active" : ""}`}
            onClick={() => { setTab("baseline"); setFilter("all"); }}
          >
            Baseline
            <span className="tt-tab-count">{baseline.length}</span>
          </button>
        </div>
        <div className="tt-controls">
          <input
            className="tt-search"
            type="text"
            placeholder="Search queries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {tab === "current" && (
            <div className="tt-filter-group">
              {(["all", "drifted", "normal"] as const).map((f) => (
                <button
                  key={f}
                  className={`tt-filter-btn${filter === f ? " tt-filter-active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f === "drifted" ? "Drifted" : "Normal"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <table className="tt-table">
        <thead>
          <tr className="tt-thead-row">
            <th className="tt-th" style={{ width: 40 }}>#</th>
            <th className="tt-th">Query</th>
            <th className="tt-th tt-th-num">Steps</th>
            <th className="tt-th">Tools</th>
            {tab === "current" && <th className="tt-th tt-th-status">Status</th>}
            <th className="tt-th tt-th-expand" />
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="tt-empty">No traces match your filter.</td>
            </tr>
          )}
          {filtered.map((r) => {
            const isDrifted = tab === "current" && driftedSet.has(r.query);
            const isOpen = expanded.has(r.id);
            const tools = r.steps.map((s) => s.tool);
            const uniqueTools = [...new Set(tools)];

            return (
              <Fragment key={r.id}>
                <tr
                  className={`tt-row${isOpen ? " tt-row-open" : ""}${isDrifted ? " tt-row-drifted" : ""}`}
                  onClick={() => toggleExpand(r.id)}
                >
                  <td className="tt-td tt-td-id">
                    <span className="tt-id">#{r.id}</span>
                  </td>
                  <td className="tt-td tt-td-query">
                    <span className="tt-query-text">
                      {r.query.length > 72 ? r.query.slice(0, 72) + "…" : r.query}
                    </span>
                  </td>
                  <td className="tt-td tt-td-num">
                    <span className={`tt-steps-badge${isDrifted ? " tt-steps-drifted" : ""}`}>
                      {r.steps.length}
                    </span>
                  </td>
                  <td className="tt-td">
                    <div className="tt-tool-pills">
                      {uniqueTools.slice(0, 3).map((t) => (
                        <span key={t} className="tt-tool-pill">{t}</span>
                      ))}
                      {uniqueTools.length > 3 && (
                        <span className="tt-tool-more">+{uniqueTools.length - 3}</span>
                      )}
                    </div>
                  </td>
                  {tab === "current" && (
                    <td className="tt-td tt-td-status">
                      <span className={`tt-status-badge${isDrifted ? " tt-status-drifted" : " tt-status-normal"}`}>
                        {isDrifted ? "Drifted" : "Normal"}
                      </span>
                    </td>
                  )}
                  <td className="tt-td tt-td-action">
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        className="tt-chevron"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(r.id); }}
                        aria-label={isOpen ? "Collapse" : "Expand steps"}
                      >
                        {isOpen ? "▼" : "▶"}
                      </button>
                      <button
                        className="tt-detail-btn"
                        onClick={(e) => { e.stopPropagation(); setDetailId({ tab, id: r.id }); }}
                        aria-label="View detail"
                      >
                        →
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Inline step expand */}
                {isOpen && (
                  <tr className="tt-expand-row">
                    <td colSpan={tab === "current" ? 6 : 5} className="tt-expand-td">
                      <div className="tt-steps-wrap">
                        {r.steps.map((step, si) => (
                          <div key={si} className="tt-step">
                            <span className="tt-step-num">{si + 1}</span>
                            <div className="tt-step-body">
                              <span className="tt-step-tool">{step.tool}</span>
                              {Object.entries(step.args).length > 0 && (
                                <span className="tt-step-args">
                                  {Object.entries(step.args).map(([k, v]) => (
                                    <span key={k} className="tt-step-arg">
                                      <span className="tt-step-arg-key">{k}</span>
                                      <span className="tt-step-arg-val">{String(v).slice(0, 40)}</span>
                                    </span>
                                  ))}
                                </span>
                              )}
                              <span className="tt-step-result">{step.result_summary}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Detail drawer */}
      {detailRecord && (
        <div className="tt-drawer-overlay" onClick={() => setDetailId(null)}>
          <div className="tt-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="tt-drawer-header">
              <div>
                <p className="tt-drawer-super">Trace #{detailRecord.id}</p>
                <p className="tt-drawer-title">Execution Detail</p>
              </div>
              <button className="tt-drawer-close" onClick={() => setDetailId(null)}>✕</button>
            </div>

            <div className="tt-drawer-body">
              {/* Query */}
              <div className="tt-drawer-section">
                <p className="tt-drawer-label">Query</p>
                <p className="tt-drawer-query">{detailRecord.query}</p>
              </div>

              {/* Path comparison (drifted traces only) */}
              {baselineMatch ? (
                <div className="tt-drawer-section">
                  <p className="tt-drawer-label">Path Comparison</p>
                  <div className="tt-path-compare">
                    {/* Baseline path */}
                    <div className="tt-path-col">
                      <p className="tt-path-col-label tt-path-col-label-before">
                        Before <span className="tt-path-count">{baselineMatch.steps.length} steps</span>
                      </p>
                      <div className="tt-path-pills">
                        {baselineMatch.steps.map((s, i) => (
                          <Fragment key={i}>
                            <span className="tt-path-pill tt-path-pill-base">{s.tool}</span>
                            {i < baselineMatch.steps.length - 1 && <span className="tt-path-arrow">→</span>}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                    {/* Current path */}
                    <div className="tt-path-col">
                      <p className="tt-path-col-label tt-path-col-label-after">
                        After <span className="tt-path-count">{detailRecord.steps.length} steps</span>
                      </p>
                      <div className="tt-path-pills">
                        {detailRecord.steps.map((s, i) => {
                          const baseTools = baselineMatch.steps.map((b) => b.tool);
                          const isNew = !baseTools.includes(s.tool);
                          return (
                            <Fragment key={i}>
                              <span className={`tt-path-pill${isNew ? " tt-path-pill-new" : " tt-path-pill-base"}`}>
                                {s.tool}
                                {isNew && <span className="tt-path-pill-new-badge">new</span>}
                              </span>
                              {i < detailRecord.steps.length - 1 && <span className="tt-path-arrow">→</span>}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Steps waterfall (non-drifted or baseline tab) */
                <div className="tt-drawer-section">
                  <p className="tt-drawer-label">Steps ({detailRecord.steps.length})</p>
                  <div className="tt-waterfall">
                    {detailRecord.steps.map((step, si) => (
                      <div key={si} className="tt-wf-step">
                        <div className="tt-wf-left">
                          <span className="tt-wf-num">{si + 1}</span>
                          {si < detailRecord.steps.length - 1 && <div className="tt-wf-line" />}
                        </div>
                        <div className="tt-wf-content">
                          <p className="tt-wf-tool">{step.tool}</p>
                          {Object.entries(step.args).length > 0 && (
                            <div className="tt-wf-args">
                              {Object.entries(step.args).map(([k, v]) => (
                                <div key={k} className="tt-wf-arg">
                                  <span className="tt-wf-arg-key">{k}:</span>
                                  <span className="tt-wf-arg-val">{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="tt-wf-result">{step.result_summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full waterfall for drifted traces (after comparison) */}
              {baselineMatch && (
                <div className="tt-drawer-section">
                  <p className="tt-drawer-label">Current Steps ({detailRecord.steps.length})</p>
                  <div className="tt-waterfall">
                    {detailRecord.steps.map((step, si) => {
                      const baseTools = baselineMatch.steps.map((b) => b.tool);
                      const isNew = !baseTools.includes(step.tool);
                      return (
                        <div key={si} className={`tt-wf-step${isNew ? " tt-wf-step-new" : ""}`}>
                          <div className="tt-wf-left">
                            <span className={`tt-wf-num${isNew ? " tt-wf-num-new" : ""}`}>{si + 1}</span>
                            {si < detailRecord.steps.length - 1 && <div className="tt-wf-line" />}
                          </div>
                          <div className="tt-wf-content">
                            <p className="tt-wf-tool">
                              {step.tool}
                              {isNew && <span className="tt-wf-new-badge">new</span>}
                            </p>
                            {Object.entries(step.args).length > 0 && (
                              <div className="tt-wf-args">
                                {Object.entries(step.args).map(([k, v]) => (
                                  <div key={k} className="tt-wf-arg">
                                    <span className="tt-wf-arg-key">{k}:</span>
                                    <span className="tt-wf-arg-val">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="tt-wf-result">{step.result_summary}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Output */}
              <div className="tt-drawer-section">
                <p className="tt-drawer-label">Output</p>
                <p className="tt-drawer-output">{detailRecord.output}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
