import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(pluginRoot, "..");
const runnerPath = path.join(repoRoot, "scripts", "run_picnic_refund_replay.sh");
const dashboardUrl = "http://localhost:3000/dashboard?project=openclaw-picnic-live";

function trimBlock(text, max = 2000) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

function buildSuccessMessage(mode, stdout, stderr) {
  const parts = [
    `OpenClaw triggered the Picnic refund replay in \`${mode}\` mode.`,
    `Dashboard: ${dashboardUrl}`,
  ];

  const cleanStdout = trimBlock(stdout?.trim() ?? "");
  const cleanStderr = trimBlock(stderr?.trim() ?? "");

  if (cleanStdout) {
    parts.push("", "Runner output:", cleanStdout);
  }
  if (cleanStderr) {
    parts.push("", "Runner stderr:", cleanStderr);
  }
  return parts.join("\n");
}

function buildErrorMessage(mode, error) {
  const stdout = trimBlock(error?.stdout?.trim?.() ?? "");
  const stderr = trimBlock(error?.stderr?.trim?.() ?? "");
  const message = error?.message ?? "Unknown execution error";

  return [
    `OpenClaw failed to trigger the Picnic refund replay in \`${mode}\` mode.`,
    `Dashboard: ${dashboardUrl}`,
    "",
    `Error: ${message}`,
    stdout ? `\nRunner output:\n${stdout}` : "",
    stderr ? `\nRunner stderr:\n${stderr}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default definePluginEntry({
  id: "driftscope-openclaw-demo",
  name: "DriftScope OpenClaw Demo",
  description:
    "Registers a Picnic refund replay tool that triggers the DriftScope live demo from a real OpenClaw plugin entrypoint.",
  register(api) {
    api.logger?.info?.("DriftScope OpenClaw Demo: registering driftscope-openclaw-demo");
    api.registerTool(
      () => ({
        name: "driftscope-openclaw-demo",
        description:
          "Trigger the DriftScope Picnic refund replay. Use healthy first, then policy_changed to show hidden drift on the same dashboard.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: {
              type: "string",
              enum: ["healthy", "policy_changed"],
              description:
                "healthy keeps the refund workflow stable; policy_changed replays the same workload after the refund policy silently changes.",
            },
          },
          required: ["mode"],
        },
        async execute(_id, params) {
          const mode = params?.mode === "healthy" ? "healthy" : "policy_changed";

          try {
            const { stdout, stderr } = await execFileAsync(
              "bash",
              [runnerPath, mode],
              {
                cwd: repoRoot,
                env: process.env,
                maxBuffer: 10 * 1024 * 1024,
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: buildSuccessMessage(mode, stdout, stderr),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: buildErrorMessage(mode, error),
                },
              ],
              isError: true,
            };
          }
        },
      }),
      { name: "driftscope-openclaw-demo", optional: true }
    );
  },
});
