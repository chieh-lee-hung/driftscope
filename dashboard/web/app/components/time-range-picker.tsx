"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const PRESETS = [
  { label: "Last 3 days",  days: 3 },
  { label: "Last 7 days",  days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "All time",     days: null },
] as const;

export function TimeRangePicker({
  project,
  defaultLabel = "Last 7 days",
}: {
  project?: string;
  defaultLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultLabel);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(preset: (typeof PRESETS)[number]) {
    setSelected(preset.label);
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (project) params.set("project", project);
    if (preset.days === null) {
      params.delete("start");
      params.delete("end");
    } else {
      const now = Math.floor(Date.now() / 1000);
      params.set("start", String(now - preset.days * 86400));
      params.set("end",   String(now));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="trp-wrap">
      <button
        className="time-range-pill"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ marginLeft: 4, opacity: 0.5 }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="trp-dropdown" role="listbox">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              role="option"
              aria-selected={selected === p.label}
              className={`trp-option${selected === p.label ? " trp-option-active" : ""}`}
              onClick={() => pick(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
