// show_code as images, with no browser: { blocks, layout, columns } on stdin -> { images: [{ png, width, height }] },
// one image per block.
//   node code.mjs <out.png>        (block n is written to out-n.png)
//   node code.mjs <out.svg> svg    (the SVG instead, for tests)
// Each block is { path?, note?, language?, startLine?, code } or { path?, note?, language?, before, after }.
// @pierre/highlights colours the code, the `diff` package lines the two sides up, and the cards are
// laid out as SVG on a monospace grid (code is one, so nothing needs measuring) and drawn by resvg
// in the terminal's font, light or dark, as cards on a transparent ground, as wide as `columns`.
// Rust is formatted by rustfmt first, so it reads as it would in the repo.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { modules, terminalTheme } from './browser.mjs'

const [out, format_ = 'png'] = process.argv.slice(2)
const { blocks, layout = 'auto', columns = 140 } = JSON.parse(readFileSync(0, 'utf8'))
const { codeToTokens, isSupportedLanguage } = await import(join(modules, '@pierre/highlights/dist/default.js'))
const { pierreDark, pierreLight } = await import(join(modules, '@pierre/highlights/dist/themes.js'))
const { diffLines, diffWordsWithSpace } = await import(join(modules, 'diff/libesm/index.js'))
const { Resvg } = await import(join(modules, '@resvg/resvg-js/index.js'))
// CTREE_THEME ({ mode, font, bg } as JSON) fixes the theme, so tests don't read the terminal's.
const { mode, font, bg } = process.env.CTREE_THEME ? JSON.parse(process.env.CTREE_THEME) : terminalTheme()
const dark = mode === 'dark'

// Tints are a solid colour with fill-opacity: resvg reads SVG 1.1, where rgba() alpha is ignored.
// One terminal cell per 8 px, as the transcript sizes the image; at 13 px a monospace advance is
// about 0.6 em, so a code character takes about one cell.
const CELL_PX = 8
const FONT_PX = 13
const CHAR_PX = FONT_PX * 0.6
const LINE_PX = 20
const BASELINE_PX = 14
const PAD = 2
const HEADER_PX = 30
const GUTTER_CHARS = 4
// A caption is prose, so it keeps a reading measure however wide the card is.
const CAPTION_CHARS = 60
const width = columns * CELL_PX

const palette = dark
  ? { fg: '#e4e6e8', muted: '#8d959d', rule: '#3a3f45', del: '#ff5c5c', add: '#34c778', tint: 0.16, delBar: '#ff6b6b', addBar: '#3fcf8e', delText: '#f0a4a4', addText: '#9fd8b1', mark: 0.42, focus: '#8fa9ea' }
  : { fg: '#1d2023', muted: '#4f555c', rule: '#d6d8dc', del: '#dc3c3c', add: '#1ea05a', tint: 0.12, delBar: '#d64545', addBar: '#1f9d5a', delText: '#a03434', addText: '#24703f', mark: 0.3, focus: '#3f5fa8' }

// A colour `amount` (0–1) of the way from `from` toward `to`, both #rrggbb.
function mix(from, to, amount) {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const mixed = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}
// The card's surface: the terminal's background lifted a little, so a card reads as solid rather
// than see-through.
const ground = /^#[0-9a-f]{6}$/i.test(bg ?? '') ? bg : dark ? '#16181b' : '#ffffff'
const surface = dark ? mix(ground, '#ffffff', 0.035) : mix(ground, '#000000', 0.05)
// Pierre's light theme is pale on a light card; its colours go a quarter of the way to black.
const tokenColor = (color) => (dark || !/^#[0-9a-f]{6}$/i.test(color) ? color : mix(color, '#000000', 0.25))

const LANGUAGES = { rs: 'rust', ts: 'typescript', mts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', md: 'markdown', sh: 'bash', zsh: 'bash', py: 'python', yml: 'yaml' }

// The language of a block: its own, else its path's extension. A path with a note after it
// ("render/code.mjs (new)", "a.rs → b.rs", "bridge.rs:300") is read for its last real file name.
function languageOf(block) {
  if (block.language && isSupportedLanguage(block.language)) return block.language
  const files = (block.path ?? '').split(/\s+/).map((word) => word.replace(/:\d+$/, '')).filter((word) => /\.\w+$/.test(word))
  const extension = files.at(-1)?.split('.').at(-1)
  const language = LANGUAGES[extension] ?? extension
  return language && isSupportedLanguage(language) ? language : undefined
}

// `code` as rustfmt would write it. A fragment that is not whole items (statements, an expression)
// is formatted inside a function and taken back out; anything rustfmt can't parse (`…`, bodiless
// signatures) is shown as written.
function format(code, language) {
  if (language !== 'rust') return code
  const rustfmt = (input) => {
    const ran = spawnSync('rustfmt', ['--edition', '2024', '--emit', 'stdout', '--quiet'], { input, encoding: 'utf8' })
    return ran.status === 0 ? ran.stdout : undefined
  }
  const whole = rustfmt(code)
  if (whole !== undefined) return whole.replace(/\n+$/, '')
  const wrapped = rustfmt(`fn __shown() {\n${code}\n}\n`)
  if (wrapped === undefined) return code
  const body = wrapped.replace(/\n+$/, '').split('\n').slice(1, -1)
  return body.map((line) => line.replace(/^ {4}/, '')).join('\n')
}

// `code` without the indentation all its non-blank lines share, as a range cut from inside a
// function has.
function dedent(code) {
  const lines = code.split('\n')
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length)
  const shared = indents.length ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(shared)).join('\n')
}

// Each line of `code` as coloured runs.
function highlight(code, language) {
  const text = code.replace(/\n+$/, '')
  if (!language) return text.split('\n').map((line) => [{ text: line, color: palette.fg }])
  const { tokens } = codeToTokens(text, { lang: language, theme: dark ? pierreDark : pierreLight })
  return tokens.map((line) => line.map((token) => ({ text: token.content, color: tokenColor(token.color ?? palette.fg), italic: (token.fontStyle & 1) === 1 })))
}

// Runs cut into rows of at most `chars` characters, each piece keeping its run's colour.
function wrap(runs, chars) {
  const rows = [[]]
  let used = 0
  for (const run of runs) {
    let text = run.text.replace(/\t/g, '    ')
    while (text.length) {
      if (used === chars) {
        rows.push([])
        used = 0
      }
      const piece = text.slice(0, chars - used)
      rows.at(-1).push({ ...run, text: piece })
      used += piece.length
      text = text.slice(piece.length)
    }
  }
  return rows
}

// Prose runs cut into rows of at most `chars` characters, breaking between words.
function wrapWords(runs, chars) {
  const rows = [[]]
  let used = 0
  for (const run of runs) {
    for (const word of run.text.split(/(?<= )/)) {
      if (used + word.trimEnd().length > chars && used > 0) {
        rows.push([])
        used = 0
      }
      const text = used === 0 ? word.trimStart() : word
      rows.at(-1).push({ ...run, text })
      used += text.length
    }
  }
  return rows
}

// The two sides as rows of [before, after] cells: unchanged lines face each other, and within a
// change the nth removed line faces the nth added one, the shorter side left blank.
function sideBySide(before, after) {
  const end = (text) => (text.endsWith('\n') ? text : `${text}\n`)
  const rows = []
  let oldLine = 0
  let newLine = 0
  let removed = []
  const flushRemoved = () => {
    for (const cell of removed) rows.push([cell, undefined])
    removed = []
  }
  for (const part of diffLines(end(before), end(after))) {
    const count = part.value.replace(/\n$/, '').split('\n').length
    if (part.removed) {
      flushRemoved()
      for (let i = 0; i < count; i++) removed.push({ line: oldLine++, kind: 'del' })
    } else if (part.added) {
      const added = []
      for (let i = 0; i < count; i++) added.push({ line: newLine++, kind: 'add' })
      for (let i = 0; i < Math.max(removed.length, added.length); i++) rows.push([removed[i], added[i]])
      removed = []
    } else {
      flushRemoved()
      for (let i = 0; i < count; i++) rows.push([{ line: oldLine++, kind: 'same' }, { line: newLine++, kind: 'same' }])
    }
  }
  flushRemoved()
  return rows
}

// A line's text as the wrapper lays it out, tabs as four spaces.
const plain = (runs) => runs.map((run) => run.text).join('').replace(/\t/g, '    ')

// The characters that changed between a removed line and the added line facing it, as [start, end)
// columns on each side; null when the two share too little for word marks to help (a rewrite, not
// an edit), so unrelated lines stay plain.
function wordMarks(before, after) {
  const parts = diffWordsWithSpace(before, after)
  const same = parts.filter((part) => !part.added && !part.removed).reduce((n, part) => n + part.value.trim().length, 0)
  if (same < 0.4 * Math.max(before.trim().length, after.trim().length)) return null
  const marks = { before: [], after: [] }
  let at = { before: 0, after: 0 }
  for (const part of parts) {
    const length = part.value.length
    if (part.removed) marks.before.push([at.before, at.before + length])
    if (part.added) marks.after.push([at.after, at.after + length])
    if (!part.added) at.before += length
    if (!part.removed) at.after += length
  }
  return marks
}

// Line numbers named by a `focus` spec ("105-106,110"), or undefined when it names none.
function focusOf(spec) {
  if (!spec) return undefined
  const ranges = String(spec).split(',').map((range) => range.trim().split('-').map(Number))
  return (number) => ranges.some(([first, last = first]) => number >= first && number <= last)
}

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// One code line in a column `chars` wide at `x`: its wrapped rows, and how to draw them at `y`
// once the row's height (the taller of the two sides in a split) is known.
// `focus` (a line-number test) dims every line it doesn't name; `cell.marks` are changed columns.
function codeLine(lines, cell, x, chars, number, focus) {
  const textChars = chars - GUTTER_CHARS - 1
  const rows = wrap(lines[cell.line] ?? [], textChars)
  const focused = focus?.(number)
  const dimmed = focus !== undefined && !focused
  const tint = { del: palette.del, add: palette.add }[cell.kind]
  const bar = { del: palette.delBar, add: palette.addBar }[cell.kind]
  const numberColor = { del: palette.delText, add: palette.addText }[cell.kind] ?? palette.muted
  return {
    height: rows.length * LINE_PX,
    draw(y, height) {
      const parts = []
      const textX = x + (GUTTER_CHARS + 0.5) * CHAR_PX
      if (tint) {
        parts.push(`<rect x="${x}" y="${y}" width="${chars * CHAR_PX}" height="${height}" fill="${tint}" fill-opacity="${palette.tint}"/>`)
        parts.push(`<rect x="${x}" y="${y}" width="3" height="${height}" fill="${bar}"/>`)
      } else if (focused) {
        parts.push(`<rect x="${x}" y="${y}" width="${chars * CHAR_PX}" height="${height}" fill="${palette.focus}" fill-opacity="0.1"/>`)
        parts.push(`<rect x="${x}" y="${y}" width="3" height="${height}" fill="${palette.focus}"/>`)
      }
      // Each changed span, cut where the line wraps.
      for (const [start, end] of cell.marks ?? []) {
        for (let row = Math.floor(start / textChars); row * textChars < end && row < rows.length; row++) {
          const from = Math.max(start, row * textChars) - row * textChars
          const to = Math.min(end, (row + 1) * textChars) - row * textChars
          parts.push(`<rect x="${textX + from * CHAR_PX}" y="${y + 3 + row * LINE_PX}" width="${(to - from) * CHAR_PX}" height="${LINE_PX - 4}" rx="2" fill="${tint}" fill-opacity="${palette.mark}"/>`)
        }
      }
      const text = [`<text x="${x + (GUTTER_CHARS - 0.5) * CHAR_PX}" y="${y + BASELINE_PX}" fill="${numberColor}" text-anchor="end">${number}</text>`]
      rows.forEach((runs, i) => {
        const spans = runs.map((run) => `<tspan fill="${run.color}"${run.italic ? ' font-style="italic"' : ''}>${escape(run.text)}</tspan>`).join('')
        text.push(`<text x="${textX}" y="${y + BASELINE_PX + i * LINE_PX}" xml:space="preserve">${spans}</text>`)
      })
      parts.push(dimmed ? `<g opacity="0.4">${text.join('')}</g>` : text.join(''))
      return parts
    },
  }
}

// A card's header as coloured runs: the path's folders muted and its file name in the text colour,
// then the note muted, with its `backticked` parts highlighted as code in the block's language.
function headerRuns(block) {
  const runs = []
  if (block.path) {
    const path = block.path.replace(homedir(), '~')
    const at = path.search(/[^/\s]+\.\w+(:\d+)?(\s|$)/)
    const split = at < 0 ? path.length : at
    runs.push({ text: path.slice(0, split), color: palette.muted })
    runs.push({ text: path.slice(split), color: palette.fg })
  }
  if (block.note) {
    if (runs.length) runs.push({ text: '  ·  ', color: palette.muted })
    runs.push(...proseRuns(block.note, block))
  }
  return runs.filter((run) => run.text)
}

// Prose muted, with its `backticked` parts highlighted as code in the block's language.
function proseRuns(text, block) {
  const language = languageOf(block)
  const code = (piece) => (language ? highlight(piece, language)[0] ?? [] : [{ text: piece, color: palette.fg }])
  return text.split('`').flatMap((piece, i) => (i % 2 ? code(piece) : [{ text: piece, color: palette.muted }])).filter((run) => run.text)
}

// One block as a card from `top`: a header (path · note), then the snippet, the two sides of a
// change, or the change as one column.
function card(block, top) {
  const parts = []
  const inner = width - 2 * PAD
  const chars = Math.floor(inner / CHAR_PX)
  let y = top
  const label = headerRuns(block)
  if (label.length) {
    const spans = label.map((run) => `<tspan fill="${run.color}">${escape(run.text)}</tspan>`).join('')
    parts.push(`<text x="${PAD + 12}" y="${y + 20}" xml:space="preserve">${spans}</text>`)
    y += HEADER_PX
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${width - PAD}" y2="${y}" stroke="${palette.rule}"/>`)
  }
  const bodyTop = y
  y += 6
  const language = languageOf(block)
  const source = (text) => {
    const trimmed = (text ?? '').replace(/\n+$/, '')
    return block.format === false ? dedent(trimmed) : format(trimmed, language)
  }
  const focus = focusOf(block.focus)
  const pushLine = (lines, cell, number) => {
    const line = codeLine(lines, cell, PAD, chars, number, focus)
    parts.push(...line.draw(y, line.height))
    y += line.height
  }
  if (block.before === undefined || block.after === undefined) {
    const lines = highlight(source(block.code), language)
    const start = block.startLine ?? 1
    lines.forEach((_, line) => pushLine(lines, { line, kind: 'same' }, line + start))
  } else {
    const beforeText = source(block.before)
    const afterText = source(block.after)
    const before = highlight(beforeText, language)
    const after = highlight(afterText, language)
    const rows = sideBySide(beforeText, afterText)
    // A removed line facing an added one that edits it gets its changed words marked on both sides.
    for (const [left, right] of rows) {
      if (left?.kind !== 'del' || right?.kind !== 'add') continue
      const marks = wordMarks(plain(before[left.line] ?? []), plain(after[right.line] ?? []))
      if (marks) [left.marks, right.marks] = [marks.before, marks.after]
    }
    const beforeStart = block.beforeLine ?? 1
    const afterStart = block.afterLine ?? 1
    if (layout === 'unified') {
      // A change reads as all its removed lines, then all its added ones: added lines wait until
      // the next unchanged line (or the end).
      let added = []
      const flushAdded = () => {
        for (const cell of added) pushLine(after, cell, cell.line + afterStart)
        added = []
      }
      for (const [left, right] of rows) {
        if (left?.kind === 'same') flushAdded()
        // An unchanged line is numbered as it is now, as git does.
        if (left?.kind === 'same') pushLine(after, right, right.line + afterStart)
        else if (left) pushLine(before, left, left.line + beforeStart)
        if (right?.kind === 'add') added.push(right)
      }
      flushAdded()
    } else {
      const half = Math.floor((chars - 1) / 2)
      const rightX = PAD + (half + 1) * CHAR_PX
      parts.push(`<text x="${PAD + 12}" y="${y + 12}" fill="${palette.delText}">before</text>`)
      parts.push(`<text x="${rightX + 12}" y="${y + 12}" fill="${palette.addText}">after</text>`)
      y += 22
      for (const [left, right] of rows) {
        const sides = [left && codeLine(before, left, PAD, half, left.line + beforeStart, focus), right && codeLine(after, right, rightX, half, right.line + afterStart, focus)]
        const height = Math.max(...sides.map((side) => side?.height ?? 0))
        for (const side of sides) if (side) parts.push(...side.draw(y, height))
        y += height
      }
      parts.push(`<line x1="${rightX - CHAR_PX / 2}" y1="${bodyTop}" x2="${rightX - CHAR_PX / 2}" y2="${y + 6}" stroke="${palette.rule}"/>`)
    }
  }
  if (block.caption) {
    // A caption under the code, set off by a rule, for a note that would crowd the header.
    y += 6
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${width - PAD}" y2="${y}" stroke="${palette.rule}"/>`)
    const rows = wrapWords(proseRuns(block.caption, block), Math.min(CAPTION_CHARS, chars - 3))
    rows.forEach((runs, i) => {
      const spans = runs.map((run) => `<tspan fill="${run.color}">${escape(run.text)}</tspan>`).join('')
      parts.push(`<text x="${PAD + 12}" y="${y + 20 + i * LINE_PX}" xml:space="preserve">${spans}</text>`)
    })
    y += 10 + rows.length * LINE_PX
  }
  y += 6
  parts.unshift(`<rect x="${PAD - 0.5}" y="${top + 0.5}" width="${inner + 1}" height="${y - top}" rx="8" fill="${surface}" stroke="${palette.rule}"/>`)
  return { parts, bottom: y }
}

// The terminal's font from the user's font folder, whose files are named after it without spaces.
function fontFiles() {
  const dir = join(homedir(), 'Library/Fonts')
  const stem = (font ?? '').replace(/\s+/g, '').toLowerCase()
  if (!stem) return []
  try {
    return readdirSync(dir).filter((name) => name.toLowerCase().startsWith(stem) && /\.(ttf|otf)$/i.test(name)).map((name) => join(dir, name))
  } catch {
    return []
  }
}
const files = fontFiles()
const family = escape(font ?? 'Menlo')
// The terminal takes images up to 4096 px a side: drawn at 2x, or smaller for a very tall card.
// The size reported stays the 2x one, which is what the transcript sizes the image by.
const MAX_SIDE_PX = 4096
const images = blocks.map((block, i) => {
  const drawn = card(block, 1)
  const height = Math.ceil(drawn.bottom + 1)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="${family}" font-size="${FONT_PX}">${drawn.parts.join('')}</svg>`
  if (format_ === 'svg') {
    const path = out.replace(/\.svg$/, `-${i}.svg`)
    writeFileSync(path, svg)
    return { svg: path, width: width * 2, height: height * 2 }
  }
  const zoom = Math.min(2, MAX_SIDE_PX / width, MAX_SIDE_PX / height)
  const png = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: zoom },
    font: { fontFiles: files, loadSystemFonts: files.length === 0, defaultFontFamily: font ?? 'Menlo', monospaceFamily: font ?? 'Menlo' },
  }).render().asPng()
  const path = out.replace(/\.png$/, `-${i}.png`)
  writeFileSync(path, png)
  return { png: path, width: width * 2, height: height * 2 }
})
process.stdout.write(JSON.stringify({ images }))
