"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function IconGrid() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>; }
function IconList() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2.5" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="11.5" width="14" height="2" rx="1"/></svg>; }
function IconBell() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 011 1v.3A5 5 0 0113 7v3l1.4 1.75A.75.75 0 0113.75 13H2.25a.75.75 0 01-.65-1.25L3 10V7A5 5 0 017 2.3V2a1 1 0 011-1zm0 14a2 2 0 01-2-2h4a2 2 0 01-2 2z"/></svg>; }
function IconCompass() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zM4.5 4.5l4 1.5 1.5 4-4-1.5-1.5-4z" clipRule="evenodd"/></svg>; }

type Props = {
  activeProject: string;
  shouldAlert: boolean;
};

const tabs = [
  { key: "dashboard", label: "Overview", icon: IconGrid },
  { key: "traces", label: "Traces", icon: IconList },
  { key: "alerts", label: "Alerts", icon: IconBell },
  { key: "explorer", label: "Explorer", icon: IconCompass },
] as const;

export function ProjectTabs({ activeProject, shouldAlert }: Props) {
  const pathname = usePathname();

  return (
    <div className="project-tabs">
      <nav className="project-tabs-nav">
        {tabs.map((tab) => {
          const href =
            tab.key === "explorer"
              ? `/traces?project=${activeProject}&filter=drifted`
              : `/${tab.key}?project=${activeProject}`;
          const active =
            (tab.key === "dashboard" && pathname === "/dashboard") ||
            (tab.key === "traces" && pathname === "/traces") ||
            (tab.key === "alerts" && pathname === "/alerts");
          const Icon = tab.icon;

          return (
            <Link key={tab.key} href={href} className={`project-tab${active ? " project-tab-active" : ""}`}>
              <span className="sb-nav-icon"><Icon /></span>
              <span>{tab.label}</span>
              {tab.key === "alerts" && shouldAlert ? <span className="sb-badge">1</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
