import { Router } from 'express'
import multer from 'multer'
import { config } from '../config.js'
import { processPhoto } from '../services/processor.js'

/**
 * multer with memoryStorage(): the upload stays in RAM as `req.file.buffer`
 * and is forwarded upstream straight away — nothing is saved to disk.
 */
const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
}).single('file')

/** Wraps multer so transport errors become clean 400 JSON responses. */
function uploadMiddleware(req, res, next) {
  uploader(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File too large (max ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB).`
          : err.message || 'Upload failed.'
      return res.status(400).json({ error: message })
    }
    return next()
  })
}

export const photoRouter = Router()

/**
 * POST /api/process-photo
 * multipart/form-data:  file (PNG/JPEG/WebP ≤ 10 MB)  +  optional caption
 * Response: { ok: true, messageId, chatId }
 */
photoRouter.post('/process-photo', uploadMiddleware, async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No image received. Send a PNG, JPEG or WebP file in the "file" field.',
    })
  }

  try {
    const result = await processPhoto({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      caption: req.body?.caption,
    })

    return res.json({
      ok: true,
      messageId: result.message_id,
      chatId: result.chat?.id ?? null,
    })
  } catch (err) {
    return next(err)
  }
})
