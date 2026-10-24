#!/usr/bin/env bash
# Format the files this branch changes and typecheck each package it touches.
# Usage: check.sh [base]   (from the worktree; base defaults to origin's default branch)
set -uo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
base=${1:-$(git symbolic-ref -q --short refs/remotes/origin/HEAD || echo origin/main)}
fork=$(git merge-base "$base" HEAD)

# Committed, staged, unstaged and untracked changes since the fork point.
changed=$( { git diff --name-only --diff-filter=d "$fork"; git ls-files --others --exclude-standard; } | sort -u)
if [ -z "$changed" ]; then
	echo "no changes since $base"
	exit 0
fi

# The repo's own formatter, if it has one installed.
formattable=$(grep -E '\.(js|jsx|ts|tsx|cjs|mjs|cts|mts|css|scss|md|mdx|html|yml|yaml|json|jsonc)$' <<<"$changed" || true)
bin=node_modules/.bin
if [ -n "$formattable" ]; then
	if [ -x $bin/oxfmt ]; then
		echo "== oxfmt"
		xargs $bin/oxfmt --no-error-on-unmatched-pattern <<<"$formattable"
	elif [ -x $bin/biome ]; then
		echo "== biome format"
		xargs $bin/biome format --write --no-errors-on-unmatched <<<"$formattable"
	elif [ -x $bin/prettier ]; then
		echo "== prettier"
		xargs $bin/prettier --write --ignore-unknown <<<"$formattable"
	fi
fi

# The nearest package.json above each changed file that has a typecheck script.
pkgs=$(while read -r f; do
	d=$(dirname "$f")
	while :; do
		if [ -f "$d/package.json" ] && jq -e '.scripts.typecheck' "$d/package.json" >/dev/null 2>&1; then
			echo "$d"
			break
		fi
		[ "$d" = . ] && break
		d=$(dirname "$d")
	done
done <<<"$changed" | sort -u)

if [ -f pnpm-lock.yaml ]; then run=(pnpm -C)
elif [ -f bun.lock ] || [ -f bun.lockb ]; then run=(bun run --cwd)
elif [ -f yarn.lock ]; then run=(yarn --cwd)
else run=(npm --prefix)
fi

status=0
for pkg in $pkgs; do
	echo "== $pkg typecheck"
	if [ "${run[0]}" = npm ]; then npm --prefix "$pkg" run typecheck || status=1
	else "${run[@]}" "$pkg" typecheck || status=1
	fi
done

echo "== diff --stat (revert formatting of files you did not touch)"
git diff --stat
[ $status -eq 0 ] && echo "check: ok" || echo "check: FAILED"
exit $status
