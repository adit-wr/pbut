import { useCallback, useEffect, useRef, useState } from 'react'
import { canvasToImageBlob, processPhoto } from '../lib/api.js'
import { DEFAULT_AR_FILTER } from '../lib/arFilters.js'
import { DEFAULT_FILTER, FILTERS } from '../lib/filters.js'
import { PHOTO_COUNT } from '../lib/stripCanvas.js'
import { DEFAULT_THEME, THEMES } from '../lib/themes.js'
import {
  readStoredDark,
  readStoredLang,
  storeDark,
  storeLang,
  t,
} from '../lib/i18n.js'
import { COUNTDOWN_SECONDS, FLASH_MS, SAVE_IDLE, SHOT_DELAY_MS, sleep } from '../config.js'
import { getStyles } from '../ui.js'

export default function usePhotobooth() {
  const webcamRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraSectionRef = useRef(null)
  const sessionRef = useRef(null)
  const uploadedSessionRef = useRef(null)
  const cancelledRef = useRef(false)
  const latestLandmarksRef = useRef([])

  const [photos, setPhotos] = useState([])
  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(null)
  const [flash, setFlash] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [drawnCount, setDrawnCount] = useState(0)
  const [uploadTick, setUploadTick] = useState(0)
  const [themeId, setThemeId] = useState(DEFAULT_THEME.id)
  const [filterId, setFilterId] = useState(DEFAULT_FILTER.id)
  const [arFilterId, setArFilterId] = useState(DEFAULT_AR_FILTER.id)
  const [darkMode, setDarkMode] = useState(readStoredDark)
  const [lang, setLang] = useState(readStoredLang)
  const [save, setSave] = useState(SAVE_IDLE)
  const [camError, setCamError] = useState(null)
  const [captureError, setCaptureError] = useState(null)
  const [photoCount, setPhotoCount] = useState(PHOTO_COUNT)
  const [beautyQuality, setBeautyQuality] = useState(1)

  const handleLandmarksUpdate = useCallback((faces) => {
    latestLandmarksRef.current = faces
  }, [])

  useEffect(() => {
    document.body.className = darkMode
      ? 'bg-neutral-950 text-neutral-50 antialiased'
      : 'bg-white text-neutral-950 antialiased'
    document.documentElement.classList.toggle('dark', darkMode)
    storeDark(darkMode)
  }, [darkMode])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t(lang, 'meta.title')
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', t(lang, 'meta.desc'))
    storeLang(lang)
  }, [lang])

  const theme = THEMES.find((item) => item.id === themeId) ?? DEFAULT_THEME
  const filter = FILTERS.find((item) => item.id === filterId) ?? DEFAULT_FILTER
  const handleStripDrawn = useCallback((count) => setDrawnCount(count), [])

  const busy = phase !== 'idle'
  const reviewing = phase === 'reviewing' && photos.length > 0
  const processed = save.status === 'success'
  const cameraLocked =
    phase === 'counting' ||
    save.status === 'sending' ||
    (reviewing && drawnCount !== photoCount)
  const startDisabled = (busy && phase !== 'reviewing') || !cameraOn

  const handleStart = useCallback(async () => {
    cancelledRef.current = false
    sessionRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    uploadedSessionRef.current = null

    setCaptureError(null)
    setSave(SAVE_IDLE)
    setDrawnCount(0)
    setPhotos([])
    setPhase('counting')

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
        setCaptureError(t(lang, 'capture.error'))
        setPhase('idle')
        return
      }

      const rawFaces = (latestLandmarksRef.current || []).map((face) =>
        face.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })),
      )

      captured.push({ dataUrl, landmarks: rawFaces })
      setPhotos([...captured])

      setFlash(true)
      await sleep(FLASH_MS)
      setFlash(false)

      if (shot < photoCount - 1) await sleep(SHOT_DELAY_MS)
    }

    if (cancelledRef.current) return
    setPhase('reviewing')
  }, [photoCount, lang])

  const handleToggleCamera = useCallback(() => {
    if (cameraLocked) return
    setCamError(null)
    setCameraOn((on) => !on)
  }, [cameraLocked])

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

  useEffect(() => {
    if (drawnCount !== photoCount || photos.length < photoCount) return undefined
    const session = sessionRef.current
    const canvas = canvasRef.current
    if (!session || !canvas || uploadedSessionRef.current === session) return undefined
    uploadedSessionRef.current = session

    const isCurrent = () => sessionRef.current === session

    ;(async () => {
      if (isCurrent()) setSave({ status: 'sending', message: t(lang, 'save.sending') })
      try {
        const blob = await canvasToImageBlob(canvas)
        const caption = `Photobu photo strip · ${new Date().toLocaleString()}`
        await processPhoto(blob, `photobu-${session}.jpg`, caption)
        if (isCurrent()) setSave({ status: 'success', message: t(lang, 'save.success') })
      } catch (err) {
        if (isCurrent()) setSave({ status: 'error', message: err.message })
      }
    })()

    return undefined
  }, [drawnCount, photos, uploadTick, photoCount, lang])

  const handleRetryUpload = useCallback(() => {
    uploadedSessionRef.current = null
    setUploadTick((tick) => tick + 1)
  }, [])

  const handleDownload = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !processed) return
    try {
      const blob = await canvasToImageBlob(canvas, { quality: 0.95, maxBytes: Infinity })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `photobu-strip-${Date.now()}.jpg`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      setSave({ status: 'error', message: err.message })
    }
  }, [processed])

  useEffect(
    () => () => {
      cancelledRef.current = true
    },
    [],
  )

  return {
    webcamRef,
    canvasRef,
    cameraSectionRef,
    photos,
    phase,
    countdown,
    flash,
    cameraOn,
    drawnCount,
    themeId,
    filterId,
    arFilterId,
    darkMode,
    lang,
    save,
    camError,
    captureError,
    photoCount,
    beautyQuality,
    theme,
    filter,
    busy,
    reviewing,
    processed,
    cameraLocked,
    startDisabled,
    setCamError,
    setPhotoCount,
    setThemeId,
    setFilterId,
    setArFilterId,
    setDarkMode,
    setLang,
    setBeautyQuality,
    handleLandmarksUpdate,
    handleStart,
    handleToggleCamera,
    handleRetake,
    handleRetryUpload,
    handleDownload,
    handleStripDrawn,
    styles: getStyles(darkMode),
  }
}
