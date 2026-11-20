import { useEffect, useRef } from 'react'
import Webcam from 'react-webcam'
import { renderArFilter } from '../lib/renderArOverlay'
import { drawBeautified } from '../lib/beautyPipeline'
import { getSlotAspect } from '../lib/stripCanvas'
import { DEFAULT_FILTER } from '../lib/filters'
import { DEFAULT_AR_FILTER } from '../lib/arFilters'
import { t } from '../lib/i18n'

const isMobileDevice =
  typeof navigator !== 'undefined' &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

function describeCameraError(err, lang = 'en') {
  const name = err?.name || String(err)
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return t(lang, 'cam.denied')
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return t(lang, 'cam.notFound')
    case 'NotReadableError':
      return t(lang, 'cam.busy')
    default:
      return t(lang, 'cam.unknown', { name })
  }
}

export default function CameraStage({
  webcamRef,
  countdown,
  busy,
  cameraOn,
  onToggleCamera,
  cameraToggleDisabled = false,
  error,
  onCameraError,
  onRetry,
  photoCount = 3,
  filter = DEFAULT_FILTER,
  arFilterId = DEFAULT_AR_FILTER.id,
  quality = 1,
  onQualityChange,
  onLandmarksUpdate,
  photos = [],
  lang = 'en',
}) {
  const portrait = photoCount === 2
  const slotAspect = getSlotAspect(photoCount)
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

    perfRef.current = { lastFrame: 0, slow: 0, fast: 0 }
  }, [cameraOn])

  useEffect(() => {
    if (!cameraOn || error) return undefined

    let isMounted = true
    let landmarker = null
    let lastDetect = -1

    import('../lib/faceTracker')
      .then(({ getFaceLandmarker }) => getFaceLandmarker())
      .then((lm) => {
        if (isMounted) landmarker = lm
      })
      .catch((err) => console.error('Failed to load face tracking:', err))

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

          const wide = vw / vh > slotAspect
          const cw = wide ? Math.round(vh * slotAspect) : vw
          const ch = wide ? vh : Math.round(vw / slotAspect)

          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            stalledSince = now
          } else if (stalledSince && now - stalledSince > 1500) {
            stalledSince = now
            try {
              video.play?.()?.catch?.(() => {})
            } catch {

            }
          }

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

            if (landmarker && now - lastDetect >= detectInterval) {
              lastDetect = now
              try {
                const res = landmarker.detectForVideo(video, now)
                const faces = res?.faceLandmarks || []
                latestLandmarksRef.current = faces
                onLandmarksUpdate?.(faces)
              } catch {

              }
            }

            const ctx = canvas.getContext('2d')
            if (ctx) {

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

                if (arFilterId && arFilterId !== 'none' && faces.length > 0) {
                  const toCanvas = (nx, ny) => ({
                    x: dx + (1 - nx) * dw,
                    y: dy + ny * dh,
                  })

                  ctx.filter = 'none'
                  renderArFilter(ctx, faces, toCanvas, arFilterId)
                }
                beautyWarned = false
              } catch (err) {

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

        animFrameRef.current = requestAnimationFrame(tick)
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      isMounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [cameraOn, error, arFilterId, filter, slotAspect, webcamRef, onLandmarksUpdate, onQualityChange])

  return (
    <div
      style={{ aspectRatio: slotAspect }}
      className={`relative w-full overflow-hidden border bg-neutral-950 ${
        portrait ? 'mx-auto max-w-sm' : ''
      } border-neutral-800`}
    >
      {!cameraOn ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-pink-300">
              {t(lang, 'stage.off')}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
              {t(lang, 'stage.offHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCamera}
            disabled={cameraToggleDisabled}
            className="min-h-11 border border-white bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 md:cursor-pointer"
          >
            {t(lang, 'stage.turnOn')}
          </button>
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase leading-none tracking-[0.22em] text-pink-300">
              {t(lang, 'stage.unavailable')}
            </p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-neutral-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 border border-white bg-white px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-neutral-200 md:cursor-pointer"
          >
            {t(lang, 'stage.retry')}
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

              width: { ideal: isMobileDevice ? 1280 : portrait ? 1440 : 2560 },
              height: { ideal: isMobileDevice ? 960 : 1920 },
              aspectRatio: { ideal: slotAspect },
            }}
            onUserMediaError={(err) => onCameraError?.(describeCameraError(err, lang))}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
          />

          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />

          <div className="absolute left-3 top-3 flex items-center gap-2 border border-white/20 bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            <span className="size-1.5 animate-pulse bg-pink-300" /> {t(lang, 'stage.live')}
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
              {t(lang, 'stage.processing')}
            </div>
          )}

          {photos.length > 0 && (
            <div
              className="pointer-events-none absolute bottom-3 left-3 z-20 flex gap-1.5"
              aria-label={t(lang, 'stage.thumbs', { count: photos.length })}
            >
              {photos.map((photo, index) => (
                <div
                  key={`${index}-${photo.dataUrl?.length}`}
                  style={{ aspectRatio: slotAspect }}
                  className="relative h-12 w-auto border border-white/70 bg-black/60"
                >
                  <img
                    src={photo.dataUrl}
                    alt={t(lang, 'stage.thumbAlt', { n: index + 1 })}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 bg-black/75 px-1 font-mono text-[8px] font-bold leading-none tabular-nums text-white">
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
