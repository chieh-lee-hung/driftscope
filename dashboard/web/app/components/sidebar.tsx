"use client";

import Link from "next/link";
import { DEMO_PROJECTS } from "@/lib/demo-projects";

const PROJECTS = DEMO_PROJECTS.map((project) => ({
  id: project.id,
  label: project.label,
}));

type Props = {
  activeProject: string;
  shouldAlert: boolean;
};

export default function Sidebar({ activeProject, shouldAlert }: Props) {
  return (
    <aside className="sidebar">
      <Link href="/" className="sb-brand">
        <span className="sb-brand-icon">◎</span>
        <span className="sb-brand-name">DriftScope</span>
      </Link>

      <div className="sb-section">
        <p className="sb-section-label">Agents</p>
        <div className="sb-projects">
          {PROJECTS.map((project) => {
            const active = project.id === activeProject;
            return (
              <Link
                key={project.id}
                href={`/dashboard?project=${project.id}`}
                className={`sb-project${active ? " sb-project-active" : ""}`}
              >
                <span className={`sb-project-dot${active && shouldAlert ? " sb-dot-alert" : active ? " sb-dot-ok" : ""}`} />
                <span className="sb-project-label">{project.label}</span>
                {active && shouldAlert ? <span className="sb-project-badge">!</span> : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="sb-divider" />
      <div className="sb-section sb-bottom">
        <Link href="/settings" className="sb-settings-link">
          <span>Settings</span>
        </Link>
        <p className="sb-version">v0.6 · demo</p>
      </div>
    </aside>
  );
}
