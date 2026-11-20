import { useEffect } from 'react'
import { drawPhotoStrip, getStripHeight, loadImages, STRIP_WIDTH } from '../lib/stripCanvas'
import { s } from '../strings.js'

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
    if (photos.length === 0) return undefined
    const canvas = canvasRef?.current
    if (!canvas) return undefined

    let stale = false

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)

    loadImages(photos)
      .then((images) => {
        if (stale || !canvasRef.current) return
        drawPhotoStrip(canvasRef.current, images, theme, filter, arFilterId, { quality })

        if (!stale) onDrawn?.(images.length)
      })
      .catch((err) => {

        console.error('Failed to render photo strip:', err)
        if (!stale) onDrawn?.(0)
      })

    return () => {
      stale = true
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
            {s('strip.placeholderTitle')}
          </p>
          <p className={`mt-3 text-[13px] font-medium ${darkMode ? 'text-neutral-50' : 'text-neutral-950'}`}>
            {s('strip.placeholder')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
            {s('strip.placeholderHint')}
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
      aria-label={s('strip.aria')}
      className={`h-auto w-full border ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}
    />
  )
}
