---
name: recurrence
description: Treat a problem that has happened before as one bug, not another incident. Searches past agent sessions (Claude Code and pi) and git history for earlier occurrences, finds the one seam they all cross, and fixes it there — with a guard, script or skill — instead of patching this occurrence again. Use when the user says "we've hit this before", "this keeps happening", "again?", "search your logs", "check history", "find the pattern" or "the seam", or when a fix you are about to make feels familiar.
---

# Recurrence

A problem that comes back has a seam: one boundary every occurrence crossed, where nothing
checked. Patching each occurrence leaves the seam open. Find it, then close it at the seam.

## 1. Name the symptom

One line, plus search terms that would appear in a log: the exact error text, the file, the
command. Prefer literal strings (`Invalid or malformed JSON`, `<<<<<<< Updated upstream`) over
descriptions.

## 2. Find every earlier occurrence

```bash
S=~/.claude/skills/recurrence/scripts
node $S/search-sessions.mjs '<regex>' [--days 180] [--project shift] [--limit 20] [--hits 3]
```

It prints one block per past session, newest first: date, project, log path, the prompt that
started it, and the matching lines. Widen the regex until older occurrences show up; the first
hit is usually this session. Also look where the tool leaves traces:

- **git:** `git log -S'<text>'`, `git log -G'<regex>'`, `git reflog` (pulls, stashes, rebases)
- **memory:** grep the memory directory for the symptom and the files involved
- **the code:** what runs at the moment it breaks (the command, the hook, the build step)

To read one past session in full, take its log path and pull out the user/assistant text with
`jq` rather than reading the raw file.

## 3. Line them up

| When | What happened | What fixed it then | Where it entered |
|---|---|---|---|

The last column is the point: the step where the bad state got in, not where it showed up.

## 4. Name the seam

The one boundary every row crosses, stated as "X happens, and nothing checks Y before Z".
Test it: would closing that boundary have prevented every row? If one row escapes, the seam
is wrong or there are two.

## 5. Close it, strongest fix that fits

1. **Structural:** make the bad state impossible (generate the file, split private from public,
   remove the second writer).
2. **Guard:** refuse at the seam (a pre-commit hook, a check before a build or deploy, a hook on
   a tool call).
3. **Detector:** a script or skill that finds it fast when it happens anyway.
4. **Note:** a memory entry naming the seam and the fix. Always write this one too.

Show the user the seam and the proposed fix before building anything bigger than a guard.
Then replay the earlier occurrences against the fix: say for each row whether it would have
been stopped.

## Example

Symptom: `~/.claude/settings.json: Invalid or malformed JSON`, the file full of
`<<<<<<< Updated upstream`. Sessions showed `update` (`git pull --rebase --autostash`, then
`rebuild`) on 14 and 16 October and today. Seam: an autostash that conflicts still exits 0, so
`rebuild` installs conflict markers as live config. Guard: `rebuild` refuses while the
checkout has unmerged files or conflict markers.
