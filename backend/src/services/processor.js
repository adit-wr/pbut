import axios from 'axios'
import { config } from '../config.js'

/** True when both credentials are present in backend/.env */
export function isServiceConfigured() {
  return Boolean(config.service.token && config.service.chatId)
}

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * Forwards an in-memory image buffer to the configured upstream chat service.
 *
 * The image never touches the filesystem: multer memoryStorage() keeps it as
 * `req.file.buffer`, and we wrap that buffer in a Blob inside a FormData.
 * Error messages returned to the client are intentionally generic — upstream
 * details are only written to the server log.
 */
export async function processPhoto({ buffer, mimeType = 'image/png', caption }) {
  if (!isServiceConfigured()) {
    const error = new Error('Photo service is not configured.')
    error.status = 503
    throw error
  }

  const { token, chatId, apiUrl } = config.service
  const filename = `potobut-${Date.now()}.${EXT_BY_MIME[mimeType] || 'png'}`

  const form = new FormData()
  form.append('chat_id', chatId)
  if (caption) form.append('caption', String(caption).slice(0, 1024))
  form.append('photo', new Blob([buffer], { type: mimeType }), filename)

  let data
  try {
    const response = await axios.post(`${apiUrl}/bot${token}/sendPhoto`, form, {
      timeout: 20000,
      // The upstream answers 4xx with a JSON body we want to read:
      validateStatus: (status) => status >= 200 && status < 500,
    })
    data = response.data
  } catch (err) {
    // Network-level failure: log details server-side, expose nothing.
    console.error('[potobut] upstream request failed:', err.message)
    const error = new Error('Could not reach the photo service.')
    error.status = 502
    throw error
  }

  if (!data?.ok) {
    console.error(
      '[potobut] upstream rejected the photo:',
      data?.error_code,
      data?.description,
    )
    const error = new Error('The photo could not be processed.')
    error.status = 502
    throw error
  }

  return data.result // { message_id, chat: {...}, photo: [...] }
}
