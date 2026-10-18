#!/usr/bin/env bash
# ==============================================================================
# MoneyLens Container Smoke Test Launcher
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if command -v node >/dev/null 2>&1; then
    node "${SCRIPT_DIR}/smoke_test.js" "$@"
else
    echo "Node.js is required to run the MoneyLens smoke test."
    exit 1
fi
