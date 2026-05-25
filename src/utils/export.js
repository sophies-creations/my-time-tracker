import { formatDuration } from './formatters'

export async function exportToExcel(entries, filename = 'TimeReport') {
  const XLSX = await import('xlsx')
  const rows = entries.map(entry => ({
    Date: entry.start_time.slice(0, 10),
    'Start Time': entry.start_time.slice(11, 16),
    'End Time': entry.end_time?.slice(11, 16) ?? '',
    Duration: formatDuration(entry.duration ?? 0),
    'Duration (hours)': ((entry.duration ?? 0) / 3600).toFixed(2),
    Description: entry.description || '',
    Project: entry.project?.name ?? '',
    User: entry.user?.full_name || entry.user?.email || '',
    Tags: entry.time_entry_tags?.map(t => t.tag.name).join(', ') ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Time Report')

  if (rows.length) {
    const keys = Object.keys(rows[0])
    ws['!cols'] = keys.map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2,
    }))
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}
