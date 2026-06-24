import { formatDuration } from './formatters'

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member', client: 'Client' }

// European format: comma as the decimal separator (e.g. "1,5" not "1.5").
function euDecimal(n, decimals = 2) {
  return n.toFixed(decimals).replace('.', ',')
}

function formatUserLabel(user) {
  if (!user) return ''
  const name = user.full_name || user.email || ''
  if (!name) return ''
  const role = user.role
  if (!role) return name
  return `${name} (${ROLE_LABELS[role] ?? role})`
}

// Backwards-compatible export. Old callers pass an entries array; new
// callers pass { mode, ... } so the export mirrors the view they're on.
//
// Summary mode shape:
//   { mode: 'summary', groups, primaryLabel, secondaryLabel, tertiaryLabel,
//     totalSecs }
// groups is the nested array from nestGroup (up to three levels).
//
// Detailed mode shape:
//   { mode: 'detailed', entries }
export async function exportToExcel(payload, filename = 'TimeReport') {
  if (Array.isArray(payload)) return exportDetailed({ entries: payload }, filename)
  if (payload?.mode === 'summary') return exportSummary(payload, filename)
  return exportDetailed(payload ?? {}, filename)
}

const HEADER_FILL = '6B3B92'      // orchid-700
const TOTAL_FILL  = 'C7A6E0'      // soft lavender
const L1_FILL     = 'F1E9F7'      // very light lavender for primary rows
const BORDER_RGB  = 'CBD5E1'      // slate-300

function thinSide(rgb = BORDER_RGB) { return { style: 'thin', color: { rgb } } }
function borderAll(rgb)             { return { top: thinSide(rgb), bottom: thinSide(rgb), left: thinSide(rgb), right: thinSide(rgb) } }

const STYLES = {
  header: {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: HEADER_FILL } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: borderAll('FFFFFF'),
  },
  body: { border: borderAll() },
  bodyBold: { font: { bold: true }, border: borderAll() },
  l1: {
    font: { bold: true },
    fill: { fgColor: { rgb: L1_FILL } },
    border: borderAll(),
  },
  l2: { font: { bold: true }, border: borderAll() },
  total: {
    font: { bold: true },
    fill: { fgColor: { rgb: TOTAL_FILL } },
    border: borderAll(),
  },
}

async function exportSummary({ groups = [], primaryLabel = 'Group', secondaryLabel = null, tertiaryLabel = null, totalSecs = 0 }, filename) {
  const XLSX = await import('xlsx-js-style')
  const hasSecondary = !!secondaryLabel && groups.some(g => g.children && g.children.length)
  const hasTertiary  = hasSecondary && !!tertiaryLabel
    && groups.some(g => g.children?.some(c => c.children && c.children.length))
  const pct = secs => totalSecs ? `${euDecimal((secs / totalSecs) * 100, 1)}%` : '0,0%'

  const labelCols = [primaryLabel,
    ...(hasSecondary ? [secondaryLabel] : []),
    ...(hasTertiary  ? [tertiaryLabel]  : []),
  ]

  // [{ cells: [{ v, depth? }], level }]
  const rows = []
  function pushRow(level, labels, seconds) {
    const cells = labelCols.map((_, i) => labels[i] ?? '')
    cells.push(formatDuration(seconds))
    cells.push(euDecimal(seconds / 3600, 2))
    cells.push(pct(seconds))
    rows.push({ cells, level })
  }
  for (const g of groups) {
    pushRow(1, [g.label], g.seconds)
    if (hasSecondary && g.children) {
      for (const c of g.children) {
        pushRow(2, ['', c.label], c.seconds)
        if (hasTertiary && c.children) {
          for (const t of c.children) {
            pushRow(3, ['', '', t.label], t.seconds)
          }
        }
      }
    }
  }
  if (rows.length) pushRow(0, ['TOTAL', ...labelCols.slice(1).map(() => '')], totalSecs)

  const headerRow = [...labelCols, 'Duration', 'Duration (hours)', '% of total']
  const aoa = [headerRow, ...rows.map(r => r.cells)]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  styleSheet(ws, XLSX, headerRow.length, (r) => {
    if (r === 0) return STYLES.header
    const row = rows[r - 1]
    if (!row) return STYLES.body
    if (row.level === 0) return STYLES.total
    if (row.level === 1) return STYLES.l1
    if (row.level === 2) return STYLES.l2
    return STYLES.body
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  autoFitCols(ws, aoa)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

async function exportDetailed({ entries = [] }, filename) {
  const XLSX = await import('xlsx-js-style')
  const headerRow = [
    'Date', 'Start Time', 'End Time',
    'Duration', 'Duration (hours)',
    'Description', 'Project', 'Client', 'User',
  ]
  const rows = entries.map(entry => [
    entry.start_time.slice(0, 10),
    entry.start_time.slice(11, 19),
    entry.end_time?.slice(11, 19) ?? '',
    formatDuration(entry.duration ?? 0),
    euDecimal((entry.duration ?? 0) / 3600, 2),
    entry.description || '',
    entry.project?.name ?? '',
    entry.project?.client?.name ?? '',
    formatUserLabel(entry.user),
  ])
  const aoa = [headerRow, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const userColIdx = headerRow.indexOf('User')

  styleSheet(ws, XLSX, headerRow.length, (r) => r === 0 ? STYLES.header : STYLES.body,
    (r, c) => {
      // Bold the user-name column in body rows so the agent is easy to scan.
      if (r > 0 && c === userColIdx) return STYLES.bodyBold
      return null
    },
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Time Report')
  autoFitCols(ws, aoa)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function styleSheet(ws, XLSX, ncols, getRowStyle, getCellStyle) {
  const ref = ws['!ref']
  if (!ref) return
  const range = XLSX.utils.decode_range(ref)
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowStyle = getRowStyle(r)
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      const cellOverride = getCellStyle ? getCellStyle(r, c) : null
      ws[addr].s = cellOverride ?? rowStyle
    }
  }
  // Freeze the header row.
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: range.e.r, c: ncols - 1 },
  })}
}

function autoFitCols(ws, aoa) {
  if (!aoa.length) return
  const ncols = aoa[0].length
  const widths = new Array(ncols).fill(0)
  for (const row of aoa) {
    for (let c = 0; c < ncols; c++) {
      const v = row[c] ?? ''
      widths[c] = Math.max(widths[c], String(v).length)
    }
  }
  ws['!cols'] = widths.map(w => ({ wch: w + 3 }))
}
