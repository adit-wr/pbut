import { AR_FILTERS } from '../lib/arFilters'

/**
 * AR Face Tracking Filter Picker — 2-row layout without scrollbar.
 */
export default function ArFilterPicker({ value, onChange, disabled, darkMode = true }) {
  return (
    <div role="group" aria-label="AR Face filters">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          AR 3D Face Filter
        </p>
        <span className="text-[11px] font-semibold text-amber-500">20 3D Props</span>
      </div>
      <div className="fade-right grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {AR_FILTERS.map((item) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              title={item.description}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-amber-400 bg-amber-500/20 text-amber-500 shadow-sm'
                  : darkMode
                    ? 'border-slate-800 bg-slate-900/90 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <span className="text-sm">{item.emoji}</span>
              <span>{item.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
