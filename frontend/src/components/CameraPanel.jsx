import CameraStage from './CameraStage.jsx'
import { t } from '../lib/i18n.js'
import { COUNTDOWN_SECONDS } from '../config.js'

export default function CameraPanel({ booth }) {
  const {
    webcamRef,
    cameraSectionRef,
    photos,
    cameraOn,
    camError,
    captureError,
    countdown,
    phase,
    reviewing,
    photoCount,
    filter,
    arFilterId,
    beautyQuality,
    setBeautyQuality,
    handleLandmarksUpdate,
    handleToggleCamera,
    cameraLocked,
    handleStart,
    startDisabled,
    setCamError,
    lang,
    styles,
  } = booth
  const { line, muted, label, accent, accentFill, darkMode } = styles

  return (
    <>
      <div className={`border-t pt-4 lg:col-span-7 lg:row-start-1 ${line}`}>
        <div className="flex items-baseline justify-between">
          <p className={`${label} ${muted}`}>
            <span className={`${accent} mr-2`}>02</span>{t(lang, 'section.camera')}
          </p>
          <p className={`font-mono text-[10px] tabular-nums ${muted}`}>
            {t(lang, 'camera.meta', { count: photoCount, seconds: COUNTDOWN_SECONDS })}
          </p>
        </div>
      </div>

      <div
        ref={cameraSectionRef}
        className="scroll-mt-6 lg:col-span-7 lg:row-start-2"
      >
        <CameraStage
          webcamRef={webcamRef}
          countdown={countdown}
          busy={phase === 'counting' && countdown === null}
          cameraOn={cameraOn}
          onToggleCamera={handleToggleCamera}
          cameraToggleDisabled={cameraLocked}
          error={camError}
          onCameraError={setCamError}
          onRetry={() => setCamError(null)}
          photoCount={photoCount}
          filter={filter}
          arFilterId={arFilterId}
          quality={beautyQuality}
          onQualityChange={setBeautyQuality}
          onLandmarksUpdate={handleLandmarksUpdate}
          photos={photos}
          lang={lang}
        />

        {captureError && (
          <p
            className={`mt-4 border-l-2 pl-3 text-[13px] ${
              darkMode ? 'border-red-500 text-red-400' : 'border-red-600 text-red-700'
            }`}
          >
            {captureError}
          </p>
        )}
      </div>

      <div className="lg:col-span-7 lg:row-start-3">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-stretch">
          <button
            type="button"
            onClick={handleStart}
            disabled={startDisabled}
            aria-label={
              phase === 'counting'
                ? t(lang, 'camera.ready', { n: countdown ?? '' }).trim()
                : reviewing
                  ? t(lang, 'camera.takeAgain')
                  : t(lang, 'camera.start')
            }
            title={
              phase === 'counting'
                ? t(lang, 'camera.ready', { n: countdown ?? '' }).trim()
                : reviewing
                  ? t(lang, 'camera.takeAgain')
                  : t(lang, 'camera.start')
            }
            className={`relative grid size-14 shrink-0 place-items-center transition disabled:cursor-not-allowed disabled:opacity-30 md:cursor-pointer ${accentFill}`}
          >
            {phase === 'counting' ? (
              <span className="font-mono text-xl font-bold tabular-nums leading-none">
                {countdown ?? ''}
              </span>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
                strokeLinejoin="miter"
              >
                <rect x="2" y="6" width="14" height="12" />
                <circle cx="9" cy="12" r="3" />
                <path d="M16 11l6-4v10l-6-4z" />
              </svg>
            )}
            {reviewing && <span className="absolute right-1 top-1 size-1.5 bg-neutral-950" />}
          </button>

          <div className={`flex h-14 items-center justify-between gap-4 border px-4 ${line}`}>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={handleToggleCamera}
                disabled={cameraLocked}
                role="switch"
                aria-checked={cameraOn}
                aria-label={t(lang, 'camera.toggle')}
                className={`relative h-7 w-12 shrink-0 border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 disabled:cursor-not-allowed disabled:opacity-40 md:cursor-pointer ${
                  cameraOn
                    ? 'border-pink-300 bg-pink-300'
                    : `${line} ${darkMode ? 'bg-neutral-950 hover:border-neutral-600' : 'bg-white hover:border-neutral-400'}`
                }`}
              >
                <span
                  className={`absolute top-[3px] grid size-5 place-items-center transition-transform duration-200 ${
                    cameraOn
                      ? 'translate-x-[24px] bg-neutral-950 text-pink-300'
                      : `translate-x-[3px] ${darkMode ? 'bg-neutral-300 text-neutral-950' : 'bg-neutral-950 text-neutral-50'}`
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                  >
                    <rect x="2" y="6" width="14" height="12" />
                    <path d="M16 11l6-4v10l-6-4z" />
                  </svg>
                </span>
              </button>
              <span
                className={`text-[9px] font-bold uppercase leading-none tracking-[0.2em] ${
                  cameraOn ? accent : muted
                }`}
              >
                {cameraOn ? t(lang, 'camera.stateOn') : t(lang, 'camera.stateOff')}
              </span>
            </div>
            <p className={`text-[11px] leading-snug ${muted}`}>
              {!cameraOn
                ? t(lang, 'camera.turnOn')
                : phase === 'counting'
                  ? t(lang, 'camera.counting', {
                      count: photoCount,
                      seconds: COUNTDOWN_SECONDS,
                    })
                  : t(lang, 'camera.idle', {
                      count: photoCount,
                      seconds: COUNTDOWN_SECONDS,
                    })}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
