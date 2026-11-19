import { useEffect, useRef } from 'react'
import Webcam from 'react-webcam'
import { getFaceLandmarker } from '../lib/faceTracker'
import { renderArFilter } from '../lib/renderArOverlay'

function describeCameraError(err) {
  const name = err?.name || String(err)
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission was denied. Allow camera access in your browser and retry.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera device was found on this machine.'
    case 'NotReadableError':
      return 'Your camera is busy in another app. Close it and retry.'
    default:
      return `Could not open the camera (${name}).`
  }
}

/**
 * Live camera stage with countdown overlay, AR face tracking overlay, and on/off switch.
 */
export default function CameraStage({
  webcamRef,
  countdown,
  busy,
  cameraOn,
  onToggleCamera,
  error,
  onRetry,
  onCameraError,
  photoCount = 3,
  filter,
  arFilterId = 'none',
  onLandmarksUpdate,
}) {
  const portrait = photoCount === 2
  const overlayRef = useRef(null)
  const animFrameRef = useRef(null)
  const latestLandmarksRef = useRef(null)

  // Face tracking loop
  useEffect(() => {
    if (!cameraOn || error) return undefined

    let isMounted = true
    let landmarker = null
    let lastTime = -1

    getFaceLandmarker().then((lm) => {
      if (isMounted) landmarker = lm
    })

    const tick = () => {
      if (!isMounted) return

      const video = webcamRef.current?.video
      const canvas = overlayRef.current

      if (video && video.readyState >= 2 && canvas && landmarker) {
        const vw = video.videoWidth
        const vh = video.videoHeight
        const cw = canvas.clientWidth
        const ch = canvas.clientHeight

        if (vw && vh && cw && ch) {
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
          }

          const now = performance.now()
          if (now - lastTime >= 30) {
            lastTime = now
            try {
              const res = landmarker.detectForVideo(video, now)
              const faces = res?.faceLandmarks || []
              latestLandmarksRef.current = faces
              onLandmarksUpdate?.(faces)

              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.clearRect(0, 0, cw, ch)

                if (arFilterId && arFilterId !== 'none' && faces.length > 0) {
                  const scale = Math.max(cw / vw, ch / vh)
                  const dw = vw * scale
                  const dh = vh * scale
                  const dx = (cw - dw) / 2
                  const dy = (ch - dh) / 2

                  const toCanvas = (nx, ny) => ({
                    x: dx + nx * dw,
                    y: dy + ny * dh,
                  })

                  renderArFilter(ctx, faces, toCanvas, arFilterId)
                }
              }
            } catch {
              // Video frame dropped or task busy, continue
            }
          }
        }
      } else if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }

      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      isMounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [cameraOn, error, arFilterId, webcamRef, onLandmarksUpdate])

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10 ${
        portrait ? 'mx-auto aspect-[3/4] max-w-sm' : 'aspect-video'
      }`}
    >
      {!cameraOn ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="text-4xl opacity-80">📷</span>
          <div>
            <p className="font-semibold text-slate-200">Camera is off</p>
            <p className="mt-1 text-sm text-slate-400">Turn it on to start capturing.</p>
          </div>
          <button
            type="button"
            onClick={onToggleCamera}
            className="min-h-11 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
          >
            Turn camera on
          </button>
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-rose-500/15 text-2xl">
            📷
          </div>
          <div>
            <p className="font-semibold text-rose-300">Camera unavailable</p>
            <p className="mt-1 max-w-sm text-sm text-slate-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            screenshotFormat="image/png"
            forceScreenshotSourceSize
            videoConstraints={{
              facingMode: 'user',
              width: { ideal: portrait ? 1440 : 2560 },
              height: { ideal: portrait ? 1920 : 1920 },
              aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 },
            }}
            onUserMediaError={(err) => onCameraError?.(describeCameraError(err))}
            style={{ filter: filter?.cssFilter || 'none' }}
            className="h-full w-full object-cover transition-[filter] duration-200"
          />

          {/* AR Face filter overlay canvas (mirrored identically to match the mirrored webcam video) */}
          <canvas
            ref={overlayRef}
            style={{ transform: 'scaleX(-1)' }}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />

          {/* Live indicator */}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-rose-500" /> Live
          </div>

          {countdown !== null && (
            <div className="absolute inset-0 grid place-items-center bg-black/45">
              <span
                key={countdown}
                className="animate-countdown text-7xl font-black tabular-nums text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)] sm:text-8xl"
              >
                {countdown}
              </span>
            </div>
          )}

          {busy && countdown === null && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              Processing…
            </div>
          )}
        </>
      )}
    </div>
  )
}
