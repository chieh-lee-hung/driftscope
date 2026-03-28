#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-policy_changed}"

if [[ -f "$ROOT_DIR/dashboard/web/.env.local" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/scripts/load_dashboard_env.sh" "$ROOT_DIR/dashboard/web/.env.local" >/dev/null
fi

cd "$ROOT_DIR"
python3 demo/openclaw_picnic_demo.py --mode "$MODE"
