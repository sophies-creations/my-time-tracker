import { LANGUAGES } from '../lib/languages'

export default function LanguagesPicker({ value, onChange }) {
  function toggle(lang) {
    onChange(
      value.includes(lang) ? value.filter(l => l !== lang) : [...value, lang]
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGES.map(lang => {
        const selected = value.includes(lang)
        return (
          <button
            key={lang}
            type="button"
            onClick={() => toggle(lang)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selected
                ? 'bg-orchid-600 text-white border-orchid-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-orchid-400 hover:text-orchid-700'
            }`}
          >
            {lang}
          </button>
        )
      })}
    </div>
  )
}
