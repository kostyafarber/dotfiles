// Render cards JSON (from grid.py's save) to transparent 2x PNGs, in order, into a deck folder.
//   node render.mjs cards.json [deck-dir]
// The deck folder defaults to ~/.cache/diagram-cards/deck, the one the Rex pane watches.
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const skill = resolve(here, '..')
if (!existsSync(join(skill, 'node_modules', 'playwright-core'))) {
  console.error(`playwright-core missing: run  npm install --prefix ${skill}`)
  process.exit(1)
}
const { chromium } = await import(join(skill, 'node_modules', 'playwright-core', 'index.mjs'))

const [src, out = join(homedir(), '.cache', 'diagram-cards', 'deck')] = process.argv.slice(2)
const cards = JSON.parse(readFileSync(src, 'utf8'))
const font = join(skill, 'assets', 'PaperMono.ttf')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ deviceScaleFactor: 2 })
let i = 0
for (const [name, card] of Object.entries(cards)) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: 'Paper Mono'; src: url('file://${font}'); font-weight: 100 800; }
    html, body { background: transparent; }
    body { margin: 0; padding: 2px 6px 6px 2px; display: inline-block; }
  </style>${card.html}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const file = join(out, `${String(++i).padStart(2, '0')}-${name}.png`)
  await (await page.$('body')).screenshot({ path: file, omitBackground: true })
  console.log(file)
}
await browser.close()
