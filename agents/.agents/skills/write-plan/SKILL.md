---
name: write-plan
description: Write or update a Shift plan, ticket or design note in the Obsidian vault for the user to read and comment on — with the agreed decisions up top, real evidence, a diagram, the file tree, and code before/afters embedded as images. Use when the user asks for "a plan", "a ticket", "write it up in Obsidian", "put it in the vault", or to record decisions a discussion agreed on.
---

# Write a plan

The note is read and commented on in Obsidian, so it is built to be scanned: decisions first, then
evidence, then pictures, then what's open. Write only what the user agreed to (a discussion's
outcome); one consolidated note or update, not one edit per exchange.

## Where

- Vault: `/Users/kostyafarber/Documents/KostyaVault/`; Shift notes in `projects/shift/`.
- Name: `Plan - <what it does>.md` or `Ticket - <what it does>.md`.
- Frontmatter: `type: Plan` (or `Ticket`), `project: Shift`, `created: <YYYY-MM-DD>`.
- Link it from the current index (`Index - Shift <Month> <Year> Spikes and Plans.md`) and from the
  plans it relates to (`[[...]]`).
- Images: `projects/shift/images/<plan-slug>-<n>.png`, embedded with `![[<plan-slug>-<n>.png]]`.
- Open it for the user: `open "obsidian://open?vault=KostyaVault&file=<path without .md, URL-encoded>"`.

## Shape

1. `# Plan - …`, then **Goal** in one or two sentences.
2. **Agreed** — each decision as a bullet with its date; the user's own words quoted where they set
   the direction. Also what was ruled out, and why, so it isn't re-proposed.
3. **Where we are** — numbers and `file:line`, verified in the code; say which are estimates.
4. **The shape** — a diagram: a ```mermaid block (Obsidian renders it, and it stays editable), plus
   the `show_diagram` PNG embedded when the layout matters. A file tree as a plain code block.
5. **Before / after** — for each change, the `show_code` card PNG embedded, then the after as a
   fenced code block (```rust, ```ts) so it can be copied and commented on.
6. **Open questions** — numbered, each with its options as (a) (b) (c), and the user's comments kept
   under the question.
7. **Phases** — numbered, each small enough to be a PR; what it deletes as well as what it adds.
8. **Estimates** — a table, labelled as estimates and how they were reached.
9. **Sources** — the plans, PRs, branches and commits it rests on.

## Images

`show_diagram` and `show_code` write PNGs (`~/.cache/diagrams/<tool_use_id>.png`,
`~/.cache/code-cards/<tool_use_id>-<n>.png`). After drawing one for the plan, copy it into the
plan's images folder under a stable name and embed it. Draw them in light mode if the user reads the
vault in light mode; otherwise the terminal's mode is fine.

## Style

Plain sentences, the words the code uses, no section-divider comments. Decisions are stated, not
hedged; anything inferred says so. Keep each section short enough to comment on line by line.
