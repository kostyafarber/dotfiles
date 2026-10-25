#!/usr/bin/env bash
# Warm a new worktree from the main checkout: reflink the build caches named in the main
# checkout's .worktreeinclude, then install dependencies. Run from inside the new worktree.
# Usage: warm.sh
set -euo pipefail

main=$(git worktree list --porcelain | awk 'NR==1 { print $2 }')
here=$(git rev-parse --show-toplevel)
[ "$main" != "$here" ] || { echo "warm.sh: run inside a linked worktree, not the main checkout" >&2; exit 1; }

if command -v wt >/dev/null; then
	wt=(wt)
else
	wt=(nix run nixpkgs#worktrunk --)
fi

# Repos the skill knows get their .worktreeinclude on first use, kept out of git
# through .git/info/exclude, so every machine copies the same caches.
skill=$(cd "$(dirname "$0")/.." && pwd)
remote=$(git -C "$main" remote get-url origin 2>/dev/null | sed -E 's#^(https?://|ssh://)?(git@)?##; s#:#/#; s#\.git$##')
known="$skill/includes/${remote//\//_}"
if [ ! -f "$main/.worktreeinclude" ] && [ -n "$remote" ] && [ -f "$known" ]; then
	cp "$known" "$main/.worktreeinclude"
	exclude="$(git -C "$main" rev-parse --absolute-git-dir)/info/exclude"
	mkdir -p "$(dirname "$exclude")"
	grep -qxF .worktreeinclude "$exclude" 2>/dev/null || echo .worktreeinclude >>"$exclude"
	echo "warm.sh: wrote $main/.worktreeinclude from $known"
fi

t0=$(date +%s)
if [ -f "$main/.worktreeinclude" ]; then
	"${wt[@]}" step copy-ignored --require-include
else
	echo "warm.sh: no $main/.worktreeinclude, so nothing is copied (see SKILL.md)" >&2
fi
t1=$(date +%s)

if [ -f pnpm-lock.yaml ]; then
	pnpm install --frozen-lockfile --prefer-offline --reporter=silent
fi
t2=$(date +%s)

echo "copy: $((t1 - t0))s  install: $((t2 - t1))s"
df -h / | tail -1 | awk '{ print "disk free: " $4 " (" $5 " used)" }'
