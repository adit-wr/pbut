import { useCallback, useEffect, useRef, useState } from 'react'
import ArFilterPicker from '../components/ArFilterPicker.jsx'
import CameraStage from '../components/CameraStage.jsx'
import FilterPicker from '../components/FilterPicker.jsx'
import StripCanvas from '../components/StripCanvas.jsx'
import ThemePicker from '../components/ThemePicker.jsx'
import { canvasToImageBlob, processPhoto } from '../lib/api.js'
import { DEFAULT_AR_FILTER } from '../lib/arFilters.js'
import { DEFAULT_FILTER, FILTERS } from '../lib/filters.js'
import { PHOTO_COUNT } from '../lib/stripCanvas.js'
import { DEFAULT_THEME, THEMES } from '../lib/themes.js'

const COUNTDOWN_SECONDS = 3
const SHOT_DELAY_MS = 1200 // pause between shots
const FLASH_MS = 260 // full-screen shutter flash duration

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const SAVE_IDLE = { status: 'idle', message: '' }

export default function BoothPage() {
  // --- refs -----------------------------------------------------------------
  const webcamRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraSectionRef = useRef(null)
  const sessionRef = useRef(null) // unique id per capture session
  const uploadedSessionRef = useRef(null) // guards against double sends
  const cancelledRef = useRef(false)
  const latestLandmarksRef = useRef([])

  // --- state ----------------------------------------------------------------
  const [photos, setPhotos] = useState([])
  const [phase, setPhase] = useState('idle') // idle | counting | reviewing
  const [countdown, setCountdown] = useState(null)
  const [flash, setFlash] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [drawnCount, setDrawnCount] = useState(0) // photos in the last completed draw
  const [uploadTick, setUploadTick] = useState(0) // bump to retry processing
  const [themeId, setThemeId] = useState(DEFAULT_THEME.id)
  const [filterId, setFilterId] = useState(DEFAULT_FILTER.id)
  const [arFilterId, setArFilterId] = useState(DEFAULT_AR_FILTER.id)
  const [darkMode, setDarkMode] = useState(true)
  const [save, setSave] = useState(SAVE_IDLE)
  const [camError, setCamError] = useState(null)
  const [captureError, setCaptureError] = useState(null)
  const [photoCount, setPhotoCount] = useState(PHOTO_COUNT) // 2 or 3
  const [beautyQuality, setBeautyQuality] = useState(1) // reduced only when preview stutters; kept in sync with result

  const handleLandmarksUpdate = useCallback((faces) => {
    latestLandmarksRef.current = faces
  }, [])

  // Sync the page background/theme with the selected colour mode.
  useEffect(() => {
    document.body.className = darkMode
      ? 'bg-slate-950 text-slate-100 antialiased transition-colors duration-200'
      : 'bg-slate-50 text-slate-900 antialiased transition-colors duration-200'
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // THEMES is a module-level constant, so this reference is stable per theme id.
  const theme = THEMES.find((item) => item.id === themeId) ?? DEFAULT_THEME
  const filter = FILTERS.find((item) => item.id === filterId) ?? DEFAULT_FILTER

  // Stable identity: the canvas effect only re-runs when photos/theme change.
  const handleStripDrawn = useCallback((count) => setDrawnCount(count), [])

  const busy = phase !== 'idle'
  const reviewing = phase === 'reviewing' && photos.length === photoCount
  // Download unlocks only after the strip has been processed successfully.
  const processed = save.status === 'success'

  // --- capture session ------------------------------------------------------
  const handleStart = useCallback(async () => {
    cancelledRef.current = false
    sessionRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    uploadedSessionRef.current = null

    setCaptureError(null)
    setSave(SAVE_IDLE)
    setDrawnCount(0)
    setPhotos([])
    setPhase('counting')

    // On small screens make sure the camera (with its countdown) is visible.
    if (window.innerWidth < 1024) {
      cameraSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const captured = []

    for (let shot = 0; shot < photoCount; shot += 1) {
      for (let tick = COUNTDOWN_SECONDS; tick >= 1; tick -= 1) {
        if (cancelledRef.current) return
        setCountdown(tick)
        await sleep(1000)
      }
      if (cancelledRef.current) return
      setCountdown(null)

      // Capture directly from the live video so we control the mirror orientation
      // and get a true mirrored selfie (matching the preview) every time.
      const video = webcamRef.current?.video
      let dataUrl = ''
      if (video && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const shotCanvas = document.createElement('canvas')
        shotCanvas.width = video.videoWidth
        shotCanvas.height = video.videoHeight
        const sctx = shotCanvas.getContext('2d')
        if (sctx) {
          sctx.translate(shotCanvas.width, 0)
          sctx.scale(-1, 1)
          sctx.drawImage(video, 0, 0, shotCanvas.width, shotCanvas.height)
          dataUrl = shotCanvas.toDataURL('image/png')
        }
      }
      if (!dataUrl) {
        // Fallback: ensure we still produce a mirrored selfie image.
        const raw = webcamRef.current?.getScreenshot?.() || ''
        if (raw) {
          try {
            const img = await new Promise((resolve, reject) => {
              const i = new Image()
              i.onload = () => resolve(i)
              i.onerror = reject
              i.src = raw
            })
            const c = document.createElement('canvas')
            c.width = img.naturalWidth || img.width
            c.height = img.naturalHeight || img.height
            const cx = c.getContext('2d')
            if (cx) {
              cx.translate(c.width, 0)
              cx.scale(-1, 1)
              cx.drawImage(img, 0, 0, c.width, c.height)
              dataUrl = c.toDataURL('image/png')
            } else {
              dataUrl = raw
            }
          } catch {
            dataUrl = raw
          }
        }
      }

      if (!dataUrl) {
        setCaptureError('Could not capture a photo — the camera may not be ready yet.')
        setPhase('idle')
        return
      }

      // Store landmarks in raw video space. The captured image above is a mirrored
      // selfie, so rendering maps them with (1 - x) to align with the image.
      const rawFaces = (latestLandmarksRef.current || []).map((face) =>
        face.map((pt) => ({
          x: pt.x,
          y: pt.y,
          z: pt.z,
        })),
      )

      captured.push({
        dataUrl,
        landmarks: rawFaces,
      })
      setPhotos([...captured])

      // Full-screen shutter flash (not just the camera area).
      setFlash(true)
      await sleep(FLASH_MS)
      setFlash(false)

      if (shot < photoCount - 1) await sleep(SHOT_DELAY_MS)
    }

    if (cancelledRef.current) return
    setPhase('reviewing')
  }, [photoCount])

  const handleToggleCamera = useCallback(() => {
    if (busy) return
    setCamError(null)
    setCameraOn((on) => !on)
  }, [busy])

  const handleRetake = useCallback(() => {
    cancelledRef.current = true
    sessionRef.current = null
    uploadedSessionRef.current = null
    setPhotos([])
    setDrawnCount(0)
    setCountdown(null)
    setFlash(false)
    setPhase('idle')
    setSave(SAVE_IDLE)
    setCaptureError(null)
  }, [])

  // --- background processing (only once the FULL strip has been drawn) ------
  useEffect(() => {
    // `drawnCount` guarantees the bitmap on the canvas is finished artwork:
    // React clears the canvas whenever the photo count (and therefore its
    // height attribute) changes, so exporting earlier would yield a blank PNG.
    if (drawnCount !== photoCount || photos.length < photoCount) return undefined

    const session = sessionRef.current
    const canvas = canvasRef.current
    if (!session || !canvas || uploadedSessionRef.current === session) return undefined
    uploadedSessionRef.current = session

    // Session-scoped guard: safe under React StrictMode's double-invoked
    // effects and ignores results if the user already started a new strip.
    const isCurrent = () => sessionRef.current === session

    ;(async () => {
      if (isCurrent()) setSave({ status: 'sending', message: 'Processing photo…' })
      try {
        const blob = await canvasToImageBlob(canvas) // canvas → JPEG blob (smaller upload)
        const caption = `Potobut photo strip · ${new Date().toLocaleString()}`
        await processPhoto(blob, `potobut-${session}.jpg`, caption)
        if (isCurrent()) {
          setSave({ status: 'success', message: 'Photo processed successfully!' })
        }
      } catch (err) {
        if (isCurrent()) setSave({ status: 'error', message: err.message })
      }
    })()

    return undefined
  }, [drawnCount, photos, uploadTick, photoCount])

  const handleRetryUpload = useCallback(() => {
    uploadedSessionRef.current = null
    setUploadTick((tick) => tick + 1)
  }, [])

  // --- download -------------------------------------------------------------
  const handleDownload = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !processed) return // locked until processing completes
    try {
      // Download keeps full canvas quality (no upload size cap).
      const blob = await canvasToImageBlob(canvas, { quality: 0.95, maxBytes: Infinity })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `potobut-strip-${Date.now()}.jpg`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      setSave({ status: 'error', message: err.message })
    }
  }, [processed])

  // --- stop capture if the user navigates away -----------------------------
  useEffect(
    () => () => {
      cancelledRef.current = true
    },
    [],
  )

  const startDisabled = busy || !cameraOn

  return (
    <div
      className={`mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 transition-colors duration-200 sm:px-6 sm:py-6 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Full-screen shutter flash */}
      {flash && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[100] animate-flash bg-white"
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={`grid size-9 place-items-center rounded-xl text-lg ${
              darkMode ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
            }`}
          >
            📸
          </span>
          <div>
            <h1 className="text-lg font-black leading-none tracking-tight">Potobut</h1>
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              web photobooth
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Photo count selector (disabled only while capturing) */}
          <div
            role="group"
            aria-label="Number of photos"
            className={`flex shrink-0 rounded-xl border p-1 text-xs font-bold ${
              darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-300 bg-white'
            }`}
          >
            {[2, 3].map((n) => {
              const active = photoCount === n
              return (
                <button
                  key={n}
                  type="button"
                  disabled={phase === 'counting'}
                  onClick={() => setPhotoCount(n)}
                  aria-pressed={active}
                  className={`min-h-9 min-w-16 rounded-lg px-4 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? darkMode
                        ? 'bg-white text-slate-900'
                        : 'bg-slate-900 text-white'
                      : darkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {n} photos
                </button>
              )
            })}
          </div>

          {/* Light / Dark mode toggle */}
          <button
            type="button"
            onClick={() => setDarkMode((on) => !on)}
            aria-pressed={darkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className={`grid size-11 place-items-center rounded-xl border text-lg transition ${
              darkMode
                ? 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="mt-5 grid flex-1 grid-cols-1 items-start gap-5 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: camera + controls */}
        <section ref={cameraSectionRef} className="flex min-w-0 flex-col gap-4 scroll-mt-4">
          <CameraStage
            webcamRef={webcamRef}
            countdown={countdown}
            busy={phase === 'counting' && countdown === null}
            cameraOn={cameraOn}
            onToggleCamera={handleToggleCamera}
            error={camError}
            onCameraError={setCamError}
            onRetry={() => setCamError(null)}
            photoCount={photoCount}
            filter={filter}
            arFilterId={arFilterId}
            quality={beautyQuality}
            onQualityChange={setBeautyQuality}
            onLandmarksUpdate={handleLandmarksUpdate}
          />

          {captureError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {captureError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleStart}
              disabled={startDisabled}
              className={`min-h-12 flex-1 rounded-xl px-6 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-10 ${
                darkMode
                  ? 'bg-white text-slate-900 hover:bg-slate-200'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {phase === 'counting'
                ? `Get ready… ${countdown ?? ''}`.trim()
                : reviewing
                  ? 'Take again'
                  : '▶ Start'}
            </button>

            <button
              type="button"
              onClick={handleToggleCamera}
              disabled={busy}
              aria-pressed={cameraOn}
              className={`min-h-12 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                cameraOn
                  ? darkMode
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-emerald-500/50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : darkMode
                    ? 'border-slate-700 text-slate-400 hover:border-slate-500'
                    : 'border-slate-300 text-slate-500 hover:border-slate-400'
              }`}
            >
              {cameraOn ? '📷 Camera on' : '📷 Camera off'}
            </button>

            <span className={`w-full text-xs sm:w-auto ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {!cameraOn
                ? 'Turn the camera on to start'
                : phase === 'counting'
                  ? `${photoCount} photos · ${COUNTDOWN_SECONDS}s countdown`
                  : `${photoCount} photos · ${COUNTDOWN_SECONDS} second countdown each`}
            </span>
          </div>
        </section>

        {/* Right: theme + strip + actions */}
        <section className="flex min-w-0 flex-col gap-4">
          <div
            className={`flex flex-col gap-3 rounded-2xl border p-3 sm:p-4 ${
              darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white'
            }`}
          >
            <ArFilterPicker
              value={arFilterId}
              onChange={setArFilterId}
              disabled={phase === 'counting'}
              darkMode={darkMode}
            />
            <div className={`border-t pt-3 ${darkMode ? 'border-slate-800/80' : 'border-slate-200'}`}>
              <FilterPicker
                value={filterId}
                onChange={setFilterId}
                disabled={phase === 'counting'}
                darkMode={darkMode}
              />
            </div>
            <div className={`border-t pt-3 ${darkMode ? 'border-slate-800/80' : 'border-slate-200'}`}>
              <ThemePicker
                value={themeId}
                onChange={setThemeId}
                disabled={phase === 'counting'}
                darkMode={darkMode}
              />
            </div>
          </div>

          <div className="mx-auto w-full max-w-[300px] sm:max-w-[340px] lg:max-w-none">
            <StripCanvas
              photos={photos}
              theme={theme}
              filter={filter}
              arFilterId={arFilterId}
              quality={beautyQuality}
              canvasRef={canvasRef}
              onDrawn={handleStripDrawn}
              darkMode={darkMode}
            />
          </div>

          {/* Auto-save status */}
          {save.status !== 'idle' && (
            <div
              className={`rounded-xl border px-3 py-2.5 text-sm ${
                save.status === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : save.status === 'error'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                    : 'border-sky-500/30 bg-sky-500/10 text-sky-600'
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  {save.status === 'sending' && (
                    <span className="mr-1.5 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
                  )}
                  {save.status === 'success' && '✅ '}
                  {save.status === 'error' && '⚠️ '}
                  {save.message}
                </span>
                {save.status === 'error' && (
                  <button
                    type="button"
                    onClick={handleRetryUpload}
                    className="shrink-0 font-semibold underline underline-offset-2"
                  >
                    Retry
                  </button>
                )}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!processed}
              title={
                processed
                  ? 'Download your photo strip'
                  : 'Download unlocks once processing completes'
              }
              className="min-h-12 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ⬇ Download
            </button>
            <button
              type="button"
              onClick={handleRetake}
              disabled={!reviewing}
              className={`min-h-12 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                darkMode
                  ? 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              ↻ New strip
            </button>
          </div>

          {reviewing && !processed && (
            <p
              className={`-mt-1 text-center text-[11px] font-medium ${
                darkMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {save.status === 'error'
                ? 'Download is locked — tap Retry above to process the strip first.'
                : 'Download will unlock once the strip is processed…'}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
