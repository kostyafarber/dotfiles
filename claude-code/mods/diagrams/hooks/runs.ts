// Coloured runs: `{color}text{/}` in show_tree and show_table input, drawn with the theme's roles.

export const COLORS: Record<string, string> = {
  green: 'success',
  blue: 'suggestion',
  yellow: 'warning',
  red: 'error',
  magenta: 'merged',
  cyan: 'ide',
  dim: 'subtle',
}

export type Run = { text: string; color?: string; bold?: boolean }

const TAG = /\{(\w+)\}(.*?)\{\/\}/g

export function parseRuns(text: string): Run[] {
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

// Cells a character takes: two for wide East Asian characters and emoji, none for combining marks
// and joiners, one otherwise. Close enough to the terminal's own count for laying out columns.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]|\p{Extended_Pictographic}/u
const ZERO = /[\p{M}​-‍︎️]/u

export function cells(text: string): number {
  let n = 0
  for (const ch of text) n += ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1
  return n
}

export const width = (runs: Run[]) => runs.reduce((n, r) => n + cells(r.text), 0)
export const plain = (runs: Run[]) => runs.map(r => r.text).join('')
