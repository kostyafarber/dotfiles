#!/usr/bin/env bash
# Print each failed check on a PR with the tail of its failed-step log.
# Usage: failed.sh <pr> [repo] [lines]
set -uo pipefail

pr=${1:?usage: failed.sh <pr> [repo] [lines]}
repo=${2:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
lines=${3:-80}

failed=$(gh pr checks "$pr" -R "$repo" --json name,bucket,link \
	--jq '.[] | select(.bucket == "fail") | "\(.link)\t\(.name)"')
if [ -z "$failed" ]; then
	echo "no failed checks on #$pr"
	exit 0
fi

while IFS=$'\t' read -r link name; do
	echo "=================== $name"
	echo "$link"
	job=$(sed -nE 's#.*/job/([0-9]+).*#\1#p' <<<"$link")
	if [ -z "$job" ]; then
		echo "(not a GitHub Actions job; open the link)"
		continue
	fi
	# Strip the per-line "job<TAB>step<TAB>timestamp" prefix, ANSI codes and install noise, then
	# keep the lines leading up to the first ##[error] (the log's tail is post-job cleanup).
	gh run view --job "$job" -R "$repo" --log-failed 2>/dev/null \
		| cut -f3- | sed -E "s/^[0-9T:.-]+Z //; s/"$'\e'"\[[0-9;]*m//g" | cut -c1-300 \
		| grep -vE '^\s*$|^Progress: resolved|\[WARN\] deprecated' \
		| awk -v n="$lines" '{ buf[NR % n] = $0 } /##\[error\]/ { for (i = NR - n + 1; i <= NR; i++) if (i > 0) print buf[i % n]; found = 1; exit }
			END { if (!found) for (i = NR - n + 1; i <= NR; i++) if (i > 0) print buf[i % n] }'
done <<<"$failed"
