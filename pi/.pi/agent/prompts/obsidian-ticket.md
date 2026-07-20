---
description: Pick up an Obsidian ticket note by file path
argument-hint: "<note-path>"
---
Pick up the Obsidian ticket note at:

`$ARGUMENTS`

Workflow:
1. Read the note first.
2. Treat the note as the source of truth for problem, design, open questions, and implementation chunks.
3. Find the relevant repo from the note path/content and inspect the code before editing.
4. Restate:
   - ticket goal
   - intended first chunk
   - acceptance criteria
   - open questions that matter now
5. Implement only the next coherent chunk unless I ask for more.
6. Run targeted checks/tests.
7. End with an Obsidian-ready update that can be pasted back into the note:

```md
## Pi Session Update - YYYY-MM-DD

### Status

### Changes

### Files changed

### Tests / checks

### Decisions

### Follow-ups

### Suggested next prompt
```

If the note has a "First Implementation Chunk" section, prioritize that over the broader design.
