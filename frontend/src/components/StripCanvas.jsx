import { useEffect } from 'react'
import { drawPhotoStrip, getStripHeight, STRIP_WIDTH } from '../lib/stripCanvas'

export default function StripCanvas({
  photos,
  theme,
  filter,
  arFilterId = 'none',
  quality = 1,
  canvasRef,
  onDrawn,
  darkMode = true,
}) {
  useEffect(() => {
    const canvas = canvasRef?.current
    if (!canvas) return

    // Clear immediately so stale artwork never lingers between sessions (e.g.
    // after retake or when the photo count / canvas height changes) and so a
    // 2-photo strip can never export with a blank 3rd frame.
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)

    // The drawn-count sentinel is driven ONLY by a completed draw (never by
    // clearing). This guarantees callers that the bitmap is finished artwork
    // and never a blank intermediate canvas.
    let alive = true
    drawPhotoStrip(canvas, photos, theme, filter, arFilterId, quality).then((count) => {
      if (alive) onDrawn?.(count)
    })
    return () => {
      alive = false
    }
  }, [canvasRef, photos, theme, filter, arFilterId, quality, onDrawn])

  if (photos.length === 0) {
    return (
      <div
        className={`grid aspect-[600/480] w-full place-items-center border p-6 text-center ${
          darkMode ? 'border-neutral-800 bg-black' : 'border-neutral-200 bg-white'
        }`}
      >
        <div>
          <p
            className={`text-[10px] font-bold uppercase leading-none tracking-[0.22em] ${
              darkMode ? 'text-pink-300' : 'text-pink-600'
            }`}
          >
            Strip
          </p>
          <p className={`mt-3 text-[13px] font-medium ${darkMode ? 'text-neutral-50' : 'text-neutral-950'}`}>
            Your strip will appear here
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            Press start and pick 2 or 3 frames above
          </p>
        </div>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={STRIP_WIDTH}
      height={getStripHeight()}
      aria-label="Generated photo strip"
      className={`h-auto w-full border ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}
    />
  )
}
