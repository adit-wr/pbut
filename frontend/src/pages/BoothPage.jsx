import usePhotobooth from '../hooks/usePhotobooth.js'
import Masthead from '../components/Masthead.jsx'
import CameraPanel from '../components/CameraPanel.jsx'
import Pickers from '../components/Pickers.jsx'
import StripPanel from '../components/StripPanel.jsx'
import OutputPanel from '../components/OutputPanel.jsx'
import { t } from '../lib/i18n.js'

export default function BoothPage() {
  const booth = usePhotobooth()
  const { flash, darkMode, lang, styles } = booth
  const { line, muted, label, accent } = styles

  return (
    <div
      className={`min-h-screen ${
        darkMode ? 'bg-neutral-950 text-neutral-50' : 'bg-white text-neutral-950'
      }`}
    >
      {flash && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[100] animate-flash bg-white"
        />
      )}

      <div
        aria-hidden
        className="pointer-events-none fixed left-[2px] top-1/2 -translate-y-1/2"
      >
        <span
          className="block text-[9px] font-bold uppercase leading-none tracking-[0.42em] text-neutral-400"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Photobu — Web Photobooth — 2026
        </span>
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-5 pb-16 sm:px-8">
        <div
          className={`mt-4 flex items-center justify-between border-b pb-2 sm:mt-6 ${
            darkMode ? 'border-neutral-900' : 'border-neutral-100'
          }`}
        >
          <p className={`${label} ${muted}`}>
            PHOTOBU<span className={accent}>®</span>
          </p>
          <p className={`font-mono text-[9px] font-medium uppercase leading-none tracking-[0.2em] ${muted}`}>
            PHOTO / BOOTH — 2026
          </p>
        </div>

        <Masthead booth={booth} />

        <div
          className={`py-4 text-center font-mono text-[8px] font-medium uppercase leading-none tracking-[0.24em] sm:py-5 sm:text-[9px] ${muted}`}
        >
          02 — {t(lang, 'section.camera')} / 03 — {t(lang, 'section.face')} / 04 —{' '}
          {t(lang, 'section.finish')} / 05 — {t(lang, 'section.frame')}
        </div>

        <main className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
          <CameraPanel booth={booth} />
          <Pickers booth={booth} />
          <StripPanel booth={booth} />
          <OutputPanel booth={booth} />
        </main>

        <footer className={`mt-16 flex items-center justify-between gap-4 border-t pt-4 ${line}`}>
          <p className={`${label} ${muted}`}>Photobu</p>
          <p className={`${label} ${muted}`}>{t(lang, 'footer.right')}</p>
        </footer>
      </div>
    </div>
  )
}
