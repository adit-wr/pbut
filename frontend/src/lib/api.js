/**
 * Tiny API client. In dev, Vite proxies `/api` to the backend, so relative
 * paths just work. Set VITE_API_BASE to override (e.g. in production).
 */
const API_BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options)

  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed (${res.status})`
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return data
}

/**
 * Sends the generated photo strip PNG to the backend, which forwards it
 * to the configured chat service (nothing is stored on disk).
 *
 * @param {Blob}   blob    - result of canvas.toBlob(..., 'image/png')
 * @param {string} filename
 * @param {string} [caption]
 * @returns {Promise<{ ok: true, messageId: number, chatId: number }>}
 */
export function processPhoto(blob, filename, caption) {
  const body = new FormData() // multipart/form-data, browser sets the boundary
  body.append('file', blob, filename)
  if (caption) body.append('caption', caption)

  return request('/api/process-photo', { method: 'POST', body })
}

/** Saves a canvas as a JPEG blob (smaller, reliable for processing/upload).
 *  Adaptively lowers quality and, if needed, downscales until the blob fits
 *  `maxBytes` (default 8 MB — safely below the 10 MB delivery limit).
 */
export async function canvasToImageBlob(
  canvas,
  { type = 'image/jpeg', quality = 0.92, maxBytes = 8 * 1024 * 1024 } = {},
) {
  const encode = (c, q) =>
    new Promise((resolve, reject) => {
      c.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not export the photo strip.'))),
        type,
        q,
      )
    })

  let blob = await encode(canvas, quality)
  if (blob.size <= maxBytes) return blob

  // Step 1: lower JPEG quality.
  for (let q = quality - 0.1; q >= 0.6; q -= 0.1) {
    blob = await encode(canvas, q)
    if (blob.size <= maxBytes) return blob
  }

  // Step 2: progressively downscale, then re-encode.
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

/** Backward-compatible alias. */
export const canvasToPngBlob = canvasToImageBlob
