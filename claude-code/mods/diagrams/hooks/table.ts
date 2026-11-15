import { cells, parseRuns, plain, width, type Run } from './runs'

// Lays out show_table: a bold header, one rule under it, columns two cells apart. Columns that
// don't fit the room shrink widest first, and their cells wrap inside the column.

export type Column = string | { title: string; align?: 'left' | 'right' }
export type Align = 'left' | 'right'
export type Table = { widths: number[]; align: Align[]; header: Run[][]; rows: Run[][][] }

export const GAP = 2
// A column is never squeezed below this, even when that leaves the table wider than the room.
const NARROWEST = 4

export function layoutTable(columns: Column[], rows: string[][], room: number): Table {
  const header = columns.map(c => parseRuns(typeof c === 'string' ? c : c.title).map(r => ({ ...r, bold: true })))
  const align = columns.map(c => (typeof c === 'string' ? 'left' : (c.align ?? 'left')))
  const body = rows.map(row => columns.map((_, k) => parseRuns(row[k] ?? '')))
  const all = [header, ...body]

  const widths = columns.map((_, k) => Math.max(1, ...all.map(row => width(row[k] ?? []))))
  // Shrinking stops at a column's longest word first, so words break only when nothing else fits.
  const longestWord = columns.map((_, k) =>
    Math.max(NARROWEST, ...all.flatMap(row => plain(row[k] ?? []).split(/\s+/).map(cells))),
  )
  const available = room - GAP * (columns.length - 1)
  for (const floor of [longestWord, columns.map(() => NARROWEST)]) {
    while (widths.reduce((a, b) => a + b, 0) > available) {
      let widest = -1
      widths.forEach((w, k) => {
        if (w > (floor[k] ?? NARROWEST) && (widest < 0 || w > (widths[widest] ?? 0))) widest = k
      })
      if (widest < 0) break
      widths[widest] = (widths[widest] ?? 1) - 1
    }
  }
  return { widths, align, header, rows: body }
}

/** One cell's text as lines of at most `w` cells, breaking at spaces and inside overlong words. */
export function wrap(text: string, w: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/(\s+)/)) {
    if (word === '') continue
    if (cells(line + word) <= w) {
      line += word
      continue
    }
    if (line.trim() !== '') lines.push(line.trimEnd())
    line = /^\s+$/.test(word) ? '' : word
    while (cells(line) > w) {
      let cut = ''
      for (const ch of line) {
        if (cells(cut + ch) > w) break
        cut += ch
      }
      lines.push(cut)
      line = line.slice(cut.length)
    }
  }
  if (line.trim() !== '' || lines.length === 0) lines.push(line.trimEnd())
  return lines
}

/** The table as plain text, for the tool result the model reads. */
export function plainTable(table: Table): string {
  const pad = (text: string, k: number) => {
    const space = ' '.repeat(Math.max(0, (table.widths[k] ?? 0) - cells(text)))
    return table.align[k] === 'right' ? space + text : text + space
  }
  const lines = (row: Run[][]) => {
    const wrapped = row.map((runs, k) => wrap(plain(runs), table.widths[k] ?? 1))
    const height = Math.max(...wrapped.map(w => w.length))
    return Array.from({ length: height }, (_, i) =>
      wrapped.map((w, k) => pad(w[i] ?? '', k)).join(' '.repeat(GAP)).trimEnd(),
    )
  }
  const rule = table.widths.map(w => '─'.repeat(w)).join(' '.repeat(GAP))
  return [...lines(table.header), rule, ...table.rows.flatMap(lines)].join('\n')
}
