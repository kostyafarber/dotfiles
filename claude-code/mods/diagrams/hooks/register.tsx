import type { Register } from 'claude-code'

// Draws an indented outline as a coloured tree in the transcript.
//
// Input: one node per line, children indented deeper than their parent. Columns on a line are
// split by two or more spaces and aligned across the tree. `{color}text{/}` colours a run.

const TOOL = 'show_tree'
const FULL = 'mcp__diagrams__show_tree'

const COLORS: Record<string, string> = {
  green: 'success',
  blue: 'suggestion',
  yellow: 'warning',
  red: 'error',
  magenta: 'merged',
  cyan: 'ide',
  dim: 'subtle',
}

type Run = { text: string; color?: string; bold?: boolean }
type Row = { prefix: string; columns: Run[][] }

const TAG = /\{(\w+)\}(.*?)\{\/\}/g

function parseRuns(text: string): Run[] {
  const runs: Run[] = []
  let at = 0
  for (const m of text.matchAll(TAG)) {
    if (m.index > at) runs.push({ text: text.slice(at, m.index) })
    const [, name = '', inner = ''] = m
    runs.push(name === 'bold' ? { text: inner, bold: true } : { text: inner, color: COLORS[name] ?? name })
    at = m.index + m[0].length
  }
  if (at < text.length) runs.push({ text: text.slice(at) })
  return runs
}

const width = (runs: Run[]) => runs.reduce((n, r) => n + r.text.length, 0)
const plain = (runs: Run[]) => runs.map(r => r.text).join('')

function layout(source: string): Row[] {
  const nodes = source
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => ({ indent: line.length - line.trimStart().length, columns: line.trim().split(/\s{2,}/) }))
  const levels = [...new Set(nodes.map(n => n.indent))].sort((a, b) => a - b)
  // The indent of the next node at or above `indent`, which says whether a branch continues.
  const nextAtOrAbove = (i: number, indent: number) => nodes.slice(i + 1).find(n => n.indent <= indent)?.indent

  return nodes.map((node, i) => {
    const depth = levels.indexOf(node.indent)
    let prefix = ''
    for (const level of levels.slice(1, depth)) prefix += nextAtOrAbove(i, level) === level ? '│   ' : '    '
    if (depth > 0) prefix += nextAtOrAbove(i, node.indent) === node.indent ? '├── ' : '└── '
    return { prefix, columns: node.columns.map(parseRuns) }
  })
}

function render(source: string): Row[] {
  const rows = layout(source)
  const widths: number[] = []
  for (const row of rows) {
    row.columns.forEach((column, k) => {
      const w = width(column) + (k === 0 ? row.prefix.length : 0)
      widths[k] = Math.max(widths[k] ?? 0, w)
    })
  }
  // Pad every column but the last so the next one starts at the same place on every row.
  for (const row of rows) {
    row.columns.forEach((column, k) => {
      if (k === row.columns.length - 1) return
      const w = width(column) + (k === 0 ? row.prefix.length : 0)
      column.push({ text: ' '.repeat((widths[k] ?? w) - w + 3) })
    })
  }
  return rows
}

const sourceOf = (input: unknown) =>
  typeof input === 'object' && input !== null && typeof (input as { tree?: unknown }).tree === 'string'
    ? (input as { tree: string }).tree
    : undefined

// show_diagram renders in the node scripts under render/ (run `npm i` there once); show_code is the
// code mod's.
// What each call drew is kept here by tool_use_id for its transcript row; a reload loses it and
// the row falls back to the engine's.
const DIAGRAM = 'mcp__diagrams__show_diagram'

type Picture = { kind: 'image'; png: string; base64?: string; columns: number; rows: number }
type Drawn =
  | Picture
  | { kind: 'text'; runs: { text: string; role: string }[][] }
const drawn = new Map<string, Drawn>()

const field = (e: unknown, key: string) => {
  const v = (e as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : undefined
}

// Light or dark from Claude Code's own theme setting, which is what the image sits in. An "auto"
// theme names neither, and the renderer then asks the terminal's settings itself.
async function themeMode($: { config: { list: () => Promise<readonly { key: string; value: unknown }[]> } }) {
  const theme = (await $.config.list()).find(row => row.key === 'theme')?.value
  if (typeof theme !== 'string') return undefined
  return theme.includes('dark') ? 'dark' : theme.includes('light') ? 'light' : undefined
}

type Host = {
  process: { run: (argv: string[], options?: { stdin?: string; timeoutMs?: number; env?: Record<string, string> }) => Promise<{ exitCode: number; stdout: string; stderr: string }> }
  fs: { read: (path: string, options: { as: 'bytes' }) => Promise<{ base64: string }> }
}

// Where a render writes its PNG: one file per tool call, in a folder looked up once.
let cacheDir: string | undefined
async function pngPath($: Host, id: string) {
  cacheDir ??= (await $.process.run(['/bin/sh', '-c', 'mkdir -p "$HOME/.cache/diagrams" && echo "$HOME/.cache/diagrams"'])).stdout.trim()
  return `${cacheDir}/${id}.png`
}

// The transcript's height in cells, as the last render hook saw it: no image is taller than the
// screen, which the terminal would leave blank.
let terminalRows = 50

// A rendered PNG as the inline image a transcript row draws. Chrome renders at 2x. Drawn at one
// cell per 8 CSS px across (about the page's own size) and two cells' height per cell's width, so
// it keeps its shape; past the row cap the width shrinks with it, never the shape.
async function imageOf($: Host, rendered: { png: string; width: number; height: number }, maxRows: number, maxColumns = 140): Promise<Picture> {
  let columns = Math.min(maxColumns, Math.max(10, Math.ceil(rendered.width / 2 / 8)))
  let rows = Math.ceil((columns * rendered.height) / rendered.width / 2)
  if (rows > maxRows) {
    columns = Math.max(10, Math.floor((columns * maxRows) / rows))
    rows = maxRows
  }
  // The bytes go with the drawing, so a row scrolled away and back can be drawn again; a file
  // name is read once by the terminal. Over the 2 MiB limit, the file name it is.
  const { base64 } = await $.fs.read(rendered.png, { as: 'bytes' })
  return { kind: 'image', png: rendered.png, base64: base64.length < 2_700_000 ? base64 : undefined, columns, rows: Math.max(3, rows) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        'Show the user a coloured tree inline in the chat, for explaining folders, structure or hierarchies. ' +
        'Pass `tree`: one node per line, children indented deeper than their parent (2 spaces per level). ' +
        'Split extra columns on a line with two or more spaces; they are aligned across the tree. ' +
        'Colour a run with {green}…{/}, {blue}, {yellow}, {red}, {magenta}, {cyan}, {dim} or {bold}. ' +
        'Use one meaning per colour within a tree. Write any explanation in your reply, not in the tree.',
      inputSchema: {
        type: 'object',
        properties: { tree: { type: 'string', description: 'The indented outline with colour tags' } },
        required: ['tree'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'show_diagram',
      description:
        'Show the user a Mermaid diagram inline in the chat. Pass `mermaid` (Mermaid source). ' +
        '`as`: "image" (default; a rendered picture, every Mermaid type) or "text" (box-drawing text; ' +
        'flowchart, state, sequence, class, ER and xychart only). Explain in your reply, not in the diagram.',
      inputSchema: {
        type: 'object',
        properties: {
          mermaid: { type: 'string', description: 'Mermaid source' },
          as: { type: 'string', enum: ['image', 'text'] },
        },
        required: ['mermaid'],
      },
      isDeferred: false,
    })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__diagrams__show_diagram' }, async ($, e) => {
    const mermaid = field(e, 'mermaid')
    if (mermaid === undefined) return { deny: 'show_diagram needs a `mermaid` string.' }
    const as = field(e, 'as') === 'text' ? 'text' : 'image'
    const id = e.tool_use_id ?? String(Date.now())
    const png = await pngPath($, id)
    const argv = ['/usr/bin/env', 'node', `${$.plugin.root}/render/mermaid.mjs`, as, ...(as === 'image' ? [png] : [])]
    const mode = await themeMode($)
    const ran = await $.process.run(argv, { stdin: mermaid, timeoutMs: 60_000, env: mode ? { CTREE_MODE: mode } : {} })
    if (ran.exitCode !== 0) return { deny: `show_diagram could not render it: ${ran.stderr.slice(0, 2000)}` }
    const rendered = JSON.parse(ran.stdout)
    if (as === 'text') {
      drawn.set(id, { kind: 'text', runs: rendered.runs })
      const text = rendered.runs.map((row: { text: string }[]) => row.map(r => r.text).join('')).join('\n')
      return { result: `Shown to the user:\n${text}` }
    }
    drawn.set(id, await imageOf($, rendered, Math.min(90, Math.max(10, terminalRows - 4))))
    return { result: `Shown to the user as an image (${rendered.png}, ${mode ?? 'mode from the terminal'}).` }
  }).catch(() => ({ deny: 'show_diagram failed.' }))

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (e.viewport?.rows) terminalRows = e.viewport.rows
    if (e.props.tool !== DIAGRAM) return next(e)
    const d = drawn.get(e.props.tool_use_id)
    if (d === undefined || e.props.isErrored) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // Only the terminal surface has Image.
    const Image = 'Image' in elements ? elements.Image : undefined
    if (d.kind === 'text') {
      return (
        <Box flexDirection="column" marginY={1}>
          {d.runs.map(row => (
            <Text>
              {row.map(r => (
                <Text color={r.role === 'line' ? 'subtle' : undefined}>{r.text}</Text>
              ))}
            </Text>
          ))}
        </Box>
      )
    }
    if (!Image) return <Text dimColor>[diagram: {d.png}]</Text>
    return (
      <Box marginY={1}>
        <Image source={d.base64 ? { png: d.base64 } : { file: d.png, format: 'png' }} columns={Math.min(255, Math.max(1, Math.round(d.columns)))} rows={Math.min(255, Math.max(1, Math.round(d.rows)))} alt={`diagram: ${d.png}`} />
      </Box>
    )
  })

  on('tool.call', { tool: 'mcp__diagrams__show_tree' }, ($, e) => {
    const source = sourceOf(e)
    if (source === undefined) return { deny: 'show_tree needs a `tree` string.' }
    const text = render(source)
      .map(row => row.prefix + row.columns.map(plain).join(''))
      .join('\n')
    return { result: `Shown to the user:\n${text}` }
  }).catch(() => ({ deny: 'show_tree could not lay out that tree.' }))

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (e.props.tool !== FULL) return next(e)
    const source = sourceOf(e.props.input)
    if (source === undefined || e.props.isErrored) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" marginY={1}>
        {render(source).map(row => (
          <Text>
            <Text color="subtle">{row.prefix}</Text>
            {row.columns.flat().map(run => (
              <Text color={run.color} bold={run.bold}>
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (![FULL, DIAGRAM].includes(e.props.tool) || e.props.isErrored) return next(e)
    if (e.props.tool !== FULL && !drawn.has(e.props.tool_use_id)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
