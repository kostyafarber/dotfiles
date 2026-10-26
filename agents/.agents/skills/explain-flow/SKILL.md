---
name: explain-flow
description: Explain how a system, protocol or feature works as a fixed structure — the cast of parts, how they connect, then one concrete trace with real ids and values — instead of prose. Use when the user asks how something works or how pieces relate ("how do these relate", "what calls what", "map out the data flow", "what ids get passed around", "walk me through the flow"), and especially when they say "I don't get it", "you didn't explain this well", "I'm confused between X and Y", or "step back". Not for opt-in learning sessions (socratic-learn, learn-trace) — this gives the answer.
---

# Explain flow

Confusion usually comes from undefined nouns and missing links, not missing detail. Name every part, show how the parts connect, then trace one real run. Do not add more prose.

## Shape of every answer

1. **One line.** The whole thing in a sentence a newcomer could repeat.
2. **Cast.** A table with one row per part:

   | Part | What it is | Runs where | Holds (ids, state, tokens) |
   |---|---|---|---|

   Every term used later must appear here first. Use the user's own words for parts when they have them. When two names mean the same thing (the "sidebar" vs the "global entrypoint"), say so in the row.
3. **Wiring.** Who talks to whom, and over what: HTTP, postMessage, IPC, WebSocket, a tool call or a file. Use one line per connection:
   `iframe → host: postMessage (ui/request)`. If there are five or more parts, draw it with the explain-with-diagrams skill (one inline diagram).
4. **One trace.** Number the steps of a single real run with concrete values, like real URLs, ids and payload fields from the code or logs:
   `3. server → clerk: POST /oauth/token {code: "ODMY…", redirect_uri: "http://127.0.0.1:51725/callback"}`
   Cite `file:line` for each hop you verified. Mark any hop you inferred as *inferred*.
5. **The catch.** The one non-obvious thing: what breaks, what is surprising, or why it is built this way.

## Rules

- Lead with the answer. Background goes after the trace, or nowhere.
- Before explaining, verify against the code or docs. If something can't be confirmed, say so rather than guess.
- No term of art without its row in the cast. "Client registration", "redirect URI" and "port" all get rows.
- If the user is still confused, **change the representation, do not repeat it louder**. Switch from the table to the trace, from the trace to a diagram, or narrow to the single hop they are stuck on. Ask which step is fuzzy only after giving the full shape once.
- Keep it short. If the cast passes about eight rows, split the system and explain one half first.
- When the user asks to keep it ("capture this", "write it down"), write the same structure to a markdown file and open it.
