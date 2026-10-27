// show_diagram's image without a browser. pele lays the diagram out in Node, decorate.js and
// patterns.js run unchanged in linkedom's DOM, style.css is applied by matching its rules and
// writing the resolved values onto the SVG (resvg reads no CSS variables and few selectors), and
// resvg draws the card in Paper Mono. mermaid.mjs falls back to Chrome when this throws.
//
//   import { drawDiagram } from './diagram.mjs'
//   await drawDiagram(source, out.png, { mode, bg, fg }) -> { png, width, height }
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iconsFor } from './icons.mjs'
import { modules } from './browser.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FONT_FILE = join(homedir(), 'Library/Fonts/PaperMono.ttf')
const FONT_STACK = "'Paper Mono', ui-monospace, monospace"
const FONT_PX = 14
const MAX_SIDE_PX = 4096
const spacing = { nodeSpacing: 70, rankSpacing: 80 }

export async function drawDiagram(source, out, { mode, bg, fg }) {
  const pele = await import(join(modules, 'pele/dist/pele.js'))
  const { parseHTML } = await import(join(modules, 'linkedom/esm/index.js'))
  const { Resvg } = await import(join(modules, '@resvg/resvg-js/index.js'))
  const postcss = (await import(join(modules, 'postcss/lib/postcss.mjs'))).default
  const nested = (await import(join(modules, 'postcss-nested/index.js'))).default
  const fonts = { fontFiles: [FONT_FILE], loadSystemFonts: false, defaultFontFamily: 'Paper Mono', monospaceFamily: 'Paper Mono' }

  // Paper Mono's advance per em, from the width two runs of M differ by: pele lays text out with
  // it, so boxes fit the font resvg draws.
  const inkWidth = (count) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="150" font-size="100">${'M'.repeat(count)}</text></svg>`, { font: fonts }).getBBox().width
  const advance = (inkWidth(20) - inkWidth(10)) / 1000
  const measurer = { width: (text, size) => [...text].length * size * advance }

  const icons = iconsFor(source)
  const options = { fontSize: FONT_PX, measurer, fontFamily: FONT_STACK, fontFamilyMono: FONT_STACK, icons: (name) => icons[name], config: { flowchart: spacing, state: spacing, class: spacing, er: spacing, architecture: { padding: 56, iconSize: 64 } } }
  let rendered = pele.render(source, options)
  // Wider than ~125 terminal columns: a left-to-right flowchart is drawn top to bottom instead.
  const across = /^(\s*(?:flowchart|graph))\s+(LR|RL)\b/m
  if (rendered.width > 1000 && across.test(source)) rendered = pele.render(source.replace(across, '$1 TB'), options)

  const title = source.match(/^\s*(?:pie\s+(?:showData\s+)?)?title:?\s+["']?(.+?)["']?\s*$/m)?.[1]
    ?? `${source.replace(/^---[\s\S]*?---\s*/, '').trim().split(/\s/)[0]}.mmd`
  const { window, document } = parseHTML(`<!doctype html><html data-mode="${mode}" data-look="card"><body><div id="shot"><div class="ctree-card"><header></header><div id="d">${rendered.svg}</div></div></div></body></html>`)
  const svg = document.querySelector('#d svg')
  addGeometry(svg, measurer)

  window.ctreeKey = source.match(/^\s*%%\s*key:\s*(.+)$/m)?.[1].split(',').map((name) => name.trim()).filter(Boolean) ?? []
  for (const script of ['patterns.js', 'decorate.js']) new Function('window', 'document', readFileSync(join(here, script), 'utf8'))(window, document)
  window.ctreeDecorate(svg)

  const styles = new Styles(document, postcss([nested]), bg, fg)
  styles.applyTo(svg)
  const patterns = [...document.querySelectorAll('pattern')]
  for (const pattern of patterns) styles.applyTo(pattern)
  const defs = `<defs>${patterns.map((pattern) => pattern.outerHTML).join('')}</defs>`

  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  const key = keyRow(document, styles, width)
  const card = frame({ title, width, height: height + key.height, ink: styles.resolve('var(--pele-fg)'), ground: styles.resolve('var(--pele-bg)') })
  svg.setAttribute('x', card.contentX)
  svg.setAttribute('y', card.contentY)
  const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width}" height="${card.height}" font-family="${FONT_STACK}">${defs}${card.back}${svg.outerHTML}${key.draw(card.contentX, card.contentY + height)}</svg>`

  const zoom = Math.min(2, MAX_SIDE_PX / card.width, MAX_SIDE_PX / card.height)
  writeFileSync(out, new Resvg(page, { fitTo: { mode: 'zoom', value: zoom }, font: fonts }).render().asPng())
  return { png: out, width: Math.round(card.width * 2), height: Math.round(card.height * 2) }
}

// The geometry calls decorate.js makes, answered from the shapes' own attributes: a rect's box, a
// text's box from its anchor and measured width, a path's box and end points from its numbers.
function addGeometry(svg, measurer) {
  const proto = Object.getPrototypeOf(svg.querySelector('*') ?? svg)
  const number = (el, name) => Number(el.getAttribute(name) ?? 0)
  const fontSize = (el) => {
    for (let at = el; at && at.getAttribute; at = at.parentElement) {
      const size = Number(at.getAttribute('font-size'))
      if (size) return size
    }
    return FONT_PX
  }
  const points = (el) => {
    const values = (el.getAttribute('d') ?? '').match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? []
    const pairs = []
    for (let i = 0; i + 1 < values.length; i += 2) pairs.push({ x: values[i], y: values[i + 1] })
    return pairs
  }
  const box = (el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'rect') return { x: number(el, 'x'), y: number(el, 'y'), width: number(el, 'width'), height: number(el, 'height') }
    if (tag === 'text' || tag === 'tspan') {
      const size = fontSize(el)
      const width = measurer.width(el.textContent ?? '', size)
      const anchor = el.getAttribute('text-anchor')
      const shift = anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0
      return { x: number(el, 'x') - shift, y: number(el, 'y') - size * 0.8, width, height: size }
    }
    const pairs = tag === 'path' ? points(el) : []
    const children = [...el.children].map(box).filter((child) => child.width || child.height)
    const corners = [...pairs, ...children.flatMap((child) => [{ x: child.x, y: child.y }, { x: child.x + child.width, y: child.y + child.height }])]
    if (!corners.length) return { x: 0, y: 0, width: 0, height: 0 }
    const xs = corners.map((point) => point.x)
    const ys = corners.map((point) => point.y)
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  }
  proto.getBBox = function () {
    return box(this)
  }
  // decorate.js reads a path's two ends only: length 1 stands for the whole path.
  proto.getTotalLength = () => 1
  proto.getPointAtLength = function (at) {
    const pairs = points(this)
    return at === 0 ? pairs[0] : pairs.at(-1)
  }
}

// style.css applied to the SVG: each rule's declarations written onto the elements it matches, in
// cascade order (presentation attribute, then CSS, then inline style, then !important), with
// var(), color-mix() and calc() resolved to plain values.
class Styles {
  constructor(document, processor, bg, fg) {
    const root = processor.process(readFileSync(join(here, 'style.css'), 'utf8'), { from: undefined }).root
    this.rootVars = new Map(bg ? [['--term-bg', bg], ['--term-fg', fg]] : [])
    this.rules = []
    root.walkRules((rule) => {
      const declarations = rule.nodes.filter((node) => node.type === 'decl')
      if (!declarations.length) return
      for (const selector of rule.selectors) {
        let matched
        try {
          matched = [...document.querySelectorAll(selector)]
        } catch {
          continue
        }
        if (matched.includes(document.documentElement)) {
          for (const decl of declarations) if (decl.prop.startsWith('--')) this.rootVars.set(decl.prop, decl.value)
        }
        if (matched.length) this.rules.push({ matched: new Set(matched), declarations })
      }
    })
  }

  // Every element of `tree` gets its resolved paint and geometry as attributes.
  applyTo(tree) {
    const elements = [tree, ...tree.querySelectorAll('*')]
    // Every inline style is read before any is cleared: children look variables up through them.
    this.inline = new Map(elements.map((el) => [el, inlineStyle(el)]))
    for (const el of elements) {
      const normal = new Map()
      const important = new Map()
      for (const rule of this.rules) {
        if (!rule.matched.has(el)) continue
        for (const decl of rule.declarations) if (!decl.prop.startsWith('--')) (decl.important ? important : normal).set(decl.prop, decl.value)
      }
      const inline = this.inline.get(el)
      const props = new Map(normal)
      for (const [prop, value] of inline) if (!prop.startsWith('--')) props.set(prop, value)
      for (const [prop, value] of important) props.set(prop, value)
      for (const name of el.getAttributeNames()) {
        const value = el.getAttribute(name)
        if (value.includes('var(') || value === 'currentColor') el.setAttribute(name, this.resolve(value, el))
      }
      if (props.get('display') === 'none') {
        el.remove()
        continue
      }
      for (const [prop, value] of props) {
        if (prop === 'display' || prop === 'max-width' || prop === 'height' && el === tree) continue
        if (prop === 'font') {
          el.setAttribute('font-size', value.match(/(\d+)px/)?.[1] ?? FONT_PX)
          continue
        }
        el.setAttribute(prop, this.resolve(value, el))
      }
      el.removeAttribute('style')
    }
  }

  // `value` with var() looked up from `el` upward, then the root, and color-mix() and calc() done.
  resolve(value, el = undefined) {
    let text = value.replace(/!important/, '').trim()
    if (text === 'currentColor') text = 'var(--_fg)'
    for (let guard = 0; text.includes('var(') && guard < 50; guard++) {
      text = text.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fallback) => this.#lookup(name, el) ?? fallback?.trim() ?? 'none')
    }
    for (let guard = 0; text.includes('color-mix(') && guard < 20; guard++) {
      text = text.replace(/color-mix\(in srgb,\s*([^,()]+(?:\([^()]*\))?)\s+(\d+(?:\.\d+)?)%\s*,\s*([^,()]+(?:\([^()]*\))?)\s*\)/g, (_, a, percent, b) => mixColors(a.trim(), b.trim(), Number(percent) / 100))
    }
    return text.replace(/calc\(([^()]+)\)/g, (_, sum) => `${sum.split('+').reduce((total, part) => total + parseFloat(part), 0)}px`)
  }

  #lookup(name, el) {
    for (let at = el; at && at.getAttribute; at = at.parentElement) {
      const value = (this.inline?.get(at) ?? inlineStyle(at)).get(name)
      if (value !== undefined) return value
    }
    return this.rootVars.get(name)
  }
}

function inlineStyle(el) {
  const styles = new Map()
  for (const part of (el.getAttribute?.('style') ?? '').split(';')) {
    const at = part.indexOf(':')
    if (at > 0) styles.set(part.slice(0, at).trim(), part.slice(at + 1).trim())
  }
  return styles
}

// `a` weighted by `share` and `b` by the rest, both #rgb/#rrggbb, rgb() or transparent.
function mixColors(a, b, share) {
  const [ca, cb] = [parseColor(a), parseColor(b)]
  if (!ca || !cb) return a
  const channel = (i) => Math.round(ca[i] * share + cb[i] * (1 - share))
  const alpha = ca[3] * share + cb[3] * (1 - share)
  const hex = [0, 1, 2].map((i) => channel(i).toString(16).padStart(2, '0')).join('')
  return alpha >= 1 ? `#${hex}` : `rgba(${channel(0)},${channel(1)},${channel(2)},${alpha.toFixed(3)})`
}

function parseColor(text) {
  if (text === 'transparent') return [0, 0, 0, 0]
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1)
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)$/)?.[1].split(',').map(Number)
  return rgb ? [rgb[0], rgb[1], rgb[2], rgb[3] ?? 1] : undefined
}

// The window frame style.css draws in HTML (.ctree-card): a title bar, an ink border and a hard
// 3px shadow, around the diagram's 20px by 24px padding.
function frame({ title, width, height, ink, ground }) {
  const header = 37
  const pad = { x: 24, y: 20 }
  const inner = { width: width + 2 * pad.x, height: header + height + 2 * pad.y }
  const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  const back = [
    `<rect x="5" y="5" width="${inner.width}" height="${inner.height}" fill="${ink}"/>`,
    `<rect x="2.5" y="2.5" width="${inner.width}" height="${inner.height}" fill="${ground}" stroke="${ink}"/>`,
    `<text x="16.5" y="25" font-size="14" fill="${ink}">${escape(title)}</text>`,
    `<text x="${inner.width - 11.5}" y="25" font-size="14" fill="${ink}" text-anchor="end">×</text>`,
    `<line x1="2.5" y1="${2.5 + header}" x2="${2.5 + inner.width}" y2="${2.5 + header}" stroke="${ink}"/>`,
  ].join('')
  return { back, width: inner.width + 8, height: inner.height + 8, contentX: 2.5 + pad.x, contentY: 2.5 + header + pad.y }
}

// The key line decorate.js adds under a chart (`%% key: a, b`), as SVG: a swatch and name per series.
function keyRow(document, styles, width) {
  const names = [...document.querySelectorAll('.ctree-key span')]
  if (!names.length) return { height: 0, draw: () => '' }
  const entries = names.map((span) => ({ name: span.textContent, colour: styles.resolve(inlineStyle(span.querySelector('i')).get('background') ?? 'var(--pele-fg)') }))
  const widthOf = (name) => 17 + name.length * 13 * 0.6
  const total = entries.reduce((sum, entry) => sum + widthOf(entry.name), 0) + 18 * (entries.length - 1)
  const ink = styles.resolve('var(--pele-fg)')
  return {
    height: 26,
    draw(x, y) {
      let at = x + (width - total) / 2
      return entries.map((entry) => {
        const swatch = `<rect x="${at}" y="${y + 9}" width="11" height="11" fill="${entry.colour}" stroke="${ink}"/><text x="${at + 17}" y="${y + 19}" font-size="13" fill="${ink}">${entry.name}</text>`
        at += widthOf(entry.name) + 18
        return swatch
      }).join('')
    },
  }
}
