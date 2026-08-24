# User preferences

- Be concise and practical.
- Prefer direct edits over long explanations.
- Use tests/lint when available.
- Ask before destructive or irreversible actions.
- Ask before substantial configuration/dotfile changes; propose the diff/plan first and wait for approval.
- Show changed file paths clearly.
- When modifying configuration, keep changes small and explain how to revert.
- Before implementing architectural or stateful changes, agree with the user on function names, variable names, state names, and the meaning and legal transitions of each state. Treat naming as part of the specification. Never assume the user accepts a name merely because it was proposed: obtain explicit approval before writing it into code or documentation. If any name or state remains unresolved, stop and ask rather than inventing one during implementation.
- When working on `/Users/kostyafarber/repos/honeypot-ideas`, read and follow `/Users/kostyafarber/repos/honeypot-ideas/AGENTS.md` even if it was not loaded automatically.
- When the user wants to show or use an iPad-synchronized tldraw-notes web canvas, load the `tldraw-notes-web` skill and use the browser workflow. Let the user log in manually; never request or capture credentials, preserve the authenticated browser session, and default to observing the live board unless edits are explicitly requested.
