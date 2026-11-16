import { THEMES } from '../lib/themes'

/**
 * Twenty cute theme options — selecting one re-draws the canvas.
 * Each card previews the strip: frame colour + 3 photo slots + motif emoji.
 */
export default function ThemePicker({ value, onChange, disabled }) {
  return (
    <div role="group" aria-label="Photo strip themes">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Theme & motif
      </p>
      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:max-h-80">
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
              className={`rounded-xl border p-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-white bg-white/10'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-500'
              }`}
            >
              {/* mini strip preview */}
              <span
                className="relative flex h-11 flex-col gap-[3px] rounded-md p-[3px] ring-1 ring-black/10"
                style={{ backgroundColor: theme.frame }}
              >
                {[0, 1, 2].map((slot) => (
                  <span
                    key={slot}
                    className="flex-1 rounded-[2px] border"
                    style={{
                      borderColor: theme.accent,
                      backgroundColor: theme.photoFallback,
                    }}
                  />
                ))}
                <span className="absolute -right-1 -top-1.5 text-sm leading-none drop-shadow">
                  {theme.emoji}
                </span>
              </span>
              <span
                className={`mt-1 block truncate text-center text-[10px] font-semibold sm:text-[11px] ${
                  active ? 'text-white' : 'text-slate-400'
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
