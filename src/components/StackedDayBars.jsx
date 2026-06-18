import { useState } from 'react'
import { format } from 'date-fns'
import { formatDuration } from '../utils/formatters'

// Stacked-by-project vertical bar chart, one bar per day. Tooltip on hover
// shows date, day total, and the per-project breakdown (sorted desc, with
// percentage). `labels` can be 'auto' (default), true, or false:
//   - auto: show always-on totals above each bar only when the chart is
//     wide enough that the labels won't overlap.
//   - true: always show.
//   - false: never show (rely on tooltip only).
//
// `perDay` is an array aligned to `days`, each item shaped like:
//   { total: number, segments: [{ id, name, color, seconds }, ...] }
export default function StackedDayBars({ days, perDay, labels = 'auto' }) {
  const [hover, setHover] = useState(null)
  const showLabels = labels === 'auto' ? days.length <= 14 : !!labels
  const max = Math.max(...perDay.map(d => d.total), 1)
  const xLabel = d => format(d, days.length > 10 ? 'd' : 'EEE, MMM d')

  return (
    <div className="relative">
      <div className="flex items-end gap-2 h-56 pt-8">
        {days.map((day, i) => {
          const info = perDay[i]
          const hPct = max ? (info.total / max) * 100 : 0
          const isHovered = hover === i
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center min-w-0 cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(h => (h === i ? null : h))}
            >
              <div className="relative w-full flex flex-col justify-end" style={{ height: '11rem' }}>
                {showLabels && info.total > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                    {formatDuration(info.total)}
                  </span>
                )}
                <div
                  className={`w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-opacity ${
                    hover !== null && !isHovered ? 'opacity-60' : ''
                  }`}
                  style={{ height: `${hPct}%` }}
                >
                  {info.segments.map((s, j) => (
                    <div
                      key={j}
                      style={{
                        height: `${(s.seconds / info.total) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <span className="mt-2 text-[10px] text-slate-400 truncate w-full text-center">
                {xLabel(day)}
              </span>
            </div>
          )
        })}
      </div>

      {hover !== null && perDay[hover] && (
        <DayTooltip
          day={days[hover]}
          info={perDay[hover]}
          index={hover}
          total={days.length}
        />
      )}
    </div>
  )
}

function DayTooltip({ day, info, index, total }) {
  const centerPct = ((index + 0.5) / total) * 100
  // Clamp horizontal anchor so tooltip stays inside the chart container.
  let translateX = '-50%'
  if (centerPct < 18) translateX = '-10%'
  else if (centerPct > 82) translateX = '-90%'

  const sorted = info.total
    ? [...info.segments].sort((a, b) => b.seconds - a.seconds)
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
        <span className="text-xs font-semibold">{format(day, 'EEE, MMM d')}</span>
        <span className="text-xs font-mono tabular-nums">{formatDuration(info.total)}</span>
      </div>
      {info.total === 0 ? (
        <div className="text-[11px] text-slate-300">No time tracked</div>
      ) : (
        <div className="space-y-1">
          {sorted.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-mono tabular-nums text-slate-200">
                {formatDuration(s.seconds)}
              </span>
              <span className="font-mono tabular-nums text-slate-400 w-8 text-right">
                {Math.round((s.seconds / info.total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
