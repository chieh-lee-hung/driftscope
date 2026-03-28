#!/usr/bin/env bash

set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_PATH="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  SCRIPT_PATH="$(print -r -- "${(%):-%N}")"
else
  SCRIPT_PATH="$0"
fi

ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"

echo "Resetting DriftScope demo state..."

mkdir -p \
  "$ROOT_DIR/demo/output" \
  "$ROOT_DIR/dashboard/web/public/data/guided-simulated-demo" \
  "$ROOT_DIR/dashboard/web/public/data/openclaw-picnic-live" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-stable" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-hidden-drift" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-live"

rm -f \
  "$ROOT_DIR/demo/output/guided_simulated_demo_baseline.db" \
  "$ROOT_DIR/demo/output/guided_simulated_demo_current.db" \
  "$ROOT_DIR/demo/output/guided_simulated_demo_bundle.json" \
  "$ROOT_DIR/demo/output/openai_support_stable_baseline.db" \
  "$ROOT_DIR/demo/output/openai_support_stable_current.db" \
  "$ROOT_DIR/demo/output/openai_support_stable_bundle.json" \
  "$ROOT_DIR/demo/output/openai_support_hidden_drift_baseline.db" \
  "$ROOT_DIR/demo/output/openai_support_hidden_drift_current.db" \
  "$ROOT_DIR/demo/output/openai_support_hidden_drift_bundle.json" \
  "$ROOT_DIR/demo/output/openai_support_live_baseline.db" \
  "$ROOT_DIR/demo/output/openai_support_live_current.db" \
  "$ROOT_DIR/demo/output/openai_support_live_bundle.json" \
  "$ROOT_DIR/demo/output/openclaw_picnic_live_bundle.json" \
  "$ROOT_DIR/demo/output/test_check_baseline.db" \
  "$ROOT_DIR/demo/output/test_check_baseline.db-journal" \
  "$ROOT_DIR/dashboard/web/public/data/guided-simulated-demo/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/guided-simulated-demo/trajectories.json" \
  "$ROOT_DIR/dashboard/web/public/data/openclaw-picnic-live/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/openclaw-picnic-live/trajectories.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-stable/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-stable/trajectories.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-hidden-drift/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-hidden-drift/trajectories.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-live/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-live/trajectories.json" \
  "/tmp/driftscope_openclaw_picnic_live_baseline.db" \
  "/tmp/driftscope_openclaw_picnic_live_current.db" \
  "/tmp/driftscope_openai_support_stable_baseline.db" \
  "/tmp/driftscope_openai_support_stable_current.db" \
  "/tmp/driftscope_openai_support_hidden_drift_baseline.db" \
  "/tmp/driftscope_openai_support_hidden_drift_current.db" \
  "/tmp/driftscope_openai_support_live_baseline.db" \
  "/tmp/driftscope_openai_support_live_current.db"

echo "Demo data cleared."
echo
echo "Next steps:"
echo "  1. cd dashboard/web && npm run dev"
echo "  2. python3 demo/simulated_dashboard_demo.py"
echo "  3. python3 demo/openclaw_picnic_demo.py"
echo "  4. (optional) python3 demo/openai_normal_demo.py"
echo "  5. (optional) python3 demo/openai_hidden_drift_demo.py"
