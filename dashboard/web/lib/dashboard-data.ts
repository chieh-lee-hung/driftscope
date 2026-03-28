import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { DEFAULT_PROJECT_ID, getDemoProject } from "@/lib/demo-projects";

const execFileAsync = promisify(execFile);

export type DriftType = "normal" | "input_drift" | "hidden" | "severe";

export type DashboardFilters = {
  project?: string;
  start?: number;
  end?: number;
  limit?: number;
};

export type AnalysisExample = {
  query: string;
  baseline_query?: string;
  query_similarity: number;
  path_similarity?: number;
  baseline_path: string[];
  current_path: string[];
  baseline_steps: number;
  current_steps: number;
};

export type HistoryPoint = {
  date: string;
  trajectory_drift: number;
  output_drift: number;
  event_label?: string | null;
};

export type SampleQuery = {
  query: string;
  baseline_path: string[];
  current_path: string[];
  baseline_output: string;
  current_output: string;
};

export type TrajectoryRecord = {
  id: number;
  project: string;
  query: string;
  steps: Array<{
    tool: string;
    args: Record<string, string>;
    result_summary: string;
    timestamp: number;
  }>;
  output: string;
  duration: number;
  timestamp: number;
};

export type AnalysisData = {
  project: string;
  generated_at: number;
  status: string;
  overall_drift_score: number;
  output_drift: number;
  trajectory_drift: number;
  drift_type: DriftType;
  behavior_drift_ratio: number;
  input_drift_ratio: number;
  same_path_ratio: number;
  baseline_count: number;
  current_count: number;
  should_alert: boolean;
  baseline_response_consistency: number;
  current_response_consistency: number;
  response_consistency_delta: number;
  tool_frequency_drift: number;
  tool_frequency_changes: Array<{
    tool: string;
    baseline_share: number;
    current_share: number;
    share_delta: number;
    baseline_count: number;
    current_count: number;
  }>;
  behavior_drift_examples: AnalysisExample[];
  input_drift_examples: Array<{
    query: string;
    best_match_similarity: number;
    best_match_query: string | null;
  }>;
  history: HistoryPoint[];
  sample_queries: SampleQuery[];
  data_source?: string;
  source_path?: string | null;
  updated_at?: string | null;
};

export type LoaderResult = {
  analysis: AnalysisData;
  source: {
    kind: "sqlite" | "json" | "default";
    path: string | null;
    updated_at: string | null;
  };
};

export type TrajectoryLoaderResult = {
  baseline: TrajectoryRecord[];
  current: TrajectoryRecord[];
  source: {
    kind: "sqlite" | "json" | "default";
    baseline_path?: string | null;
    current_path?: string | null;
    path?: string | null;
  };
};

export const defaultAnalysis: AnalysisData = {
  project: DEFAULT_PROJECT_ID,
  generated_at: Date.now() / 1000,
  status: "insufficient_data",
  overall_drift_score: 0,
  output_drift: 0,
  trajectory_drift: 0,
  drift_type: "normal",
  behavior_drift_ratio: 0,
  input_drift_ratio: 0,
  same_path_ratio: 0,
  baseline_count: 0,
  current_count: 0,
  should_alert: false,
  baseline_response_consistency: 1,
  current_response_consistency: 1,
  response_consistency_delta: 0,
  tool_frequency_drift: 0,
  tool_frequency_changes: [],
  behavior_drift_examples: [],
  input_drift_examples: [],
  history: [],
  sample_queries: [],
  data_source: "default",
  source_path: null,
  updated_at: null
};

export async function loadDashboardData(
  filters: DashboardFilters = {}
): Promise<LoaderResult> {
  const preferJson = filters.project?.startsWith("openai-support-") ?? false;

  if (preferJson) {
    const json = await tryLoadAnalysisFromJson(filters.project);
    if (json) {
      return json;
    }
  }

  const sqlite = await tryLoadAnalysisFromSqlite(filters);
  if (sqlite) {
    return sqlite;
  }

  const json = await tryLoadAnalysisFromJson(filters.project);
  if (json) {
    return json;
  }

  return {
    analysis: {
      ...defaultAnalysis,
      project: filters.project ?? defaultAnalysis.project,
    },
    source: {
      kind: "default",
      path: null,
      updated_at: null
    }
  };
}

export async function loadTrajectoryData(
  filters: DashboardFilters = {}
): Promise<TrajectoryLoaderResult> {
  const preferJson = filters.project?.startsWith("openai-support-") ?? false;

  if (preferJson) {
    const json = await tryLoadTrajectoriesFromJson(filters.project);
    if (json) {
      return json;
    }
  }

  const sqlite = await tryLoadTrajectoriesFromSqlite(filters);
  if (sqlite) {
    return sqlite;
  }

  const json = await tryLoadTrajectoriesFromJson(filters.project);
  if (json) {
    return json;
  }

  return {
    baseline: [],
    current: [],
    source: {
      kind: "default",
      path: null
    }
  };
}

function getProjectDbPaths(project: string | undefined, repoRoot: string) {
  const demoProject = getDemoProject(project);
  return {
    baselineDb: path.join(repoRoot, demoProject.baselineDb),
    currentDb: path.join(repoRoot, demoProject.currentDb),
  };
}

async function tryLoadAnalysisFromSqlite(
  filters: DashboardFilters
): Promise<LoaderResult | null> {
  const repoRoot = getRepoRoot();
  const scriptPath = path.join(repoRoot, "dashboard", "load_dashboard_data.py");
  const { currentDb } = getProjectDbPaths(filters.project, repoRoot);

  try {
    await fs.access(scriptPath);
    await fs.access(currentDb);
  } catch {
    return null;
  }

  try {
    const args = buildPythonArgs("analysis", [currentDb], filters);
    const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
      cwd: repoRoot
    });
    const parsed = JSON.parse(stdout) as LoaderResult;
    return {
      analysis: normalizeAnalysis(parsed.analysis, {
        kind: "sqlite",
        path: parsed.source.path,
        updated_at: parsed.source.updated_at
      }),
      source: {
        kind: "sqlite",
        path: parsed.source.path,
        updated_at: parsed.source.updated_at
      }
    };
  } catch {
    return null;
  }
}

async function tryLoadTrajectoriesFromSqlite(
  filters: DashboardFilters
): Promise<TrajectoryLoaderResult | null> {
  const repoRoot = getRepoRoot();
  const scriptPath = path.join(repoRoot, "dashboard", "load_dashboard_data.py");
  const { baselineDb, currentDb } = getProjectDbPaths(filters.project, repoRoot);

  try {
    await fs.access(scriptPath);
    await fs.access(baselineDb);
    await fs.access(currentDb);
  } catch {
    return null;
  }

  try {
    const args = buildPythonArgs("trajectories", [baselineDb, currentDb], filters);
    const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
      cwd: repoRoot
    });
    return JSON.parse(stdout) as TrajectoryLoaderResult;
  } catch {
    return null;
  }
}

async function tryLoadAnalysisFromJson(project?: string): Promise<LoaderResult | null> {
  const candidates: string[] = [];
  if (project) {
    candidates.push(path.join(process.cwd(), "public", "data", project, "analysis.json"));
    candidates.push(path.join(getRepoRoot(), "demo", "output", `${project.replace(/-/g, "_")}_bundle.json`));
  } else {
    candidates.push(path.join(process.cwd(), "public", "data", "analysis.json"));
    candidates.push(path.join(getRepoRoot(), "demo", "output", "demo_bundle.json"));
  }

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw) as AnalysisData | { analysis: AnalysisData };
      const analysis = "analysis" in parsed ? parsed.analysis : parsed;
      const stat = await fs.stat(candidate);
      return {
        analysis: normalizeAnalysis(analysis, {
          kind: "json",
          path: candidate,
          updated_at: stat.mtime.toISOString()
        }),
        source: {
          kind: "json",
          path: candidate,
          updated_at: stat.mtime.toISOString()
        }
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function tryLoadTrajectoriesFromJson(project?: string): Promise<TrajectoryLoaderResult | null> {
  const candidates: string[] = [];
  if (project) {
    candidates.push(path.join(process.cwd(), "public", "data", project, "trajectories.json"));
    candidates.push(path.join(getRepoRoot(), "demo", "output", `${project.replace(/-/g, "_")}_bundle.json`));
  } else {
    candidates.push(path.join(process.cwd(), "public", "data", "trajectories.json"));
    candidates.push(path.join(getRepoRoot(), "demo", "output", "demo_bundle.json"));
  }

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw) as
        | { baseline: TrajectoryRecord[]; current: TrajectoryRecord[] }
        | { analysis: AnalysisData; baseline: TrajectoryRecord[]; current: TrajectoryRecord[] };
      const stat = await fs.stat(candidate);
      return {
        baseline: parsed.baseline ?? [],
        current: parsed.current ?? [],
        source: {
          kind: "json",
          path: candidate,
          baseline_path: candidate,
          current_path: candidate
        }
      };
    } catch {
      continue;
    }
  }
  return null;
}

function buildPythonArgs(
  mode: "analysis" | "trajectories",
  dbPaths: string[],
  filters: DashboardFilters
) {
  const args = [mode, ...dbPaths];
  if (filters.project) {
    args.push("--project", filters.project);
  }
  if (typeof filters.start === "number" && Number.isFinite(filters.start)) {
    args.push("--start", String(filters.start));
  }
  if (typeof filters.end === "number" && Number.isFinite(filters.end)) {
    args.push("--end", String(filters.end));
  }
  if (mode === "trajectories" && typeof filters.limit === "number") {
    args.push("--limit", String(filters.limit));
  }
  return args;
}

function normalizeAnalysis(
  analysis: Partial<AnalysisData>,
  source: LoaderResult["source"]
): AnalysisData {
  return {
    ...defaultAnalysis,
    ...analysis,
    data_source: source.kind,
    source_path: source.path,
    updated_at: source.updated_at
  };
}

function getRepoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}
