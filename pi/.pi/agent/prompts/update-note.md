---
description: Update an Obsidian note with a session handoff section
argument-hint: "<note-path>"
---
Update this Obsidian note with a new session handoff section:

`$ARGUMENTS`

Rules:
- Preserve the existing note structure and wording.
- Append a new section near the end, before any final archival/reference sections if obvious; otherwise append to the end.
- Use this heading format: `## Pi Session Update - YYYY-MM-DD`.
- Include: Status, Changes, Files changed, Tests/checks, Decisions, Follow-ups, Suggested next prompt.
- Keep it concise and factual.
- Do not rewrite the design note unless explicitly asked.
