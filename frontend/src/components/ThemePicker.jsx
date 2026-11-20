import { useRef, useState } from 'react'
import { THEMES } from '../lib/themes'
import { s } from '../strings.js'

export default function ThemePicker({ value, onChange, disabled, darkMode = true }) {
  const railRef = useRef(null)
  const [scrollRatio, setScrollRatio] = useState(0)
  const activeIndex = THEMES.findIndex((theme) => theme.id === value)
  const counter = `${String(Math.max(0, activeIndex) + 1).padStart(2, '0')} / ${String(THEMES.length).padStart(2, '0')}`
  const track = darkMode ? 'bg-neutral-800' : 'bg-neutral-200'

  const handleScroll = (event) => {
    const el = event.currentTarget
    const max = el.scrollHeight - el.clientHeight
    setScrollRatio(max > 0 ? el.scrollTop / max : 0)
  }

  return (
    <div role="group" aria-label={s('picker.themeAria')}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-neutral-500">
          {s('picker.themeLabel')}
        </p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tabular-nums text-neutral-500">{counter}</span>
          <span className={`block h-px w-10 ${track}`}>
            <span
              className="block h-px bg-pink-300 transition-[width] duration-150"
              style={{ width: `${Math.max(6, scrollRatio * 100)}%` }}
            />
          </span>
        </div>
      </div>

      <div
        ref={railRef}
        onScroll={handleScroll}
        className="fade-bottom grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pr-1 no-scrollbar sm:max-h-56"
      >
        {THEMES.map((theme) => {
          const active = theme.id === value
          return (
            <button
              key={theme.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(theme.id)}
              aria-pressed={active}
              title={theme.name}
              className={`border p-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-pink-300'
                  : darkMode
                    ? 'border-neutral-800 hover:border-neutral-600'
                    : 'border-neutral-200 hover:border-neutral-400'
              }`}
            >
              <span
                className="flex h-9 flex-col gap-[3px] p-[3px]"
                style={{ backgroundColor: theme.frame }}
              >
                {[0, 1, 2].map((slot) => (
                  <span
                    key={slot}
                    className="flex-1 border"
                    style={{
                      borderColor: theme.accent,
                      backgroundColor: theme.photoFallback,
                    }}
                  />
                ))}
              </span>
              <span
                className={`mt-1.5 block truncate text-[9px] font-medium uppercase leading-none tracking-[0.1em] ${
                  active ? 'text-pink-600 dark:text-pink-300' : 'text-neutral-500'
                }`}
              >
                {theme.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
