import { AR_FILTERS } from '../lib/arFilters'

/**
 * AR face-tracking picker — two rows, horizontal rail, no visible scrollbar.
 * Swiss styling: hairline chips, single light-pink accent, no decoration.
 */
export default function ArFilterPicker({ value, onChange, disabled, darkMode = true }) {
  const line = darkMode ? 'border-neutral-800' : 'border-neutral-200'
  const muted = 'text-neutral-500'

  return (
    <div role="group" aria-label="AR face filters">
      <p className={`mb-2 text-[10px] font-bold uppercase leading-none tracking-[0.22em] ${muted}`}>
        Face tracking
      </p>
      <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto no-scrollbar pb-1">
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
              className={`h-8 shrink-0 border px-2.5 text-[10px] font-medium uppercase leading-none tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-pink-300 bg-pink-300 text-neutral-950'
                  : `${line} ${muted} hover:text-neutral-950 dark:hover:text-neutral-50`
              }`}
            >
              {item.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
