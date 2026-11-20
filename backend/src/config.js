import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

/**
 * Load `backend/.env` regardless of the directory the server was started from
 * (e.g. `node backend/server.js` from the repo root, or `npm start`).
 * Real environment variables (Railway/CI) always win — dotenv never overrides
 * values that already exist in `process.env`.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../.env') })

/**
 * Central configuration. Credentials come from `backend/.env` (dotenv).
 * Nothing is ever written to disk — photo strips are forwarded upstream
 * from RAM and discarded after the request.
 */
export const config = {
  port: Number(process.env.PORT || 4000),

  service: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    apiUrl: 'https://api.telegram.org',
  },

  maxUploadBytes: 10 * 1024 * 1024, // 10 MB
}
