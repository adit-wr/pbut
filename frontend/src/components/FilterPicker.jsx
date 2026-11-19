import { FILTERS } from '../lib/filters'

/**
 * Filter picker — selectable photo filters that mix seamlessly with any theme.
 */
export default function FilterPicker({ value, onChange, disabled }) {
  return (
    <div role="group" aria-label="Photo filters">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Photo filter
        </p>
        <span className="text-[11px] text-slate-500">Mix with any theme</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
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
                  ? 'border-sky-400 bg-sky-500/20 text-sky-200 shadow-sm'
                  : 'border-slate-800 bg-slate-900/90 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <span>{filter.emoji}</span>
              <span>{filter.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
