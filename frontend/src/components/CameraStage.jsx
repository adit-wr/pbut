import { useEffect, useRef } from 'react'
import Webcam from 'react-webcam'
import { getFaceLandmarker } from '../lib/faceTracker'
import { renderArFilter } from '../lib/renderArOverlay'
import { drawBeautified } from '../lib/beautyPipeline'
import { DEFAULT_FILTER } from '../lib/filters'
import { DEFAULT_AR_FILTER } from '../lib/arFilters'

const isMobileDevice =
  typeof navigator !== 'undefined' &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

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
  onCameraError,
  onRetry,
  photoCount = 3,
  filter = DEFAULT_FILTER,
  arFilterId = DEFAULT_AR_FILTER.id,
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

    let lastVideoTime = -1
    let stalledSince = 0
    let beautyWarned = false

    const tick = (now) => {
      if (!isMounted) return

      try {
        const video = webcamRef.current?.video
        const canvas = canvasRef.current

        if (video && video.readyState >= 2 && canvas) {
          const vw = video.videoWidth
          const vh = video.videoHeight
          const cw = canvas.clientWidth
          const ch = canvas.clientHeight

          // Mobile Safari can suspend the stream when the tab is backgrounded.
          // If currentTime stops advancing, nudge playback instead of leaving
          // the canvas frozen on the last drawn frame.
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            stalledSince = now
          } else if (stalledSince && now - stalledSince > 1500) {
            stalledSince = now
            try {
              video.play?.()?.catch?.(() => {})
            } catch {
              /* ignore */
            }
          }

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

              try {
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
                beautyWarned = false
              } catch (err) {
                // A single bad frame (e.g. malformed landmarks on mobile) must
                // never kill the animation loop. Fall back to a plain mirrored
                // frame so the preview stays live instead of freezing.
                if (!beautyWarned) {
                  console.warn('Beauty preview frame failed, showing raw frame:', err)
                  beautyWarned = true
                }
                ctx.clearRect(0, 0, cw, ch)
                ctx.save()
                ctx.translate(cw, 0)
                ctx.scale(-1, 1)
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch)
                ctx.restore()
              }
            }
          }
        }
      } catch (err) {
        console.error('Camera preview frame error:', err)
      } finally {
        // Always schedule the next frame, even if a frame threw an error.
        animFrameRef.current = requestAnimationFrame(tick)
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      isMounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [cameraOn, error, arFilterId, filter, webcamRef, onLandmarksUpdate, onQualityChange])

  return (
    <div
      className={`relative w-full overflow-hidden border bg-neutral-950 ${
        portrait ? 'mx-auto aspect-[3/4] max-w-sm' : 'aspect-video'
      } border-neutral-800`}
    >
      {!cameraOn ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-pink-300">
              Camera off
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
              Turn it on to start capturing.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCamera}
            className="min-h-11 border border-white bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-neutral-200 md:cursor-pointer"
          >
            Turn camera on
          </button>
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-pink-300">
              Camera unavailable
            </p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-neutral-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 border border-white bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-neutral-200 md:cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored={false}
            screenshotFormat="image/png"
            forceScreenshotSourceSize
            videoConstraints={{
              facingMode: 'user',
              // Keep mobile cameras at a moderate resolution: high-res frames
              // plus per-frame beauty processing are what stall phones.
              width: { ideal: isMobileDevice ? 1280 : portrait ? 1440 : 2560 },
              height: { ideal: isMobileDevice ? 960 : 1920 },
              aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 },
            }}
            onUserMediaError={(err) => onCameraError?.(describeCameraError(err))}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />

          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute left-3 top-3 flex items-center gap-2 border border-white/20 bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            <span className="size-1.5 animate-pulse bg-pink-300" /> Live
          </div>

          {countdown !== null && (
            <div className="absolute inset-0 grid place-items-center bg-black/50">
              <span
                key={countdown}
                className="animate-countdown text-8xl font-bold tabular-nums text-white"
              >
                {countdown}
              </span>
            </div>
          )}

          {busy && countdown === null && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 border border-white/20 bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              Processing
            </div>
          )}
        </>
      )}
    </div>
  )
}
