---
name: run-pr
description: Run a pull request's dev app in a Rex pane split under this one — fetch the PR into ~/repos/<repo>-worktrees/pr-N, install, pick the app the PR changes, start it with that repo's recipe — then watch the pane and fix whatever stops it; and clean it all up (pane, worktree, branch) when the user is done. Works for any repo with a recipe (Shift, plus any recipes in the private work repo) and writes the recipe for a new repo. Use when the user says "/run-pr", "run PR N", "open #N in the app", "let me try this PR", "run the dev app for…", or pastes a PR URL and wants to see it running; and to clean up, "/run-pr clean N", "clean up #N", "done with this PR", "remove the PR worktree", "clean up old PRs".
---

# Run a PR's dev app

`scripts/pr-run.sh <PR URL | number> [app]` does the work in a pane. Your job is to start it, watch it, and get it to a running app.

`/run-pr <PR>` runs it (sections 1–2). `/run-pr test` tests the running PR (section 3). `/run-pr clean <PR>`, or `/run-pr clean closed`, cleans up (section 4).

**Which PR?** When the user says "test it", "the PR", "clean it up" or `/run-pr` with no number, look for the PR in this tab: `rex block ls -s "$REX_SESSION"` lists every pane with its window and label. The `PR #<N>` pane in the same window as `$REX_BLOCK` (the id's last six characters) is the one they mean. Use that number, and say which PR you picked. If there's none, or several, ask.

## 1. Start it

```bash
rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=below --ratio 40 --label "PR #<N>" --focus=false --json \
  -- ~/.claude/skills/run-pr/scripts/pr-run.sh <PR URL>
```

Save `.block_ids[0]` as the pane. A bare number means a PR of the repo in this directory. Pass an app name as the second argument only when the user names one, or when the PR touches several apps.

Tell the user in one line that it has started and where the worktree is.

What the pane does, each step printed as `▸ <step>`:

1. **resolve the PR**: the repo from the URL, its main checkout under `~/repos` (matched by `origin`), the PR's base and title from `gh`.
2. **fetch the PR**: `pull/N/head` into `origin/pr/N`; the worktree `~/repos/<repo>-worktrees/pr-N` on `review/pr-N`, created or fast-forwarded.
3. **install**: `direnv allow`, then the lockfile's package manager (pnpm through the `worktrees` skill's `warm.sh`).
4. **pick the app**: the first changed file (against the base) that the recipe's `pick_app` maps to an app.
5. **start the app (<app>)**: the recipe's `run_<app>`.

A failure prints `✗ <step> failed: <why>`. Whatever happens, the pane ends in a shell in the worktree.

## 2. Watch it

Load `Monitor` (`ToolSearch select:Monitor`) and wait on the pane instead of sleeping:

```bash
until rex capture -s "$REX_SESSION" -b <pane> --trim | grep -qE '▸ start the app|✗ .* failed'; do sleep 5; done
```

- **`▸ start the app`**: the build may still be running. Wait on the dev server's ready line, or ~30 s, then capture the tail once (`rex capture … --trim | tail -60`) to check that it didn't crash on launch. Then tell the user it's running: which PR and which app. Done.
- **`✗ … failed`**: read the tail, find the cause, fix it, and run the pane's command again with `rex split` (close the old pane first: `rex block close -s "$REX_SESSION" <pane>`).

## 3. Test it

When the user asks you to test the running PR:

1. Read what it claims: `gh pr view <N> -R <owner/repo> --json body,files`. Its "Verified" / "Not yet run" lines say what's left to check.
2. Exercise that claim in the running app, through the hook its recipe's `test notes` name. Work in a scratch board or file you create, never in the user's own.
3. Check the effect where it lands (records, files on disk), not only on screen.
4. Report as a table: each claim, what you did, what you saw, pass or fail. List what you could not reach.

Leave the scratch board for the user to look at, and give its path.

## 4. Clean up

When the user is done with a PR ("clean it up", "done with #N"), close its pane, which stops the app, then remove the worktree, `review/pr-N` and `origin/pr/N`:

```bash
rex block close -s "$REX_SESSION" <pane>
~/.claude/skills/run-pr/scripts/pr-clean.sh <PR URL | number>
```

If you no longer have the pane id, find the pane labelled `PR #<N>` (`rex __internal skill` explains how to list panes) and close it. For "clean up old PRs", run `pr-clean.sh --closed <repo dir>`. It removes every `pr-N` worktree whose PR is merged or closed, and keeps open ones.

`pr-clean.sh` refuses a worktree that has uncommitted changes or commits the PR lacks, because those may be the user's review notes. Show the user what's there (`git -C <dir> status --short`, `git -C <dir> log origin/pr/N..HEAD`), and pass `--force` only if they say to drop it.

Clean up only when the user asks. Never do it on your own after they've tested.

## 5. A repo without a recipe

`✗ pick the app failed: no recipe for <owner>/<repo>` means the repo is new to the skill. Write `recipes/<owner>_<repo>.sh` in `~/.dotfiles/agents/.agents/skills/run-pr/` (the source of the linked skill) for a public repo, or in `~/.dotfiles/work/run-pr/recipes/` for a work repo, since the dotfiles repo is public. Copy the shape of `recipes/shift-editor_shift.sh`: a `pick_app` function that maps a changed file to an app name (or prints nothing), an optional `default_app`, one `run_<app>` function per app, and `test notes` comments. (Don't paste recipe code into this file: Claude Code replaces `$`-numbered arguments in a skill with the command's arguments.)

Take the dev command from the repo's AGENTS.md / CLAUDE.md and its `package.json` scripts. Prefer a command that runs the app beside the user's installed copy (its own profile or port). Check that any env var you set for this has no other effect. Show the user the recipe in one card, then rerun.

## 6. Common failures

| Pane says | Cause | Fix |
|---|---|---|
| `fetch the PR failed: can't fast-forward` | the PR was force-pushed, or the worktree has local commits | if `git -C <dir> log origin/pr/N..HEAD` is empty: `git -C <dir> reset --hard origin/pr/N`; otherwise ask first |
| `is on <x>, not review/pr-N` | someone switched the worktree's branch | ask before switching it back |
| `no checkout of <repo> under ~/repos` | the repo was never cloned | ask, then `gh repo clone <repo> ~/repos/<name>` |
| install failed, lockfile out of date | the PR's lockfile is behind its `package.json` | it's the PR's bug; report it, don't fix it in the worktree |
| install failed in `install-app-deps` / node-gyp, C++ errors inside `CommandLineTools/SDKs/…/c++/v1` | `xcode-select` picks an Xcode whose clang is older than the CLT SDK; `pr-run.sh` sets `DEVELOPER_DIR` to the CLT for this, so if you still see it, check `xcode-select -p` and `xcrun clang --version` | rerun the pane with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`; the lasting fix is `sudo xcode-select -s /Library/Developer/CommandLineTools` (ask first) |
| compile or type errors in the build | the PR doesn't build | report the first error with its file:line; don't patch the PR |
| the app quits at once | another copy holds the same profile or port | find it, ask before quitting it |

## Rules

- Uncommitted changes in a PR worktree may be the user's review notes. Never reset, stash or delete them without asking.
- Never commit or push from a PR worktree.
- Leave the worktree; it is reused the next time this PR runs.
- The app is the user's to try. Don't drive it unless asked.
