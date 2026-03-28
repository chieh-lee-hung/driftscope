export type DemoProject = {
  id: string;
  label: string;
  tagline: string;
  description: string;
  mode: "simulated" | "openai";
  outcome: "empty" | "normal" | "hidden";
  command: string;
  followupCommand?: string;
  requiresOpenAI?: boolean;
  dashboardPath: string;
  baselineDb: string;
  currentDb: string;
  analysisJson: string;
  trajectoriesJson: string;
  terminalPreview: string[];
};

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: "guided-simulated-demo",
    label: "Picnic Support — Guided",
    tagline: "Deterministic walkthrough · always behaves the same way",
    description:
      "Start here. A Picnic support agent with a pre-loaded policy change and repeatable hidden drift. The observer detects the trajectory shift and triggers protected mode.",
    mode: "simulated",
    outcome: "hidden",
    command: "python3 demo/simulated_dashboard_demo.py",
    dashboardPath: "/dashboard?project=guided-simulated-demo",
    baselineDb: "demo/output/guided_simulated_demo_baseline.db",
    currentDb: "demo/output/guided_simulated_demo_current.db",
    analysisJson: "dashboard/web/public/data/guided-simulated-demo/analysis.json",
    trajectoriesJson: "dashboard/web/public/data/guided-simulated-demo/trajectories.json",
    terminalPreview: [
      "Picnic Support Agent (baseline)",
      "search_kb -> generate_response  ✓",
      "",
      "Picnic Support Agent (after policy update)",
      "search_kb -> lookup_order -> verify_eligibility -> generate_response  !",
      "",
      "Observer → Hidden Drift detected → Protected mode",
    ],
  },
  {
    id: "openclaw-picnic-live",
    label: "Picnic Refund Agent — Live",
    tagline: "OpenClaw-style refund workflow · DriftScope observer plugin · healthy first, drift later",
    description:
      "This is the main hackathon demo. A Picnic refund agent runs through an OpenClaw-style workflow while DriftScope plugs into the tool-routing layer, watches traces live, and reacts when the refund policy changes silently.",
    mode: "openai",
    outcome: "hidden",
    command: "python3 demo/openclaw_picnic_demo.py",
    requiresOpenAI: true,
    dashboardPath: "/dashboard?project=openclaw-picnic-live",
    baselineDb: "demo/output/openclaw_picnic_live_baseline.db",
    currentDb: "demo/output/openclaw_picnic_live_current.db",
    analysisJson: "dashboard/web/public/data/openclaw-picnic-live/analysis.json",
    trajectoriesJson: "dashboard/web/public/data/openclaw-picnic-live/trajectories.json",
    terminalPreview: [
      "1) Healthy refund run",
      "search_policy -> check_order -> process_refund  ✓",
      "",
      "2) Same agent after silent policy change",
      "search_policy -> check_order -> check_seller_type -> verify_photo -> process_refund  !",
      "",
      "Observer plugin → Hidden Drift → protected mode → owner email",
    ],
  },
];

export const DEFAULT_PROJECT_ID = DEMO_PROJECTS[0].id;

export function getDemoProject(projectId?: string | null): DemoProject {
  return (
    DEMO_PROJECTS.find((project) => project.id === projectId) ??
    DEMO_PROJECTS[0]
  );
}
