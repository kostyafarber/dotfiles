---
description: Show concrete API and implementation sketches before editing
argument-hint: "[topic]"
---
Sketch ${ARGUMENTS:-the change currently under discussion}.

Read the relevant existing code first. Do not modify files.

Keep the response concise—normally under 50 lines. Show only:
1. One realistic caller example.
2. The smallest useful signature and implementation sketch.
3. The direct integration point.
4. Up to three important boundary cases.

Prefer one recommended design over exhaustive alternatives.
Do not restate existing code, enumerate every affected file, or sketch routine plumbing.
Call out only decisions that block implementation.
Stop for approval before editing.
