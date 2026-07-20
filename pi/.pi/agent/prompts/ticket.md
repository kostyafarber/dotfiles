---
description: Pick up a ticket from notes or issue text
argument-hint: "<ticket/ref> [context]"
---
Pick up this ticket: $ARGUMENTS

First orient yourself, then work end-to-end.

Workflow:
1. Read relevant project docs, AGENTS.md, package scripts, and referenced files.
2. Restate the ticket in 2-4 bullets, including acceptance criteria and unknowns.
3. Inspect the code before editing. Prefer minimal changes.
4. Implement the fix/feature.
5. Run the smallest useful tests/lint/typecheck available.
6. End with an Obsidian-friendly handoff summary:
   - Status
   - Files changed
   - Tests run + result
   - Decisions made
   - Follow-ups / risks

If the ticket text is incomplete, ask concise clarifying questions before making broad changes.
