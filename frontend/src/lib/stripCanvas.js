
import { renderArFilter } from './renderArOverlay'
import { drawBeautified } from './beautyPipeline'

const SCALE = 3
export const STRIP_WIDTH = 600 * SCALE
export const PHOTO_COUNT = 3

const OUTER_PADDING = 28 * SCALE
const GAP = 14 * SCALE
const FOOTER_HEIGHT = 60 * SCALE
const PHOTO_ASPECT = 4 / 3
const CORNER_RADIUS = 14 * SCALE
const BORDER_WIDTH = 4 * SCALE

const FIXED_HEIGHT = 4179

const SLOT_WIDTH = STRIP_WIDTH - OUTER_PADDING * 2
const SLOT_HEIGHT = Math.round(SLOT_WIDTH / PHOTO_ASPECT)
const REFERENCE_CONTENT =
  PHOTO_COUNT * SLOT_HEIGHT + (PHOTO_COUNT - 1) * GAP + FOOTER_HEIGHT
const REFERENCE_TOP = Math.floor((FIXED_HEIGHT - REFERENCE_CONTENT) / 2)

const PORTRAIT_GAP = GAP * 3
const PORTRAIT_SLOT_HEIGHT = Math.floor(
  (FIXED_HEIGHT - REFERENCE_TOP * 2 - PORTRAIT_GAP - FOOTER_HEIGHT) / 2,
)

export function getSlotAspect(count) {
  return count === 2 ? SLOT_WIDTH / PORTRAIT_SLOT_HEIGHT : SLOT_WIDTH / SLOT_HEIGHT
}

export function getStripHeight() {
  return FIXED_HEIGHT
}

export function loadImages(items) {
  return Promise.all(
    items.map(
      (item) =>
        new Promise((resolve, reject) => {
          const src = typeof item === 'string' ? item : item.dataUrl
          const img = new Image()
          img.onload = () => {
            img._landmarks = item?.landmarks || null
            resolve(img)
          }
          img.onerror = () => reject(new Error('Failed to decode a captured photo.'))
          img.src = src
        }),
    ),
  )
}

function seededRandom(seedText) {
  let seed = 0
  for (let i = 0; i < seedText.length; i += 1) {
    seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function heartPath(ctx, size) {
  const s = size
  ctx.beginPath()
  ctx.moveTo(0, s * 0.32)
  ctx.bezierCurveTo(0, -s * 0.05, -s * 0.5, -s * 0.35, -s * 0.5, s * 0.05)
  ctx.bezierCurveTo(-s * 0.5, s * 0.42, -s * 0.12, s * 0.5, 0, s * 0.78)
  ctx.bezierCurveTo(s * 0.12, s * 0.5, s * 0.5, s * 0.42, s * 0.5, s * 0.05)
  ctx.bezierCurveTo(s * 0.5, -s * 0.35, 0, -s * 0.05, 0, s * 0.32)
  ctx.closePath()
  ctx.fill()
}

function starPath(ctx, size, points = 5) {
  const outer = size * 0.62
  const inner = outer * 0.45
  ctx.beginPath()
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (Math.PI / points) * i - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

function sparklePath(ctx, size) {
  const r = size * 0.7
  const waist = r * 0.16
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.quadraticCurveTo(waist, -waist, r, 0)
  ctx.quadraticCurveTo(waist, waist, 0, r)
  ctx.quadraticCurveTo(-waist, waist, -r, 0)
  ctx.quadraticCurveTo(-waist, -waist, 0, -r)
  ctx.closePath()
  ctx.fill()
}

function flowerPath(ctx, size, holeColor) {
  const petalRadius = size * 0.42
  const distance = size * 0.5
  ctx.beginPath()
  for (let i = 0; i < 5; i += 1) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance
    ctx.moveTo(x + petalRadius, y)
    ctx.arc(x, y, petalRadius, 0, Math.PI * 2)
  }
  ctx.fill()

  ctx.beginPath()
  ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = holeColor
  ctx.fill()
}

function drawMotif(ctx, type, size, holeColor) {
  switch (type) {
    case 'hearts':
      heartPath(ctx, size)
      break
    case 'flowers':
      flowerPath(ctx, size, holeColor)
      break
    case 'stars':
      starPath(ctx, size)
      break
    case 'bubbles':
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2)
      ctx.lineWidth = Math.max(2, size * 0.22)
      ctx.stroke()
      break
    case 'sparkles':
      sparklePath(ctx, size)
      break
    case 'dots':
    default:
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2)
      ctx.fill()
      break
  }
}

const MOTIF_LAYOUT = {
  hearts: { stepX: 76 * SCALE, stepY: 68 * SCALE, size: 17 * SCALE },
  flowers: { stepX: 80 * SCALE, stepY: 72 * SCALE, size: 16 * SCALE },
  stars: { stepX: 72 * SCALE, stepY: 66 * SCALE, size: 14 * SCALE },
  dots: { stepX: 52 * SCALE, stepY: 52 * SCALE, size: 8 * SCALE },
  bubbles: { stepX: 68 * SCALE, stepY: 62 * SCALE, size: 16 * SCALE },
  sparkles: { stepX: 70 * SCALE, stepY: 64 * SCALE, size: 15 * SCALE },
}

function drawPattern(ctx, theme, width, height) {
  const type = theme.pattern
  if (!type) return

  const layout = MOTIF_LAYOUT[type] ?? MOTIF_LAYOUT.dots
  const rand = seededRandom(type)

  ctx.save()
  ctx.globalAlpha = theme.patternAlpha ?? 0.7
  ctx.fillStyle = theme.patternColor
  ctx.strokeStyle = theme.patternColor
  ctx.lineJoin = 'round'

  for (let row = -1; row * layout.stepY < height + layout.stepY; row += 1) {
    const y = row * layout.stepY + layout.stepY / 2 + (rand() - 0.5) * 12 * SCALE
    const offset = row % 2 === 0 ? 0 : layout.stepX / 2
    for (let col = -1; col * layout.stepX < width + layout.stepX; col += 1) {
      const x = col * layout.stepX + offset + (rand() - 0.5) * 14 * SCALE
      const size = layout.size * (0.75 + rand() * 0.55)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((rand() - 0.5) * 0.7)
      drawMotif(ctx, type, size, theme.frame)
      ctx.restore()
    }
  }

  ctx.restore()
}

function roundedRectPath(ctx, x, y, w, h, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
  } else {
    ctx.rect(x, y, w, h)
  }
}

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return

  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

export function drawPhotoStrip(canvas, images, theme, filter, arFilterId, options = {}) {
  if (!canvas || !images?.length) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const quality = options.quality ?? 1

  const width = STRIP_WIDTH
  const height = getStripHeight()

  const count = images.length
  const portrait = count === 2
  const slotWidth = SLOT_WIDTH
  const slotHeight = portrait ? PORTRAIT_SLOT_HEIGHT : SLOT_HEIGHT
  const slotX = Math.round((width - slotWidth) / 2)
  const gap = portrait ? PORTRAIT_GAP : GAP

  const contentHeight = count * slotHeight + (count - 1) * gap + FOOTER_HEIGHT
  const topOffset = Math.floor((height - contentHeight) / 2)

  canvas.width = width
  canvas.height = height

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.fillStyle = theme.frame
  ctx.fillRect(0, 0, width, height)
  drawPattern(ctx, theme, width, height)

  images.forEach((img, index) => {
    const x = slotX
    const y = topOffset + index * (slotHeight + gap)

    ctx.save()
    ctx.beginPath()
    roundedRectPath(ctx, x, y, slotWidth, slotHeight, CORNER_RADIUS)
    ctx.clip()
    ctx.fillStyle = theme.photoFallback
    ctx.fillRect(x, y, slotWidth, slotHeight)

    const iw = img.naturalWidth || img.width
    const ih = img.naturalHeight || img.height
    if (iw && ih) {
      const coverScale = Math.max(slotWidth / iw, slotHeight / ih)
      const sw = slotWidth / coverScale
      const sh = slotHeight / coverScale
      const sx = (iw - sw) / 2
      const sy = (ih - sh) / 2

      drawBeautified(
        ctx,
        img,
        sx,
        sy,
        sw,
        sh,
        x,
        y,
        slotWidth,
        slotHeight,
        filter,
        img._landmarks || [],
        { flipSource: false, mirrorLandmarks: true, srcWFull: iw, srcHFull: ih, quality },
      )
    } else {
      ctx.filter = filter?.colorFilter || filter?.cssFilter || 'none'
      drawCover(ctx, img, x, y, slotWidth, slotHeight)
      ctx.filter = 'none'
    }

    if (arFilterId && arFilterId !== 'none' && img._landmarks?.length) {
      ctx.filter = 'none'
      if (iw && ih) {
        const arScale = Math.max(slotWidth / iw, slotHeight / ih)
        const dw = iw * arScale
        const dh = ih * arScale
        const dx = x + (slotWidth - dw) / 2
        const dy = y + (slotHeight - dh) / 2

        const toSlotCanvas = (nx, ny) => ({
          x: dx + (1 - nx) * dw,
          y: dy + ny * dh,
        })

        const arFaces = Array(32).fill(null)
        if (Array.isArray(img._landmarks)) arFaces.push(...img._landmarks)
        renderArFilter(ctx, arFaces, toSlotCanvas, arFilterId)
      }
    }
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    roundedRectPath(ctx, x, y, slotWidth, slotHeight, CORNER_RADIUS)
    ctx.lineWidth = BORDER_WIDTH
    ctx.strokeStyle = theme.accent
    ctx.stroke()
    ctx.restore()
  })

  const footerTop = topOffset + images.length * slotHeight + (images.length - 1) * gap
  const footerCenterY = footerTop + FOOTER_HEIGHT / 2

  ctx.save()
  ctx.fillStyle = theme.onFrame
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `800 ${24 * SCALE}px Poppins, ui-sans-serif, system-ui, -apple-system, sans-serif`
  ctx.fillText(`${theme.emoji ?? ''} PHOTOBU`.trim(), OUTER_PADDING, footerCenterY)

  ctx.textAlign = 'right'
  ctx.font = `600 ${18 * SCALE}px Poppins, ui-sans-serif, system-ui, -apple-system, sans-serif`
  const dateLabel = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  ctx.fillText(dateLabel, width - OUTER_PADDING, footerCenterY)
  ctx.restore()
}
