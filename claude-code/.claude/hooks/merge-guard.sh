#!/usr/bin/env bash
# PreToolUse hook for Bash: Kostya merges PRs himself, and pushes need his say-so.
# Blocks `gh pr merge` and the REST merge endpoint; asks before `git push`.
cmd=$(jq -r '.tool_input.command // empty')

decide() {
	jq -n --arg d "$1" --arg r "$2" \
		'{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
	exit 0
}

if grep -qE '(^|[;&|(]|\s)gh\s+pr\s+merge\b|pulls/[0-9]+/merge\b|mergePullRequest|enablePullRequestAutoMerge' <<<"$cmd"; then
	decide deny "Kostya merges PRs himself. Tell him it is ready to merge instead."
fi
if grep -qE '(^|[;&|(]|\s)git(\s+-C\s+\S+)?\s+push\b' <<<"$cmd"; then
	decide ask "git push: confirm Kostya asked for this push."
fi
exit 0
