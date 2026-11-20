/**
 * Level-3 beauty pipeline: color grading, skin smoothing (landmark-masked),
 * glow/soft focus, vignette, and film grain.
 *
 * Works on Canvas2D for both realtime preview frames and final strip photos.
 * Designed to be compatible with renderArOverlay (landmarks stay in the same
 * normalized video space; callers provide mapping helpers).
 */

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
]

const LEFT_EYE = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
]
const RIGHT_EYE = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398,
]
// Outer lips
const LIPS_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37,
  39, 40, 185,
]
// Inner lips / mouth opening (to avoid tinting teeth)
const LIPS_INNER = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87,
  178, 88, 95,
]
// Eyebrow regions (approx) to avoid over-smoothing brows
const LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
const RIGHT_BROW = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285]

let _noiseCanvas = null
let _noiseKey = ''

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function getNoiseCanvas() {
  // Tileable-ish small noise pattern scaled up for performance
  const tw = 256
  const th = 256
  const key = `${tw}x${th}`
  if (_noiseCanvas && _noiseKey === key) return _noiseCanvas
  const c = document.createElement('canvas')
  c.width = tw
  c.height = th
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const img = ctx.createImageData(tw, th)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  _noiseCanvas = c
  _noiseKey = key
  return c
}

function ensureCanvas(cache, key, w, h) {
  let c = cache[key]
  if (!c) {
    c = document.createElement('canvas')
    cache[key] = c
  }
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c
}

function expandPoly(landmarks, indices, toPoint, cx, cy, scale) {
  const pts = []
  for (let i = 0; i < indices.length; i += 1) {
    const p = toPoint(landmarks[indices[i]])
    pts.push({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale })
  }
  return pts
}

function tracePts(ctx, pts) {
  if (!pts.length) return
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

function traceLandmarks(ctx, face, indices, toPoint) {
  if (!indices?.length) return
  const p0 = toPoint(face[indices[0]])
  if (!p0) return
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < indices.length; i += 1) {
    const p = toPoint(face[indices[i]])
    if (p) ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

/**
 * Build a soft skin mask (white = smooth/whiten area) for one face.
 * Excludes eyes, lips, and brows. Returns a canvas.
 */
function buildSkinMask(face, toPoint, w, h, featherPx, cache) {
  const mask = ensureCanvas(cache, 'mask', w, h)
  const mctx = mask.getContext('2d')
  if (!mctx) return mask
  mctx.clearRect(0, 0, w, h)

  // Face center for slight expansion
  const nose = toPoint(face[1] || face[4] || face[168] || face[0])
  const cx = nose?.x ?? w / 2
  const cy = nose?.y ?? h / 2

  // Expanded face oval for better coverage
  const ovalPts = expandPoly(face, FACE_OVAL, toPoint, cx, cy, 1.08)

  mctx.save()
  mctx.filter = `blur(${Math.max(2, featherPx)}px)`
  mctx.fillStyle = '#fff'
  mctx.beginPath()
  tracePts(mctx, ovalPts)
  mctx.fill()

  // Cut out features
  mctx.globalCompositeOperation = 'destination-out'
  mctx.fillStyle = '#fff'

  const cutout = (indices, scale = 1.15) => {
    let rx = 0
    let ry = 0
    let n = 0
    for (const i of indices) {
      const p = toPoint(face[i])
      if (!p) continue
      rx += p.x
      ry += p.y
      n += 1
    }
    if (!n) return
    rx /= n
    ry /= n
    const pts = expandPoly(face, indices, toPoint, rx, ry, scale)
    mctx.beginPath()
    tracePts(mctx, pts)
    mctx.fill()
  }

  cutout(LEFT_EYE, 1.35)
  cutout(RIGHT_EYE, 1.35)
  cutout(LIPS_OUTER, 1.25)
  cutout(LEFT_BROW, 1.3)
  cutout(RIGHT_BROW, 1.3)

  mctx.restore()
  return mask
}

function buildAllFaceMask(faces, toPoint, w, h, featherPx, cache) {
  const maskAll = ensureCanvas(cache, 'maskAll', w, h)
  const actx = maskAll.getContext('2d')
  if (!actx) return maskAll
  actx.clearRect(0, 0, w, h)
  actx.globalCompositeOperation = 'source-over'

  for (const face of faces) {
    if (!face || face.length < 468) continue
    const m = buildSkinMask(face, toPoint, w, h, featherPx, cache)
    actx.drawImage(m, 0, 0)
  }
  return maskAll
}

/**
 * Apply skin smoothing for all faces using a prebuilt mask.
 */
function applySkinSmoothing(outCtx, baseCanvas, w, h, maskAll, opts, cache) {
  const strength = clamp01(opts.smooth ?? 0)
  if (!strength) return

  const blurPx = Math.max(2, (opts.smoothRadius ?? 6) * (w / 720))

  const smooth = ensureCanvas(cache, 'smooth', w, h)
  const sctx = smooth.getContext('2d')
  if (!sctx) return
  sctx.clearRect(0, 0, w, h)
  sctx.filter = `blur(${blurPx}px) brightness(${1 + strength * 0.05}) saturate(${1 + strength * 0.04})`
  sctx.drawImage(baseCanvas, 0, 0, w, h)
  sctx.filter = 'none'

  sctx.globalCompositeOperation = 'destination-in'
  sctx.drawImage(maskAll, 0, 0)
  sctx.globalCompositeOperation = 'source-over'

  outCtx.save()
  outCtx.globalAlpha = strength
  outCtx.drawImage(smooth, 0, 0)
  outCtx.restore()
}

/**
 * Brighten/whiten face skin within mask (natural-looking).
 */
function applyFaceWhiten(outCtx, w, h, maskAll, opts, cache) {
  const strength = clamp01(opts.whiten ?? 0)
  if (!strength) return

  const tmp = ensureCanvas(cache, 'whiten', w, h)
  const tctx = tmp.getContext('2d')
  if (!tctx) return
  tctx.clearRect(0, 0, w, h)

  // Soft bright layer (slightly warm/neutral to avoid grey cast)
  const tone = opts.whitenTone || '255,255,252'
  tctx.fillStyle = `rgb(${tone})`
  tctx.fillRect(0, 0, w, h)
  tctx.globalCompositeOperation = 'destination-in'
  tctx.drawImage(maskAll, 0, 0)
  tctx.globalCompositeOperation = 'source-over'

  outCtx.save()
  outCtx.globalCompositeOperation = 'screen'
  outCtx.globalAlpha = 0.05 + strength * 0.18
  outCtx.drawImage(tmp, 0, 0)
  outCtx.restore()

  // Extra lift with soft-light for a brighter/clear look at higher strength (kept gentle)
  if (strength > 0.35) {
    outCtx.save()
    outCtx.globalCompositeOperation = 'soft-light'
    outCtx.globalAlpha = (strength - 0.35) * 0.16
    outCtx.drawImage(tmp, 0, 0)
    outCtx.restore()
  }
}

function getEyeDist(face, toPoint) {
  const a = toPoint(face[33])
  const b = toPoint(face[263])
  if (!a || !b) return 1
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  return d || 1
}

/**
 * Natural cheek blush on both cheeks.
 */
function applyCheekBlush(outCtx, faces, toPoint, opts) {
  const amount = clamp01(opts.cheek ?? 0)
  if (!amount) return
  const color = opts.cheekColor || '255,105,135'
  const mode = opts.cheekMode || 'soft-light'

  for (const face of faces) {
    if (!face || face.length < 468) continue
    const eyeDist = getEyeDist(face, toPoint)
    const r = eyeDist * (opts.cheekSize ?? 0.62)

    const pts = [
      toPoint(face[50] || face[205] || face[101]), // left cheek
      toPoint(face[280] || face[425] || face[330]), // right cheek
    ]

    pts.forEach((c, idx) => {
      if (!c) return
      // nudge slightly down and toward center for natural placement
      const inward = idx === 0 ? 1 : -1
      const x = c.x + inward * eyeDist * 0.06
      const y = c.y + eyeDist * 0.12
      const g = outCtx.createRadialGradient(x, y, r * 0.05, x, y, r)
      g.addColorStop(0, `rgba(${color},${0.34 * amount})`)
      g.addColorStop(0.55, `rgba(${color},${0.17 * amount})`)
      g.addColorStop(1, `rgba(${color},0)`)
      outCtx.save()
      outCtx.globalCompositeOperation = mode
      outCtx.fillStyle = g
      outCtx.beginPath()
      outCtx.arc(x, y, r, 0, Math.PI * 2)
      outCtx.fill()
      outCtx.restore()
    })
  }
}

/**
 * Lip tint (outer lips minus inner mouth) for a natural rosy/red lip look.
 */
function applyLipTint(outCtx, faces, toPoint, opts) {
  const amount = clamp01(opts.lip ?? 0)
  if (!amount) return
  const color = opts.lipColor || '#e23a5c'
  const mode = opts.lipMode || 'soft-light'

  for (const face of faces) {
    if (!face || face.length < 468) continue
    outCtx.save()
    outCtx.globalCompositeOperation = mode
    outCtx.globalAlpha = 0.14 + amount * 0.42
    outCtx.fillStyle = color
    outCtx.beginPath()
    traceLandmarks(outCtx, face, LIPS_OUTER, toPoint)
    traceLandmarks(outCtx, face, LIPS_INNER, toPoint)
    try {
      outCtx.fill('evenodd')
    } catch {
      // fallback: fill outer only
      outCtx.beginPath()
      traceLandmarks(outCtx, face, LIPS_OUTER, toPoint)
      outCtx.fill()
    }
    outCtx.restore()

    // subtle highlight for fuller look
    if (amount > 0.25) {
      let sx = 0
      let sy = 0
      let n = 0
      // upper lip area highlight
      const top = [0, 37, 39, 40, 185, 61, 146, 91, 181, 84]
      for (const i of top) {
        const p = toPoint(face[i])
        if (!p) continue
        sx += p.x
        sy += p.y
        n += 1
      }
      if (n) {
        const eyeDist = getEyeDist(face, toPoint)
        const hx = sx / n
        const hy = sy / n + eyeDist * 0.01
        const hr = eyeDist * 0.18
        const hg = outCtx.createRadialGradient(hx, hy, 0, hx, hy, hr)
        hg.addColorStop(0, `rgba(255,255,255,${0.14 * amount})`)
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        outCtx.save()
        outCtx.globalCompositeOperation = 'screen'
        outCtx.fillStyle = hg
        outCtx.beginPath()
        outCtx.arc(hx, hy, hr, 0, Math.PI * 2)
        outCtx.fill()
        outCtx.restore()
      }
    }
  }
}

function applyGlow(outCtx, baseCanvas, w, h, opts, cache) {
  const glow = clamp01(opts.glow ?? 0)
  if (!glow) return
  const g = ensureCanvas(cache, 'glow', w, h)
  const gctx = g.getContext('2d')
  if (!gctx) return
  const blur = Math.max(6, 18 * (w / 720))
  gctx.clearRect(0, 0, w, h)
  gctx.filter = `blur(${blur}px) brightness(${1.15 + glow * 0.2}) saturate(${1.05 + glow * 0.15})`
  gctx.drawImage(baseCanvas, 0, 0, w, h)
  gctx.filter = 'none'

  outCtx.save()
  outCtx.globalCompositeOperation = 'screen'
  outCtx.globalAlpha = glow * 0.35
  outCtx.drawImage(g, 0, 0)
  outCtx.restore()
}

function applyVignette(ctx, w, h, amount) {
  const v = clamp01(amount ?? 0)
  if (!v) return
  const inner = Math.min(w, h) * 0.28
  const outer = Math.max(w, h) * 0.75
  const grad = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, outer)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.55, `rgba(0,0,0,${0.08 * v})`)
  grad.addColorStop(1, `rgba(0,0,0,${0.55 * v})`)
  ctx.save()
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

function applyGrain(ctx, w, h, amount) {
  const g = clamp01(amount ?? 0)
  if (!g) return
  const noise = getNoiseCanvas()
  if (!noise) return
  ctx.save()
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = g * 0.18
  const pattern = ctx.createPattern(noise, 'repeat')
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
  } else {
    ctx.drawImage(noise, 0, 0, w, h)
  }
  ctx.restore()
}

function applyTint(ctx, w, h, tint) {
  if (!tint || !tint.color || !tint.alpha) return
  ctx.save()
  ctx.globalCompositeOperation = tint.mode || 'soft-light'
  ctx.globalAlpha = clamp01(tint.alpha)
  ctx.fillStyle = tint.color
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

function applySharpen(outCtx, baseCanvas, w, h, amount, cache) {
  // Lightweight pseudo-sharpen via unsharp mask approximation with canvas ops
  const s = clamp01(amount ?? 0)
  if (!s) return
  const blur = ensureCanvas(cache, 'sharpBlur', w, h)
  const bctx = blur.getContext('2d')
  if (!bctx) return
  bctx.clearRect(0, 0, w, h)
  bctx.filter = 'blur(1.2px)'
  bctx.drawImage(baseCanvas, 0, 0, w, h)
  bctx.filter = 'none'

  // Unsharp: output = base + s*(base - blur) approximated by overlaying difference
  // Approximation: draw inverted blur with overlay/soft-light is messy; instead use
  // a subtle contrast bump on edges by drawing base over blur difference via 'difference' composite into temp.
  const diff = ensureCanvas(cache, 'sharpDiff', w, h)
  const dctx = diff.getContext('2d')
  if (!dctx) return
  dctx.clearRect(0, 0, w, h)
  dctx.drawImage(baseCanvas, 0, 0, w, h)
  dctx.globalCompositeOperation = 'difference'
  dctx.drawImage(blur, 0, 0, w, h)
  dctx.globalCompositeOperation = 'source-over'

  outCtx.save()
  outCtx.globalCompositeOperation = 'overlay'
  outCtx.globalAlpha = s * 0.5
  outCtx.drawImage(diff, 0, 0, w, h)
  outCtx.restore()
}

/**
 * Build a CSS filter string from structured grade params (used as base color grade).
 */
export function gradeToCss(grade) {
  if (!grade) return 'none'
  if (typeof grade === 'string') return grade
  if (grade.css) return grade.css
  const parts = []
  if (grade.brightness != null) parts.push(`brightness(${grade.brightness}%)`)
  if (grade.contrast != null) parts.push(`contrast(${grade.contrast}%)`)
  if (grade.saturate != null) parts.push(`saturate(${grade.saturate}%)`)
  if (grade.sepia != null) parts.push(`sepia(${grade.sepia}%)`)
  if (grade.hue != null) parts.push(`hue-rotate(${grade.hue}deg)`)
  if (grade.gray != null) parts.push(`grayscale(${grade.gray}%)`)
  if (grade.blur != null) parts.push(`blur(${grade.blur}px)`)
  return parts.length ? parts.join(' ') : 'none'
}

function getGradeCss(filter) {
  if (!filter) return 'none'
  if (filter.colorFilter) return filter.colorFilter
  if (filter.cssFilter) return filter.cssFilter
  if (filter.grade) return gradeToCss(filter.grade)
  return 'none'
}

function createCache() {
  return {}
}

/**
 * Process/draw a beautified image into ctx at (dx,dy,dw,dh).
 *
 * @param {CanvasRenderingContext2D} ctx destination context
 * @param {CanvasImageSource} source image/video/canvas
 * @param {number} sx,sy,sw,sh source rect (for cover/crop) - pass 0,0,srcW,srcH for full
 * @param {number} dx,dy,dw,dh destination rect in ctx
 * @param {object} filter filter preset (from filters.js)
 * @param {Array} faces faceLandmarksList in normalized source space (0-1 of source)
 * @param {object} options { mirrorX?: boolean } - mirrorX true if source should be treated mirrored (landmarks mapping)
 * @param {object} [cache] optional reusable canvas cache (for realtime)
 */
export function drawBeautified(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh, filter, faces, options = {}, cache) {
  const _cache = cache || createCache()
  const w = Math.max(1, Math.round(dw))
  const h = Math.max(1, Math.round(dh))
  const beauty = filter?.beauty || {}
  const effects = filter?.effects || {}
  const gradeCss = getGradeCss(filter)
  // flipSource: actually mirror the drawn pixels (for raw/unmirrored camera frames).
  // mirrorLandmarks: map landmark X as (1-x) to align with a mirrored image space.
  // For preview (raw video -> mirrored selfie): flipSource true, mirrorLandmarks true.
  // For strip (image already mirrored): flipSource false, mirrorLandmarks true.
  const flipSource = !!options.flipSource
  const mirrorLandmarks =
    options.mirrorLandmarks != null ? !!options.mirrorLandmarks : !!options.mirrorX

  // Work canvas at destination size
  const work = ensureCanvas(_cache, 'work', w, h)
  const wctx = work.getContext('2d')
  if (!wctx) {
    ctx.save()
    if (flipSource) {
      ctx.translate(dx + dw, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh)
    } else {
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
    }
    ctx.restore()
    return
  }

  // 1) Base with color grading
  wctx.clearRect(0, 0, w, h)
  wctx.save()
  wctx.filter = gradeCss || 'none'
  if (flipSource) {
    wctx.translate(w, 0)
    wctx.scale(-1, 1)
  }
  wctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h)
  wctx.restore()
  wctx.filter = 'none'

  // Landmarks are normalized to the full source frame (0..1 over full width/height).
  // sx,sy,sw,sh define the crop region in that full frame mapped to (0,0,w,h).
  // mirrorLandmarks flips landmark X to align with mirrored image pixels.
  const fullW = options.srcWFull || (sx + sw) || sw
  const fullH = options.srcHFull || (sy + sh) || sh
  const toPointMapped = (lm) => {
    if (!lm) return { x: 0, y: 0 }
    const nx = mirrorLandmarks ? 1 - lm.x : lm.x
    const ny = lm.y
    const lx = nx * fullW
    const ly = ny * fullH
    return {
      x: ((lx - sx) / sw) * w,
      y: ((ly - sy) / sh) * h,
    }
  }

  // 2) Skin smoothing & whitening (need base-graded copy and skin mask)
  const needMask =
    faces?.length &&
    ((beauty.smooth ?? 0) > 0 || (beauty.whiten ?? 0) > 0)
  if (needMask) {
    const featherPx = Math.max(3, 10 * (w / 720))
    const maskAll = buildAllFaceMask(faces, toPointMapped, w, h, featherPx, _cache)

    if ((beauty.smooth ?? 0) > 0) {
      const baseCopy = ensureCanvas(_cache, 'baseCopy', w, h)
      const bctx = baseCopy.getContext('2d')
      if (bctx) {
        bctx.clearRect(0, 0, w, h)
        bctx.drawImage(work, 0, 0)
        applySkinSmoothing(wctx, baseCopy, w, h, maskAll, beauty, _cache)
      }
    }

    if ((beauty.whiten ?? 0) > 0) {
      applyFaceWhiten(wctx, w, h, maskAll, beauty, _cache)
    }
  }

  // 3) Cheek blush & lip tint (beauty makeup)
  if (faces?.length && (beauty.cheek ?? 0) > 0) {
    applyCheekBlush(wctx, faces, toPointMapped, beauty)
  }
  if (faces?.length && (beauty.lip ?? 0) > 0) {
    applyLipTint(wctx, faces, toPointMapped, beauty)
  }

  // Snapshot for effects that need current composite (after makeup so glow picks it up)
  const needSnap = (beauty.glow ?? 0) > 0 || (beauty.sharpen ?? 0) > 0
  let snap = null
  if (needSnap) {
    snap = ensureCanvas(_cache, 'snap', w, h)
    const sc = snap.getContext('2d')
    if (sc) {
      sc.clearRect(0, 0, w, h)
      sc.drawImage(work, 0, 0)
    }
  }

  // 4) Glow / soft focus
  if ((beauty.glow ?? 0) > 0 && snap) {
    applyGlow(wctx, snap, w, h, beauty, _cache)
  }

  // 5) Sharpen
  if ((beauty.sharpen ?? 0) > 0 && snap) {
    const snap2 = ensureCanvas(_cache, 'snap2', w, h)
    const sc2 = snap2.getContext('2d')
    if (sc2) {
      sc2.clearRect(0, 0, w, h)
      sc2.drawImage(work, 0, 0)
      applySharpen(wctx, snap2, w, h, beauty.sharpen, _cache)
    }
  }

  // 6) Tint overlay
  if (effects.tint) {
    applyTint(wctx, w, h, effects.tint)
  }

  // 7) Vignette
  if ((effects.vignette ?? 0) > 0) {
    applyVignette(wctx, w, h, effects.vignette)
  }

  // 8) Grain
  if ((effects.grain ?? 0) > 0) {
    applyGrain(wctx, w, h, effects.grain)
  }

  // Output to destination
  ctx.drawImage(work, 0, 0, w, h, dx, dy, dw, dh)
}

/**
 * Convenience: draw beautified full source covering destination rect (like drawCover result area).
 * faces in normalized full-source space.
 */
export function drawBeautifiedCover(ctx, source, dx, dy, dw, dh, filter, faces, options = {}, cache) {
  const iw = source.videoWidth || source.naturalWidth || source.width || 0
  const ih = source.videoHeight || source.naturalHeight || source.height || 0
  if (!iw || !ih) return
  const scale = Math.max(dw / iw, dh / ih)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (iw - sw) / 2
  const sy = (ih - sh) / 2
  drawBeautified(
    ctx,
    source,
    sx,
    sy,
    sw,
    sh,
    dx,
    dy,
    dw,
    dh,
    filter,
    faces,
    { ...options, srcWFull: iw, srcHFull: ih },
    cache,
  )
}
