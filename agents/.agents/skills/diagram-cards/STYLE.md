# Diagram card style

The look is Paper Mono's own launch page: text as interface, drawn with real box-drawing
characters, on a window card. Every rule below was a call the user made; keep to them.

## Card

- Window frame: `name.mmd` title left, `×` right, 37px title bar, 1px `#222` rule.
- Fill `#F6F6F3`, 1px `#222` border, hard shadow `3px 3px 0 #222`. Every panel gets the
  shadow, including the detail panel of a zoom card.
- Paper Mono 14px on a 17px line, letter-spacing −0.126px. A cell is 8.358 × 17px and box
  strokes sit at the cell's centre, so SVG lines drawn to `cx(col)`/`cy(row)` meet them exactly.
- Render with a transparent background; no white matte around the card.

## Nodes and connectors

- Nodes are box text: `┌─┐` normal, `╔═╗` for the focus node.
- Connectors are SVG, not characters: 1.5px ink, rounded elbows (radius 7), small filled
  8 × 8 arrowheads stopping 3px short of the box. Merge several sources into one trunk.
- No overlaps: a connector, region or label never crosses an unrelated box or label. Move a
  label to the other side of its box before letting a line cut through it.
- A line meeting box text must be drawn above any fill, or the fill hides its last pixels.

## Colour

- Ink `#222` for everything by default.
- **One accent per card**, `#5E8FE0`, on the single thing the card is about (the signing
  step, the signature, the set bits). Never whole cards, never decoration.
- Code tokens only (function names, strings, numbers, constants) take muted syntax colours:
  fn `#7A4CC2`, str `#2F7D4A`, num `#B4561F`, const `#9A4A72`. Prose stays ink.
- Secondary labels (`JSON`, units) in muted `#8A8984`.

## Text

- No pills, chips or tag backgrounds on labels: plain text.
- Numbered steps use plain digits (`1  flags`), not circle badges.
- Lowercase, short labels; real names from the code (`issueToken()`), real example
  values (compute them, don't invent their shape).

## Icons

- IBM Carbon only, 14px, at the start of an entity box's first line (leave 3 spaces).
- Sparingly: a few boxes per card that are things (a key, a database, a document), not
  every box. The focus box's icon takes the accent colour.

## Zoom card (advanced)

A shrunk overview of a flow card with the node in question boxed in the accent, two 1px
ink projection lines from the box's right corners to the corners of a full-size detail
panel. Align the overview so the boxed node sits level with the panel's middle and the
lines run clear of other boxes. Mock it in Paper before writing it as code.

## New card types

Mock them in Paper first (the user designs there), agree the look, then build them in
grid.py. Paper cannot CSS-scale a cloned card: use a rendered PNG for shrunk overviews.
