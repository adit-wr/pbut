import { useRef, useState } from 'react'

export default function FilterRail({
  items,
  value,
  onChange,
  disabled,
  darkMode,
  ariaLabel,
  label,
  getTitle,
}) {
  const railRef = useRef(null)
  const [scrollRatio, setScrollRatio] = useState(0)
  const line = darkMode ? 'border-neutral-800' : 'border-neutral-200'
  const track = darkMode ? 'bg-neutral-800' : 'bg-neutral-200'
  const muted = 'text-neutral-500'
  const activeIndex = items.findIndex((item) => item.id === value)
  const counter = `${String(Math.max(0, activeIndex) + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`

  const handleScroll = (event) => {
    const el = event.currentTarget
    const max = el.scrollHeight - el.clientHeight
    setScrollRatio(max > 0 ? el.scrollTop / max : 0)
  }

  return (
    <div role="group" aria-label={ariaLabel}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className={`text-[10px] font-bold uppercase leading-none tracking-[0.22em] ${muted}`}>
          {label}
        </p>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[9px] tabular-nums ${muted}`}>{counter}</span>
          <span className={`block h-px w-10 ${track}`}>
            <span
              className="block h-px bg-pink-300 transition-[width] duration-150"
              style={{ width: `${Math.max(6, scrollRatio * 100)}%` }}
            />
          </span>
        </div>
      </div>

      <div className="fade-bottom">
        <div
          ref={railRef}
          onScroll={handleScroll}
          className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto pr-1 no-scrollbar sm:max-h-56"
        >
          {items.map((item) => {
            const active = item.id === value
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(item.id)}
                aria-pressed={active}
                title={getTitle ? getTitle(item) : item.name}
                className={`flex h-9 shrink-0 items-center gap-1.5 border px-2.5 text-[10px] font-medium uppercase leading-none tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 md:cursor-pointer ${
                  active
                    ? 'border-pink-300 bg-pink-300 text-neutral-950'
                    : `${line} ${muted} hover:text-neutral-950 dark:hover:text-neutral-50`
                }`}
              >
                {active && <span className="size-1 shrink-0 bg-neutral-950" />}
                {item.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
