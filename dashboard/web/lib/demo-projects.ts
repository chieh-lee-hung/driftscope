export type DemoProject = {
  id: string;
  label: string;
  tagline: string;
  description: string;
  mode: "simulated" | "openai";
  outcome: "empty" | "normal" | "hidden";
  command: string;
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
    id: "openai-support-stable",
    label: "Picnic Support — Healthy",
    tagline: "Real GPT-4o-mini agent · no drift · observer stays calm",
    description:
      "The same Picnic support agent runs before and after with the same policy. Observer confirms healthy behavior and takes no action.",
    mode: "openai",
    outcome: "normal",
    command: "python3 demo/openai_normal_demo.py",
    requiresOpenAI: true,
    dashboardPath: "/dashboard?project=openai-support-stable",
    baselineDb: "demo/output/openai_support_stable_baseline.db",
    currentDb: "demo/output/openai_support_stable_current.db",
    analysisJson: "dashboard/web/public/data/openai-support-stable/analysis.json",
    trajectoriesJson: "dashboard/web/public/data/openai-support-stable/trajectories.json",
    terminalPreview: [
      "Picnic Support Agent (baseline)",
      "search_policy -> check_order -> process_refund  ✓",
      "",
      "Picnic Support Agent (same policy)",
      "search_policy -> check_order -> process_refund  ✓",
      "",
      "Observer → Normal · Monitoring only",
    ],
  },
  {
    id: "openai-support-hidden-drift",
    label: "Picnic Support — Drifted",
    tagline: "Real GPT-4o-mini agent · silent policy change · observer reacts",
    description:
      "A Picnic policy update silently adds 2 extra verification steps. Customer answers stay identical — but the observer catches the trajectory change and gates refunds.",
    mode: "openai",
    outcome: "hidden",
    command: "python3 demo/openai_hidden_drift_demo.py",
    requiresOpenAI: true,
    dashboardPath: "/dashboard?project=openai-support-hidden-drift",
    baselineDb: "demo/output/openai_support_hidden_drift_baseline.db",
    currentDb: "demo/output/openai_support_hidden_drift_current.db",
    analysisJson: "dashboard/web/public/data/openai-support-hidden-drift/analysis.json",
    trajectoriesJson: "dashboard/web/public/data/openai-support-hidden-drift/trajectories.json",
    terminalPreview: [
      "Picnic Support Agent (baseline)",
      "search_policy -> check_order -> process_refund  ✓",
      "",
      "Picnic Support Agent (after silent policy update)",
      "search_policy -> check_order -> check_seller_type -> verify_photo -> process_refund  !",
      "",
      "Observer → Hidden Drift 0.58 → Refunds gated",
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
