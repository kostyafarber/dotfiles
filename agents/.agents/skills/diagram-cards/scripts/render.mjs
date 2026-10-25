// Render cards JSON (from grid.py's save) to transparent 2x PNGs, in order, into a deck folder.
//   node render.mjs cards.json [deck-dir]
// The deck folder defaults to ~/.cache/diagram-cards/deck, the one the Rex pane watches.
import { readFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs'
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
// Transparent space around the card; DIAGRAM_CARDS_PAD (px) leaves room for its
// shadow on pages with their own background, such as a pull request.
const pad = Number(process.env.DIAGRAM_CARDS_PAD)
const padding = pad > 0 ? `${pad}px ${pad + 3}px ${pad + 3}px ${pad}px` : '2px 6px 6px 2px'
// DIAGRAM_CARDS_MATTE paints that space, so the shadow shows on a dark page too.
const matte = process.env.DIAGRAM_CARDS_MATTE ?? 'transparent'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// Chrome may be renamed in /Applications; DIAGRAM_CARDS_CHROME overrides the lookup.
function chromePath() {
  if (process.env.DIAGRAM_CARDS_CHROME) return process.env.DIAGRAM_CARDS_CHROME
  const app = readdirSync('/Applications', { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith('Chrome.app'))
  return app ? join('/Applications', app.name, 'Contents', 'MacOS', 'Google Chrome') : undefined
}

const executablePath = chromePath()
const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' })
const page = await browser.newPage({ deviceScaleFactor: 2 })
let i = 0
for (const [name, card] of Object.entries(cards)) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: 'Paper Mono'; src: url('file://${font}'); font-weight: 100 800; }
    html { background: transparent; }
    body { background: ${matte}; }
    body { margin: 0; padding: ${padding}; display: inline-block; }
  </style>${card.html}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const file = join(out, `${String(++i).padStart(2, '0')}-${name}.png`)
  await (await page.$('body')).screenshot({ path: file, omitBackground: matte === 'transparent' })
  console.log(file)
}
await browser.close()
