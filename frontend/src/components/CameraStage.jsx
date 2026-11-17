import Webcam from 'react-webcam'

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
 * Live camera stage with a countdown overlay and an on/off switch.
 * The parent owns the webcamRef so it can call getScreenshot().
 * When the camera is off the <Webcam> is unmounted, which releases the
 * device so other apps can use it.
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
}) {
  const portrait = photoCount === 2

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
            className="h-full w-full object-cover"
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
