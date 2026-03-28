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
    label: "Guided Support Agent",
    tagline: "A deterministic walkthrough for the first live story",
    description:
      "A mock grocery support agent with deterministic traces and repeatable hidden drift. Best for opening the demo because it always behaves the same way.",
    mode: "simulated",
    outcome: "hidden",
    command: "python3 demo/simulated_dashboard_demo.py",
    dashboardPath: "/dashboard?project=guided-simulated-demo",
    baselineDb: "demo/output/guided_simulated_demo_baseline.db",
    currentDb: "demo/output/guided_simulated_demo_current.db",
    analysisJson: "dashboard/web/public/data/guided-simulated-demo/analysis.json",
    trajectoriesJson: "dashboard/web/public/data/guided-simulated-demo/trajectories.json",
    terminalPreview: [
      "Phase 1 — Baseline support path",
      "search_kb -> generate_response",
      "Phase 2 — Policy updated",
      "search_kb -> lookup_order_context -> verify_eligibility -> generate_response",
      "Result: Hidden Drift",
    ],
  },
  {
    id: "openai-support-stable",
    label: "Stable Support Agent",
    tagline: "A real OpenAI agent under healthy operating conditions",
    description:
      "Runs the same OpenAI-powered grocery support agent twice with the same policy and tool path so DriftScope shows a clean healthy baseline.",
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
      "Phase 1 — Baseline with GPT-4o-mini",
      "search_policy -> check_order -> process_refund",
      "Phase 2 — Same policy, same tools",
      "search_policy -> check_order -> process_refund",
      "Result: Normal",
    ],
  },
  {
    id: "openai-support-hidden-drift",
    label: "Drifted Support Agent",
    tagline: "A real OpenAI agent after a silent behavior change",
    description:
      "Uses the same customer-support workflow as the stable demo, but a policy update adds extra verification steps while the final customer answer stays effectively the same.",
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
      "Phase 1 — Baseline with GPT-4o-mini",
      "search_policy -> check_order -> process_refund",
      "Phase 2 — Updated policy, same customer answers",
      "search_policy -> check_order -> check_seller_type -> verify_photo_evidence -> process_refund",
      "Result: Hidden Drift",
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
