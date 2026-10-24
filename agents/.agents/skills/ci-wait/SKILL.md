---
name: ci-wait
description: Wait for a GitHub PR's CI without sleep loops, then pull only the failed job logs and say whether each failure is a known flake, a known setup gotcha or a real break, and what to do (fix, rerun failed jobs only, or ignore). Use after pushing a PR, when the user pastes a GitHub Actions run or job URL, or says "CI failed", "why is lint/format failing", "is it green", "watch CI", "does this need a rerun".
---

# CI wait

## Quick start

```bash
S=~/.claude/skills/ci-wait/scripts
$S/wait.sh <pr> [owner/repo]     # run with run_in_background; exits when every check settles
$S/failed.sh <pr> [owner/repo]   # failed checks + the tail of each failed job log
```

The repo defaults to the current checkout's GitHub repo.

Run `wait.sh` in the background. The harness notifies you when it exits, so do not poll and do not write `sleep`/`until` loops. Tell the user it is watching and stop.

When the user pastes a job URL, use its PR (`gh run view <run-id> --json headBranch`) or read the job directly: `gh run view --job <job-id> --log-failed | tail -120`.

## Triage each failure

Before reading code, match the failure against the repo's own known failures: its AGENTS.md or CLAUDE.md, and any project memory. Then check the general list below. Report one line per failed check: **check → cause → action**.

| Symptom in the log | Cause | Action |
|---|---|---|
| A format check fails, lint passes | A changed md/yml/json file was not run through the formatter | `~/.claude/skills/pr-worktree/scripts/check.sh`, commit |
| A lockfile dedupe or frozen-lockfile error | The lockfile is stale after a dependency change | Run the package manager's install or dedupe, commit the lockfile |
| A timeout in one shard of a sharded test job only | Flake candidate | Rerun failed jobs once. If the same test fails again, treat it as real |
| Merge conflict / `mergeable: CONFLICTING` | Branch is behind the base | Rebase, but only if this PR merges next |
| Typecheck errors in a package this PR did not touch | The base branch is red, or the branch is stale | `gh run list --branch <base> --limit 3` before touching anything |

To rerun only what failed: `gh run rerun <run-id> --failed`. Do not rerun the whole workflow for one failed job.

## Rules

- A real break: fix it in the PR's worktree (see `pr-worktree`), commit, and push only if the user already said to.
- Never merge, even when everything is green. Report "green, ready for you to merge".
- If a failure repeats across PRs and is not listed anywhere, tell the user and offer to record it where the repo keeps its known failures.
