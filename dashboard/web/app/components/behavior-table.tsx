"use client";

import { Fragment, useState } from "react";

type Example = {
  query: string;
  baseline_path: string[];
  current_path: string[];
  baseline_steps: number;
  current_steps: number;
};

export function BehaviorTable({ examples }: { examples: Example[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  if (examples.length === 0) {
    return <div className="bt-empty">No behavior drift events found.</div>;
  }

  return (
    <table className="bt-table">
      <thead>
        <tr className="bt-thead-row">
          <th className="bt-th bt-th-query">Query</th>
          <th className="bt-th bt-th-num">Before</th>
          <th className="bt-th bt-th-num">After</th>
          <th className="bt-th bt-th-num">Delta</th>
          <th className="bt-th bt-th-expand" />
        </tr>
      </thead>
      <tbody>
        {examples.map((ex, idx) => {
          const baselineSet = new Set(ex.baseline_path);
          const newSteps = ex.current_path.filter((s) => !baselineSet.has(s));
          const newStepSet = new Set(newSteps);
          const delta = ex.current_steps - ex.baseline_steps;
          const isOpen = expanded.has(idx);

          return (
            <Fragment key={idx}>
              <tr
                className={`bt-row${isOpen ? " bt-row-open" : ""}`}
                onClick={() => toggle(idx)}
              >
                <td className="bt-td bt-td-query">
                  <span className="bt-query-text">
                    {ex.query.length > 60 ? ex.query.slice(0, 60) + "…" : ex.query}
                  </span>
                </td>
                <td className="bt-td bt-td-num">
                  <span className="bt-step-count">{ex.baseline_steps}</span>
                </td>
                <td className="bt-td bt-td-num">
                  <span className="bt-step-count">{ex.current_steps}</span>
                </td>
                <td className="bt-td bt-td-num">
                  <span className={`bt-delta ${delta > 0 ? "bt-delta-up" : delta < 0 ? "bt-delta-down" : "bt-delta-zero"}`}>
                    {delta > 0 ? "+" : ""}{delta}
                  </span>
                </td>
                <td className="bt-td bt-td-expand">
                  <button
                    className="bt-chevron"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggle(idx); }}
                  >
                    {isOpen ? "▼" : "▶"}
                  </button>
                </td>
              </tr>
              {isOpen && (
                <tr className="bt-expand-row">
                  <td colSpan={5} className="bt-expand-td">
                    <div className="bt-expand-inner">
                      <div className="bt-path-row">
                        <span className="bt-path-label bt-path-label-before">Before</span>
                        <div className="bt-pills">
                          {ex.baseline_path.map((step, i) => (
                            <span key={`b-${i}`} className="bt-pill bt-pill-base">{step}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bt-path-row">
                        <span className="bt-path-label bt-path-label-after">After</span>
                        <div className="bt-pills">
                          {ex.current_path.map((step, i) => (
                            <span
                              key={`c-${i}`}
                              className={`bt-pill ${newStepSet.has(step) ? "bt-pill-new" : "bt-pill-base"}`}
                            >
                              {step}
                              {newStepSet.has(step) && <span className="bt-new-badge">new</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
