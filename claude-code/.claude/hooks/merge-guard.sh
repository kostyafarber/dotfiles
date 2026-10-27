#!/usr/bin/env bash
# PreToolUse hook for Bash: pushes need Kostya's say-so.
# Asks before `git push`.
cmd=$(jq -r '.tool_input.command // empty')

decide() {
	jq -n --arg d "$1" --arg r "$2" \
		'{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
	exit 0
}

if grep -qE '(^|[;&|(]|\s)git(\s+-C\s+\S+)?\s+push\b' <<<"$cmd"; then
	decide ask "git push: confirm Kostya asked for this push."
fi
exit 0
