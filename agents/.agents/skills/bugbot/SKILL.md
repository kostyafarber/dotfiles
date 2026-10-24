---
name: bugbot
description: Handle Cursor Bugbot findings on a GitHub PR one at a time — find the bot's thread from a pasted finding, verify it against the code, fix it or rule it out, then reply on the thread and resolve it. Use when the user pastes a Bugbot finding (a title followed by "High/Medium/Low Severity" and a description), says "bugbot", "more bugbots", "reply and resolve", "resolve it", or asks to go through a PR's bot review comments.
---

# Bugbot

## Quick start

```bash
B=~/.claude/skills/bugbot/scripts/bugbot.sh
$B list <pr>                          # unresolved bot threads: thread id, comment id, file:line, title
$B reply <pr> <comment-id> "<text>"   # reply on the thread
$B resolve <thread-id>                # mark the thread resolved
```

The PR is the one the user named, or else the one for the current branch (`gh pr view --json number`). The repo is the current checkout's GitHub repo. Pass `-R owner/repo` as the first argument for another repo.

## Workflow

1. **Find the thread.** Run `list` and match the pasted title. If the user pasted several findings, or said "more bugbots", handle each unresolved thread in turn.
2. **Verify before acting.** Read the code at the reported location and trace the claimed failure. Bugbot is right often but not always. Put each finding in one bucket:
   - **Real**: the failure can happen.
   - **Real but not worth it**: possible, but the fix costs more than it saves, or it is out of scope.
   - **False positive**: the code already handles it. Name the line that does.
3. **Fix (real).** Make the smallest fix in the PR's worktree, with a regression test when one is cheap. Run `~/.claude/skills/pr-worktree/scripts/check.sh` and commit, one commit per finding. Use a message like `fix(<scope>): <what the finding was>`.
4. **Push.** Push only when the user asked for the whole loop ("resolve it", "reply and resolve", "do it"). Otherwise stop after the commit and report.
5. **Reply, then resolve.** Write one plain sentence, lowercase is fine:
   - Real: `fixed in <short-sha>, <what changed>`
   - Not worth it: `leaving this: <reason>`
   - False positive: `not an issue: <line or mechanism that already handles it>`

   Then run `resolve` with the thread id.

## Rules

- Replies to the bot are fine to post. Replies to a *human* reviewer are not: draft those in the user's voice and let them post them.
- Do not resolve a thread you have not replied to, and do not reply "fixed" before the fix is pushed.
- If one fix changes behaviour a spec or another PR in the stack depends on, stop and ask.
- Report back: one line per finding with its bucket and commit sha.
