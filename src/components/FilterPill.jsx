import { useState, useRef, useEffect, Fragment } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'

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

// `options` is a flat list. `groups` is `[{ label, options }]`; when
// provided, options are rendered under group headers (used for Active /
// Inactive splitting). Pass `multi` for checkbox-style selection where
// `value` is an array and `onChange` receives the next array.
export function SelectableList({ options, groups, value, onChange, multi = false, search = true }) {
  const [q, setQ] = useState('')
  const lc = q.trim().toLowerCase()

  const allOptions = groups ? groups.flatMap(g => g.options) : (options ?? [])
  const matchFn = o => !lc || o.label.toLowerCase().includes(lc)
  const shouldShowSearch = search && allOptions.length > 8

  const renderedGroups = groups
    ? groups.map(g => ({ label: g.label, options: g.options.filter(matchFn) })).filter(g => g.options.length)
    : [{ label: null, options: allOptions.filter(matchFn) }]

  const hasMatches = renderedGroups.some(g => g.options.length > 0)

  const isSelected = v => (multi ? Array.isArray(value) && value.includes(v) : v === value)

  function pick(v) {
    if (multi) {
      const arr = Array.isArray(value) ? value : []
      onChange(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
    } else {
      onChange(v)
    }
  }

  return (
    <div>
      {shouldShowSearch && (
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
        {renderedGroups.map((g, gi) => (
          <Fragment key={gi}>
            {g.label && (
              <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/40">
                {g.label}
              </p>
            )}
            {g.options.map(o => {
              const selected = isSelected(o.value)
              return (
                <button
                  key={o.value}
                  onClick={() => pick(o.value)}
                  className={`w-full text-left text-sm px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 ${
                    !multi && selected ? 'text-orchid-700 bg-orchid-50/60 font-medium' : 'text-slate-700'
                  }`}
                >
                  {multi && (
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      selected ? 'bg-orchid-600 border-orchid-600' : 'border-slate-300'
                    }`}>
                      {selected && <Check size={10} className="text-white" />}
                    </span>
                  )}
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </Fragment>
        ))}
        {!hasMatches && (
          <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
        )}
      </div>
    </div>
  )
}

// Helper for pill `valueLabel` in multi mode.
export function multiValueLabel(values, allOptions) {
  if (!Array.isArray(values) || !values.length) return ''
  if (values.length === 1) {
    const opt = allOptions.find(o => o.value === values[0])
    return opt?.label ?? ''
  }
  return `${values.length} selected`
}
