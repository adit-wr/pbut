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
      ? 'bg-neutral-950 text-neutral-50 antialiased'
      : 'bg-white text-neutral-950 antialiased'
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
  const line = darkMode ? 'border-neutral-800' : 'border-neutral-200'
  const muted = 'text-neutral-500'
  const label = 'text-[10px] font-bold uppercase leading-none tracking-[0.22em]'
  const accent = darkMode ? 'text-pink-300' : 'text-pink-600'
  const accentFill = 'bg-pink-300 text-neutral-950 hover:bg-pink-200'
  const control = `flex h-9 items-center justify-center px-4 ${label} transition disabled:cursor-not-allowed disabled:opacity-40`
  const controlOn = `${accentFill}`
  const controlOff = `${muted} ${darkMode ? 'hover:text-neutral-50' : 'hover:text-neutral-950'}`

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

      <div className="mx-auto w-full max-w-[1180px] px-5 pb-16 sm:px-8">
        {/* Masthead */}
        <header
          className={`grid gap-8 border-b pt-8 pb-7 sm:pt-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end ${line}`}
        >
          <div>
            <p className={`${label} ${accent}`}>Web photobooth</p>
            <h1 className="mt-3 text-[clamp(3.25rem,10vw,6rem)] font-extrabold leading-[0.82] tracking-[-0.06em]">
              POTOBUT
            </h1>
            <p className={`mt-4 max-w-md text-[13px] leading-relaxed ${muted}`}>
              Two or three frames, one strip. Pick a face, a finish and a frame —
              then keep the result.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-5 md:justify-items-end">
            <div>
              <p className={`${label} ${muted}`}>Frames</p>
              <div
                role="group"
                aria-label="Number of photos"
                className={`mt-2 flex divide-x border ${line} ${
                  darkMode ? 'divide-neutral-800' : 'divide-neutral-200'
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
                      className={`${control} w-12 md:cursor-pointer ${active ? controlOn : controlOff}`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className={`${label} ${muted}`}>Mode</p>
              <div
                role="group"
                aria-label="Colour mode"
                className={`mt-2 flex divide-x border ${line} ${
                  darkMode ? 'divide-neutral-800' : 'divide-neutral-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setDarkMode(false)}
                  aria-pressed={!darkMode}
                  className={`${control} md:cursor-pointer ${!darkMode ? controlOn : controlOff}`}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode(true)}
                  aria-pressed={darkMode}
                  className={`${control} md:cursor-pointer ${darkMode ? controlOn : controlOff}`}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 gap-x-10 gap-y-12 pt-10 lg:grid-cols-12">
          {/* 02 — Camera */}
          <section ref={cameraSectionRef} className="scroll-mt-6 lg:col-span-7">
            <div className={`mb-4 flex items-baseline justify-between border-t pt-4 ${line}`}>
              <p className={`${label} ${muted}`}>
                <span className={`${accent} mr-2`}>02</span>Camera
              </p>
              <p className={`${label} ${muted}`}>
                {photoCount} frames · {COUNTDOWN_SECONDS}s
              </p>
            </div>

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
              <p
                className={`mt-4 border-l-2 pl-3 text-[13px] ${
                  darkMode
                    ? 'border-red-500 text-red-400'
                    : 'border-red-600 text-red-700'
                }`}
              >
                {captureError}
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-stretch">
              <button
                type="button"
                onClick={handleStart}
                disabled={startDisabled}
                className={`h-14 px-10 text-[11px] font-semibold uppercase leading-none tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-30 md:cursor-pointer ${accentFill}`}
              >
                {phase === 'counting'
                  ? `Ready ${countdown ?? ''}`.trim()
                  : reviewing
                    ? 'Take again'
                    : 'Start'}
              </button>

              <div className={`flex h-14 items-center justify-between gap-4 border px-4 ${line}`}>
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  disabled={busy}
                  aria-pressed={cameraOn}
                  className={`text-[11px] font-semibold uppercase leading-none tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-40 md:cursor-pointer ${
                    cameraOn ? accent : `${muted} ${darkMode ? 'hover:text-neutral-50' : 'hover:text-neutral-950'}`
                  }`}
                >
                  {cameraOn ? 'Camera on' : 'Camera off'}
                </button>
                <p className={`text-[11px] leading-snug ${muted}`}>
                  {!cameraOn
                    ? 'Turn the camera on to start'
                    : phase === 'counting'
                      ? `${photoCount} photos · ${COUNTDOWN_SECONDS}s countdown`
                      : `${photoCount} photos · ${COUNTDOWN_SECONDS} second countdown each`}
                </p>
              </div>
            </div>
          </section>

          {/* 03–05 — Pickers */}
          <aside className="flex min-w-0 flex-col gap-8 lg:col-span-5">
            <div className={`border-t pt-4 ${line}`}>
              <p className={`${label} ${muted} mb-3`}>
                <span className={`${accent} mr-2`}>03</span>Face
              </p>
              <ArFilterPicker
                value={arFilterId}
                onChange={setArFilterId}
                disabled={phase === 'counting'}
                darkMode={darkMode}
              />
            </div>

            <div className={`border-t pt-4 ${line}`}>
              <p className={`${label} ${muted} mb-3`}>
                <span className={`${accent} mr-2`}>04</span>Finish
              </p>
              <FilterPicker
                value={filterId}
                onChange={setFilterId}
                disabled={phase === 'counting'}
                darkMode={darkMode}
              />
            </div>

            <div className={`border-t pt-4 ${line}`}>
              <p className={`${label} ${muted} mb-3`}>
                <span className={`${accent} mr-2`}>05</span>Frame
              </p>
              <ThemePicker
                value={themeId}
                onChange={setThemeId}
                disabled={phase === 'counting'}
                darkMode={darkMode}
              />
            </div>
          </aside>

          {/* 06 — Strip */}
          <section className="min-w-0 lg:col-span-6">
            <p className={`${label} ${muted} mb-4 border-t pt-4 ${line}`}>
              <span className={`${accent} mr-2`}>06</span>Strip
            </p>
            <div className="max-w-[340px]">
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
          </section>

          {/* 07 — Output */}
          <section className="min-w-0 lg:col-span-6">
            <p className={`${label} ${muted} mb-4 border-t pt-4 ${line}`}>
              <span className={`${accent} mr-2`}>07</span>Output
            </p>

            {save.status !== 'idle' && (
              <div
                className={`mb-4 flex items-start justify-between gap-4 border-l-2 pl-3 text-[13px] ${
                  save.status === 'success'
                    ? darkMode
                      ? 'border-pink-300 text-pink-200'
                      : 'border-pink-600 text-pink-700'
                    : save.status === 'error'
                      ? darkMode
                        ? 'border-red-500 text-red-400'
                        : 'border-red-600 text-red-700'
                      : `border-neutral-400 ${muted}`
                }`}
              >
                <span>
                  {save.status === 'sending' && (
                    <span className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
                  )}
                  {save.message}
                </span>
                {save.status === 'error' && (
                  <button
                    type="button"
                    onClick={handleRetryUpload}
                    className="shrink-0 font-semibold uppercase tracking-[0.14em] underline underline-offset-4 md:cursor-pointer"
                  >
                    Retry
                  </button>
                )}
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
                className={`h-14 text-[11px] font-semibold uppercase leading-none tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-25 md:cursor-pointer ${accentFill}`}
              >
                Download
              </button>
              <button
                type="button"
                onClick={handleRetake}
                disabled={!reviewing}
                className={`h-14 border text-[11px] font-semibold uppercase leading-none tracking-[0.22em] transition disabled:cursor-not-allowed disabled:opacity-25 md:cursor-pointer ${line} ${muted} hover:text-neutral-950 dark:hover:text-neutral-50`}
              >
                New strip
              </button>
            </div>

            {reviewing && !processed && (
              <p className={`mt-3 text-[11px] leading-relaxed ${muted}`}>
                {save.status === 'error'
                  ? 'Download is locked — retry the process above.'
                  : 'Download unlocks once the strip is processed.'}
              </p>
            )}
          </section>
        </main>

        <footer className={`mt-16 flex items-center justify-between gap-4 border-t pt-4 ${line}`}>
          <p className={`${label} ${muted}`}>Potobut</p>
          <p className={`${label} ${muted}`}>Web photobooth</p>
        </footer>
      </div>
    </div>
  )
}
