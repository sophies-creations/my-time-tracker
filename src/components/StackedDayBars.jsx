import { useState } from 'react'
import {
  format,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  startOfDay, endOfDay, startOfWeek, endOfWeek, endOfMonth,
  differenceInCalendarDays,
} from 'date-fns'
import { formatDuration } from '../utils/formatters'

const WEEK_OPT = { weekStartsOn: 1 }
const NO_PROJECT_COLOR = '#94a3b8'

// Pick a bucket size that won't render hundreds of slivers.
function chooseGranularity(rangeDays) {
  if (rangeDays <= 31)  return 'day'
  if (rangeDays <= 183) return 'week'   // ~6 months
  return 'month'
}

// Build chart buckets for a range, adapting day → week → month so a year-
// long range renders 12 monthly columns instead of 365 invisible day slivers.
// Each bucket carries a label (x-axis), tooltipLabel (header), total seconds,
// and per-project segments coloured for stacking.
export function buildBuckets(entries, range, fallbackColor = '#DA70D6') {
  if (!range?.from) return []
  const start = range.from
  const end   = range.to ?? range.from
  const span  = differenceInCalendarDays(end, start) + 1
  const mode  = chooseGranularity(span)

  let boundaries
  if (mode === 'day') {
    boundaries = eachDayOfInterval({ start, end }).map(d => ({
      from: startOfDay(d),
      to:   endOfDay(d),
      label: format(d, span > 10 ? 'd' : 'EEE, MMM d'),
      tooltipLabel: format(d, 'EEE, MMM d'),
    }))
  } else if (mode === 'week') {
    boundaries = eachWeekOfInterval({ start, end }, WEEK_OPT).map(ws => {
      const we = endOfWeek(ws, WEEK_OPT)
      return {
        from: ws,
        to:   we,
        label: format(ws, 'MMM d'),
        tooltipLabel: `Week of ${format(ws, 'MMM d')} – ${format(we, 'MMM d')}`,
      }
    })
  } else {
    boundaries = eachMonthOfInterval({ start, end }).map(ms => ({
      from: ms,
      to:   endOfMonth(ms),
      label: format(ms, 'MMM'),
      tooltipLabel: format(ms, 'MMMM yyyy'),
    }))
  }

  return boundaries.map(b => {
    const projMap = {}
    for (const e of entries) {
      const t = new Date(e.start_time)
      if (t < b.from || t > b.to) continue
      const p = e.project
        ? { id: e.project.id, name: e.project.name, color: e.project.color || fallbackColor }
        : { id: '_none', name: 'Without project', color: NO_PROJECT_COLOR }
      if (!projMap[p.id]) projMap[p.id] = { ...p, seconds: 0 }
      projMap[p.id].seconds += e.duration ?? 0
    }
    const segments = Object.values(projMap)
    return {
      label: b.label,
      tooltipLabel: b.tooltipLabel,
      total: segments.reduce((s, x) => s + x.seconds, 0),
      segments,
    }
  })
}

export default function StackedDayBars({ buckets, labels = 'auto' }) {
  const [hover, setHover] = useState(null)
  const showLabels = labels === 'auto' ? buckets.length <= 14 : !!labels
  const max = Math.max(...buckets.map(b => b.total), 1)

  if (!buckets.length) {
    return <p className="text-sm text-slate-400 py-10 text-center">No data for this period</p>
  }

  return (
    <div className="relative">
      <div className="flex items-end gap-2 h-56 pt-8">
        {buckets.map((b, i) => {
          const hPct = max ? (b.total / max) * 100 : 0
          const isHovered = hover === i
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center min-w-0 cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(h => (h === i ? null : h))}
            >
              <div className="relative w-full flex flex-col justify-end" style={{ height: '11rem' }}>
                {showLabels && b.total > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                    {formatDuration(b.total)}
                  </span>
                )}
                <div
                  className={`w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-opacity ${
                    hover !== null && !isHovered ? 'opacity-60' : ''
                  }`}
                  style={{ height: `${hPct}%` }}
                >
                  {b.segments.map((s, j) => (
                    <div
                      key={j}
                      style={{
                        height: `${(s.seconds / b.total) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <span className="mt-2 text-[10px] text-slate-400 truncate w-full text-center">
                {b.label}
              </span>
            </div>
          )
        })}
      </div>

      {hover !== null && buckets[hover] && (
        <Tooltip bucket={buckets[hover]} index={hover} count={buckets.length} />
      )}
    </div>
  )
}

function Tooltip({ bucket, index, count }) {
  const centerPct = ((index + 0.5) / count) * 100
  let translateX = '-50%'
  if (centerPct < 18) translateX = '-10%'
  else if (centerPct > 82) translateX = '-90%'

  const sorted = bucket.total
    ? [...bucket.segments].sort((a, b) => b.seconds - a.seconds)
    : []

  return (
    <div
      className="absolute pointer-events-none z-40 bg-slate-900 text-white rounded-lg shadow-xl px-3 py-2 w-[16rem]"
      style={{
        left: `${centerPct}%`,
        top: '-8px',
        transform: `translate(${translateX}, -100%)`,
      }}
    >
      <div className="flex items-center justify-between gap-3 pb-1.5 mb-1.5 border-b border-white/10">
        <span className="text-xs font-semibold">{bucket.tooltipLabel}</span>
        <span className="text-xs font-mono tabular-nums">{formatDuration(bucket.total)}</span>
      </div>
      {bucket.total === 0 ? (
        <div className="text-[11px] text-slate-300">No time tracked</div>
      ) : (
        <div className="space-y-1">
          {sorted.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-mono tabular-nums text-slate-200">{formatDuration(s.seconds)}</span>
              <span className="font-mono tabular-nums text-slate-400 w-8 text-right">
                {Math.round((s.seconds / bucket.total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
