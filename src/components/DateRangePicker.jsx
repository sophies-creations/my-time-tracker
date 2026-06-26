import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { format, startOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears, isSameDay } from 'date-fns'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'

const WEEK_OPT = { weekStartsOn: 1 }

// Each preset returns { from: Date, to: Date }
const PRESETS = [
  { label: 'Today',          range: () => ({ from: startOfToday(),                       to: startOfToday() }) },
  { label: 'Yesterday',      range: () => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0,0,0,0); return { from: d, to: d } } },
  { label: 'This week',      range: () => ({ from: startOfWeek(new Date(), WEEK_OPT),    to: endOfWeek(new Date(), WEEK_OPT) }) },
  { label: 'Last week',      range: () => ({ from: startOfWeek(subWeeks(new Date(), 1), WEEK_OPT), to: endOfWeek(subWeeks(new Date(), 1), WEEK_OPT) }) },
  { label: 'This month',     range: () => ({ from: startOfMonth(new Date()),             to: endOfMonth(new Date()) }) },
  { label: 'Last month',     range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: 'This year',      range: () => ({ from: startOfYear(new Date()),              to: endOfYear(new Date()) }) },
  { label: 'Last year',      range: () => ({ from: startOfYear(subYears(new Date(), 1)),  to: endOfYear(subYears(new Date(), 1)) }) },
]

function dateOnly(d) {
  const n = new Date(d); n.setHours(0, 0, 0, 0); return n
}

function rangesEqual(a, b) {
  if (!a || !b) return false
  return isSameDay(a.from, b.from) && isSameDay(a.to ?? a.from, b.to ?? b.from)
}

function matchPreset({ from, to }) {
  for (const p of PRESETS) {
    const r = p.range()
    if (rangesEqual({ from: dateOnly(r.from), to: dateOnly(r.to) }, { from: dateOnly(from), to: dateOnly(to) })) {
      return p.label
    }
  }
  return 'Custom'
}

function formatRangeLabel(from, to) {
  if (!from) return 'Pick a date'
  const sameDay = to && isSameDay(from, to)
  if (sameDay) return format(from, 'MMM d, yyyy')
  if (!to) return `${format(from, 'MMM d, yyyy')} – …`
  const sameYear = from.getFullYear() === to.getFullYear()
  if (sameYear) return `${format(from, 'MMM d')} – ${format(to, 'MMM d, yyyy')}`
  return `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`
}

export default function DateRangePicker({ from, to, onChange, align = 'left' }) {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState({ from, to })
  const wrapRef = useRef(null)

  useEffect(() => { setDraft({ from, to }) }, [from, to])

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function applyPreset(p) {
    const range = p.range()
    onChange(range)
    setDraft(range)
    setOpen(false)
  }

  function applyDraft() {
    if (draft?.from) {
      const finalRange = { from: draft.from, to: draft.to ?? draft.from }
      onChange(finalRange)
      setOpen(false)
    }
  }

  const activePreset = from && to ? matchPreset({ from, to }) : null

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-surface hover:bg-slate-100 transition-colors"
      >
        <CalendarIcon size={14} className="text-slate-400" />
        <span>{formatRangeLabel(from, to)}</span>
        <ChevronDown size={13} className="text-slate-400" />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 z-50 bg-surface border border-slate-200 rounded-xl shadow-xl flex ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <div className="border-r border-slate-100 py-1.5 w-28">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 ${activePreset === p.label ? 'text-orchid-700 font-medium bg-orchid-50/40' : 'text-slate-600'}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => { /* keep popover open in custom mode */ }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 ${activePreset === 'Custom' ? 'text-orchid-700 font-medium bg-orchid-50/40' : 'text-slate-600'}`}
            >
              Custom
            </button>
          </div>
          <div className="p-2 compact-daypicker">
            <DayPicker
              mode="range"
              numberOfMonths={1}
              weekStartsOn={1}
              selected={draft?.from ? draft : undefined}
              onSelect={r => setDraft(r ?? { from: undefined, to: undefined })}
              showOutsideDays
            />
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <span className="text-xs text-slate-500">
                {draft?.from
                  ? formatRangeLabel(draft.from, draft.to ?? draft.from)
                  : 'Pick a start date'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={applyDraft}
                  disabled={!draft?.from}
                  className="px-3 py-1.5 text-xs bg-orchid-600 hover:bg-orchid-700 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
