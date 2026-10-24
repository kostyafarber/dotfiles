---
name: diagram-cards
description: Draw explanation diagrams as Paper Mono box-drawing cards (box-text nodes, SVG connectors, one accent colour), render them to PNGs and show them in a Rex pane the user steps through with the arrow keys. Use when explaining how code, a system or a data format works and a picture would help ("draw it", "diagram this", "show me how X flows", "how does the login token work"), when explain-flow's wiring has five or more parts, or when the user asks for diagram cards, a deck or the diagrams pane.
---

# Diagram cards

An explanation is a short **deck** of cards, each answering one question. The user steps
through them in a Rex pane beside the chat. Verify every box against the code before
drawing it: a card states facts, so cite what it shows in the reply.

## Workflow

1. **Plan the deck** (2–4 cards). Pick a card type per question:
   - **flow**: who calls what, and in which order (boxes + arrows)
   - **anatomy**: a value split into its parts (a key, a URL, a payload) with brackets
   - **table**: a bitfield, enum or mapping, with one example worked through
   - **zoom**: one node of the flow opened up (see STYLE.md; mock new types in Paper first)
2. **Write a Python script** in the scratchpad that builds the cards with `scripts/grid.py`
   and saves them. Copy the shape of `examples/jwt.py`.
3. **Render**: `node scripts/render.mjs cards.json` writes `~/.cache/diagram-cards/deck/NN-name.png`.
4. **Show**: `scripts/show.sh` opens the `diagrams` pane once; it then watches the deck
   folder and jumps to each new render by itself.
5. **Look at the PNGs** (Read them) before telling the user they are ready. Fix overlaps,
   cut-off text and arrows that miss a box.
6. Reply with what each card shows, in order, and the `file:line` it came from.

Paths are relative to this skill's folder. First run only: `npm install --prefix <skill folder>`.

## grid.py in brief

```python
g = Grid(rows, cols)                         # one character grid per card
b = g.box(row, ['line', 'line'], center=35)  # or left=col; double=True; layer='accent'
g.put(row, col, 'label', 'muted')            # free text on any colour layer
g.highlight(row, r'nanoid', 'fn')            # recolour code tokens: fn, str, num, const
g.icon(b, 'password')                        # Carbon icon; leave 3 spaces at the line start
g.arrow(a, b, via_row=5)                     # downward connector, rounded elbows
save({'flow': g.card('name.mmd')}, path)     # dict order = deck order
```

Icons available: `assets/icons/*.svg` (bot, terminal, screen, password, data--base, license,
document, user, application, flow, cloud, locked, folder, settings). Add more from
`@carbon/icons` 32px SVGs.

## In the pane

← → step · `+` `-` zoom · `0` reset · `q` quit. Cards open at natural size and refit
when the pane is zoomed or resized.

## Style

Follow [STYLE.md](STYLE.md): one accent per card, no pills, plain-digit lists, hard 3px
shadow on every panel, no overlaps.
