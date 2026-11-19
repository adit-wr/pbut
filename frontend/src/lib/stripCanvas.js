/**
 * Photo strip rendering on an HTML5 Canvas.
 *
 * Layout (all values are in canvas pixels, computed once):
 *
 *   |<-------------- STRIP_WIDTH -------------->|
 *   +-------------------------------------------+  ^ OUTER_PADDING
 *   |  ┌─────────────────────────────────────┐  |  |
 *   |  │           photo slot 1 (4:3)        │  |  | slotHeight
 *   |  └─────────────────────────────────────┘  |  |
 *   |               (GAP between slots)         |
 *   |  ┌─────────────────────────────────────┐  |
 *   |  │           photo slot 2 (4:3)        │  |
 *   |  └─────────────────────────────────────┘  |
 *   |  ┌─────────────────────────────────────┐  |
 *   |  │           photo slot 3 (4:3)        │  |
 *   |  └─────────────────────────────────────┘  |
 *   |  🍓 POTOBUT                        date   |  <- footer
 *   +-------------------------------------------+  ^ OUTER_PADDING
 *
 * The frame is filled with the theme colour, then tiled with the theme's
 * cute motif (hearts / flowers / stars / dots / bubbles / sparkles),
 * then the photos are drawn on top, so the motif only shows in the
 * padding, the gaps and the footer.
 */

import { renderArFilter } from './renderArOverlay'

const SCALE = 3 // 3x the original layout (1800px wide) → a much sharper strip
export const STRIP_WIDTH = 600 * SCALE
export const PHOTO_COUNT = 3

const OUTER_PADDING = 18 * SCALE
const GAP = 14 * SCALE
const FOOTER_HEIGHT = 60 * SCALE
const PHOTO_ASPECT = 4 / 3 // width / height
const CORNER_RADIUS = 14 * SCALE
const BORDER_WIDTH = 4 * SCALE

const SLOT_WIDTH = STRIP_WIDTH - OUTER_PADDING * 2 // 1692
const SLOT_HEIGHT = Math.round(SLOT_WIDTH / PHOTO_ASPECT) // 1269

/** 2-photo mode uses portrait (3:4) slots, centred horizontally in the frame. */
const PORTRAIT_SLOT_WIDTH = 400 * SCALE // 1200
const PORTRAIT_SLOT_HEIGHT = Math.round((PORTRAIT_SLOT_WIDTH * 4) / 3) // 1600

/**
 * The strip canvas is ALWAYS this tall (the 3-photo height). A 2-photo strip
 * vertically centres its photos + footer inside the same canvas and the rest of
 * the frame is filled with the theme's motif, so the exported PNG length never
 * changes.
 */
const FIXED_HEIGHT =
  OUTER_PADDING * 2 + PHOTO_COUNT * SLOT_HEIGHT + (PHOTO_COUNT - 1) * GAP + FOOTER_HEIGHT // 4179

/** Total canvas height — always the 3-photo height (see above). */
export function getStripHeight() {
  return FIXED_HEIGHT
}

/** Loads data-URL photos into HTMLImageElements (resolves once decoded). */
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

// ---------------------------------------------------------------------------
// Motifs (cute patterns for the frame)
// ---------------------------------------------------------------------------

/** Deterministic PRNG so every redraw of the same theme looks identical. */
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
  // punched-out centre in the frame colour
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

/** Tiles the theme's motif over the whole canvas (behind the photos). */
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

// ---------------------------------------------------------------------------

function roundedRectPath(ctx, x, y, w, h, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
  } else {
    ctx.rect(x, y, w, h)
  }
}

/** Draws an image "cover"-style (fill the slot, crop the overflow, stay centred). */
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return

  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/**
 * Renders the full photo strip onto `canvas`.
 * Re-runs whenever the photos, the selected theme, the selected filter, or AR filter change.
 */
export function drawPhotoStrip(canvas, images, theme, filter, arFilterId) {
  if (!canvas || !images?.length) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = STRIP_WIDTH
  const height = getStripHeight()

  // For 2 photos use portrait (3:4) slots centred horizontally; the frame on
  // both sides stays filled with the theme's motif.
  const count = images.length
  const portrait = count === 2
  const slotWidth = portrait ? PORTRAIT_SLOT_WIDTH : SLOT_WIDTH
  const slotHeight = portrait ? PORTRAIT_SLOT_HEIGHT : SLOT_HEIGHT
  const slotX = Math.round((width - slotWidth) / 2)
  const gap = portrait ? GAP * 3 : GAP // more breathing room between tall photos

  // Vertically centre (photos + footer) inside the fixed-height canvas.
  const contentHeight = count * slotHeight + (count - 1) * gap + FOOTER_HEIGHT
  const topOffset = Math.floor((height - contentHeight) / 2)

  // Setting width/height resets the context, so do it first.
  canvas.width = width
  canvas.height = height

  // Highest-quality resampling when scaling photos into slots (must be set
  // after the resize that resets the context).
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 1. Frame background (theme colour) + cute motif.
  ctx.fillStyle = theme.frame
  ctx.fillRect(0, 0, width, height)
  drawPattern(ctx, theme, width, height)

  // 2. Photos, one slot per photo.
  images.forEach((img, index) => {
    const x = slotX
    const y = topOffset + index * (slotHeight + gap)

    ctx.save()
    ctx.beginPath()
    roundedRectPath(ctx, x, y, slotWidth, slotHeight, CORNER_RADIUS)
    ctx.clip()
    ctx.fillStyle = theme.photoFallback
    ctx.fillRect(x, y, slotWidth, slotHeight)

    // Apply photo filter only to the photo image, preserving frame & accents
    ctx.filter = filter?.cssFilter || 'none'
    drawCover(ctx, img, x, y, slotWidth, slotHeight)

    // Render AR Face props if present and landmarks exist
    if (arFilterId && arFilterId !== 'none' && img._landmarks?.length) {
      ctx.filter = 'none'
      const iw = img.naturalWidth || img.width
      const ih = img.naturalHeight || img.height
      if (iw && ih) {
        const scale = Math.max(slotWidth / iw, slotHeight / ih)
        const dw = iw * scale
        const dh = ih * scale
        const dx = x + (slotWidth - dw) / 2
        const dy = y + (slotHeight - dh) / 2

        const toSlotCanvas = (nx, ny) => ({
          x: dx + nx * dw,
          y: dy + ny * dh,
        })

        renderArFilter(ctx, img._landmarks, toSlotCanvas, arFilterId)
      }
    }
    ctx.restore()

    // Accent border on top of the photo.
    ctx.save()
    ctx.beginPath()
    roundedRectPath(ctx, x, y, slotWidth, slotHeight, CORNER_RADIUS)
    ctx.lineWidth = BORDER_WIDTH
    ctx.strokeStyle = theme.accent
    ctx.stroke()
    ctx.restore()
  })

  // 3. Footer (emoji + brand + date) on the frame.
  const footerTop = topOffset + images.length * slotHeight + (images.length - 1) * gap
  const footerCenterY = footerTop + FOOTER_HEIGHT / 2

  ctx.save()
  ctx.fillStyle = theme.onFrame
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `800 ${24 * SCALE}px Poppins, ui-sans-serif, system-ui, -apple-system, sans-serif`
  ctx.fillText(`${theme.emoji ?? ''} POTOBUT`.trim(), OUTER_PADDING, footerCenterY)

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
