# User preferences

- Be concise and practical.
- Prefer direct edits over long explanations.
- Use tests/lint when available.
- Ask before destructive or irreversible actions.
- Ask before substantial configuration/dotfile changes; propose the diff/plan first and wait for approval.
- Show changed file paths clearly.
- When modifying configuration, keep changes small and explain how to revert.
- Except when working on `/Users/kostyafarber/repos/FOR` (where routine naming decisions do not require approval), before implementing architectural or stateful changes, agree with the user on function names, variable names, state names, and the meaning and legal transitions of each state. Treat naming as part of the specification. Never assume the user accepts a name merely because it was proposed: obtain explicit approval before writing it into code or documentation. If any name or state remains unresolved, stop and ask rather than inventing one during implementation.
- When working on `/Users/kostyafarber/repos/honeypot-ideas`, read and follow `/Users/kostyafarber/repos/honeypot-ideas/AGENTS.md` even if it was not loaded automatically.
- When working on `/Users/kostyafarber/repos/shift`, load the `shift-remote-e2e` skill and run Playwright/Electron E2E through `~/.pi/agent/bin/shift-remote-e2e` so Electron windows do not open on the user's current Mac. Run E2E locally only when the user explicitly requests it.
