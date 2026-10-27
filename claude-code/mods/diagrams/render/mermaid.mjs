// Mermaid on stdin -> JSON on stdout, for the diagrams mod's show_diagram.
//   node mermaid.mjs text           -> { runs: [[{ text, role }]] }   (beautiful-mermaid)
//   node mermaid.mjs image <out.png> -> { png, width, height }        (pele, laid out and shot in Chrome; look in style.css)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iconsFor } from './icons.mjs'
import { launchChrome, terminalTheme } from './browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const modules = join(here, 'node_modules')
const [mode, out] = process.argv.slice(2)
const source = readFileSync(0, 'utf8')

if (mode === 'text') {
  const bm = await import(join(modules, 'beautiful-mermaid/dist/index.js'))
  const html = bm.renderMermaidASCII(source, { colorMode: 'html' })
  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  // Node text keeps the theme's text colour; boxes, lines and arrows go subtle.
  const role = (color) => (color === '#27272a' ? 'text' : 'line')
  const lines = html.split('\n')
  while (lines.length && lines.at(-1).trim() === '') lines.pop()
  const runs = lines.map((line) => {
    const row = []
    let at = 0
    for (const m of line.matchAll(/<span style="color:(#[0-9a-f]+)">(.*?)<\/span>/g)) {
      if (m.index > at) row.push({ text: unescape(line.slice(at, m.index)), role: 'text' })
      row.push({ text: unescape(m[2]), role: role(m[1]) })
      at = m.index + m[0].length
    }
    if (at < line.length) row.push({ text: unescape(line.slice(at)), role: 'text' })
    return row
  })
  process.stdout.write(JSON.stringify({ runs }))
} else {
  const { mode, bg, fg } = terminalTheme()
  const browser = await launchChrome()
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1200 } })
  await page.emulateMedia({ colorScheme: mode })
  const term = bg ? `:root{--term-bg:${bg};--term-fg:${fg}}` : ''
  // The card look (a plain style in a window frame) unless CTREE_LOOK=rich. The frame's title
  // is the diagram's own title line, else its type as a file name.
  const look = process.env.CTREE_LOOK === 'rich' ? 'rich' : 'card'
  // `title X` (gantt, xychart, …; a pie's is on its first line) or front matter's `title: X`.
  const title = source.match(/^\s*(?:pie\s+(?:showData\s+)?)?title:?\s+["']?(.+?)["']?\s*$/m)?.[1]
    ?? `${source.replace(/^---[\s\S]*?---\s*/, '').trim().split(/\s/)[0]}.mmd`
  const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  const body = look === 'card'
    ? `<div id=shot style="display:inline-block;padding:2px 6px 6px 2px"><div class=ctree-card><header><span>${escape(title)}</span><span>×</span></header><div id=d></div></div></div>`
    : '<div id=shot style="display:inline-block"><div id=d></div></div>'
  await page.setContent(`<!doctype html><html data-mode=${mode} data-look=${look}><meta charset=utf-8><style>${readFileSync(join(here, 'style.css'), 'utf8')}${term}</style>${body}`)
  await page.addScriptTag({ path: join(here, 'patterns.js') })
  await page.addScriptTag({ path: join(here, 'decorate.js') })
  await page.addScriptTag({ content: `window.ctreeIcons = ${JSON.stringify(iconsFor(source))}` })
  // `%% key: a, b`: the names of a chart's series, for the key line decorate.js draws.
  const key = source.match(/^\s*%%\s*key:\s*(.+)$/m)?.[1].split(',').map((name) => name.trim()).filter(Boolean) ?? []
  await page.addScriptTag({ content: `window.ctreeKey = ${JSON.stringify(key)}` })
  await page.addScriptTag({ path: join(modules, 'pele/dist/pele.global.js') })
  // Drawn at its natural size (not fitted to the page), so its text keeps the size the chat expects.
  const draw = (text) => page.evaluate(async (text) => {
    await document.fonts.load("14px 'Paper Mono'")
    const box = document.getElementById('d')
    box.replaceChildren()
    const spacing = { nodeSpacing: 70, rankSpacing: 80 }
    window.pele.mount(box, text, {
      zoom: false,
      responsive: false,
      fontSize: 14,
      icons: (name) => window.ctreeIcons[name],
      config: { flowchart: spacing, state: spacing, class: spacing, er: spacing, architecture: { padding: 56, iconSize: 64 } },
      onError: (e) => { throw e },
      // mount draws again when it fits the diagram to its box; decorate every drawing.
      onRender: () => window.ctreeDecorate(document.querySelector('#d svg.pele')),
    })
    return box.getBoundingClientRect().width
  }, text)
  // Wider than ~125 terminal columns at the chat's size: a left-to-right flowchart is drawn top to
  // bottom instead, rather than shrunk until its text is unreadable.
  const across = /^(\s*(?:flowchart|graph))\s+(LR|RL)\b/m
  if ((await draw(source)) > 1000 && across.test(source)) await draw(source.replace(across, '$1 TB'))
  const el = await page.$('#shot')
  const box = await el.boundingBox()
  await el.screenshot({ path: out })
  await browser.close()
  process.stdout.write(JSON.stringify({ png: out, width: Math.round(box.width * 2), height: Math.round(box.height * 2) }))
}
