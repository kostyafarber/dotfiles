---
name: grill-me
description: Grill the user with pointed questions, one at a time, until a design they feel unsure about is pinned down — their real use cases, constraints and taste — before proposing or changing anything. Use when the user says "grill me", "ask me questions", "help me figure out what I want", or reacts to a design with "I don't love this", "not sure about this API", "something feels off" without saying what.
---

# Grill me

The user has a feeling about a design but not the words for it yet. Your job is to find the words with
them, by asking, not by proposing. A new proposal now just gets another "hmm".

## How

- **One question per message.** Short, concrete, answerable in a line. Never a list of five.
- **Ground each question in a real case from their code or product**, not an abstraction: "You
  Shift-double-click two glyphs in a run and press P. Where should the next click draw?" beats "How
  should multiple targets work?".
- **Offer 2–3 answers they can pick by letter**, plus "something else". Include the answer you'd
  guess they'll reject; it often surfaces the real constraint. A tiny before/after or code sketch per
  option when the choice is about an API's shape.
- **Order:**
  1. The job: who calls this, in which moment, wanting what. (The user's workflow, not the code.)
  2. The edges: the case that would make each candidate design wrong.
  3. Taste: names, what they'd type, what they'd expect to read in a call site.
  4. Prior art they trust (tldraw, Glyphs, Figma, their own earlier code) — "how did X do this, and
     did you like it?"
- **Track answers** in a short running list ("so far: …") every few questions, so they can correct it.
- **Don't argue.** If an answer contradicts something earlier, ask which one wins.
- **Stop** when you can state the requirement in two or three sentences they agree with. Then show
  the design that follows from it as a before/after, and ask if that's it. No code changes until they
  say so.

## Not this

- Not teaching (`socratic-learn`): they know the domain; you're extracting their intent.
- Not `discuss`: there you bring evidence and proposals. Here you bring questions and hold proposals
  back until the requirement is clear.
