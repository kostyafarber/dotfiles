# review.nvim

Review comments drawn as overlays on code, traded with Claude through a JSON file.

## Keys

| Key | Does |
| --- | --- |
| `<leader>cc` | Comment on the line, or the selected lines |
| `<leader>cg` | Suggest a change: the lines prefilled as code to rewrite, shown as a diff |
| `Enter` / `<leader>cr` | Open the thread on this line: read, reply, resolve, apply a suggestion |
| `<leader>cx` | Resolve / reopen |
| `<leader>cd` | Delete the thread |
| `]r` / `[r` | Next / previous thread in this file |
| `<leader>cl` | Open threads across the repo, in quickfix |
| `<leader>ch` | Cycle display: compact (one-line preview, full thread peeks while the cursor is on it) → cards → hidden |
| `<leader>cv` | Mark this file reviewed (✓ in codediff's file panel) and go to the next unreviewed one |
| `]u` / `[u` | Next / previous unreviewed file |
| `<leader>cs` | Send the review to the Claude pane (Rex), or copy the prompt |

In the comment float: `Ctrl-S` (or Enter in normal mode) saves, `Esc Esc` cancels.
In the thread float: `Ctrl-S` sends your reply, `Ctrl-R` sends and resolves, `Ctrl-A` applies a
suggestion, `q` closes.

A reviewed file whose content changes afterwards shows ✎ instead of ✓ and counts as unreviewed.

## File format (for Claude)

One file per repo or worktree, at `$(git rev-parse --absolute-git-dir)/review.json`.
nvim watches it and redraws when it changes, so edits show up live.

```json
{
  "version": 1,
  "checkpoint": "<optional commit the review is against>",
  "threads": [
    {
      "id": "6716a3f2c4b1",
      "file": "src/app.ts",
      "line": 42,
      "end_line": 45,
      "line_text": "  const x = load()",
      "status": "open",
      "kind": "comment",
      "messages": [
        { "author": "you", "body": "why not cache this?", "at": 1729400000 },
        { "author": "claude", "body": "Good call:\n```ts\nconst x = cache(load)\n```", "at": 1729400100 }
      ]
    }
  ]
}
```

- `line` / `end_line` are 1-based. `line_text` is the first line's text, used to re-find
  the spot if lines moved, so set it whenever you set `line`.
- `body` is markdown-ish: prose is wrapped, ``` fenced blocks are shown verbatim.
- `kind: "suggestion"` threads also have `original` (the lines as they were) and a fenced
  block whose info string contains `suggestion` (e.g. ```` ```lua suggestion ````): the
  replacement for `line`..`end_line`. Treat it as the user's intended code: apply it, and
  use it as the pattern for similar code elsewhere.
- Top-level `reviewed` maps file → sha256 of its content when the user marked it reviewed.
  Leave it alone.

## Answering a review (Claude)

1. Read the file. Work only on threads with `status: "open"` whose last message is from `you`.
2. Look at the user's code edits too (`git diff <checkpoint>` if set, else `git diff`):
   an edit next to a comment is often the example to follow.
3. For each thread, append `{ "author": "claude", "body": ..., "at": <unix time> }`.
   If you changed code for it, say what in one line. Set `status: "resolved"` only for
   threads that need nothing more from the user.
4. You may open a thread yourself (first message from `claude`) to explain a choice
   in a change you're proposing.
5. Write the file in one go (e.g. with `jq`), keeping all other fields as they are.
