import { format, parseISO, isToday, isYesterday } from 'date-fns'

export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatTime(iso) {
  if (!iso) return ''
  return format(parseISO(iso), 'HH:mm:ss')
}

export function formatDateHeader(dateStr) {
  const date = parseISO(dateStr)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMM d')
}

export function groupByDate(entries) {
  const groups = {}
  for (const entry of entries) {
    const key = entry.start_time.slice(0, 10)
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
  }
  return groups
}
