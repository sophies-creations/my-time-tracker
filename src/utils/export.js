import { formatDuration } from './formatters'

// Backwards-compatible export. Old callers pass an entries array; new
// callers pass { mode, ... } so the export mirrors the view they're on.
//
// Summary mode shape:
//   { mode: 'summary', groups: [{ label, seconds, children?: [{label, seconds}] }],
//     primaryLabel, secondaryLabel, totalSecs }
//
// Detailed mode shape:
//   { mode: 'detailed', entries }
export async function exportToExcel(payload, filename = 'TimeReport') {
  if (Array.isArray(payload)) return exportDetailed({ entries: payload }, filename)
  if (payload?.mode === 'summary') return exportSummary(payload, filename)
  return exportDetailed(payload ?? {}, filename)
}

async function exportSummary({ groups = [], primaryLabel = 'Group', secondaryLabel = null, totalSecs = 0 }, filename) {
  const XLSX = await import('xlsx')
  const hasSecondary = !!secondaryLabel && groups.some(g => g.children && g.children.length)
  const pct = secs => totalSecs ? `${((secs / totalSecs) * 100).toFixed(1)}%` : '0.0%'

  const rows = []
  for (const g of groups) {
    rows.push({
      [primaryLabel]: g.label,
      ...(hasSecondary ? { [secondaryLabel]: '' } : {}),
      Duration: formatDuration(g.seconds),
      'Duration (hours)': (g.seconds / 3600).toFixed(2),
      '% of total': pct(g.seconds),
    })
    if (hasSecondary && g.children) {
      for (const c of g.children) {
        rows.push({
          [primaryLabel]: '',
          [secondaryLabel]: c.label,
          Duration: formatDuration(c.seconds),
          'Duration (hours)': (c.seconds / 3600).toFixed(2),
          '% of total': pct(c.seconds),
        })
      }
    }
  }
  if (rows.length) {
    rows.push({
      [primaryLabel]: 'TOTAL',
      ...(hasSecondary ? { [secondaryLabel]: '' } : {}),
      Duration: formatDuration(totalSecs),
      'Duration (hours)': (totalSecs / 3600).toFixed(2),
      '% of total': '100.0%',
    })
  }

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  autoFitColumns(ws, rows)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

async function exportDetailed({ entries = [] }, filename) {
  const XLSX = await import('xlsx')
  const rows = entries.map(entry => ({
    Date:               entry.start_time.slice(0, 10),
    'Start Time':       entry.start_time.slice(11, 19),
    'End Time':         entry.end_time?.slice(11, 19) ?? '',
    Duration:           formatDuration(entry.duration ?? 0),
    'Duration (hours)': ((entry.duration ?? 0) / 3600).toFixed(2),
    Description:        entry.description || '',
    Project:            entry.project?.name ?? '',
    Client:             entry.project?.client?.name ?? '',
    User:               entry.user?.full_name || entry.user?.email || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Time Report')
  autoFitColumns(ws, rows)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

function autoFitColumns(ws, rows) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  ws['!cols'] = keys.map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2,
  }))
}
