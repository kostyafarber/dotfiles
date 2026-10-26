---
name: shift-prior-work
description: Before designing, reviewing or implementing anything in Shift, find what already exists for the topic — vault plans, tickets and spikes, GitHub PRs (open and closed), git branches, worktrees on this Mac, mini and beelink, earlier agent sessions and memory — and report it with links, so nothing already decided gets redesigned. Use when starting design or implementation work in Shift, before reviewing a large PR, and when the user says "check what we have", "did we plan this", "find the ticket/spike/branch", "we tried this before", or asks "why didn't we find this".
---

# Shift prior work

A diff or a ticket title is never the whole story. Plans, spikes and earlier sessions often chose a design already. Run this search first, report, then start the task. It takes a few minutes.

Pick 3-6 keywords: the feature's names, likely symbols (`mint_id`, `GlyphDraft`), branch-ish words (`engine`, `wasm`, `derisk`), and the PR number if there is one. Search every source below even after an early hit; the decision is often in a different source than the code.

## 1. Vault

Notes live in `~/Documents/KostyaVault/projects/shift/`, named `Plan - `, `Ticket - `, `Spike - `, `ADR - `, `Design - `, `Audit - `, `Research - `, `Handoff - `, `Index - `. Also check `../shift.md` and `../shift-board.md`.

```bash
cd ~/Documents/KostyaVault/projects/shift
stat -f '%Sm  %N' -t '%Y-%m-%d' *.md | sort -r | head -25        # newest first
command ls Index\ -*                                              # read these first
grep -rli --exclude='*.sync-conflict-*' --exclude-dir=.stversions -e 'kw1' -e 'kw2' . ../shift.md ../shift-board.md
```

Read the `Index - …` notes and anything modified in the last week in full. For other grep hits, read the headings and the decision/"Revisions" sections. Ignore `.stversions/` and `*.sync-conflict-*` copies.

## 2. GitHub PRs

```bash
gh pr list -R shift-editor/shift --state all --search 'kw in:title,body sort:updated-desc' --limit 20 \
  --json number,title,state,headRefName,updatedAt --jq '.[]|"#\(.number) [\(.state)] \(.title) (\(.headRefName), \(.updatedAt[:10]))"'
gh pr list -R shift-editor/shift --state all --search 'sort:updated-desc' --limit 20 \
  --json number,title,state,updatedAt --jq '.[]|"#\(.number) [\(.state)] \(.title) \(.updatedAt[:10])"'
gh pr view <n> -R shift-editor/shift --json body,comments --jq '.body, .comments[].body'
```

Closed-unmerged PRs matter: they record what was tried and dropped. Read the body and comments of every relevant hit.

## 3. Git branches and history

```bash
cd ~/repos/shift && git fetch --quiet origin
git branch -a --sort=-committerdate --format='%(refname:short) %(committerdate:short)' | grep -iE 'spike/|codex/|agent/|kw'
git log --all --oneline -i --grep='kw' --since=90.days | head -20     # commit messages
git log --all --oneline -S 'symbol' | head -20                        # code that added/removed a symbol
git branch -a --contains <sha>                                        # which branches hold a hit
git log --oneline origin/main..origin/spike/<name>                    # what a spike has that main lacks
```

`spike/*` branches are throwaway prototypes whose conclusions usually live in a vault `Spike - ` or `Plan - ` note; read both. `codex/*`, `agent/*` and `claude/*` are agent branches.

## 4. Worktrees (this Mac, mini, beelink)

```bash
S=~/.claude/skills/shift-prior-work/scripts
tailscale status | grep -E 'mini|beelink'          # skip hosts not "active"/online
$S/worktrees.sh                                     # local
for h in mini beelink; do echo "== $h"; ssh -o BatchMode=yes -o ConnectTimeout=8 $h bash -s < $S/worktrees.sh; done
```

Each line prints path, branch, `dirty=` (uncommitted files) and `unpushed=` (commits on no remote). Filter by keyword. For a relevant worktree with `dirty>0` or `unpushed>0`, look at it: `ssh <host> 'git -C <path> status --short; git -C <path> log --oneline -5 HEAD --not --remotes'`. That work exists nowhere else.

## 5. Earlier agent sessions

Transcripts: `~/.claude/projects/-Users-kostyafarber-repos-shift/*.jsonl` (worktree sessions sit in sibling `~/.claude/projects/*shift*` folders). The newest file is usually the current session; skip it.

```bash
cd ~/.claude/projects/-Users-kostyafarber-repos-shift
command ls -t *.jsonl | head -60 | xargs grep -li -e 'kw1' -e 'kw2' | while read f; do
  echo "== $f $(stat -f '%Sm' -t '%Y-%m-%d' "$f")"; done
jq -r 'select(.type=="user") | .message.content
  | if type=="string" then . else (map(select(.type=="text").text) | join(" ")) end
  | select(length>0 and (startswith("<")|not)) | .[0:300]' <file>.jsonl | head -40
```

The user's messages show what was asked and decided. To see the agent's conclusions, grep the file for the keyword with context: `rg -o '.{0,200}kw.{0,200}' <file>.jsonl | head` (use `rg`: the shell's `grep` rejects long `{0,200}` ranges).

## 6. Memory

Read `~/.claude/projects/-Users-kostyafarber-repos-shift/memory/MEMORY.md`, then open the linked `project_*.md` / `feedback_*.md` files that match the topic. Memory can be stale; where it conflicts with a newer vault note or branch, trust the newer source and say so.

## Report

Keep it short. One block per source, each hit with a path or link and one line on why it matters:

```
Vault: Plan - <title>.md (2026-10-25) — already chooses <design>; <consequence for this task>
PRs: #<n> [CLOSED] <title> — tried <approach>, dropped because <reason>
Branches: origin/spike/<name> (2026-10-19) — prototype of the plan above, not merged
Worktrees: beelink ~/worktrees/<dir> dirty=2 — uncommitted <what>
Sessions: <uuid> (2026-10-24) — user decided <decision>
Memory: nothing found
What this means for the current task: <follow plan X / the PR contradicts decision Y / genuinely new, no prior work>
```

Say "nothing found in X" for each empty source so the reader knows it was searched. If prior work and the current task disagree, stop and raise it with the user before designing or reviewing further.
