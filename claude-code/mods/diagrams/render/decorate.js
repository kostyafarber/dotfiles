// Shapes SVG can't get from CSS alone, added after Pele draws. Loaded by preview.html and by
// mermaid.mjs, which call ctreeDecorate(svg) on each diagram.
//   Subgraphs: a palette colour each (--tint, cycling from the accent) and their title on a solid
//     pill of that colour, like Figma section labels.
//   Edges: one between a subgraph and a node outside every subgraph (either way) takes that
//     subgraph's colour; edges inside a subgraph or between two stay ink.
//   Sequence focus (`rect rgb(94,143,224) … end` around the steps that matter): a soft accent band,
//     and the messages inside it drawn in the accent.
//   Charts with several series: bars coloured by series, not per bar; and a key line under the chart
//     from `%% key: a, b` in the source (window.ctreeKey), swatches in each series' colour.
//   Packet fields whose label starts with `*` are the set ones: the `*` goes, they take the accent,
//     and the unmarked fields dim.
//   Focus nodes (`classDef focus` + `class X focus`): a second outline 3px outside the first, like
//     box-drawing ╔═╗ focus box.
window.ctreeDecorate = (svg) => {
  const ns = 'http://www.w3.org/2000/svg'
  const order = [2, 3, 4, 5, 6, 8, 7, 1]

  svg.querySelectorAll('.pele-cluster').forEach((cluster, i) => {
    cluster.style.setProperty('--tint', `var(--pele-series-${order[i % order.length]})`)
    const label = cluster.querySelector(':scope > .pele-cluster-label')
    const frame = cluster.querySelector(':scope > rect')
    if (!label) return
    // Keep the pill inside the group, clear of its edges.
    if (frame) {
      const inset = { x: 10, y: 8 }
      const [text, outer] = [label.getBBox(), frame.getBBox()]
      const dx = Math.max(0, outer.x + inset.x - (text.x - 7))
      const dy = Math.max(0, outer.y + inset.y - (text.y - 3))
      label.setAttribute('x', Number(label.getAttribute('x')) + dx)
      label.setAttribute('y', Number(label.getAttribute('y')) + dy)
    }
    const box = label.getBBox()
    const pill = document.createElementNS(ns, 'rect')
    pill.setAttribute('class', 'ctree-pill')
    pill.setAttribute('x', box.x - 7)
    pill.setAttribute('y', box.y - 3)
    pill.setAttribute('width', box.width + 14)
    pill.setAttribute('height', box.height + 6)
    pill.setAttribute('rx', 4)
    label.before(pill)
  })

  const groups = [...svg.querySelectorAll('.pele-cluster')].map((cluster) => {
    const rect = cluster.querySelector(':scope > rect')
    return { tint: cluster.style.getPropertyValue('--tint'), box: rect && rect.getBBox() }
  }).filter((group) => group.box)
  // The innermost group holding a point (nested groups are smaller).
  const groupAt = (point) => groups
    .filter(({ box }) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height)
    .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0]
  svg.querySelectorAll('.pele-edge').forEach((edge) => {
    const line = edge.querySelector(':scope > path:not(.pele-marker)')
    if (!line || !line.getTotalLength) return
    const from = groupAt(line.getPointAtLength(0))
    const to = groupAt(line.getPointAtLength(line.getTotalLength()))
    if (Boolean(from) === Boolean(to)) return
    const group = from ?? to
    edge.classList.add('ctree-tinted')
    edge.style.setProperty('--tint', group.tint)
  })

  const bands = [...svg.querySelectorAll('.pele-sequence .pele-rect')].map((rect) => {
    rect.classList.add('ctree-focus-band')
    rect.style.removeProperty('fill')
    return rect.getBBox()
  })
  // Messages and their labels share the band's coordinates (both sit in the same translated group).
  const inBand = (y) => bands.some((band) => y >= band.y && y <= band.y + band.height)
  svg.querySelectorAll('.pele-sequence .pele-message').forEach((message) => {
    const line = message.querySelector('path:not(.pele-marker)')
    if (line && inBand(line.getBBox().y + line.getBBox().height / 2)) message.classList.add('ctree-focus')
  })
  svg.querySelectorAll('.pele-sequence .pele-edge-label').forEach((label) => {
    if (inBand(label.getBBox().y + label.getBBox().height / 2)) label.classList.add('ctree-focus')
  })

  const bars = [...svg.querySelectorAll('.pele-xychart .pele-bars')]
  if (bars.length > 1) {
    svg.classList.add('ctree-multi')
    bars.forEach((group, k) => group.classList.add(`ctree-s${order[k % order.length]}`))
  }
  svg.parentElement.querySelector(':scope > .ctree-key')?.remove()
  const key = window.ctreeKey ?? []
  if (key.length) {
    const lines = svg.querySelectorAll('.pele-xychart .pele-line').length
    const colour = (k) => (bars.length > 1 || (!lines && bars.length) ? order[k % order.length] : k + 1)
    const row = document.createElement('div')
    row.className = 'ctree-key'
    row.innerHTML = key.map((name, k) => `<span><i style="background:var(--pele-series-${colour(k)})"></i>${name.replace(/[&<>]/g, '')}</span>`).join('')
    svg.after(row)
  }

  const fields = [...svg.querySelectorAll('.pele-packet .pele-node')]
  const marked = fields.filter((field) => field.querySelector('text')?.textContent.trim().startsWith('*'))
  if (marked.length) {
    for (const field of fields) {
      const text = field.querySelector('text')
      if (marked.includes(field)) {
        field.classList.add('ctree-set')
        // The label may be split into tspans; strip the marker from the first run that has it.
        const run = [...field.querySelectorAll('tspan')].find((t) => t.textContent.includes('*')) ?? text
        run.textContent = run.textContent.replace(/^\s*\*\s*/, '')
      } else field.classList.add('ctree-unset')
    }
  }

  svg.querySelectorAll('.pele-node.focus > rect:first-child').forEach((rect) => {
    const gap = 3
    const outer = rect.cloneNode(false)
    outer.removeAttribute('style')
    outer.setAttribute('class', 'ctree-focus-ring')
    for (const [key, grow] of [['x', -gap], ['y', -gap], ['width', 2 * gap], ['height', 2 * gap]]) {
      outer.setAttribute(key, Number(rect.getAttribute(key)) + grow)
    }
    rect.before(outer)
  })
}
