#!/bin/bash
# RC Engine -- Cost Guard Hook
# Monitors cumulative tool calls per session and warns at thresholds.
#
# Usage in Claude Code settings:
#   hooks:
#     PostToolUse:
#       - command: ".claude/hooks/cost-guard.sh"
#         event: PostToolUse
#
# Tracks call count in a temp file per session. Warns at 50, 100, 150 calls.
# Does NOT block -- only warns. Blocking is done by budget module in code.

set -euo pipefail

COUNTER_DIR=".rc-engine/cache"
mkdir -p "$COUNTER_DIR"

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

COUNTER_FILE="$COUNTER_DIR/session-${SESSION_ID}-calls.count"

# Increment counter (atomic: flock prevents race conditions)
(
  flock -x 200
  if [ -f "$COUNTER_FILE" ]; then
    COUNT=$(cat "$COUNTER_FILE")
    COUNT=$((COUNT + 1))
  else
    COUNT=1
  fi
  echo "$COUNT" > "$COUNTER_FILE"
  echo "$COUNT"
) 200>"$COUNTER_FILE.lock"
COUNT=$(cat "$COUNTER_FILE")

# Warn at thresholds
if [ "$COUNT" -eq 50 ]; then
  echo "Cost warning: 50 tool calls in this session. Review token usage." >&2
elif [ "$COUNT" -eq 100 ]; then
  echo "Cost warning: 100 tool calls in this session. Consider checkpointing." >&2
elif [ "$COUNT" -eq 150 ]; then
  echo "Cost alert: 150 tool calls in this session. High usage detected." >&2
fi

exit 0
