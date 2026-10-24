#!/usr/bin/env bash
# Block until every check on a PR settles, then print a summary.
# Usage: wait.sh <pr> [repo]   (run in the background; the harness reports the exit)
set -uo pipefail

pr=${1:?usage: wait.sh <pr> [repo]}
repo=${2:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}

# Checks can take a few seconds to register after a push.
for _ in 1 2 3 4 5 6; do
	[ -n "$(gh pr checks "$pr" -R "$repo" --json name --jq '.[0].name' 2>/dev/null)" ] && break
	sleep 10
done

gh pr checks "$pr" -R "$repo" --watch --interval 60 >/dev/null 2>&1
gh pr checks "$pr" -R "$repo" --json bucket --jq 'group_by(.bucket) | map("\(.[0].bucket): \(length)") | join(", ")'
gh pr checks "$pr" -R "$repo" --json name,bucket,link --jq '.[] | select(.bucket == "fail") | "FAIL  \(.name)  \(.link)"'
gh pr view "$pr" -R "$repo" --json mergeable,mergeStateStatus --jq '"mergeable: \(.mergeable) (\(.mergeStateStatus))"'
