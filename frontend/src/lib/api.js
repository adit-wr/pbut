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

/** Saves a canvas as a JPEG blob (smaller, reliable for processing/upload). */
export function canvasToImageBlob(canvas, { type = 'image/jpeg', quality = 0.92 } = {}) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not export the photo strip.'))
      },
      type,
      quality,
    )
  })
}

/** Backward-compatible alias. */
export const canvasToPngBlob = canvasToImageBlob
