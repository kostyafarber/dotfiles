#!/usr/bin/env bash
# Print each Shift worktree with its branch, uncommitted file count and commits on no remote.
# Local: worktrees.sh   Remote: ssh -o BatchMode=yes -o ConnectTimeout=8 <host> bash -s < worktrees.sh
repo="${1:-$HOME/repos/shift}"
git -C "$repo" worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r w; do
  [ -d "$w" ] || { echo "$w  (missing)"; continue; }
  b=$(git -C "$w" branch --show-current)
  d=$(git -C "$w" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  u=$(git -C "$w" rev-list --count HEAD --not --remotes 2>/dev/null)
  echo "$w  [${b:-detached}]  dirty=$d  unpushed=$u"
done
