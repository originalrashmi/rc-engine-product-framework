#!/bin/bash
# RC Engine -- Audit Logger Hook
# Logs every tool call to .rc-engine/audit/ for compliance and debugging.
#
# Usage in Claude Code settings:
#   hooks:
#     PostToolUse:
#       - command: ".claude/hooks/audit-logger.sh"
#         event: PostToolUse
#
# Input: receives JSON on stdin with tool_name, tool_input, tool_output fields
# Output: appends structured JSON line to daily audit log

set -euo pipefail

AUDIT_DIR=".rc-engine/audit"
mkdir -p "$AUDIT_DIR"

# Daily log file -- one per day, append-only
LOG_FILE="$AUDIT_DIR/$(date -u +%Y-%m-%d).jsonl"

# Read the hook event from stdin
INPUT=$(cat)

# Extract fields safely
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")

# Build audit record -- NEVER log tool_input or tool_output (may contain secrets)
RECORD=$(jq -n \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)" \
  --arg tool "$TOOL_NAME" \
  --arg session "$SESSION_ID" \
  --arg pid "$$" \
  '{
    timestamp: $ts,
    tool: $tool,
    session: $session,
    pid: $pid,
    event: "PostToolUse"
  }')

# Append to daily log (atomic via single write)
echo "$RECORD" >> "$LOG_FILE"
