import { t } from '../lib/i18n.js'

export default function Masthead({ booth }) {
  const { lang, setLang, darkMode, setDarkMode, photoCount, setPhotoCount, phase, styles } = booth
  const { line, muted, label, accent, control, controlOn, controlOff } = styles

  const toggleClass = (active) =>
    `relative grid size-10 place-items-center rounded-full transition-all duration-200 sm:size-11 hover:scale-100 hover:opacity-100 hover:ring-2 hover:ring-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 md:cursor-pointer ${
      active ? 'scale-100 opacity-100' : 'scale-90 opacity-50'
    }`
  const iconWrapClass = `relative z-10 grid size-8 place-items-center rounded-full sm:size-9 ${
    darkMode ? 'bg-neutral-950' : 'bg-white'
  }`
  const iconClass = `h-4 w-4 ${darkMode ? 'text-pink-300' : 'text-pink-600'}`

  return (
    <header
      className={`grid gap-8 border-b pt-4 pb-7 sm:pt-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end ${line}`}
    >
      <div>
        <p className={`${label} ${accent}`}>{t(lang, 'app.eyebrow')}</p>
        <h1 className="mt-3 text-[clamp(3.25rem,10vw,6rem)] font-black leading-[0.82] tracking-[-0.06em]">
          PHOTOBU
        </h1>
        <div className={`mt-4 flex items-center gap-3 font-mono text-[9px] uppercase leading-none tracking-[0.2em] ${muted}`}>
          <span className={`h-px w-8 ${darkMode ? 'bg-neutral-700' : 'bg-neutral-300'}`} />
          <span>Inter / 900 — tracking −0.06em</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:gap-x-10 md:justify-items-end">
        <div>
          <p className={`${label} ${muted}`}>{t(lang, 'header.frames')}</p>
          <div
            role="group"
            aria-label={t(lang, 'header.framesAria')}
            className={`mt-2 flex w-fit divide-x border ${line} ${
              darkMode ? 'divide-neutral-800' : 'divide-neutral-200'
            }`}
          >
            {[2, 3].map((n) => (
              <button
                key={n}
                type="button"
                disabled={phase === 'counting'}
                onClick={() => setPhotoCount(n)}
                aria-pressed={photoCount === n}
                className={`${control} w-10 sm:w-12 md:cursor-pointer ${
                  photoCount === n ? controlOn : controlOff
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={`${label} ${muted}`}>Mode</p>
          <div
            role="group"
            aria-label={t(lang, 'header.modeAria')}
            className="mt-3 flex items-center gap-2 sm:gap-3"
          >
            <button
              type="button"
              onClick={() => setDarkMode(false)}
              aria-pressed={!darkMode}
              aria-label={t(lang, 'header.light')}
              title={t(lang, 'header.light')}
              className={toggleClass(!darkMode)}
            >
              <span className="animate-ring-spin pointer-events-none absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#f9a8d4,#ec4899,#fbcfe8,#f9a8d4)]" />
              <span className={iconWrapClass}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={iconClass}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 3v2M12 19v2M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M3 12h2M19 12h2M5.64 18.36l1.41-1.41M16.95 7.05l1.41-1.41" />
                </svg>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(true)}
              aria-pressed={darkMode}
              aria-label={t(lang, 'header.dark')}
              title={t(lang, 'header.dark')}
              className={toggleClass(darkMode)}
            >
              <span className="animate-ring-spin pointer-events-none absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#fbcfe8,#db2777,#f9a8d4,#fbcfe8)]" />
              <span className={iconWrapClass}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={iconClass}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                >
                  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        <div>
          <p className={`${label} ${muted}`}>{t(lang, 'header.language')}</p>
          <div
            role="group"
            aria-label={t(lang, 'header.language')}
            className={`mt-2 flex w-fit divide-x border ${line} ${
              darkMode ? 'divide-neutral-800' : 'divide-neutral-200'
            }`}
          >
            {['en', 'id'].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`${control} w-10 sm:w-11 md:cursor-pointer ${
                  lang === code ? controlOn : controlOff
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
