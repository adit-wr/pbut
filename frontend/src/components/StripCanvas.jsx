import { useEffect } from 'react'
import { drawPhotoStrip, loadImages, STRIP_WIDTH, getStripHeight } from '../lib/stripCanvas'

/**
 * Renders the photo strip on an HTML5 canvas.
 * Re-draws whenever photos or the theme change, then notifies the parent
 * via `onDrawn(photoCount)` so it knows the canvas holds finished artwork
 * (the canvas bitmap is cleared whenever its height attribute changes, so
 * exports must only happen after a completed draw).
 */
export default function StripCanvas({
  photos,
  theme,
  filter,
  arFilterId,
  quality = 1,
  canvasRef,
  onDrawn,
  darkMode = true,
}) {
  useEffect(() => {
    if (photos.length === 0) return undefined

    let stale = false
    loadImages(photos)
      .then((images) => {
        if (stale || !canvasRef.current) return
        drawPhotoStrip(canvasRef.current, images, theme, filter, arFilterId, { quality })
        onDrawn?.(photos.length)
      })
      .catch((err) => {
        console.error(err)
      })

    return () => {
      stale = true
    }
  }, [photos, theme, filter, arFilterId, quality, canvasRef, onDrawn])

  if (photos.length === 0) {
    return (
      <div
        className={`grid aspect-[600/480] w-full place-items-center rounded-2xl border border-dashed p-6 text-center ${
          darkMode ? 'border-slate-700 bg-slate-900/60' : 'border-slate-300 bg-white'
        }`}
      >
        <div>
          <p className="text-3xl">🎞️</p>
          <p
            className={`mt-2 text-sm font-medium ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}
          >
            Your strip will appear here
          </p>
          <p className={`mt-1 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Press Start and smile — pick 2 or 3 photos in the header
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
      className="h-auto w-full rounded-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
    />
  )
}
