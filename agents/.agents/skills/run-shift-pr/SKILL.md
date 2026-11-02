---
name: run-shift-pr
description: Run a Shift pull request's dev app in a Rex pane split under this one — fetch the PR into ~/repos/shift-worktrees/pr-N, install, build native, start Electron with its own profile — then watch the pane and fix whatever stops it. Use when Kostya says "/run-shift-pr N", "run PR N", "open #N in the app", "let me try #N", or pastes a Shift PR URL and wants to see it running.
---

# Run a Shift PR

The work is already scripted: the Rex action `shift_pr_run` (in `~/.dotfiles/rex/.config/rex/init.lua`)
splits a pane under the one you name and runs `shift-review run <N>` (in
`~/.dotfiles/rex/.local/bin/shift-review`) there. Your job is to start it, watch it, and get it to a
running app.

## 1. Start it

Take the PR number from the argument (a URL works too: the action takes the trailing number).

```bash
rex do -s "$REX_SESSION" -b "$REX_BLOCK" shift_pr_run pr=<N>
```

Add `debug=true` only when he asks for a debug build or Rust backtraces. The result's `block_id` is
the new pane and `dir` is the worktree. Any earlier `shift-run` pane in this tab is closed first, so
rerunning is safe.

What the pane does, each step printed as `▸ <step>`:

1. fetch `pull/N/head` into `origin/pr/N`; create the worktree on `review/pr-N`, or fast-forward it
2. `direnv allow`, then `pnpm install`
3. `cargo build --release -p shift-cli`, only when the Rust differs from the last build
4. `pnpm build:native` (minutes after a Rust change)
5. `electron-forge start` with the profile `~/Library/Application Support/Shift Dev PR N`

On failure it prints `✗ <step> failed` and drops to a shell in the worktree.

## 2. Watch it

Tell him in one line it has started. Then use `Monitor` (load with `ToolSearch select:Monitor`) on a
loop that greps the pane until the app starts or a step fails, instead of sleeping:

```bash
until rex capture -s "$REX_SESSION" -b <block_id> --trim | grep -qE '▸ start the app|✗ .* failed'; do sleep 5; done
```

- **`▸ start the app`**: wait a few seconds more, capture the tail once to check Electron didn't crash
  on launch, then say it's running and which PR it is. Done.
- **`✗ … failed`**: read the tail (`rex capture … --trim | tail -80`), find the cause, fix it, rerun
  step 1.

## 3. Common failures

| Pane says | Cause | Fix |
|---|---|---|
| `fetch PR` failed, "Not possible to fast-forward" | the PR was force-pushed, or the worktree has local commits | if `git -C <dir> log origin/pr/N..HEAD` is empty: `git -C <dir> reset --hard origin/pr/N`; otherwise ask him first |
| `fetch PR` failed, worktree already exists / branch checked out elsewhere | `review/pr-N` is in another worktree | `git worktree list`; ask before removing anything |
| `pnpm install` failed, lockfile out of date | the PR's lockfile is behind its `package.json` | it's the PR's bug; tell him, don't fix it in the worktree |
| `build:native` Rust compile errors | the PR doesn't build | report the first error with its file:line; don't patch the PR |
| app exits right after start, or "Worker exited unexpectedly" | stale or unsigned `.node` | rerun; the build step rebuilds it |
| app quits silently at start | another app already holds that profile | quit the other Shift Dev PR N window, rerun |

Uncommitted changes in a PR worktree may be his review notes. Never reset, stash or delete them without
asking. Never commit or push from the PR worktree.

## Notes

- The pane runs under its own profile per PR, so it sits beside his everyday Shift Dev and other PRs.
- To read the PR itself while it builds: `gh pr view <N>`.
- The app is his to try. Don't drive it unless asked.
