#!/usr/bin/env bash
# Remove what pr-run.sh made for a PR: the worktree ~/repos/<repo>-worktrees/pr-N, its branch
# review/pr-N and the ref origin/pr/N. Close the PR's Rex pane first, so its app has stopped.
#
#   pr-clean.sh <PR URL | number>    one PR (a bare number: a PR of the repo in this directory)
#   pr-clean.sh --closed [repo dir]  every pr-N worktree of the repo whose PR is merged or closed
#
# Refuses a worktree with uncommitted changes or commits the PR doesn't have: they may be review
# notes. --force removes it anyway.
set -euo pipefail

die() { echo "pr-clean: $*" >&2; exit 1; }
force=false
args=()
for a in "$@"; do [ "$a" = --force ] && force=true || args+=("$a"); done
set -- "${args[@]+"${args[@]}"}"

# main checkout + PR number → removes one worktree; prints what it did.
clean() {
	local main=$1 pr=$2 name dir branch
	name=$(basename "$main")
	dir="$HOME/repos/$name-worktrees/pr-$pr"
	branch="review/pr-$pr"
	if [ -d "$dir" ]; then
		if ! $force; then
			[ -z "$(git -C "$dir" status --porcelain)" ] ||
				die "$dir has uncommitted changes; keep them, or rerun with --force"
			local ahead
			ahead=$(git -C "$dir" log --oneline "origin/pr/$pr..HEAD" 2>/dev/null | wc -l | tr -d ' ')
			[ "$ahead" = 0 ] || die "$dir has $ahead commit(s) the PR doesn't; keep them, or rerun with --force"
		fi
		git -C "$main" worktree remove --force "$dir"
		echo "removed $dir"
	fi
	git -C "$main" show-ref -q --verify "refs/heads/$branch" && git -C "$main" branch -q -D "$branch" && echo "deleted $branch"
	git -C "$main" show-ref -q --verify "refs/remotes/origin/pr/$pr" && git -C "$main" update-ref -d "refs/remotes/origin/pr/$pr"
	return 0
}

# A repo's main checkout, from a directory inside it or one of its worktrees.
main_of() { git -C "$1" worktree list --porcelain | awk 'NR==1 { print $2 }'; }

if [ "${1:-}" = --closed ]; then
	main=$(main_of "${2:-$PWD}")
	slug=$(cd "$main" && gh repo view --json nameWithOwner -q .nameWithOwner)
	for dir in "$HOME/repos/$(basename "$main")-worktrees"/pr-*; do
		[ -d "$dir" ] || continue
		pr=${dir##*/pr-}
		[[ "$pr" =~ ^[0-9]+$ ]] || continue
		state=$(gh pr view "$pr" -R "$slug" --json state -q .state 2>/dev/null || echo UNKNOWN)
		case "$state" in
			MERGED | CLOSED) (clean "$main" "$pr") || true ;;
			*) echo "kept pr-$pr ($state)" ;;
		esac
	done
	exit 0
fi

arg=${1:?usage: pr-clean.sh <PR URL | number> | --closed [repo dir]  [--force]}
arg=${arg%/}; arg=${arg%/files}; arg=${arg%/changes}; arg=${arg%%#*}
if [[ "$arg" =~ github\.com/([^/]+)/([^/]+)/pull/([0-9]+) ]]; then
	name=${BASH_REMATCH[2]}
	pr=${BASH_REMATCH[3]}
	main="$HOME/repos/$name"
	[ -d "$main/.git" ] || die "no checkout at $main"
elif [[ "$arg" =~ ^#?([0-9]+)$ ]]; then
	pr=${BASH_REMATCH[1]}
	main=$(main_of "$PWD")
else
	die "not a PR URL or number: $1"
fi
clean "$main" "$pr"
