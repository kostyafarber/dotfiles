// Each diagram type draws without a browser: drawDiagram must not throw (mermaid.mjs would fall
// back to Chrome) and must write a PNG of a plausible size.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drawDiagram } from '../diagram.mjs'

const theme = { mode: 'dark', bg: '#1e1e2e', fg: '#e4e6e1' }
const sources = {
  flowchart: 'flowchart LR\n  subgraph R[Renderer]\n    a[Tool] --> b[Glyph]\n  end\n  b -- intent --> c[Engine]\n  classDef focus stroke:#5E8FE0\n  class c focus',
  sequence: 'sequenceDiagram\n  participant P as Pointer\n  participant W as wasm\n  P->>W: dx, dy\n  rect rgb(94,143,224)\n  W-->>P: moves\n  end',
  state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Open: begin\n  Open --> Idle: commit',
  pie: 'pie title Where time goes\n  "render" : 60\n  "tokens" : 40',
  bars: 'xychart-beta\n  title "Render time"\n  %% key: diagram, code\n  x-axis ["Chrome", "no browser"]\n  bar [1200, 150]\n  bar [1200, 100]',
}

for (const [name, source] of Object.entries(sources)) {
  test(name, async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'diagram-')), `${name}.png`)
    const drawn = await drawDiagram(source, out, theme)
    assert.ok(drawn.width > 200 && drawn.height > 100, `${name} is ${drawn.width}x${drawn.height}`)
    assert.ok(statSync(out).size > 2000, `${name}'s PNG is nearly empty`)
  })
}
