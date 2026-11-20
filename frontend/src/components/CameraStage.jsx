import { useEffect, useRef } from 'react'
import Webcam from 'react-webcam'
import { getFaceLandmarker } from '../lib/faceTracker'
import { renderArFilter } from '../lib/renderArOverlay'
import { drawBeautified } from '../lib/beautyPipeline'

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
 * Live camera stage with countdown overlay, level-3 beauty pipeline, and AR face tracking.
 * Renders the video through a beautified canvas (mirrored selfie) and draws AR props on top.
 * renderArOverlay.js is used as-is.
 *
 * Performance: starts at full quality. If preview stutters/freezes, quality is reduced
 * adaptively and reported via onQualityChange so preview and final strip stay in sync.
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
  quality = 1,
  onQualityChange,
  onLandmarksUpdate,
}) {
  const portrait = photoCount === 2
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const latestLandmarksRef = useRef([])
  const beautyCacheRef = useRef({})
  const qualityRef = useRef(quality)
  const perfRef = useRef({ lastFrame: 0, slow: 0, fast: 0 })

  useEffect(() => {
    qualityRef.current = quality
  }, [quality])

  useEffect(() => {
    // Reset performance state when camera (re)starts; keep quality as-is (parent controls initial)
    perfRef.current = { lastFrame: 0, slow: 0, fast: 0 }
  }, [cameraOn])

  // Face tracking + beautified render loop
  useEffect(() => {
    if (!cameraOn || error) return undefined

    let isMounted = true
    let landmarker = null
    let lastDetect = -1

    getFaceLandmarker().then((lm) => {
      if (isMounted) landmarker = lm
    })

    const tick = (now) => {
      if (!isMounted) return

      const video = webcamRef.current?.video
      const canvas = canvasRef.current

      if (video && video.readyState >= 2 && canvas) {
        const vw = video.videoWidth
        const vh = video.videoHeight
        const cw = canvas.clientWidth
        const ch = canvas.clientHeight

        // Adaptive quality: only reduce when preview stutters/freezes, not at start
        const perf = perfRef.current
        if (perf.lastFrame) {
          const dt = now - perf.lastFrame
          if (qualityRef.current >= 1) {
            if (dt > 170) {
              perf.slow += 1
            } else {
              perf.slow = 0
            }
            if (perf.slow >= 4) {
              perf.slow = 0
              perf.fast = 0
              qualityRef.current = 0.55
              onQualityChange?.(0.55)
            }
          } else if (dt < 60) {
            perf.fast += 1
            if (perf.fast >= 90) {
              perf.fast = 0
              perf.slow = 0
              qualityRef.current = 1
              onQualityChange?.(1)
            }
          } else {
            perf.fast = 0
          }
        }
        perf.lastFrame = now

        if (vw && vh && cw && ch) {
          if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw
            canvas.height = ch
          }

          const q = qualityRef.current
          const detectInterval = q < 1 ? 90 : 33

          // Throttle face detection (slower in reduced-quality mode) to save CPU/GPU
          if (landmarker && now - lastDetect >= detectInterval) {
            lastDetect = now
            try {
              const res = landmarker.detectForVideo(video, now)
              const faces = res?.faceLandmarks || []
              latestLandmarksRef.current = faces
              onLandmarksUpdate?.(faces)
            } catch {
              // Frame dropped or task busy
            }
          }

          const ctx = canvas.getContext('2d')
          if (ctx) {
            // object-cover crop for the full video frame
            const scale = Math.max(cw / vw, ch / vh)
            const dw = vw * scale
            const dh = vh * scale
            const dx = (cw - dw) / 2
            const dy = (ch - dh) / 2
            const sw = cw / scale
            const sh = ch / scale
            const sx = (vw - sw) / 2
            const sy = (vh - sh) / 2

            const faces = latestLandmarksRef.current || []

            // Draw beautified, mirrored selfie frame (flip raw video pixels + mirror landmark masks)
            drawBeautified(
              ctx,
              video,
              sx,
              sy,
              sw,
              sh,
              0,
              0,
              cw,
              ch,
              filter,
              faces,
              { flipSource: true, mirrorLandmarks: true, srcWFull: vw, srcHFull: vh, quality: q },
              beautyCacheRef.current,
            )

            // Render AR Face props on top of the mirrored image.
            // Landmarks are in raw video space; image pixels are mirrored, so flip X in mapping.
            if (arFilterId && arFilterId !== 'none' && faces.length > 0) {
              const toCanvas = (nx, ny) => ({
                x: dx + (1 - nx) * dw,
                y: dy + ny * dh,
              })
              renderArFilter(ctx, faces, toCanvas, arFilterId)
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      isMounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [cameraOn, error, arFilterId, filter, webcamRef, onLandmarksUpdate, onQualityChange])

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
          {/* Hidden video source (kept for face tracking and capture). Rendering happens on canvas. */}
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={false}
            screenshotFormat="image/png"
            forceScreenshotSourceSize
            videoConstraints={{
              facingMode: 'user',
              width: { ideal: portrait ? 1440 : 2560 },
              height: { ideal: portrait ? 1920 : 1920 },
              aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 },
            }}
            onUserMediaError={(err) => onCameraError?.(describeCameraError(err))}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />

          {/* Beautified + AR output canvas (mirrored selfie drawn in pixels) */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full object-cover"
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
