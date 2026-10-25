#!/usr/bin/env bash
# Trim Rust build caches: delete build files not used in the last N days from every
# worktree under ~/worktrees and every checkout under ~/repos, then print free disk.
# A reflinked target/ grows with every rebuild, so run this whenever free space drops
# below about 30 GB, and before a long build or test run.
# Usage: sweep.sh [days]   (default 7)
set -euo pipefail

days=${1:-7}

if command -v cargo-sweep >/dev/null; then
	sweep=(cargo-sweep sweep)
else
	sweep=(nix run nixpkgs#cargo-sweep -- sweep)
fi

echo "before: $(df -h / | awk 'NR==2 { print $4 }') free"
for target in "$HOME"/worktrees/*/target "$HOME"/repos/*/target; do
	[ -d "$target" ] || continue
	project=$(dirname "$target")
	echo "sweep: $project"
	"${sweep[@]}" --time "$days" "$project" >/dev/null || echo "sweep: $project failed" >&2
done
echo "after: $(df -h / | awk 'NR==2 { print $4 }') free"
