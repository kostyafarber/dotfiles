import type { EngineInterface, Register } from 'claude-code'

// show_code: code, or a before/after change, drawn as a syntax-highlighted card in the chat. The
// cards render in render/code.mjs (run `npm i` there once); `as: "text"` draws terminal text with
// the engine's Code element instead. What each call drew is kept here by tool_use_id for its
// transcript row; a reload loses it and the row falls back to the engine's.
const CODE = 'mcp__code__show_code'
type Picture = { kind: 'image'; png: string; base64?: string; columns: number; rows: number }
type Drawn =
  | Picture
  | { kind: 'images'; images: Picture[]; hidden: number }
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
// An image grows down, not across, so it holds a few more blocks before it gets too tall to read.
const MAX_IMAGE_BLOCKS = 6
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
  cacheDir ??= (await $.process.run(['/bin/sh', '-c', 'mkdir -p "$HOME/.cache/code-cards" && echo "$HOME/.cache/code-cards"'])).stdout.trim()
  return `${cacheDir}/${id}.png`
}

// The transcript's size in cells, as the last render hook saw it: code images are drawn this wide,
// and no image is taller than the screen, which the terminal would leave blank.
let terminalColumns = 140
let terminalRows = 50

// A rendered PNG as the inline image a transcript row draws. Cards render at 2x. Drawn at one
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

// Which images each call drew, kept in $.store by tool_use_id so its row still draws them after a
// reload or a relaunch (the module's own map starts empty then). File paths only, the most recent
// KEPT_CALLS calls.
const KEPT_CALLS = 500
type Kept = { pictures: { png: string; columns: number; rows: number }[]; hidden: number }

async function remember($: EngineInterface, id: string, kept: Kept) {
  await $.store.set(`call:${id}`, kept)
  const order = ((await $.store.get('calls')) as string[] | undefined) ?? []
  const next = [...order.filter(other => other !== id), id]
  for (const old of next.slice(0, Math.max(0, next.length - KEPT_CALLS))) await $.store.delete(`call:${old}`)
  await $.store.set('calls', next.slice(-KEPT_CALLS))
}

async function recall($: EngineInterface, id: string): Promise<Drawn | undefined> {
  const kept = (await $.store.get(`call:${id}`)) as Kept | undefined
  if (!kept?.pictures.length) return undefined
  return { kind: 'images', images: kept.pictures.map(picture => ({ kind: 'image', ...picture })), hidden: kept.hidden }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'show_code',
      description:
        'Show the user code as syntax-highlighted cards: a snippet, or a before/after change as a coloured diff. ' +
        '`as`: "image" (default; a syntax-highlighted picture, Rust run through rustfmt, before and after side by side) or "text" (terminal text). ' +
        'Use it before making a change, so the user sees what it will look like. Pass `code` for a snippet, or `before` and `after` ' +
        'for a change (side by side, lines aligned, when both are short; unified otherwise; `layout` forces one). For several blocks pass `changes`: ' +
        '[{path, note, before, after} or {path, note, code}], each its own framed block; past six (four as text) the rest are counted and the user ' +
        'is pointed to the nvim review. Show the code instead of describing it: when about to say "the fix is in X:42", show that hunk. ' +
        'For an API or interface, show the signatures (types, function signatures, props; no bodies) and one call site as two blocks. ' +
        '`path` is shown in the block header and picks the highlighter; `language` ' +
        'overrides it; `title` adds a short note; `startLine` numbers a snippet. Show only the hunk that matters, not whole files. ' +
        'Code that is already on disk is named, not pasted, so the call stays short: {path, lines: "120-160"} shows that range, and ' +
        '{path, against: "HEAD"} shows each hunk of the working copy that differs from that revision. Paste only code that is not in a file yet.',
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
                caption: { type: 'string', description: 'A note drawn under the code instead of in the header; `backticks` mark code.' },
                focus: { type: 'string', description: 'Line numbers to bring forward, e.g. "105-106,110"; the rest of the card is dimmed.' },
                before: { type: 'string' },
                after: { type: 'string' },
                code: { type: 'string' },
                startLine: { type: 'number' },
                lines: { type: 'string', description: 'Show this range of `path` from disk, e.g. "120-160", instead of pasting it.' },
                against: { type: 'string', description: 'Show each hunk where `path` differs from this git revision (e.g. "HEAD", "origin/main"), instead of pasting before/after.' },
              },
            },
          },
          frame: { type: 'string', enum: ['rule', 'box', 'rule-split'] },
          as: { type: 'string', enum: ['image', 'text'] },
        },
      },
      isDeferred: false,
    })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__code__show_code' }, async ($, e) => {
    const id = e.tool_use_id ?? String(Date.now())
    const language = field(e, 'language')
    const layout = field(e, 'layout') ?? 'auto'
    const frameArg = field(e, 'frame')
    const frame: Frame = frameArg === 'rule' || frameArg === 'rule-split' ? frameArg : 'box'
    type Change = {
      path?: string
      note?: string
      caption?: string
      focus?: string
      before?: string
      after?: string
      code?: string
      startLine?: number
      beforeLine?: number
      afterLine?: number
      lines?: string
      against?: string
      format?: boolean
    }
    // A change that names code on disk instead of carrying it, so the call stays short: `lines`
    // ("120-160") is that range of `path`; `against` (a git revision) is each hunk where `path`'s
    // working copy differs from it. Code read from disk is shown as it is, not reformatted.
    const fromDisk = async (change: Change): Promise<Change[]> => {
      const path = change.path ?? ''
      if (change.lines !== undefined) {
        const [first = 1, last = first] = change.lines.split('-').map(Number)
        const ran = await $.process.run(['sed', '-n', `${first},${last}p`, path])
        if (ran.exitCode !== 0) throw new Error(`show_code could not read ${path}: ${ran.stderr}`)
        return [{ path: `${path}:${first}`, note: change.note, caption: change.caption, focus: change.focus, code: ran.stdout, startLine: first, format: false }]
      }
      if (change.against !== undefined) {
        // Run from the file's own folder, so a file in another repository diffs against its own history.
        const slash = path.lastIndexOf('/')
        const folder = slash < 0 ? '.' : path.slice(0, slash) || '/'
        const ran = await $.process.run(['git', 'diff', '--no-color', '-U3', change.against, '--', path.slice(slash + 1)], { cwd: folder })
        if (ran.exitCode !== 0) throw new Error(`show_code could not diff ${path}: ${ran.stderr}`)
        const hunks: Change[] = []
        for (const line of ran.stdout.split('\n')) {
          const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
          const hunk = hunks.at(-1)
          if (header) {
            hunks.push({ path: `${path}:${header[2]}`, note: change.note, caption: change.caption, focus: change.focus, before: '', after: '', beforeLine: Number(header[1]), afterLine: Number(header[2]), format: false })
          } else if (hunk && /^[ +-]/.test(line) && !/^(\+\+\+|---) /.test(line)) {
            const text = `${line.slice(1)}\n`
            if (line[0] !== '+') hunk.before += text
            if (line[0] !== '-') hunk.after += text
          }
        }
        return hunks
      }
      return [change]
    }
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
          const named = typeof item.path === 'string' && (typeof item.lines === 'string' || typeof item.against === 'string')
          return named || typeof item.code === 'string' || (typeof item.before === 'string' && typeof item.after === 'string')
        })
      : []
    const before = field(e, 'before')
    const after = field(e, 'after')
    if (before !== undefined && after !== undefined) changes.unshift({ path: field(e, 'path'), note: field(e, 'title'), before, after })
    const snippet = field(e, 'code')
    if (field(e, 'as') !== 'text') {
      const named = (await Promise.all(changes.map(fromDisk))).flat()
      const blocks: Change[] = named.length ? named : snippet !== undefined ? [{ path: field(e, 'path'), note: field(e, 'title'), code: snippet }] : []
      if (!blocks.length) return { deny: 'show_code needs `code`, `before` and `after`, or `changes`.' }
      const shown = blocks.slice(0, MAX_IMAGE_BLOCKS).map(block => ({ ...block, language }))
      const png = await pngPath($, id)
      const mode = await themeMode($)
      const imageColumns = Math.max(60, terminalColumns - 4)
      const ran = await $.process.run(['/usr/bin/env', 'node', `${$.plugin.root}/render/code.mjs`, png], {
        // A few cells short of the transcript, for its margin.
        stdin: JSON.stringify({ blocks: shown, layout, columns: imageColumns }),
        timeoutMs: 60_000,
        env: mode ? { CTREE_MODE: mode } : {},
      })
      if (ran.exitCode !== 0) return { deny: `show_code could not render it: ${ran.stderr.slice(0, 2000)}` }
      // One image per block: each stays under the terminal's image size limit and at full size.
      const { images } = JSON.parse(ran.stdout) as { images: { png: string; width: number; height: number }[] }
      // Code read from disk is not echoed back: the caller named it and can read it there.
      const text = shown.map(b => (b.format === false ? `${b.path ?? ''}` : `${b.path ?? ''}\n${b.code ?? `--- before\n${b.before}\n+++ after\n${b.after}`}`)).join('\n\n')
      const hidden = blocks.length - shown.length
      const pictures = await Promise.all(images.map(image => imageOf($, image, Math.max(10, terminalRows - 4), imageColumns)))
      drawn.set(id, { kind: 'images', images: pictures, hidden })
      await remember($, id, { pictures: pictures.map(({ png, columns, rows }) => ({ png, columns, rows })), hidden })
      const more = hidden ? ` ${hidden} more not shown; point the user to the nvim review (/look).` : ''
      return { result: `Shown to the user as an image of ${shown.length} block(s).${more}\n${text}` }
    }
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

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.viewport?.columns) terminalColumns = e.viewport.columns
    if (e.viewport?.rows) terminalRows = e.viewport.rows
    if (e.props.tool !== CODE) return next(e)
    const d = drawn.get(e.props.tool_use_id) ?? (await recall($, e.props.tool_use_id))
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
    const pictures = d.kind === 'images' ? d.images : [d]
    const hidden = d.kind === 'images' ? d.hidden : 0
    if (!Image) return <Text dimColor>[image: {pictures.map(p => p.png).join(', ')}]</Text>
    return (
      <Box flexDirection="column" marginY={1} gap={1}>
        {pictures.map(p => (
          <Image source={p.base64 ? { png: p.base64 } : { file: p.png, format: 'png' }} columns={p.columns} rows={p.rows} alt={`image: ${p.png}`} />
        ))}
        {hidden ? (
          <Text dimColor>{`+${hidden} more block${hidden === 1 ? '' : 's'} not shown: open the review in nvim (/look) to see them all`}</Text>
        ) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== CODE || e.props.isErrored) return next(e)
    if (!drawn.has(e.props.tool_use_id) && !(await recall($, e.props.tool_use_id))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
