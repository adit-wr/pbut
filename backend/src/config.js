import 'dotenv/config'

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
