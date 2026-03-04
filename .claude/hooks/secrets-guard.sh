#!/bin/bash
# RC Engine -- Secrets Guard Hook
# Blocks tool calls that attempt to read, write, or expose secrets.
#
# Usage in Claude Code settings:
#   hooks:
#     PreToolUse:
#       - command: ".claude/hooks/secrets-guard.sh"
#         event: PreToolUse
#
# Input: receives JSON on stdin with tool_name, tool_input fields
# Output: exits 0 to allow, exits 2 to block (with reason on stderr)

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || echo "")
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // ""' 2>/dev/null || echo "")

# Patterns that indicate secrets access
SECRET_PATTERNS=(
  '\.env'
  '\.env\.'
  'credentials\.json'
  '\.ssh/'
  '\.aws/'
  '\.config/gcloud/'
  '\.docker/config\.json'
  '\.kube/config'
  '\.npmrc'
  '\.pem$'
  '\.key$'
  'secrets/'
  'secret[_./]'
  'API_KEY='
  'api_key='
  'apiKey='
  'SECRET_KEY'
  'PASSWORD='
  'password='
  '_TOKEN='
  'PRIVATE_KEY'
)

# Check if tool input references any secret patterns
for pattern in "${SECRET_PATTERNS[@]}"; do
  if echo "$TOOL_INPUT" | grep -qiE "$pattern"; then
    echo "BLOCKED: Tool '$TOOL_NAME' attempted to access a secrets-related path or value matching pattern '$pattern'. This is prohibited by RC Engine security policy." >&2
    exit 2
  fi
done

# Allow the tool call
exit 0
