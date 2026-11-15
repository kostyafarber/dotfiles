#!/usr/bin/env bash
# Run a pull request's dev app: fetch the PR into ~/repos/<repo>-worktrees/pr-N, install
# dependencies, pick the app the PR changes and start it with the repo's recipe.
#
#   pr-run.sh <PR URL | number> [app]
#
# A bare number means a PR of the repo in the current directory. Each step prints
# "▸ <step>"; a failed step prints "✗ <step> failed". Either way the pane stays open in a
# shell in the worktree.
set -uo pipefail

skill=$(cd "$(dirname "$0")/.." && pwd)
step() { echo; echo "▸ $*"; }
fail() { echo; echo "✗ $current failed${1:+: $1}"; cd "${dir:-$HOME}" 2>/dev/null; exec "${SHELL:-zsh}" -l; }
run() { current=$1; shift; step "$current"; "$@" || fail; }

arg=${1:?usage: pr-run.sh <PR URL | number> [app]}
app=${2:-}

# --- which repo and PR ------------------------------------------------------
current="resolve the PR"
step "$current"
arg=${arg%/}; arg=${arg%/files}; arg=${arg%/changes}; arg=${arg%%#*}
if [[ "$arg" =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
	slug="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
	pr=${BASH_REMATCH[3]}
elif [[ "$arg" =~ ^#?([0-9]+)$ ]]; then
	pr=${BASH_REMATCH[1]}
	slug=$(gh repo view --json nameWithOwner -q .nameWithOwner) || fail "no PR URL, and $PWD is not a GitHub repo"
else
	fail "not a PR URL or number: $1"
fi
name=${slug#*/}

# The main checkout: ~/repos/<name>, else any ~/repos/* whose origin is this repo.
origin_slug() { git -C "$1" remote get-url origin 2>/dev/null | sed -E 's#^(https?://|ssh://)?(git@)?github\.com[:/]##; s#\.git$##'; }
main=""
for candidate in "$HOME/repos/$name" "$HOME"/repos/*/; do
	candidate=${candidate%/}
	[ -d "$candidate/.git" ] || continue # a main checkout, not a linked worktree
	if [ "$(origin_slug "$candidate")" = "$slug" ]; then main=$candidate; break; fi
done
[ -n "$main" ] || fail "no checkout of $slug under ~/repos; clone it to ~/repos/$name"

IFS=$'\t' read -r base title < <(gh pr view "$pr" -R "$slug" --json baseRefName,title -q '[.baseRefName, .title] | join("\t")') ||
	fail "can't read PR #$pr of $slug"
dir="$HOME/repos/$name-worktrees/pr-$pr"
branch="review/pr-$pr"
echo "$slug #$pr: $title"
echo "checkout $main → worktree $dir"

# --- worktree on the PR's head ------------------------------------------------
current="fetch the PR"
step "$current"
git -C "$main" fetch -q origin "+refs/pull/$pr/head:refs/remotes/origin/pr/$pr" "$base" || fail
if [ -d "$dir" ]; then
	cd "$dir" || fail
	[ "$(git branch --show-current)" = "$branch" ] || fail "$dir is on $(git branch --show-current), not $branch"
	git merge -q --ff-only "origin/pr/$pr" ||
		fail "can't fast-forward $branch to the PR (force-pushed, or local commits: git log origin/pr/$pr..HEAD)"
else
	mkdir -p "$(dirname "$dir")"
	if git -C "$main" show-ref -q --verify "refs/heads/$branch"; then
		git -C "$main" worktree add -q "$dir" "$branch" || fail
		cd "$dir" && git merge -q --ff-only "origin/pr/$pr" || fail "can't fast-forward $branch to the PR"
	else
		git -C "$main" worktree add -q --no-track -b "$branch" "$dir" "origin/pr/$pr" || fail
	fi
	cd "$dir" || fail
fi
git log -1 --format='%h %s'

# --- dependencies ---------------------------------------------------------------
# Native modules (node-gyp) fail when xcode-select picks an Xcode whose clang is older than
# the Command Line Tools SDK the build finds. Build with the CLT's own clang then.
clt=/Library/Developer/CommandLineTools
if [ "$(uname)" = Darwin ] && [ -z "${DEVELOPER_DIR:-}" ] && [ -x "$clt/usr/bin/clang" ] &&
	[ "$(xcode-select -p 2>/dev/null)" != "$clt" ] && [[ "$(xcrun --show-sdk-path 2>/dev/null)" == "$clt"/* ]]; then
	export DEVELOPER_DIR=$clt
	echo "DEVELOPER_DIR=$clt (xcode-select's Xcode is older than the SDK the build uses)"
fi
[ -f .envrc ] && command -v direnv >/dev/null && { direnv allow . && eval "$(direnv export bash 2>/dev/null)"; }
if [ -f pnpm-lock.yaml ]; then
	run "install (pnpm)" "$HOME/.claude/skills/worktrees/scripts/warm.sh"
elif [ -f bun.lock ] || [ -f bun.lockb ]; then
	run "install (bun)" bun install --frozen-lockfile
elif [ -f yarn.lock ]; then
	run "install (yarn)" yarn install --immutable
elif [ -f package-lock.json ]; then
	run "install (npm)" npm ci --prefer-offline --no-audit --no-fund
fi

# --- the app --------------------------------------------------------------------
current="pick the app"
step "$current"
name="${slug//\//_}.sh"
recipe="$skill/recipes/$name"
# Work repos' recipes live in the private work repo, never in this public one.
[ -f "$recipe" ] || recipe="$HOME/.dotfiles/work/run-pr/recipes/$name"
[ -f "$recipe" ] || fail "no recipe for $slug: write it in $skill/recipes/ (public) or ~/.dotfiles/work/run-pr/recipes/ (work); see SKILL.md"
export PR=$pr PR_DIR=$dir PR_SLUG=$slug
# shellcheck source=/dev/null
source "$recipe"
if [ -z "$app" ]; then
	while read -r file; do
		app=$(pick_app "$file")
		[ -n "$app" ] && break
	done < <(git diff --name-only "origin/$base...HEAD")
	app=${app:-${default_app:-}}
fi
[ -n "$app" ] || fail "none of the PR's files belong to an app the recipe knows; pass one: pr-run.sh $pr <app>"
declare -F "run_$app" >/dev/null || fail "the recipe has no run_$app"
echo "$app"

current="start the app ($app)"
step "$current"
"run_$app"
status=$?
echo
[ "$status" -eq 0 ] && echo "■ the app exited" || echo "✗ $current failed: exit $status"
exec "${SHELL:-zsh}" -l
