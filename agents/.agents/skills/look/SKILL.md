---
name: look
description: Open the user's review of code changes (yours, or a PR they are reviewing) in their nvim (review.nvim on codediff — an editable inline diff with Hunk-style comment cards and threads), talk in it live with the rv script (list, add notes, reply in threads, move their view), and act on the review they send back. Use when the user says "/look", "let me look", "show me what you changed", "open it in nvim", or when a message says "Address my review in <path>/review.md" (sent by review.nvim's export, <leader>vs).
---

# Look

You edit files as usual. The user reviews them in nvim with
[review.nvim](https://github.com/georgeguimaraes/review.nvim): an inline diff in which the new
side is the real file (they edit it directly), with typed comments on lines (note, suggestion,
issue, praise). Their export lands in `$(git rev-parse --absolute-git-dir)/review.md` and arrives
here as "Address my review in <path>".

## Open a look

1. Pick the base: `HEAD` for uncommitted changes, or the branch's base (`origin/main`) for a
   branch of commits.
2. Open it in their nvim in this Rex tab: `nvo --review` (HEAD) or `nvo --review origin/main`.
   If that fails (no nvim in this tab), open a tab of its own:
   `rex window new -s "$REX_SESSION" review -c <repo> -- nvim -c Review`
   (`-c "Review branch <branch> origin/main"` for a branch). The Rex palette has "Review
   Changes" for the same.
3. Snapshot your round, so their edits can be told apart from yours: `git stash create`
   (empty output means a clean tree: use `HEAD`). Keep the sha for the next step.
4. In chat, one line: what changed and how many files.

## Talk in the open review (`rv`)

`~/.claude/skills/look/scripts/rv` reads and writes the review open in their nvim, live, the way
`hunk session comment …` drives Hunk. Comments render as cards titled `author type · file L1–L2`,
and replies thread inside the card. Run it from the repo (or pass `--repo DIR`):

```bash
rv list                                         # every comment and reply, JSON (ids, author, file, line, replies)
rv add FILE LINE[-END] --type note $'Summary.\nWhy, in a sentence or two.'  # your own note, author claude
rv reply ID "Changed it to …"                   # answer in their thread
rv resolve ID / rv reopen ID                    # after you've addressed it: reply first, then resolve
rv goto ID                                      # move their view to it (walking them through)
rv rm ID
rv files                                        # the review's files with their reviewed ✓, JSON
rv reviewed FILE... / rv unreviewed FILE...     # tick files off in their file panel (paths from the repo root)
```

- Tick off files they don't need to read one by one (lockfiles, generated code, mechanical
  renames), so next-file navigation skips them. A mark drops when the file changes. Leave the files that
  need their eyes unticked.

- `rv list` is the source of truth for threads: the markdown export carries no replies.
- Notes you add: first line a one-line summary, then the reason. Use them when the reason for a change
  isn't obvious from the code, at most one per hunk. Never restate the diff.
- Their replies to your notes have `author: "you"`. Answer them with `rv reply`.
- If `rv` says no review is open, open one (below) or tell them.

## Answer a review

When "Address my review in <path>" arrives:

1. Read `<path>`. Each entry is `**[TYPE]** \`file:line\` - text`. A `~` before the line
   means the old (left) side of the diff.
2. Read their edits: `git diff <round sha>`. An edit next to a comment is usually the example
   to follow. Apply the same pattern wherever else it fits.
3. Handle by type:
   - **ISSUE**: fix it.
   - **SUGGESTION**: their intended direction. Apply it and reuse the pattern.
   - **NOTE**: a question or remark. Answer it in chat, and change code only if it asks.
   - **PRAISE**: keep that approach. Nothing to do.
4. Reply in each thread with `rv reply ID "<what you did>"` (one line), so the answer sits on the
   code. Then `rv resolve ID` the ones fully addressed; a question back to them stays open.
   Resolved threads collapse to one line, and their export (`space v s`) leaves them out. In chat, give only the count and anything that needs them. Then take a new round
   snapshot.

## Reviewing someone else's PR

`~/.claude/skills/look/scripts/review-pr N` puts the PR in `<repo>-worktrees/pr-N` on a local
`review/pr-N` branch with no upstream and opens it in a `pr-N` Rex tab on the review page
(`review-pr --branch B` does the same for a branch with no PR). `work-list` lists the user's
branches with no PR yet. The `/prs` mod drives both. When they send the review, post it as a
**pending** GitHub review (`gh api repos/O/R/pulls/N/reviews` with no `event`). They submit it
themselves.
- **Their comments** (author `you`) become line comments on the PR head's lines. Map them back if
  their edits shifted lines.
- **Their edits** (`git diff` in the worktree) become ```` ```suggestion ```` blocks.
- **Your own notes** (author `claude`) are for them only. Never post those.
- Never push to the PR branch.

## Holding a change back

If the user wants a change kept out of their working tree until they approve it, make it in a
git worktree (`git worktree add --detach <scratch>/look-<name> HEAD`), and open the review from
there with `rex window new -s "$REX_SESSION" Look -c <worktree> -- nvim -c Review`.
On "apply": `git -C <worktree> add -A && git -C <worktree> diff --cached HEAD --binary | git apply --3way`,
then remove the worktree and close the tab.
