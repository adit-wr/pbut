import { FILTERS } from '../lib/filters'

/**
 * Beauty finish picker — four rows, horizontal rail, no visible scrollbar.
 * Swiss styling: hairline chips, single light-pink accent, no decoration.
 */
export default function FilterPicker({ value, onChange, disabled, darkMode = true }) {
  const line = darkMode ? 'border-neutral-800' : 'border-neutral-200'
  const muted = 'text-neutral-500'

  return (
    <div role="group" aria-label="Photo filters">
      <p className={`mb-2 text-[10px] font-bold uppercase leading-none tracking-[0.22em] ${muted}`}>
        Beauty finish
      </p>
      <div className="grid grid-rows-4 grid-flow-col auto-cols-max gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((filter) => {
          const active = filter.id === value
          return (
            <button
              key={filter.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(filter.id)}
              aria-pressed={active}
              className={`h-8 shrink-0 border px-2.5 text-[10px] font-medium uppercase leading-none tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-pink-300 bg-pink-300 text-neutral-950'
                  : `${line} ${muted} hover:text-neutral-950 dark:hover:text-neutral-50`
              }`}
            >
              {filter.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
