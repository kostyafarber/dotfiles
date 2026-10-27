---
name: explain-with-diagrams
description: Answer with a picture first. Use when the user asks how something works, how parts relate, what calls what, where code runs, why something broke, says "map it out", "draw it", "step back", "I don't get it", or re-asks a question. Draws diagrams with the diagrams mod's show_diagram (Mermaid, card look) and file trees with show_tree. When the answer is code, use the show-code skill instead. Not for questions a short table answers better.
---

# Explain with diagrams

People asked "how does X work" and got prose, option lists or tables, and asked again. The answers
that landed opened with a picture of where things run or how they connect, then said the point in
one line. Do that.

## Shape of every answer

1. **One diagram**, drawn with `show_diagram`, before any prose. One per answer.
2. **One line** with the answer to the question, in the user's words, 25 words at most ("Yes:
   upload always runs on merge; the $10 check only decides the order").
3. **Then detail only if needed**: a short trace with real values, or the catch. Cite `file:line`
   for what you verified. Leave out anything the question did not ask (status updates, next steps,
   design options).

## Pick the diagram by the question

| The question is about | Draw |
|---|---|
| where code runs, which process or service owns what | `architecture-beta` or `flowchart` with `subgraph` per process/box |
| a pipeline, a decision, what happens on X | `flowchart TB` (LR when it is short) |
| who calls whom, in what order, what crosses a boundary | `sequenceDiagram` |
| the states something moves through | `stateDiagram-v2` |
| what runs inside what (container › process › thread), what a thing is made of | `block` (nested boxes; the user likes these) |
| bits, bytes or fields of a value (flags, a key, a header) | `packet` with front-matter `config: packet: {bitsPerRow: 8, bitWidth: 90}` for small fields; start a set field's label with `*` to highlight it (the rest dim) |
| how branches or stacked PRs relate, or a rebase | `gitGraph` |
| what two or three things share and what is only in each | `venn-beta` (sets, the shared part named, 2 items per region) |
| what arguments a command or CLI takes, a small grammar | `railroad-ebnf-beta` (≤ 2 rules) |
| how a screen or window is laid out | `block` (rows and columns follow position; not a treemap, which sorts by size) |
| why something broke, when several causes fed it | `ishikawa-beta` (the failure, then cause groups) |
| where files or folders live | `show_tree` (coloured text tree; the user prefers it to `treeView-beta`) |
| all the parts of something, for an explore phase | `mindmap` (root, 4–5 branches, 2–3 leaves each; no focus) |
| a breakdown or a comparison of real numbers | `pie` (parts of one whole, ≤ 6) or `xychart-beta` (bars, lines) |

Pele draws ~30 Mermaid types (pele.run/examples); reach past flowchart and sequence when the
question's shape matches one of the rows above.

## Rules for the drawing

Draw the one point, not a summary of everything you found. The facts you verified go in the text.

- **The focus is the thing the question turns on.** Exactly one (an overview mindmap has none): `classDef focus stroke:#5E8FE0`
  + `class X focus` on a node; in a sequence, wrap the key steps in `rect rgb(94,143,224) … end`.
- **4–7 boxes.** If it needs more, it is two questions: draw the half that answers this one.
- **Labels of 2–4 words**, one line, two at most. No limits, sizes, env vars, file paths, flags or
  "today/proposed" notes inside a box; those go in the answer or the detail.
- **Edge labels of 1–3 words** (`yes`, `ws /sync`, `https`), or none.
- **One path.** Alternatives (env vars *or* files, today *or* proposed) are a sentence in the
  detail, not a second branch in the picture.
- **Shapes keep their natural size.** Don't stretch a cylinder or circle across columns (`:3`
  in a block diagram); give it a column like any box.
- **Groups only when the question is about them** (which process, which machine, before/after).
  Not a group around every box.
- **Title it** with what it answers, in front matter: `---` / `title: How a connector gets its secret` / `---`
  (pie, gantt and xychart take a `title` line instead).
- **Groups** (`subgraph`) for processes, machines, or before/after; they get their own colour.
- **Short labels**, plain words; break long ones with `<br/>`. No backticks; they show literally.
- **Real data only** in charts and trees: numbers and paths from the code, logs or the conversation.
  Never invent them. Name the series with `%% key: a, b` when a chart has more than one.
- **For a change or a PR**, show the before and the after as two groups in one diagram, and focus the
  part that changed. Wiring without the before/after explains nothing.

See [examples.md](examples.md) for diagrams the user liked: match their density before you draw.

## Before you draw

Check every box and arrow against the code or the docs. If a link is inferred, say so in the one-line
answer. A wrong diagram is worse than none.

## Code

When the answer is code (a change, a fix, an API, a diff), show it with `show_code` as the
`show-code` skill says, not a diagram.

## Don't draw

- A comparison of two snippets (code side by side is clearer).
- A single fact or a yes/no with no moving parts.
- A list of options for a decision (that is a table).
