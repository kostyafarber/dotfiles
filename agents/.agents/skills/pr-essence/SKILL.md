---
name: pr-essence
description: Show what a PR or branch really changes as a few before/after code cards from its most important files, so the user can scan it in a minute instead of reading the diff. Use when the user says "essence", "what does this PR do", "show me the gist of #N", "summarise this PR in code", "help me scan these PRs", or asks to review a large PR quickly.
---

# PR essence

The user wants to understand a PR at a glance. A file list or prose summary doesn't do that; the five
or so hunks that carry the change do. Show those as `show_code` cards (load the `show-code` skill's
rules), then a short list of what you left out.

## Find the essence

1. Get the diff against the PR's real base: `gh pr view N --json baseRefName,headRefName`, fetch,
   then `git diff --stat $(git merge-base origin/<base> origin/<head>) origin/<head>`. In zsh, write
   `"${ref}:path"`, never `$ref:path` (`:a`, `:h`, `:t` are modifiers).
2. Rank files by **meaning, not line count**. Skip generated files (`generated/`, `*.api.md`,
   lockfiles, synced skill copies), tests that only follow the change, and docs. Pick the hunks that
   answer, in order:
   - **What new capability or rule exists?** (a new type, function, command, invariant)
   - **What does a caller do differently?** (one call site, before and after)
   - **What was deleted or replaced?**
   - **What is risky?** (a breaking signature, a new hook or global, a changed error or null case)
3. Three to five cards; never more than six. One card per idea, not per file.

## Draw the cards

- `{ path, before, after }` for a change; `{ path, code }` for a new file. Paste the hunk, trimmed to
  the lines that carry the idea; replace boring bodies with `/* … */`.
- `note`: `N · <the idea in a few words>` (numbered, so the user can answer "3 looks wrong").
- `caption`: one sentence on why it matters or what it breaks.
- Before = what `main` has now, not an intermediate commit of the branch.

## After the cards

- **Not shown:** one line listing what you skipped (generated code, docs, schemas, mechanical test
  edits), so nothing looks hidden.
- **Noticed:** anything that looked off while you scanned (a changed null case, a workaround, a hook
  that isn't gated). Facts with `file:line`, not a review verdict.
- Keep prose to that. Don't restate the cards.
