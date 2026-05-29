// Shared Recharts theming. Colors point at CSS variables so charts follow the
// active theme (SVG stroke/fill + inline tooltip styles all accept var()).
export const CHART = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  amber: 'var(--amber)',
  teal: 'var(--teal)',
  cream: 'var(--ink)',
  red: 'var(--chart-red)',
  blue: 'var(--chart-blue)',
  green: 'var(--teal)',
  cursor: 'var(--chart-cursor)',
}

export const axisProps = {
  stroke: CHART.axis,
  fontSize: 10,
  fontFamily: "'Bricolage Grotesque', sans-serif",
  tickLine: false,
}

export const tooltipStyle = {
  background: 'var(--bg-soft)',
  border: '1px solid var(--line-strong)',
  borderRadius: 2,
  color: 'var(--ink)',
  fontFamily: "'Bricolage Grotesque', sans-serif",
  fontSize: 12,
}

export const tooltipLabelStyle = { color: 'var(--muted)', fontSize: 10, letterSpacing: '0.1em' }
