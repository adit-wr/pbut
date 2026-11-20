export const COUNTDOWN_SECONDS = 3
export const SHOT_DELAY_MS = 1200
export const FLASH_MS = 260

export const SAVE_IDLE = { status: 'idle', message: '' }

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
