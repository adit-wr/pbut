import { AR_FILTERS } from '../lib/arFilters'

/**
 * AR Face Tracking Filter Picker — select live AR face stickers/props.
 */
export default function ArFilterPicker({ value, onChange, disabled }) {
  return (
    <div role="group" aria-label="AR Face filters">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          AR Face Filter
        </p>
        <span className="text-[11px] text-amber-400/80 font-medium">20 Face Props</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
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
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200 shadow-sm'
                  : 'border-slate-800 bg-slate-900/90 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <span>{item.emoji}</span>
              <span>{item.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
