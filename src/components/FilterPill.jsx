import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

// Compact Clockify-style filter pill. Click the chip to open a popover
// whose content is provided by children. When `hasValue` is true the
// pill switches to its "active" colour and exposes a clear (×) button.
//
// `children` may be a function receiving a `close` callback, useful when
// the popover should dismiss after a selection.
export default function FilterPill({ label, valueLabel = '', hasValue, onClear, children, align = 'left', width = 'w-64' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const content = typeof children === 'function' ? children(() => setOpen(false)) : children

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 h-9 rounded-full border text-xs transition-colors ${
          hasValue
            ? 'border-orchid-300 bg-orchid-50 text-orchid-800'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
        }`}
      >
        <span className="font-semibold uppercase tracking-wide text-[10px]">{label}</span>
        {hasValue ? (
          <>
            <span className="text-slate-300">:</span>
            <span className="text-xs max-w-[10rem] truncate">{valueLabel}</span>
            {onClear && (
              <span
                role="button"
                aria-label="Clear filter"
                onClick={e => { e.stopPropagation(); onClear() }}
                className="text-slate-400 hover:text-slate-700 ml-0.5 cursor-pointer"
              >
                <X size={11} />
              </span>
            )}
          </>
        ) : (
          <ChevronDown size={11} className="text-slate-400" />
        )}
      </button>
      {open && (
        <div className={`absolute top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden ${width} ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {content}
        </div>
      )}
    </div>
  )
}

export function SelectableList({ options, value, onChange, search = true }) {
  const [q, setQ] = useState('')
  const lc = q.trim().toLowerCase()
  const filtered = lc ? options.filter(o => o.label.toLowerCase().includes(lc)) : options
  return (
    <div>
      {search && options.length > 8 && (
        <div className="p-2 border-b border-slate-100">
          <input
            autoFocus
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full text-sm px-2 py-1 rounded border border-slate-200 outline-none focus:border-orchid-400"
          />
        </div>
      )}
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`w-full text-left text-sm px-3 py-1.5 hover:bg-slate-50 ${o.value === value ? 'text-orchid-700 bg-orchid-50/60 font-medium' : 'text-slate-700'}`}
          >
            {o.label}
          </button>
        ))}
        {!filtered.length && (
          <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
        )}
      </div>
    </div>
  )
}
