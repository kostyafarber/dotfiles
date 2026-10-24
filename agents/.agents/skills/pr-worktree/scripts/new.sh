#!/usr/bin/env bash
# Create a worktree for a PR branch, based on the remote default branch, with dependencies installed.
# Usage: new.sh <branch> <dir> [base]   (base defaults to origin's default branch)
set -euo pipefail

branch=${1:?usage: new.sh <branch> <dir> [base]}
dir=${2:?usage: new.sh <branch> <dir> [base]}
main=$(git worktree list --porcelain | awk 'NR==1 { print $2 }')
base=${3:-$(git -C "$main" symbolic-ref -q --short refs/remotes/origin/HEAD | sed 's#^origin/##' || echo main)}

git -C "$main" fetch -q origin "$base"
if git -C "$main" show-ref -q --verify "refs/heads/$branch"; then
	git -C "$main" worktree add -q "$dir" "$branch"
elif git -C "$main" ls-remote -q --exit-code --heads origin "$branch" >/dev/null; then
	git -C "$main" fetch -q origin "$branch"
	git -C "$main" worktree add -q --track -b "$branch" "$dir" "origin/$branch"
else
	git -C "$main" worktree add -q --no-track -b "$branch" "$dir" "origin/$base"
fi

cd "$dir"
# Install with whichever package manager the lockfile names. A fresh install, not a symlinked
# node_modules, so workspace links resolve to this worktree's code. pnpm repos are warmed by
# the worktrees skill, which also reflinks the build caches the main checkout's .worktreeinclude names.
if [ -f pnpm-lock.yaml ]; then
	"$HOME/.dotfiles/agents/.agents/skills/worktrees/scripts/warm.sh"
elif [ -f bun.lock ] || [ -f bun.lockb ]; then
	bun install --frozen-lockfile
elif [ -f yarn.lock ]; then
	yarn install --immutable
elif [ -f package-lock.json ]; then
	npm ci --prefer-offline --no-audit --no-fund
fi
echo "worktree: $dir"
echo "base:     origin/$base"
echo "branch:   $branch @ $(git log -1 --format='%h %s')"
