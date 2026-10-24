---
name: pr-worktree
description: Start and finish a change in its own git worktree off the remote default branch — create the worktree with dependencies installed, then format the changed files and typecheck the touched packages before committing, so the PR does not go red on format or typecheck. Use when starting any change that will become a PR, when the user says "PR this", "make a PR off main", "new branch for this", or before committing work that lives in a worktree.
---

# PR worktree

The user works in their own checkout in parallel and switches branches without saying so. Every change that becomes a PR is built in its own worktree, cut from `origin/<default branch>`. The local default branch is never the base.

## Quick start

```bash
S=~/.claude/skills/pr-worktree/scripts
$S/new.sh <branch> "$SCRATCH/<short-name>"   # fetch, worktree off origin's default branch, install deps
cd "$SCRATCH/<short-name>"
# ...make the change...
$S/check.sh                                  # format changed files + typecheck touched packages
git add -A && git commit -m "<conventional message>"
```

`$SCRATCH` is the session scratchpad directory. If the branch already exists locally or on origin, `new.sh` checks it out instead of creating it. Pass a third argument to `new.sh`, or the first to `check.sh`, to use another base.

## Workflow

1. **Look first.** Run `git status --short` in the user's checkout and note their branch. Never edit files in their checkout. If they asked for the work to happen there ("do it on the original repo"), do that instead. Where the work lives is their call.
2. **Create.** Run `new.sh <branch> <dir>`. It installs dependencies with the package manager the lockfile names. Do not symlink the main checkout's `node_modules`, because workspace links then resolve to *their* checkout's code, which may be behind the base.
3. **Change.** Make the change in the worktree only.
4. **Check.** Run `check.sh` from the worktree. It:
   - runs the repo's formatter (oxfmt, biome or prettier, whichever is installed) on every changed file, md/yml/json included.
   - runs `typecheck` in each package that contains a changed file and has that script.
   - reverts nothing. Read its `git diff --stat` output and undo formatting of files you did not touch.

   If the repo's AGENTS.md or CLAUDE.md names other pre-PR checks, run those too.
5. **Commit.** If a pre-commit hook fails only in packages you did not touch, and `check.sh` passed, commit with `--no-verify` and say so.
6. **Push and PR.** Only when the user has said to ("PR it", "push it"). Follow the repo's PR conventions for the title and body, then hand off to `ci-wait`.
7. **Leave the worktree.** Do not remove it after the PR is up, because it is kept for follow-ups. Tell the user the path.

## Rules

- Never merge. The user merges.
- In a mutually-conflicting PR series, rebase and push only the PR that merges next. Every push restarts CI.
- A conflict in a generated file (lockfile, compiled catalog, API report): take the base's side, then regenerate it with the repo's script. Do not hand-merge generated files.
