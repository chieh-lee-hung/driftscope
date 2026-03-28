#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Resetting DriftScope demo state..."

mkdir -p \
  "$ROOT_DIR/demo/output" \
  "$ROOT_DIR/dashboard/web/public/data/guided-simulated-demo" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-live"

rm -f \
  "$ROOT_DIR/demo/output/guided_simulated_demo_baseline.db" \
  "$ROOT_DIR/demo/output/guided_simulated_demo_current.db" \
  "$ROOT_DIR/demo/output/guided_simulated_demo_bundle.json" \
  "$ROOT_DIR/demo/output/openai_support_live_bundle.json" \
  "$ROOT_DIR/dashboard/web/public/data/guided-simulated-demo/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/guided-simulated-demo/trajectories.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-live/analysis.json" \
  "$ROOT_DIR/dashboard/web/public/data/openai-support-live/trajectories.json" \
  "/tmp/driftscope_openai_support_live_baseline.db" \
  "/tmp/driftscope_openai_support_live_current.db"

echo "Demo data cleared."
echo
echo "Next steps:"
echo "  1. cd dashboard/web && npm run dev"
echo "  2. python3 demo/simulated_dashboard_demo.py"
echo "  3. python3 demo/openai_normal_demo.py"
echo "  4. python3 demo/openai_hidden_drift_demo.py"
