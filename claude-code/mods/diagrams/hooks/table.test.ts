import { describe, expect, test } from 'claude-code/testing'
import { cells } from './runs'
import { layoutTable, plainTable, wrap } from './table'

describe('show_table layout', () => {
  test('keeps natural widths when the table fits', async () => {
    const table = layoutTable(['Name', { title: 'Count', align: 'right' }], [['apples', '3'], ['pears', '12']], 80)
    expect(table.widths).toEqual([6, 5])
    expect(plainTable(table)).toBe(['Name    Count', '──────  ─────', 'apples      3', 'pears      12'].join('\n'))
  })

  test('shrinks the widest column first, and wraps its cells inside it', async () => {
    const table = layoutTable(
      ['Scenario', 'Result'],
      [['a step that throws', 'the board stays open on its old version, and the error is reported']],
      48,
    )
    expect(table.widths[0]).toBe(18)
    expect(table.widths[1]).toBe(48 - 2 - 18)
    const lines = plainTable(table).split('\n')
    expect(lines.length).toBeGreaterThan(3)
    for (const line of lines) expect(cells(line)).toBeLessThanOrEqual(48)
  })

  test('reads colour tags as runs and leaves them out of the width', async () => {
    const table = layoutTable(['Check'], [['{green}ok{/} done']], 80)
    expect(table.widths).toEqual([7])
    expect(table.rows[0]?.[0]).toEqual([{ text: 'ok', color: 'success' }, { text: ' done' }])
  })

  test('counts wide characters as two cells', async () => {
    expect(cells('漢字')).toBe(4)
    expect(cells('ok ✅')).toBe(5)
  })

  test('breaks a word longer than its column', async () => {
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrap('one two three', 7)).toEqual(['one two', 'three'])
  })
})
