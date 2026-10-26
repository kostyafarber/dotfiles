// Fill patterns style.css refers to as url(#…). Loaded by preview.html and by mermaid.mjs.
//   hatch-N, dots-N: in --pele-series-N. hatch is after big-numbers' HatchDefs, finer (a 0.75px
//     diagonal every 4px); dots are Ben-Day, 2px dots 6px apart (smaller ones blur). Nothing behind.
//   engrave-N: a different engraving per series, in --pele-series-N (see below).
{
  const series = [1, 2, 3, 4, 5, 6, 7, 8]
  const hatch = (i) => `
    <pattern id="hatch-${i}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--pele-series-${i})" stroke-width="0.75" />
    </pattern>`
  const dots = (i) => `
    <pattern id="dots-${i}" patternUnits="userSpaceOnUse" width="6" height="6">
      <circle cx="1.5" cy="1.5" r="1" style="fill:var(--pele-series-${i})" />
      <circle cx="4.5" cy="4.5" r="1" style="fill:var(--pele-series-${i})" />
    </pattern>`

  // Engravings: a different fill per slice, after 1910s printed charts (stipple, diagonals both
  // ways, horizontals, dense verticals, cross-hatch), engrave-N drawn in --pele-series-N.
  const kinds = ['stipple', 'diag', 'horiz', 'vert', 'diag-back', 'cross', 'diag-wide', 'dots']
  // Stipple: scattered dots, from a fixed seed so every render matches.
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const scatter = Array.from({ length: 70 }, () => [random() * 30, random() * 30, 0.45 + random() * 0.35])
  const engrave = (i) => {
    const colour = `var(--pele-series-${i})`
    const line = (len, weight, x2 = 0, y2 = len) =>
      `<line x1="0" y1="0" x2="${x2}" y2="${y2}" style="stroke:${colour}" stroke-width="${weight}" />`
    const pattern = (size, angle, body) =>
      `<pattern id="engrave-${i}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(${angle})">${body}</pattern>`
    switch (kinds[(i - 1) % kinds.length]) {
      case 'stipple':
        return pattern(30, 0, scatter.map(([x, y, r]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" style="fill:${colour}" />`).join(''))
      case 'diag': return pattern(5, 45, line(5, 1))
      case 'horiz': return pattern(5, 90, line(5, 1))
      case 'vert': return pattern(2.5, 0, line(2.5, 0.8))
      case 'diag-back': return pattern(4, -45, line(4, 0.9))
      case 'cross': return pattern(6, 45, line(6, 0.8) + line(6, 0.8, 6, 0))
      case 'diag-wide': return pattern(9, 45, line(9, 1.5))
      case 'dots':
        return pattern(6, 0, `<circle cx="1.5" cy="1.5" r="1" style="fill:${colour}" /><circle cx="4.5" cy="4.5" r="1" style="fill:${colour}" />`)
    }
  }

  document.body.insertAdjacentHTML(
    'afterbegin',
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${series.map((i) => hatch(i) + dots(i) + engrave(i)).join('')}</defs></svg>`,
  )
}
