---
name: show-code
description: Show code as a highlighted image card with the code mod's show_code, instead of describing it. Use whenever the answer is code — a change you are about to make ("what will it look like", "show me the change", "show me the diff"), a fix you are pointing at ("the fix is in X:42"), a proposed interface or API, a before/after refactor, or a review of what changed — and when the user asks to see code, a hunk or a diff.
---

# Show code

Code is the answer more often than prose about it. When you are about to write "the fix is in X:42",
"the new API takes…" or "here's what changes", show it with `show_code` and say the point in one
line after.

## Pick the block

| You want to show | Pass |
|---|---|
| code already on disk | `{path, lines: "120-160"}` — read from the file, not pasted |
| what a file changed | `{path, against: "HEAD"}` (or `origin/main`, a commit) — one card per hunk |
| a change you are proposing | `{path, before, after}` — side by side; `layout: "unified"` for long lines |
| a new interface or API | two blocks: signatures only (types, `fn` / method signatures, doc comments, no bodies), then one call site as a before/after |
| a few lines that matter in a longer range | add `focus: "105-106"` — the rest of the card dims |

Name code on disk instead of pasting it: the call stays short, so it runs fast, and the card is
numbered as the file is. Paste only code that is not in a file yet.

## Words on the card

- `note`: a few words in the header saying what the card is (`call site`, `the origin check`).
- `caption`: a full sentence under the code saying why it matters. Prefer it to a long note.
- In both, put code in `backticks`: those parts are highlighted, the rest stays plain. Never
  backtick ordinary words.

## Keep it readable

- Show only the hunk that matters, never a whole file. Three or four cards per call at most; past six the rest are counted and the user is pointed to the nvim review (`/look`).
- Pasted Rust goes through rustfmt, so write it however is quick. Code read from disk is shown as it
  is.
- After the call, one line with the point. Don't restate the code in prose.
- `as: "text"` draws terminal text instead of an image; use it only where images don't show.
