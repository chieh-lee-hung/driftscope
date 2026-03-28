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
    id: "openai-support-live",
    label: "Picnic Support — Live Agent",
    tagline: "Real GPT-4o-mini agent · same dashboard project · healthy first, drift later",
    description:
      "Run the healthy policy first so the dashboard stays calm, then run the silent policy-change scenario on the same agent workspace. DriftScope keeps watching the same refund agent and reacts when its internal path changes.",
    mode: "openai",
    outcome: "hidden",
    command: "python3 demo/openai_normal_demo.py",
    followupCommand: "python3 demo/openai_hidden_drift_demo.py",
    requiresOpenAI: true,
    dashboardPath: "/dashboard?project=openai-support-live",
    baselineDb: "demo/output/openai_support_live_baseline.db",
    currentDb: "demo/output/openai_support_live_current.db",
    analysisJson: "dashboard/web/public/data/openai-support-live/analysis.json",
    trajectoriesJson: "dashboard/web/public/data/openai-support-live/trajectories.json",
    terminalPreview: [
      "1) Healthy run on the same refund agent",
      "search_policy -> check_order -> process_refund  ✓",
      "",
      "2) Silent policy change on the same agent",
      "search_policy -> check_order -> check_seller_type -> verify_photo -> process_refund  !",
      "",
      "Observer → healthy first, then Hidden Drift → owner notified",
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
