import { THEMES } from '../lib/themes'

/**
 * Twenty cute theme options — selecting one re-draws the canvas.
 * Each card previews the strip: frame colour + 3 photo slots + motif emoji.
 */
export default function ThemePicker({ value, onChange, disabled, darkMode = true }) {
  return (
    <div role="group" aria-label="Photo strip themes">
      <p className="mb-2 text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-neutral-500">
        Frame &amp; motif
      </p>
      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 no-scrollbar sm:max-h-80">
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
              {/* mini strip preview */}
              <span
                className="flex h-11 flex-col gap-[3px] p-[3px]"
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
