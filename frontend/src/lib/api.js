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
    const error = new Error(data?.error || `Request failed (${res.status})`)
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

/** Saves a canvas as a PNG blob (used for download + background processing). */
export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export the photo strip.'))
    }, 'image/png')
  })
}
