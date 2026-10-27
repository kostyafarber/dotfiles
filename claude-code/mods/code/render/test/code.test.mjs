// Each case in cases/ is show_code's renderer input; its SVG must match expected/<case>-<n>.svg.
// Run with `node --test`; UPDATE=1 rewrites the expected files after a deliberate change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = join(here, '..', 'code.mjs')
const theme = JSON.stringify({ mode: 'dark', font: 'Berkeley Mono', bg: '#1e1e2e' })

for (const name of readdirSync(join(here, 'cases')).filter((file) => file.endsWith('.json'))) {
  test(name.replace(/\.json$/, ''), () => {
    const out = join(mkdtempSync(join(tmpdir(), 'show-code-')), 'card.svg')
    const ran = spawnSync(process.execPath, [renderer, out, 'svg'], {
      input: readFileSync(join(here, 'cases', name)),
      env: { ...process.env, CTREE_THEME: theme },
      encoding: 'utf8',
    })
    assert.equal(ran.status, 0, ran.stderr)
    const { images } = JSON.parse(ran.stdout)
    images.forEach((image, i) => {
      const expected = join(here, 'expected', `${name.replace(/\.json$/, '')}-${i}.svg`)
      const svg = readFileSync(image.svg, 'utf8')
      if (process.env.UPDATE || !existsSync(expected)) writeFileSync(expected, svg)
      else assert.equal(svg, readFileSync(expected, 'utf8'), `${expected} differs; UPDATE=1 to accept`)
    })
  })
}
