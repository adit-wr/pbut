import { FILTERS } from '../lib/filters'

/**
 * Filter picker — 2-row layout without scrollbar.
 */
export default function FilterPicker({ value, onChange, disabled, darkMode = true }) {
  return (
    <div role="group" aria-label="Photo filters">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Beauty Filter
        </p>
        <span className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Smooth · color · glow</span>
      </div>
      <div className="fade-right grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((filter) => {
          const active = filter.id === value
          return (
            <button
              key={filter.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(filter.id)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-sky-400 bg-sky-500/20 text-sky-400 shadow-sm'
                  : darkMode
                    ? 'border-slate-800 bg-slate-900/90 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <span className="text-sm">{filter.emoji}</span>
              <span>{filter.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
