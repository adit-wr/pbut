import usePhotobooth from '../hooks/usePhotobooth.js'
import Masthead from '../components/Masthead.jsx'
import CameraPanel from '../components/CameraPanel.jsx'
import Pickers from '../components/Pickers.jsx'
import StripPanel from '../components/StripPanel.jsx'
import OutputPanel from '../components/OutputPanel.jsx'
import { s } from '../strings.js'

export default function BoothPage() {
  const booth = usePhotobooth()
  const { flash, darkMode, styles } = booth
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

      <div
        className={`sticky top-0 z-40 border-b ${
          darkMode ? 'border-neutral-900 bg-neutral-950' : 'border-neutral-100 bg-white'
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-2 sm:px-8">
          <p className={`${label} ${muted}`}>
            PHOTOBU<span className={accent}>®</span>
          </p>
          <p className={`font-mono text-[9px] font-medium uppercase leading-none tracking-[0.2em] ${muted}`}>
            PHOTO / BOOTH — 2026
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-4 sm:px-8 sm:pt-6">
        <Masthead booth={booth} />

        <div
          className={`py-4 text-center font-mono text-[8px] font-medium uppercase leading-none tracking-[0.24em] sm:py-5 sm:text-[9px] ${muted}`}
        >
          02 — {s('section.camera')} / 03 — {s('section.face')} / 04 —{' '}
          {s('section.finish')} / 05 — {s('section.frame')}
        </div>

        <main className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-12">
          <CameraPanel booth={booth} />
          <Pickers booth={booth} />
          <StripPanel booth={booth} />
          <OutputPanel booth={booth} />
        </main>

        <footer className={`mt-16 flex items-center justify-between gap-4 border-t pt-4 ${line}`}>
          <p className={`${label} ${muted}`}>Photobu</p>
          <p className={`${label} ${muted}`}>{s('footer.right')}</p>
        </footer>
      </div>
    </div>
  )
}
