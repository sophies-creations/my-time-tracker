import { Star } from 'lucide-react'
import { LANGUAGES } from '../lib/languages'

// showPrimary: when true and 2+ languages are selected, the first entry in
// `value` is treated as the primary language (this is also what Calendar.jsx
// groups the schedule by) and a star toggle lets the user reorder it to
// the front.
export default function LanguagesPicker({ value, onChange, showPrimary = false }) {
  function toggle(lang) {
    onChange(
      value.includes(lang) ? value.filter(l => l !== lang) : [...value, lang]
    )
  }

  function makePrimary(lang) {
    onChange([lang, ...value.filter(l => l !== lang)])
  }

  const primaryActive = showPrimary && value.length > 1

  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGES.map(lang => {
        const selected  = value.includes(lang)
        const isPrimary = primaryActive && selected && value[0] === lang
        return (
          <span key={lang} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggle(lang)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selected
                  ? isPrimary
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-orchid-600 text-white border-orchid-600'
                  : 'bg-surface text-slate-600 border-slate-200 hover:border-orchid-400 hover:text-orchid-700'
              }`}
            >
              {isPrimary && <Star size={11} className="fill-current" />}
              {lang}
            </button>
            {primaryActive && selected && !isPrimary && (
              <button
                type="button"
                onClick={() => makePrimary(lang)}
                title={`Mark ${lang} as primary`}
                className="p-1 rounded-full text-slate-300 hover:text-amber-500 transition-colors"
              >
                <Star size={13} />
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
