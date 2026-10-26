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

// show_diagram and show_code render in the node scripts under render/ (run `npm i` there once).
// What each call drew is kept here by tool_use_id for its transcript row; a reload loses it and
// the row falls back to the engine's.
const DIAGRAM = 'mcp__diagrams__show_diagram'
const CODE = 'mcp__diagrams__show_code'

type Drawn =
  | { kind: 'image'; png: string; base64?: string; columns: number; rows: number }
  | { kind: 'text'; runs: { text: string; role: string }[][] }
  | { kind: 'code'; frame: Frame; blocks: CodeBlock[]; hidden: number }
// One delineated block of code: a header line (path · note), then a snippet, a unified diff, or a
// before/after pair side by side.
type CodeBlock = {
  path?: string
  note?: string
  language?: string
  source: string
  diff: boolean
  startLine?: number
  rows?: SideRow[]
}
// One row of a side-by-side change: the before line and the after line, each a one-line diff hunk
// ('-' or ' ' on the left, '+' or ' ' on the right), or undefined where that side has a filler row.
type SideRow = [string | undefined, string | undefined]
// How blocks are set apart (being compared): a rule header, a dim box, or a rule header plus a rule
// between the two sides.
type Frame = 'rule' | 'box' | 'rule-split'
const MAX_BLOCKS = 4
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

// A unified diff as aligned side-by-side rows. Context lines sit on both sides; within a run of
// removals and additions, the nth removal faces the nth addition and the shorter side gets filler
// rows. Each cell is a one-line hunk numbered like the file, so `Code` draws the right gutter.
function sideRows(unified: string): SideRow[] {
  const rows: SideRow[] = []
  let oldLine = 1
  let newLine = 1
  let dels: string[] = []
  let adds: string[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
      const del = dels[i]
      const add = adds[i]
      rows.push([
        del === undefined ? undefined : `@@ -${oldLine++},1 +${newLine},0 @@\n${del}`,
        add === undefined ? undefined : `@@ -${oldLine},0 +${newLine++},1 @@\n${add}`,
      ])
    }
    dels = []
    adds = []
  }
  for (const line of unified.split('\n')) {
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) {
      flush()
      oldLine = Number(header[1])
      newLine = Number(header[2])
    } else if (line.startsWith('-')) dels.push(line)
    else if (line.startsWith('+')) adds.push(line)
    else if (line.startsWith(' ')) {
      flush()
      // An unchanged line counts on both sides of its hunk, or Code does not read it as a diff.
      const hunk = `@@ -${oldLine++},1 +${newLine++},1 @@\n${line}`
      rows.push([hunk, hunk])
    }
  }
  flush()
  return rows
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
    await $.tool.register({
      name: 'show_code',
      description:
        'Show the user code inline in the chat as real terminal text: a snippet, or a before/after change as a coloured diff. ' +
        'Use it before making a change, so the user sees what it will look like. Pass `code` for a snippet, or `before` and `after` ' +
        'for a change (side by side, lines aligned, when both are short; unified otherwise; `layout` forces one). For several blocks pass `changes`: ' +
        '[{path, note, before, after} or {path, note, code}], each its own framed block; past four the rest are counted and the user ' +
        'is pointed to the nvim review. Show the code instead of describing it: when about to say "the fix is in X:42", show that hunk. ' +
        'For an API or interface, show the signatures (types, function signatures, props; no bodies) and one call site as two blocks. ' +
        '`path` is shown in the block header and picks the highlighter; `language` ' +
        'overrides it; `title` adds a short note; `startLine` numbers a snippet. Show only the hunk that matters, not whole files.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          before: { type: 'string' },
          after: { type: 'string' },
          language: { type: 'string' },
          path: { type: 'string' },
          title: { type: 'string' },
          startLine: { type: 'number' },
          layout: { type: 'string', enum: ['auto', 'split', 'unified'] },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                note: { type: 'string' },
                before: { type: 'string' },
                after: { type: 'string' },
                code: { type: 'string' },
                startLine: { type: 'number' },
              },
            },
          },
          frame: { type: 'string', enum: ['rule', 'box', 'rule-split'] },
        },
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
    const cache = await $.process.run(['/bin/sh', '-c', 'mkdir -p "$HOME/.cache/diagrams" && echo "$HOME/.cache/diagrams"'])
    const png = `${cache.stdout.trim()}/${id}.png`
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
    // Chrome renders at 2x. Drawn at one cell per 8 CSS px across (about the page's own size) and
    // two cells' height per cell's width, so it keeps its shape; past the row cap the width
    // shrinks with it, never the shape.
    const maxRows = 90
    let columns = Math.min(140, Math.max(10, Math.ceil(rendered.width / 2 / 8)))
    let rows = Math.ceil((columns * rendered.height) / rendered.width / 2)
    if (rows > maxRows) {
      columns = Math.max(10, Math.floor((columns * maxRows) / rows))
      rows = maxRows
    }
    // The bytes go with the drawing, so a row scrolled away and back can be drawn again; a file
    // name is read once by the terminal. Over the 2 MiB limit, the file name it is.
    const { base64 } = await $.fs.read(rendered.png, { as: 'bytes' })
    drawn.set(id, { kind: 'image', png: rendered.png, base64: base64.length < 2_700_000 ? base64 : undefined, columns, rows: Math.max(3, rows) })
    return { result: `Shown to the user as an image (${rendered.png}, ${mode ?? 'mode from the terminal'}).` }
  }).catch(() => ({ deny: 'show_diagram failed.' }))

  on('tool.call', { tool: 'mcp__diagrams__show_code' }, async ($, e) => {
    const id = e.tool_use_id ?? String(Date.now())
    const language = field(e, 'language')
    const layout = field(e, 'layout') ?? 'auto'
    const frameArg = field(e, 'frame')
    const frame: Frame = frameArg === 'rule' || frameArg === 'rule-split' ? frameArg : 'box'
    type Change = { path?: string; note?: string; before?: string; after?: string; code?: string; startLine?: number }
    const diffBlock = async (change: Change): Promise<CodeBlock> => {
      if (change.before === undefined || change.after === undefined) {
        return { path: change.path, note: change.note, language, source: change.code ?? '', diff: false, startLine: change.startLine }
      }
      const ran = await $.process.run(['/usr/bin/env', 'node', `${$.plugin.root}/render/diff.mjs`], { stdin: JSON.stringify(change) })
      if (ran.exitCode !== 0) throw new Error(ran.stderr.slice(0, 2000))
      const short = Math.max(change.before.split('\n').length, change.after.split('\n').length) <= 12
      const rows = layout === 'split' || (layout === 'auto' && short) ? sideRows(ran.stdout) : undefined
      return { path: change.path, note: change.note, language, source: ran.stdout, diff: true, rows }
    }
    const list = (e as { changes?: unknown }).changes
    const changes: Change[] = Array.isArray(list)
      ? list.filter((c): c is Change => {
          if (typeof c !== 'object' || c === null) return false
          const item = c as Change
          return typeof item.code === 'string' || (typeof item.before === 'string' && typeof item.after === 'string')
        })
      : []
    const before = field(e, 'before')
    const after = field(e, 'after')
    if (before !== undefined && after !== undefined) changes.unshift({ path: field(e, 'path'), note: field(e, 'title'), before, after })
    if (changes.length) {
      const blocks = await Promise.all(changes.slice(0, MAX_BLOCKS).map(diffBlock))
      drawn.set(id, { kind: 'code', frame, blocks, hidden: Math.max(0, changes.length - MAX_BLOCKS) })
      return { result: `Shown to the user as ${changes.length} block(s):\n${blocks.map(b => `${b.path ?? ''}\n${b.source}`).join('\n')}` }
    }
    const code = field(e, 'code')
    if (code === undefined) return { deny: 'show_code needs `code`, `before` and `after`, or `changes`.' }
    const startLine = (e as { startLine?: unknown }).startLine
    drawn.set(id, {
      kind: 'code',
      frame,
      hidden: 0,
      blocks: [{ path: field(e, 'path'), note: field(e, 'title'), language, source: code, diff: false, startLine: typeof startLine === 'number' ? startLine : undefined }],
    })
    return { result: 'Shown to the user.' }
  }).catch(() => ({ deny: 'show_code failed.' }))

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (e.props.tool !== DIAGRAM && e.props.tool !== CODE) return next(e)
    const d = drawn.get(e.props.tool_use_id)
    if (d === undefined || e.props.isErrored) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text, Code } = elements
    // Only the terminal surface has Image.
    const Image = 'Image' in elements ? elements.Image : undefined
    if (d.kind === 'code') {
      const RULE = 64
      const header = (block: CodeBlock) => {
        const label = [block.path, block.note].filter(Boolean).join('  ·  ')
        if (d.frame === 'box') return label ? <Text dimColor>{label}</Text> : null
        return <Text dimColor>{`── ${label} ${'─'.repeat(Math.max(3, RULE - label.length))}`}</Text>
      }
      const code = (block: CodeBlock, source: string, format: 'diff' | 'source') => (
        <Code source={source} language={block.language} path={block.path} startLine={format === 'source' ? block.startLine : undefined} format={format} wrap="truncate-end" />
      )
      const body = (block: CodeBlock) => {
        if (!block.rows) return code(block, block.source, block.diff ? 'diff' : 'source')
        const cell = (hunk: string | undefined) => (
          <Box flexDirection="column" flexGrow={1} flexShrink={1} width="50%">
            {hunk ? code(block, hunk, 'diff') : <Text> </Text>}
          </Box>
        )
        return (
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Box flexGrow={1} width="50%"><Text dimColor>before</Text></Box>
              <Box flexGrow={1} width="50%"><Text dimColor>after</Text></Box>
            </Box>
            {block.rows.map(([left, right]) => (
              <Box flexDirection="row" gap={1}>
                {cell(left)}
                {d.frame === 'rule-split' ? <Text dimColor>│</Text> : null}
                {cell(right)}
              </Box>
            ))}
          </Box>
        )
      }
      return (
        <Box flexDirection="column" marginY={1} gap={1}>
          {d.blocks.map(block =>
            d.frame === 'box' ? (
              <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
                {header(block)}
                {body(block)}
              </Box>
            ) : (
              <Box flexDirection="column">
                {header(block)}
                {body(block)}
              </Box>
            ),
          )}
          {d.hidden ? (
            <Text dimColor>{`+${d.hidden} more change${d.hidden === 1 ? '' : 's'} not shown: open the review in nvim (/look) to see them all`}</Text>
          ) : null}
        </Box>
      )
    }
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
        <Image source={d.base64 ? { png: d.base64 } : { file: d.png, format: 'png' }} columns={d.columns} rows={d.rows} alt={`diagram: ${d.png}`} />
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
    if (![FULL, DIAGRAM, CODE].includes(e.props.tool) || e.props.isErrored) return next(e)
    if (e.props.tool !== FULL && !drawn.has(e.props.tool_use_id)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
