#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage: scripts/demo.sh [baseUrl] [repo] [prompt]

Default values can also be overridden with the BASE_URL, REPO, and PROMPT environment variables.
EOF
  exit 0
fi

BASE_URL="${1:-${BASE_URL:-http://localhost:3000}}"
REPO="${2:-${REPO:-vercel/turbo}}"
PROMPT="${3:-${PROMPT:-Summarize the highest impact open issues, quick wins, and risks.}}"

encode_prompt() {
  node - <<'NODE' "$1"
const [, , prompt] = process.argv;
console.log(JSON.stringify(prompt ?? ''));
NODE
}

scan_payload=$(cat <<EOF
{"repo":"$REPO"}
EOF
)

analyze_payload=$(cat <<EOF
{"repo":"$REPO","prompt":$(encode_prompt "$PROMPT")}
EOF
)

echo "Health check at $BASE_URL/health"
curl -sSf "$BASE_URL/health"
echo -e "\n"

echo "Scanning repository $REPO"
curl -sSf -X POST "$BASE_URL/scan" \
  -H "Content-Type: application/json" \
  -d "$scan_payload"
echo -e "\n"

echo "Analyzing repository $REPO"
curl -sSf -X POST "$BASE_URL/analyze" \
  -H "Content-Type: application/json" \
  -d "$analyze_payload"
echo
