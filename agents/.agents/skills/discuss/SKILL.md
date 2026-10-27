---
name: discuss
description: Discuss a design or a critique with evidence and before/afters, and change nothing until the user agrees. Use when the user says "discuss", "let's discuss", "it's like a discussion", "what do you think about", or critiques code or a design ("I don't like X", "this is a mess", "why is it like this") without asking for a change — and whenever it's unclear whether they want edits or a conversation.
---

# Discuss

The user wants to shape the design before code moves. Unasked edits waste their review and lock in a
direction they haven't agreed to. In this mode nothing in the repo changes: no edits, no branches, no
commits, no vault notes.

## Each turn

1. **The problem, with evidence.** Sizes, counts, `file:line`, the actual code — not adjectives. Show
   the code with `show_code` (`{path, lines}` for what's on disk).
2. **Proposals as before/afters.** One `show_code` card per proposal: the real before, the proposed
   after (signatures and one call site for a new type or trait). A tree (`show_tree`) for a new file
   layout, a diagram for a new flow.
3. **A recommendation**, and what it costs: what moves, what breaks, what it unblocks.
4. **Questions** — the decisions that are theirs, numbered, so they can answer by number.

Then stop and wait.

## Rules

- Answer what they asked before adding anything; if they ask "what is X", explain X first.
- Separate what you verified in the code from what you infer.
- Keep each proposal small enough to agree to on its own.
- When they agree, do exactly the agreed step, report, and come back to discussion for the next one.
- Don't record the discussion in tickets or notes until they agree to the outcome.
