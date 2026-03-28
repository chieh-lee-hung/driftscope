"use client";

import { useState } from "react";
import type { HistoryPoint } from "@/lib/dashboard-data";

export function DriftTimeline({ history }: { history: HistoryPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (history.length === 0) {
    return <div style={{ color: "var(--text-3)", fontSize: "0.85rem", padding: "20px 0", textAlign: "center" }}>No history data.</div>;
  }

  const W = 520, H = 210;
  const PL = 36, PR = 16, PT = 14, PB = 32;
  const pw = W - PL - PR;
  const ph = H - PT - PB;

  const toX = (i: number) => PL + (i / Math.max(1, history.length - 1)) * pw;
  const toY = (v: number) => PT + (1 - Math.min(v, 1)) * ph;
  const labelFor = (point: HistoryPoint) => point.label ?? point.date;

  const areaPath =
    history.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(p.trajectory_drift)}`).join(" ") +
    ` L${toX(history.length - 1)},${PT + ph} L${toX(0)},${PT + ph} Z`;

  const trajPath = history.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(p.trajectory_drift)}`).join(" ");
  const outPath  = history.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(p.output_drift)}`).join(" ");

  const alertY = toY(0.3);
  const eventIdx = history.findIndex((p) => p.event_label);
  const yTicks = [0, 0.3, 0.6, 1.0];

  // Tooltip position clamped inside viewBox
  function tooltipX(i: number) {
    const x = toX(i);
    if (x + 100 > W) return x - 106;
    return x + 10;
  }

  const hp = hovered !== null ? history[hovered] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="timeline-chart"
        role="img"
        aria-label="Live run timeline chart"
      >
        {/* Grid lines + Y labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PL} y1={toY(v)} x2={W - PR} y2={toY(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={PL - 6} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-sans)">{v}</text>
          </g>
        ))}

        {/* Alert threshold */}
        <line x1={PL} y1={alertY} x2={W - PR} y2={alertY} className="alert-line" />
        <text x={W - PR + 2} y={alertY - 3} fontSize="8" fill="var(--orange)" opacity="0.7" fontFamily="var(--font-sans)">Alert</text>

        {/* Scenario event marker */}
        {eventIdx >= 0 && (
          <g>
            <line x1={toX(eventIdx)} y1={PT + 4} x2={toX(eventIdx)} y2={PT + ph} stroke="var(--orange)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
            <rect
              x={toX(eventIdx) - 42} y={PT - 14}
              width={84} height={14}
              rx={3} fill="var(--orange-bg)"
              stroke="rgba(234,88,12,0.3)" strokeWidth="1"
            />
            <text x={toX(eventIdx)} y={PT - 3} textAnchor="middle" fontSize="8.5" fill="var(--orange)" fontFamily="var(--font-sans)" fontWeight="700">
              {`⚡ ${history[eventIdx].event_label}`}
            </text>
          </g>
        )}

        {/* Area + lines */}
        <path d={areaPath} className="traj-area" />
        <path d={trajPath} className="traj-line" />
        <path d={outPath}  className="out-line" />

        {/* Data points + hit areas */}
        {history.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            {/* invisible hit target */}
            <circle
              cx={toX(i)} cy={toY(p.trajectory_drift)} r="10"
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
            {/* halo when hovered */}
            {hovered === i && <circle cx={toX(i)} cy={toY(p.trajectory_drift)} r="7" fill="var(--orange)" opacity="0.15" />}
            <circle cx={toX(i)} cy={toY(p.trajectory_drift)} r="3.5" className="traj-dot" style={{ pointerEvents: "none" }} />
            <circle cx={toX(i)} cy={toY(p.output_drift)}     r="3"   className="out-dot"  style={{ pointerEvents: "none" }} />
            {/* X label */}
            <text x={toX(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-3)" fontFamily="var(--font-sans)">{labelFor(p)}</text>
          </g>
        ))}

        {/* Tooltip */}
        {hovered !== null && hp && (
          <g style={{ pointerEvents: "none" }}>
            <rect
              x={tooltipX(hovered)} y={toY(hp.trajectory_drift) - 46}
              width={128} height={48}
              rx={5} fill="var(--panel)"
              stroke="var(--border)" strokeWidth="1"
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
            />
            <text x={tooltipX(hovered) + 8} y={toY(hp.trajectory_drift) - 33} fontSize="9" fontWeight="600" fill="var(--text-3)" fontFamily="var(--font-sans)">{labelFor(hp)}</text>
            <circle cx={tooltipX(hovered) + 8} cy={toY(hp.trajectory_drift) - 19} r="3.5" fill="var(--orange)" />
            <text x={tooltipX(hovered) + 15} y={toY(hp.trajectory_drift) - 16} fontSize="9" fill="var(--text)" fontFamily="var(--font-mono)">Traj: {hp.trajectory_drift.toFixed(3)}</text>
            <circle cx={tooltipX(hovered) + 8} cy={toY(hp.trajectory_drift) - 7} r="3" fill="var(--green)" />
            <text x={tooltipX(hovered) + 15} y={toY(hp.trajectory_drift) - 4} fontSize="9" fill="var(--text)" fontFamily="var(--font-mono)">Out:  {hp.output_drift.toFixed(3)}</text>
            {hp.detail ? (
              <text x={tooltipX(hovered) + 8} y={toY(hp.trajectory_drift) + 6} fontSize="8.5" fill="var(--text-3)" fontFamily="var(--font-sans)">
                {hp.detail.length > 26 ? `${hp.detail.slice(0, 26)}…` : hp.detail}
              </text>
            ) : null}
          </g>
        )}
      </svg>

      <div className="chart-legend">
        <span><i className="legend-dot orange" />Trajectory Drift</span>
        <span><i className="legend-dot green"  />Output Drift</span>
      </div>
    </div>
  );
}
