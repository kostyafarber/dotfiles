"""Layout kit for diagram cards.

Nodes are Paper Mono box-drawing text on a character grid; connectors are SVG drawn on
the same grid. Each colour is its own text layer over the same grid, so a character
keeps its column whatever colour it is.

    from grid import Grid, save
    g = Grid(rows=12, cols=40)
    a = g.box(0, ['client'], left=0)
    b = g.box(7, ['server'], center=20, double=True, layer='accent')
    g.arrow(a, b, via_row=5)
    save({'flow': g.card('client-server.mmd')}, 'cards.json')
"""
import html, json, os, re

CW = 14 * 0.606 - 0.126   # advance per character at 14px, letter-spacing -0.126px
LH = 17                    # line height; Paper Mono box strokes sit at a cell's centre
PAD_X, PAD_Y = 28, 24
FONT = "font-family: 'Paper Mono'; font-size: 14px; line-height: 17px; letter-spacing: -0.126px; white-space: pre;"

# One accent per card; syntax colours only ever touch code tokens.
COLORS = {
    'ink': '#222222', 'accent': '#5E8FE0', 'muted': '#8A8984',
    'fn': '#7A4CC2', 'str': '#2F7D4A', 'num': '#B4561F', 'const': '#9A4A72',
}
ICONS = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')


def cx(col): return PAD_X + col * CW + CW / 2
def cy(row): return PAD_Y + row * LH + LH / 2


class Grid:
    def __init__(self, rows, cols):
        self.rows, self.cols = rows, cols
        self.layers = {k: [[' '] * cols for _ in range(rows)] for k in COLORS}
        self.edges, self.heads, self.icons = [], [], []

    def put(self, row, col, text, layer='ink'):
        for j, ch in enumerate(text):
            self.layers[layer][row][col + j] = ch

    def box(self, row, lines, *, left=None, center=None, width=None, double=False, layer='ink'):
        """Draw a box; returns its extent. `center` keeps the box's middle on that column."""
        w = width or max(len(l) for l in lines) + 4
        if center is not None:
            w += w % 2                       # even width so the middle lands on `center`
            left = int(center + 0.5 - w / 2)
        h, v, tl, tr, bl, br = ('═', '║', '╔', '╗', '╚', '╝') if double else ('─', '│', '┌', '┐', '└', '┘')
        rows = [tl + h * (w - 2) + tr] + [v + ' ' + l.ljust(w - 4) + ' ' + v for l in lines] + [bl + h * (w - 2) + br]
        for i, s in enumerate(rows):
            self.put(row + i, left, s, layer)
        return dict(top=row, bottom=row + len(rows) - 1, left=left, right=left + w - 1, mid=left + (w - 1) / 2)

    def highlight(self, row, pattern, layer):
        """Move every match of `pattern` on `row` onto another colour layer (syntax colour, accent)."""
        line = ''.join(self.layers['ink'][row])
        for m in re.finditer(pattern, line):
            for c in range(m.start(), m.end()):
                self.layers[layer][row][c] = self.layers['ink'][row][c]
                self.layers['ink'][row][c] = ' '

    def icon(self, box, name, layer='ink', row=None):
        """Carbon icon at the start of a box's first text line. Leave 3 spaces there for it."""
        r = box['top'] + 1 if row is None else row
        svg = open(os.path.join(ICONS, f'{name}.svg')).read()
        inner = re.sub(r'^<svg[^>]*>|</svg>$', '', svg.strip())
        x, y = PAD_X + (box['left'] + 2) * CW, PAD_Y + r * LH + 1.5
        self.icons.append(f'<svg width="14" height="14" viewBox="0 0 32 32" fill="{COLORS[layer]}" '
                          f'style="position: absolute; left: {x:.1f}px; top: {y:.1f}px;">{inner}</svg>')

    def arrow(self, a, b, via_row=None, layer='ink', gap=3, r=7):
        """Downward connector from box a's bottom to box b's top, with rounded elbows at via_row."""
        color = COLORS[layer]
        x0, y0 = cx(a['mid']), cy(a['bottom'])
        x1, y1 = cx(b['mid']), cy(b['top']) - gap
        if abs(x1 - x0) < 0.5:
            d = f'M{x0:.1f} {y0:.1f}V{y1 - 8:.1f}'
        else:
            ym, s = cy(via_row), 1 if x1 > x0 else -1
            d = (f'M{x0:.1f} {y0:.1f}V{ym - r:.1f}Q{x0:.1f} {ym:.1f} {x0 + s * r:.1f} {ym:.1f}'
                 f'H{x1 - s * r:.1f}Q{x1:.1f} {ym:.1f} {x1:.1f} {ym + r:.1f}V{y1 - 8:.1f}')
        self.edges.append((d, color))
        self.heads.append((f'M{x1:.1f} {y1:.1f}L{x1 - 4:.1f} {y1 - 8:.1f}L{x1 + 4:.1f} {y1 - 8:.1f}Z', color))

    def card(self, title):
        """The card as HTML: window frame, exact-size body, connectors, then one text layer per colour."""
        W = PAD_X * 2 + self.cols * CW
        H = PAD_Y + self.rows * LH + 28
        svg = ''
        if self.edges:
            svg = (f'<svg width="{W:.0f}" height="{H:.0f}" viewBox="0 0 {W:.0f} {H:.0f}" fill="none" '
                   f'style="position: absolute; left: 0; top: 0;">'
                   + ''.join(f'<path d="{d}" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/>' for d, c in self.edges)
                   + ''.join(f'<path d="{d}" fill="{c}"/>' for d, c in self.heads) + '</svg>')
        texts = []
        for name, grid in self.layers.items():
            text = '\n'.join(''.join(r).rstrip() for r in grid)
            if not text.strip():
                continue
            weight = ' font-weight: 600;' if name == 'accent' else ''
            texts.append(f'<div style="position: absolute; left: {PAD_X}px; top: {PAD_Y}px; {FONT} '
                         f'color: {COLORS[name]};{weight}">{html.escape(text)}</div>')
        return {'title': title, 'html': f'''<div style="display: inline-flex; flex-direction: column; background: #F6F6F3; border: 1px solid #222222; box-shadow: 3px 3px 0 #222222;">
  <div style="display: flex; align-items: center; justify-content: space-between; height: 37px; padding: 0 8px 0 12px; border-bottom: 1px solid #222222; font-family: 'Paper Mono'; font-size: 14px; color: #222222;"><div>{html.escape(title)}</div><div style="font-weight: 300; font-size: 20px; line-height: 20px;">×</div></div>
  <div style="position: relative; width: {W:.0f}px; height: {H:.0f}px;">{svg}{''.join(texts)}{''.join(self.icons)}</div>
</div>'''}


def save(cards, path):
    """Write cards in order ({name: card}) for render.mjs."""
    with open(path, 'w') as f:
        json.dump(cards, f, ensure_ascii=False)
