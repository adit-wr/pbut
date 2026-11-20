import { s } from '../strings.js'

const configuredBase = import.meta.env.VITE_API_BASE || ''
const isRemoteBase =
  /^https?:\/\//i.test(configuredBase) &&
  !/(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(configuredBase)
const API_BASE = isRemoteBase ? configuredBase.replace(/\/$/, '') : ''

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, options)
  } catch (err) {

    console.error('API request failed:', err)
    const hint = import.meta.env.DEV
      ? s('api.devHint')
      : s('api.prodHint')
    throw new Error(s('api.cannotReach', { hint }))
  }

  let data = null
  try {
    data = await res.json()
  } catch {

  }

  if (!res.ok) {
    const message = data?.message || data?.error || s('api.requestFailed', { status: res.status })
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return data
}

export function processPhoto(blob, filename, caption) {
  const body = new FormData()
  body.append('file', blob, filename)
  if (caption) body.append('caption', caption)

  return request('/api/process-photo', { method: 'POST', body })
}

export async function canvasToImageBlob(
  canvas,
  { type = 'image/jpeg', quality = 0.92, maxBytes = 8 * 1024 * 1024 } = {},
) {
  const encode = (c, q) =>
    new Promise((resolve, reject) => {
      c.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(s('api.exportFailed')))),
        type,
        q,
      )
    })

  let blob = await encode(canvas, quality)
  if (blob.size <= maxBytes) return blob

  for (let q = quality - 0.1; q >= 0.6; q -= 0.1) {
    blob = await encode(canvas, q)
    if (blob.size <= maxBytes) return blob
  }

  for (let scale = 0.9; scale >= 0.4 && blob.size > maxBytes; scale -= 0.1) {
    const scaled = document.createElement('canvas')
    scaled.width = Math.max(1, Math.round(canvas.width * scale))
    scaled.height = Math.max(1, Math.round(canvas.height * scale))
    const sctx = scaled.getContext('2d')
    if (!sctx) break
    sctx.imageSmoothingEnabled = true
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
    blob = await encode(scaled, 0.85)
  }
  return blob
}

export const canvasToPngBlob = canvasToImageBlob
