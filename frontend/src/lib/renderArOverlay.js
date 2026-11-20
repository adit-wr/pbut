/**
 * Volumetric 3D AR face tracking overlays rendered on HTML5 Canvas.
 *
 * Every prop is built from layered gradients (ambient → body → specular
 * highlight), soft ambient-occlusion shadows and a subtle pose-based skew, so
 * the overlays read as solid volumes instead of flat stickers.
 *
 * All sizes derive from real face measurements:
 *  - hw  = half the head width (outer cheek landmarks) → head-mounted props
 *  - s   = eye distance                                   → face-mounted props
 */

// --- colour helpers ---------------------------------------------------------

function shiftColor(hex, percent) {
  if (!hex || hex[0] !== '#') return hex
  let base = hex.slice(1)
  if (base.length === 3) base = base[0] + base[0] + base[1] + base[1] + base[2] + base[2]
  const num = parseInt(base, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + percent))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent))
  const b = Math.min(255, Math.max(0, (num & 0xff) + percent))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/** Solid 3D sphere with drop shadow, body gradient, rim light and gloss. */
function sphere(ctx, cx, cy, r, color, gloss = '#ffffff', shadow = 0.32) {
  // Contact shadow
  ctx.save()
  ctx.fillStyle = `rgba(0,0,0,${shadow})`
  ctx.beginPath()
  ctx.ellipse(cx + r * 0.08, cy + r * 0.34, r * 0.92, r * 0.46, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Body
  const g = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.38, r * 0.04, cx, cy, r * 1.02)
  g.addColorStop(0, gloss === '#ffffff' ? shiftColor(color, 45) : gloss)
  g.addColorStop(0.28, color)
  g.addColorStop(0.82, shiftColor(color, -40))
  g.addColorStop(1, shiftColor(color, -70))

  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Rim light (bottom-right bounce)
  const rim = ctx.createRadialGradient(cx + r * 0.5, cy + r * 0.55, 0, cx + r * 0.5, cy + r * 0.55, r * 0.8)
  rim.addColorStop(0, 'rgba(255,255,255,0.18)')
  rim.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Specular hotspot
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.ellipse(cx - r * 0.33, cy - r * 0.4, r * 0.24, r * 0.14, -0.45, 0, Math.PI * 2)
  ctx.fill()
}

/** Rounded volumetric capsule (sunglasses barrel, hat bands, …). */
function capsule(ctx, x, y, w, h, color) {
  const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x - w / 2, y + h / 2)
  g.addColorStop(0, shiftColor(color, 55))
  g.addColorStop(0.35, color)
  g.addColorStop(0.75, shiftColor(color, -35))
  g.addColorStop(1, shiftColor(color, -65))

  ctx.fillStyle = g
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2)
  } else {
    ctx.rect(x - w / 2, y - h / 2, w, h)
  }
  ctx.fill()
}

/** Glowing 3D sparkle. */
function sparkle(ctx, cx, cy, r, color = '#facc15') {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = r * 1.2
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4
    const d = i % 2 === 0 ? r : r * 0.32
    const x = cx + Math.cos(a) * d
    const y = cy + Math.sin(a) * d
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Volumetric heart. */
function heart(ctx, x, y, size, color = '#f43f5e') {
  ctx.save()
  ctx.translate(x, y)

  const path = () => {
    const t = size * 0.3
    ctx.beginPath()
    ctx.moveTo(0, t)
    ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, t)
    ctx.bezierCurveTo(-size / 2, (size + t) / 2, 0, (size + t) / 1.5, 0, size)
    ctx.bezierCurveTo(0, (size + t) / 1.5, size / 2, (size + t) / 2, size / 2, t)
    ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, t)
    ctx.closePath()
  }

  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.beginPath()
  ctx.ellipse(size * 0.08, size * 0.95, size * 0.42, size * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()

  const g = ctx.createRadialGradient(-size * 0.18, size * 0.02, size * 0.04, 0, size * 0.45, size * 0.95)
  g.addColorStop(0, shiftColor(color, 70))
  g.addColorStop(0.35, color)
  g.addColorStop(1, shiftColor(color, -70))

  path()
  ctx.fillStyle = g
  ctx.fill()

  // Gloss
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.ellipse(-size * 0.24, size * 0.26, size * 0.11, size * 0.06, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Soft blush puff. */
function blush(ctx, x, y, r, color = '251, 113, 133') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(${color}, 0.5)`)
  g.addColorStop(0.6, `rgba(${color}, 0.22)`)
  g.addColorStop(1, `rgba(${color}, 0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

// --- face geometry ----------------------------------------------------------

function extract3DFaceGeometry(landmarks, toCanvas) {
  const p = (idx) => {
    const lm = landmarks[idx] || landmarks[0]
    return toCanvas(lm.x, lm.y)
  }

  const eyeL = p(468) || p(33)
  const eyeR = p(473) || p(263)
  const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 }
  const eyeDist = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y) || 100
  const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x)

  const forehead = p(10)
  const chin = p(152)
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) || eyeDist * 2

  const nose = p(1)
  const noseBase = p(2)
  const cheekL = p(234)
  const cheekR = p(454)
  const blushL = p(205) || p(116)
  const blushR = p(425) || p(345)

  const mouthTop = p(13)
  const mouthBottom = p(14)
  const mouthL = p(61)
  const mouthR = p(291)
  const mouthOpen = Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y) / faceHeight > 0.045

  // Pose estimation (yaw / pitch) for a bit of 3D parallax.
  const distL = Math.hypot(nose.x - cheekL.x, nose.y - cheekL.y)
  const distR = Math.hypot(cheekR.x - nose.x, cheekR.y - nose.y)
  const yaw = (distR - distL) / (distR + distL || 1)

  const eyeNose = Math.hypot(nose.y - eyeMid.y, nose.x - eyeMid.x)
  const pitch = (eyeNose / (faceHeight || 1) - 0.28) * 2

  const headW = Math.hypot(cheekR.x - cheekL.x, cheekR.y - cheekL.y) || eyeDist * 1.55
  const hw = headW / 2

  // Anchor for head-mounted props: the hairline, nudged up a touch.
  const headTop = {
    x: forehead.x - Math.sin(roll) * (faceHeight * 0.07) + yaw * (hw * 0.45),
    y: forehead.y - Math.cos(roll) * (faceHeight * 0.07) + pitch * (eyeDist * 0.25),
  }

  return {
    eyeL,
    eyeR,
    eyeMid,
    eyeDist,
    eyeDistH: hw,
    hw,
    headW,
    roll,
    yaw,
    pitch,
    forehead,
    chin,
    faceHeight,
    nose,
    noseBase,
    cheekL,
    cheekR,
    blushL,
    blushR,
    mouthTop,
    mouthBottom,
    mouthL,
    mouthR,
    mouthOpen,
    headTop,
  }
}

// --- 20 volumetric renderers ------------------------------------------------

const RENDERERS_3D = {
  // 1. Puppy 🐶 — floppy volumetric ears + glossy nose + tongue
  puppy(ctx, g) {
    const h = g.hw
    const s = g.eyeDist

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const ear = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.72, h * 0.1)
      ctx.rotate(0.5)

      // Ear silhouette path
      const rx = h * 0.34
      const ry = h * 0.66
      const path = () => {
        ctx.beginPath()
        ctx.ellipse(0, ry * 0.42, rx, ry, 0.08, 0, Math.PI * 2)
      }

      // Contact shadow
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.beginPath()
      ctx.ellipse(h * 0.04, ry * 0.5, rx * 1.05, ry * 1.02, 0.08, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      path()
      const outer = ctx.createLinearGradient(-rx, 0, rx, ry)
      outer.addColorStop(0, '#c2703a')
      outer.addColorStop(0.35, '#8a4a1d')
      outer.addColorStop(1, '#3f1d08')
      ctx.fillStyle = outer
      ctx.fill()

      // Inner ear volume
      ctx.save()
      ctx.clip()
      const inner = ctx.createRadialGradient(-rx * 0.2, ry * 0.35, rx * 0.1, 0, ry * 0.5, ry)
      inner.addColorStop(0, '#f0a2b6')
      inner.addColorStop(0.7, '#b56a4a')
      inner.addColorStop(1, '#5a2a10')
      ctx.fillStyle = inner
      ctx.beginPath()
      ctx.ellipse(0, ry * 0.5, rx * 0.56, ry * 0.72, 0.08, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Specular streak
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = Math.max(2, rx * 0.08)
      ctx.beginPath()
      ctx.ellipse(0, ry * 0.4, rx * 0.8, ry * 0.86, 0.08, Math.PI * 0.95, Math.PI * 1.55)
      ctx.stroke()
      ctx.restore()
    }

    ear(-1)
    ear(1)
    ctx.restore()

    // Glossy nose
    sphere(ctx, g.nose.x, g.nose.y, s * 0.27, '#242c3a', '#ffffff', 0.4)

    // Tongue (hangs from the lower lip)
    ctx.save()
    ctx.translate(g.mouthBottom.x, g.mouthBottom.y - s * 0.02)
    ctx.rotate(g.roll)
    const tw = s * 0.42
    const th = s * (g.mouthOpen ? 0.72 : 0.5)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(0, th * 0.75, tw * 0.5, th * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()

    const tg = ctx.createLinearGradient(-tw / 2, 0, tw / 2, th)
    tg.addColorStop(0, '#c81e4a')
    tg.addColorStop(0.45, '#fb7185')
    tg.addColorStop(1, '#9f1239')
    ctx.fillStyle = tg
    ctx.beginPath()
    ctx.moveTo(-tw * 0.5, 0)
    ctx.quadraticCurveTo(-tw * 0.62, th * 0.92, 0, th)
    ctx.quadraticCurveTo(tw * 0.62, th * 0.92, tw * 0.5, 0)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = 'rgba(127,29,29,0.85)'
    ctx.lineWidth = Math.max(1.5, s * 0.03)
    ctx.beginPath()
    ctx.moveTo(0, th * 0.12)
    ctx.lineTo(0, th * 0.72)
    ctx.stroke()
    ctx.restore()
  },

  // 2. Kitty 🐱 — pointed 3D ears, gem nose, whiskers
  kitty(ctx, g) {
    const h = g.hw
    const s = g.eyeDist

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const catEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.6, h * 0.08)
      ctx.rotate(0.16)

      const bw = h * 0.34
      const bh = h * 0.62

      const path = () => {
        ctx.beginPath()
        ctx.moveTo(-bw, 0)
        ctx.quadraticCurveTo(-bw * 0.35, -bh * 0.72, 0, -bh)
        ctx.quadraticCurveTo(bw * 0.35, -bh * 0.72, bw, 0)
        ctx.closePath()
      }

      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.beginPath()
      ctx.ellipse(0, bh * 0.12, bw * 1.05, bh * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      path()
      const outer = ctx.createLinearGradient(-bw, 0, bw, -bh)
      outer.addColorStop(0, '#cbd5e1')
      outer.addColorStop(0.45, '#ffffff')
      outer.addColorStop(1, '#b6c2d1')
      ctx.fillStyle = outer
      ctx.fill()

      ctx.save()
      path()
      ctx.clip()
      const inner = ctx.createLinearGradient(0, -bh, 0, 0)
      inner.addColorStop(0, '#ff9fb8')
      inner.addColorStop(0.55, '#f472b6')
      inner.addColorStop(1, '#be185d')
      ctx.fillStyle = inner
      ctx.beginPath()
      ctx.moveTo(-bw * 0.6, -bh * 0.06)
      ctx.quadraticCurveTo(-bw * 0.2, -bh * 0.62, 0, -bh * 0.82)
      ctx.quadraticCurveTo(bw * 0.2, -bh * 0.62, bw * 0.6, -bh * 0.06)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.restore()
    }

    catEar(-1)
    catEar(1)
    ctx.restore()

    // Pink gem nose
    sphere(ctx, g.nose.x, g.nose.y, s * 0.18, '#f43f5e', '#fecdd3', 0.3)

    // Whiskers with a soft shadow so they read over any background
    const whiskers = (side, x, y) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(g.roll)
      ctx.scale(side, 1)
      ctx.lineCap = 'round'
      const len = s * 1.05
      ;[-0.16, 0, 0.16].forEach((angle, i) => {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'
        ctx.lineWidth = Math.max(3, s * 0.055)
        ctx.beginPath()
        ctx.moveTo(s * 0.12, i * 0.5 + 1.5)
        ctx.lineTo(s * 0.12 + Math.cos(angle) * len, Math.sin(angle) * len + 1.5)
        ctx.stroke()

        ctx.strokeStyle = 'rgba(255,255,255,0.96)'
        ctx.lineWidth = Math.max(2.2, s * 0.04)
        ctx.beginPath()
        ctx.moveTo(s * 0.12, i * 0.5)
        ctx.lineTo(s * 0.12 + Math.cos(angle) * len, Math.sin(angle) * len)
        ctx.stroke()
      })
      ctx.restore()
    }

    whiskers(-1, g.blushL.x, g.blushL.y)
    whiskers(1, g.blushR.x, g.blushR.y)
  },

  // 3. Bunny 🐰 — tall soft ears + button nose
  bunny(ctx, g) {
    const { hw: h, eyeDist: s } = g

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const bunnyEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.4, 0)
      ctx.rotate(-0.08)

      const rx = h * 0.22
      const ry = h * 0.8
      const cy = -ry * 0.72

      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      ctx.beginPath()
      ctx.ellipse(rx * 0.3, cy + ry * 0.1, rx * 1.15, ry * 1.05, 0, 0, Math.PI * 2)
      ctx.fill()

      const outer = ctx.createLinearGradient(-rx, 0, rx, 0)
      outer.addColorStop(0, '#c8d3e0')
      outer.addColorStop(0.4, '#ffffff')
      outer.addColorStop(1, '#aebbcb')
      ctx.fillStyle = outer
      ctx.beginPath()
      ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()

      const inner = ctx.createLinearGradient(0, cy - ry, 0, cy + ry)
      inner.addColorStop(0, '#f43f5e')
      inner.addColorStop(0.6, '#fb7185')
      inner.addColorStop(1, '#be123c')
      ctx.fillStyle = inner
      ctx.beginPath()
      ctx.ellipse(0, cy, rx * 0.55, ry * 0.78, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.ellipse(-rx * 0.4, cy - ry * 0.35, rx * 0.16, ry * 0.22, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    bunnyEar(-1)
    bunnyEar(1)
    ctx.restore()

    sphere(ctx, g.nose.x, g.nose.y, s * 0.16, '#fb7185', '#ffffff', 0.28)
    blush(ctx, g.blushL.x, g.blushL.y, s * 0.42, '244, 114, 182')
    blush(ctx, g.blushR.x, g.blushR.y, s * 0.42, '244, 114, 182')
  },

  // 4. Teddy Bear 🐻 — fuzzy round ears + muzzle
  bear(ctx, g) {
    const { hw: h, eyeDist: s } = g

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const bearEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.66, h * 0.22)
      sphere(ctx, 0, 0, h * 0.3, '#7c4a21', '#b98456', 0.26)
      sphere(ctx, 0, 0, h * 0.17, '#e6c48f', '#fff6e0', 0.12)
      ctx.restore()
    }

    bearEar(-1)
    bearEar(1)
    ctx.restore()

    // Muzzle
    ctx.save()
    ctx.translate(g.nose.x, g.nose.y + s * 0.1)
    ctx.rotate(g.roll)
    sphere(ctx, 0, 0, s * 0.5, '#e8cfa4', '#fffaf0', 0.14)
    sphere(ctx, 0, -s * 0.08, s * 0.2, '#2b2118', '#a3958a', 0.2)
    // Muzzle split
    ctx.strokeStyle = 'rgba(90,60,30,0.55)'
    ctx.lineWidth = Math.max(1.2, s * 0.02)
    ctx.beginPath()
    ctx.moveTo(0, s * 0.02)
    ctx.lineTo(0, s * 0.16)
    ctx.stroke()
    ctx.restore()
  },

  // 5. Froggy 🐸 — bulging volumetric eyes
  froggy(ctx, g) {
    const { hw: h } = g

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const frogEye = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.52, -h * 0.16)
      sphere(ctx, 0, 0, h * 0.27, '#3fa34d', '#b9f6a0', 0.3)
      sphere(ctx, 0, 0, h * 0.185, '#ffffff', '#ffffff', 0.1)
      sphere(ctx, 0, 0, h * 0.105, '#101a2b', '#5b7089', 0.05)
      // catchlight
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(-h * 0.045, -h * 0.05, h * 0.032, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    frogEye(-1)
    frogEye(1)
    ctx.restore()

    blush(ctx, g.blushL.x, g.blushL.y, g.eyeDist * 0.34, '251, 146, 160')
    blush(ctx, g.blushR.x, g.blushR.y, g.eyeDist * 0.34, '251, 146, 160')
  },

  // 6. Panda 🐼 — black ears, eye patches, nose
  panda(ctx, g) {
    const { hw: h, eyeDist: s } = g

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const pandaEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.68, h * 0.16)
      sphere(ctx, 0, 0, h * 0.28, '#1b2432', '#6b7c93', 0.26)
      ctx.restore()
    }

    pandaEar(-1)
    pandaEar(1)
    ctx.restore()

    // Eye patches (soft volume)
    const patch = (eye) => {
      ctx.save()
      // Nudge slightly towards the temples so the two patches stay separate.
      ctx.translate(eye.x + (eye.x - g.eyeMid.x) * 0.28, eye.y + s * 0.02)
      ctx.rotate(g.roll)
      const rx = s * 0.5
      const ry = s * 0.44
      const p = ctx.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx)
      p.addColorStop(0, 'rgba(16,24,38,0.72)')
      p.addColorStop(0.7, 'rgba(16,24,38,0.42)')
      p.addColorStop(1, 'rgba(16,24,38,0.02)')
      ctx.fillStyle = p
      ctx.beginPath()
      ctx.ellipse(0, 0, rx, ry, 0.32, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    patch(g.eyeL)
    patch(g.eyeR)

    sphere(ctx, g.nose.x, g.nose.y, s * 0.22, '#1b2432', '#a8b6c8', 0.26)
  },

  // 7. Reindeer 🦌 — antlers + glowing nose
  reindeer(ctx, g) {
    const { hw: h, eyeDist: s } = g

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const antler = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.5, h * 0.04)
      ctx.rotate(0.24)

      const beam = () => {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.bezierCurveTo(-h * 0.16, -h * 0.36, -h * 0.22, -h * 0.66, -h * 0.08, -h * 1.02)
      }

      // Shadow pass
      ctx.save()
      ctx.translate(h * 0.02, h * 0.03)
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'
      ctx.lineCap = 'round'
      ctx.lineWidth = h * 0.1
      beam()
      ctx.stroke()
      ctx.restore()

      // Main beam
      const grad = ctx.createLinearGradient(0, 0, -h * 0.1, -h * 1.05)
      grad.addColorStop(0, '#6b3f14')
      grad.addColorStop(0.5, '#a9722f')
      grad.addColorStop(1, '#d9b476')
      ctx.strokeStyle = grad
      ctx.lineCap = 'round'
      ctx.lineWidth = h * 0.085
      beam()
      ctx.stroke()

      // Tines
      ctx.lineWidth = h * 0.065
      const tine = (x1, y1, x2, y2) => {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.quadraticCurveTo((x1 + x2) / 2, y1 - h * 0.05, x2, y2)
        ctx.stroke()
      }
      tine(-h * 0.13, -h * 0.38, h * 0.22, -h * 0.58)
      tine(-h * 0.17, -h * 0.7, h * 0.14, -h * 0.92)
      ctx.restore()
    }

    antler(-1)
    antler(1)
    ctx.restore()

    // Glow + glossy red nose
    ctx.save()
    const glow = ctx.createRadialGradient(
      g.nose.x,
      g.nose.y,
      s * 0.1,
      g.nose.x,
      g.nose.y,
      s * 0.95,
    )
    glow.addColorStop(0, 'rgba(239,68,68,0.55)')
    glow.addColorStop(1, 'rgba(239,68,68,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(g.nose.x, g.nose.y, s * 0.95, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    sphere(ctx, g.nose.x, g.nose.y, s * 0.27, '#e11d48', '#ffd1d1', 0.34)
  },

  // 8. Crown 👑 — metallic gold, jewels
  crown(ctx, g) {
    const { hw: h } = g
    const w = h * 1.9
    const ht = h * 0.95

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const crownPath = () => {
      ctx.beginPath()
      ctx.moveTo(-w * 0.5, 0)
      ctx.lineTo(-w * 0.46, -ht * 0.72)
      ctx.lineTo(-w * 0.24, -ht * 0.4)
      ctx.lineTo(0, -ht)
      ctx.lineTo(w * 0.24, -ht * 0.4)
      ctx.lineTo(w * 0.46, -ht * 0.72)
      ctx.lineTo(w * 0.5, 0)
      ctx.closePath()
    }

    // Contact shadow
    ctx.save()
    ctx.translate(h * 0.03, h * 0.04)
    crownPath()
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.fill()
    ctx.restore()

    crownPath()
    const gold = ctx.createLinearGradient(-w * 0.5, -ht, w * 0.5, 0)
    gold.addColorStop(0, '#fff7c2')
    gold.addColorStop(0.22, '#f7cf3a')
    gold.addColorStop(0.5, '#d99a10')
    gold.addColorStop(0.78, '#f7cf3a')
    gold.addColorStop(1, '#8a5a05')
    ctx.fillStyle = gold
    ctx.fill()

    // Base band (darker metal)
    const band = ctx.createLinearGradient(0, -ht * 0.16, 0, 0)
    band.addColorStop(0, '#b07b0c')
    band.addColorStop(0.5, '#8a5a05')
    band.addColorStop(1, '#6b4403')
    ctx.fillStyle = band
    ctx.fillRect(-w * 0.5, -ht * 0.16, w, ht * 0.16)

    // Jewels
    sphere(ctx, -w * 0.3, -ht * 0.075, h * 0.055, '#e11d48', '#ffb3c1', 0.2)
    sphere(ctx, 0, -ht * 0.075, h * 0.065, '#2563eb', '#bfdbfe', 0.2)
    sphere(ctx, w * 0.3, -ht * 0.075, h * 0.055, '#059669', '#a7f3d0', 0.2)
    sphere(ctx, 0, -ht * 1.02, h * 0.075, '#fde68a', '#ffffff', 0.14)

    ctx.restore()
  },

  // 9. Flower Wreath 🌸
  flower_crown(ctx, g) {
    const { hw: h } = g
    const r = h * 0.92
    const colors = ['#f472b6', '#fde047', '#fb7185', '#c084fc', '#38bdf8', '#4ade80', '#fda4af']

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y + h * 0.14)
    ctx.rotate(g.roll)

    // Vine
    ctx.strokeStyle = '#3f8f4a'
    ctx.lineWidth = Math.max(2, h * 0.035)
    ctx.beginPath()
    ctx.arc(0, h * 0.5, r, Math.PI * 1.16, Math.PI * 1.84)
    ctx.stroke()

    const count = 7
    for (let i = 0; i < count; i += 1) {
      const a = Math.PI * 1.18 + (i / (count - 1)) * (Math.PI * 0.64)
      const fx = Math.cos(a) * r
      const fy = h * 0.5 + Math.sin(a) * r
      const pr = h * 0.115
      const col = colors[i % colors.length]

      // Petals
      for (let p = 0; p < 5; p += 1) {
        const pa = (p * Math.PI * 2) / 5 + i * 0.4
        sphere(ctx, fx + Math.cos(pa) * pr * 0.75, fy + Math.sin(pa) * pr * 0.75, pr * 0.62, col, '#ffffff', 0.14)
      }
      sphere(ctx, fx, fy, pr * 0.45, '#fde68a', '#ffffff', 0.14)
    }
    ctx.restore()
  },

  // 10. Angel Halo 😇
  angel(ctx, g) {
    const { hw: h } = g
    const rx = h * 0.78
    const ry = h * 0.24

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y - h * 0.34)
    ctx.rotate(g.roll)

    // Outer bloom
    const bloom = ctx.createRadialGradient(0, 0, rx * 0.6, 0, 0, rx * 1.25)
    bloom.addColorStop(0, 'rgba(253,224,71,0.5)')
    bloom.addColorStop(1, 'rgba(253,224,71,0)')
    ctx.fillStyle = bloom
    ctx.beginPath()
    ctx.ellipse(0, 0, rx * 1.25, ry * 2.4, 0, 0, Math.PI * 2)
    ctx.fill()

    // Torus body
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#b07b0c'
    ctx.lineWidth = Math.max(4, h * 0.1)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = '#fde047'
    ctx.lineWidth = Math.max(3, h * 0.07)
    ctx.beginPath()
    ctx.ellipse(0, -h * 0.012, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = '#fffbe8'
    ctx.lineWidth = Math.max(1.5, h * 0.028)
    ctx.beginPath()
    ctx.ellipse(0, -h * 0.02, rx * 0.97, ry * 0.9, 0, Math.PI * 1.05, Math.PI * 1.9)
    ctx.stroke()

    sparkle(ctx, -rx * 0.85, -ry * 1.6, h * 0.12, '#ffffff')
    sparkle(ctx, rx * 0.78, -ry * 1.9, h * 0.15, '#fef08a')
    sparkle(ctx, rx * 1.05, ry * 1.1, h * 0.09, '#fef08a')
    ctx.restore()
  },

  // 11. Devil Horns 😈
  devil(ctx, g) {
    const { hw: h } = g

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    const horn = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(h * 0.5, -h * 0.02)
      ctx.rotate(-0.1)

      const bw = h * 0.2
      const ht = h * 0.9

      const path = () => {
        ctx.beginPath()
        ctx.moveTo(-bw, 0)
        ctx.bezierCurveTo(-bw * 1.05, -ht * 0.45, -bw * 0.25, -ht * 0.86, bw * 0.55, -ht)
        ctx.bezierCurveTo(bw * 0.1, -ht * 0.5, bw * 0.95, -ht * 0.2, bw * 1.05, 0)
        ctx.closePath()
      }

      ctx.save()
      ctx.translate(h * 0.02, h * 0.03)
      path()
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fill()
      ctx.restore()

      path()
      const grad = ctx.createLinearGradient(-bw, 0, bw * 1.1, -ht)
      grad.addColorStop(0, '#65090f')
      grad.addColorStop(0.4, '#c81e2c')
      grad.addColorStop(0.78, '#f87171')
      grad.addColorStop(1, '#ffc4c4')
      ctx.fillStyle = grad
      ctx.fill()

      // Sheen
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = Math.max(1.5, h * 0.018)
      ctx.beginPath()
      ctx.moveTo(-bw * 0.3, -ht * 0.1)
      ctx.quadraticCurveTo(-bw * 0.35, -ht * 0.5, bw * 0.28, -ht * 0.86)
      ctx.stroke()
      ctx.restore()
    }

    horn(-1)
    horn(1)
    ctx.restore()
  },

  // 12. Strawberry 🍓
  strawberry(ctx, g) {
    const { hw: h } = g
    const rx = h * 0.62
    const ry = h * 0.5
    const cy = -h * 0.32

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    // Body
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.ellipse(h * 0.04, cy + ry * 0.5, rx * 1.02, ry * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    const body = ctx.createRadialGradient(-rx * 0.3, cy - ry * 0.35, rx * 0.1, 0, cy + ry * 0.25, rx * 1.15)
    body.addColorStop(0, '#ff8a8a')
    body.addColorStop(0.35, '#e11d48')
    body.addColorStop(0.8, '#9f1239')
    body.addColorStop(1, '#5c0a1f')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()

    // Seeds
    const seeds = [
      [-0.42, -0.28], [0, -0.4], [0.42, -0.28],
      [-0.24, 0.02], [0.24, 0.02], [0, 0.24],
    ]
    seeds.forEach(([sx, sy]) => {
      ctx.save()
      ctx.translate(rx * sx, cy + ry * sy)
      ctx.rotate(-0.25)
      const sg = ctx.createLinearGradient(0, -1, 0, 2)
      sg.addColorStop(0, '#fff7b0')
      sg.addColorStop(1, '#d9a800')
      ctx.fillStyle = sg
      ctx.beginPath()
      ctx.ellipse(0, 0, h * 0.026, h * 0.045, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })

    // Calyx (green leaves)
    const leaf = (angle, len) => {
      ctx.save()
      ctx.rotate(angle)
      const lg = ctx.createLinearGradient(0, 0, 0, -len)
      lg.addColorStop(0, '#166534')
      lg.addColorStop(0.55, '#22c55e')
      lg.addColorStop(1, '#86efac')
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.moveTo(0, cy - ry * 0.72)
      ctx.quadraticCurveTo(len * 0.42, cy - ry * 0.72 - len * 0.55, 0, cy - ry * 0.72 - len)
      ctx.quadraticCurveTo(-len * 0.42, cy - ry * 0.72 - len * 0.55, 0, cy - ry * 0.72)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    ;[-0.85, -0.42, 0, 0.42, 0.85].forEach((a) => leaf(a, h * 0.26))
    ctx.restore()

    blush(ctx, g.blushL.x, g.blushL.y, g.eyeDist * 0.4)
    blush(ctx, g.blushR.x, g.blushR.y, g.eyeDist * 0.4)
  },

  // 13. Toadstool 🍄
  mushroom(ctx, g) {
    const { hw: h } = g
    const rw = h * 0.85
    const rh = h * 0.62

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    // Dome
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.24)'
    ctx.beginPath()
    ctx.ellipse(h * 0.04, rh * 0.16, rw * 1.02, rh * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    const dome = ctx.createRadialGradient(-rw * 0.35, -rh * 0.9, rw * 0.1, 0, -rh * 0.2, rw * 1.1)
    dome.addColorStop(0, '#ff9aa8')
    dome.addColorStop(0.3, '#e11d48')
    dome.addColorStop(0.75, '#9f1239')
    dome.addColorStop(1, '#4c0519')
    ctx.fillStyle = dome
    ctx.beginPath()
    ctx.ellipse(0, 0, rw, rh, 0, Math.PI, 0)
    ctx.closePath()
    ctx.fill()

    // Underside (gill plate)
    const gill = ctx.createLinearGradient(0, -rh * 0.06, 0, rh * 0.16)
    gill.addColorStop(0, '#fff8e1')
    gill.addColorStop(1, '#d8c9a8')
    ctx.fillStyle = gill
    ctx.beginPath()
    ctx.ellipse(0, 0, rw, rh * 0.16, 0, 0, Math.PI)
    ctx.fill()

    // Polka dots
    ;[
      [0, -rh * 0.55, h * 0.13],
      [-rw * 0.5, -rh * 0.32, h * 0.1],
      [rw * 0.5, -rh * 0.32, h * 0.1],
      [-rw * 0.22, -rh * 0.7, h * 0.075],
      [rw * 0.24, -rh * 0.72, h * 0.07],
    ].forEach(([dx, dy, dr]) => sphere(ctx, dx, dy, dr, '#fffdf5', '#ffffff', 0.1))

    ctx.restore()
    blush(ctx, g.blushL.x, g.blushL.y, g.eyeDist * 0.38, '251, 146, 160')
    blush(ctx, g.blushR.x, g.blushR.y, g.eyeDist * 0.38, '251, 146, 160')
  },

  // 14. Ribbon 🎀
  ribbon(ctx, g) {
    const { hw: h } = g
    const loopW = h * 0.8
    const loopH = h * 0.55

    ctx.save()
    ctx.translate(g.headTop.x - h * 0.1, g.headTop.y - h * 0.06)
    ctx.rotate(g.roll - 0.12)

    const bow = (side) => {
      ctx.save()
      ctx.scale(side, 1)

      const path = () => {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.bezierCurveTo(loopW * 0.35, -loopH * 1.05, loopW * 1.05, -loopH * 0.72, loopW * 0.92, 0)
        ctx.bezierCurveTo(loopW * 1.05, loopH * 0.72, loopW * 0.35, loopH * 1.05, 0, 0)
        ctx.closePath()
      }

      ctx.save()
      ctx.translate(h * 0.02, h * 0.035)
      path()
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fill()
      ctx.restore()

      path()
      const grad = ctx.createLinearGradient(0, -loopH, loopW, loopH)
      grad.addColorStop(0, '#ffd1e6')
      grad.addColorStop(0.4, '#f472b6')
      grad.addColorStop(0.8, '#be185d')
      grad.addColorStop(1, '#7d0f3c')
      ctx.fillStyle = grad
      ctx.fill()

      // Fold shadow
      ctx.fillStyle = 'rgba(127,15,60,0.35)'
      ctx.beginPath()
      ctx.ellipse(loopW * 0.5, 0, loopW * 0.16, loopH * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()

      // Sheen
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = Math.max(1.5, h * 0.02)
      ctx.beginPath()
      ctx.moveTo(loopW * 0.2, -loopH * 0.42)
      ctx.quadraticCurveTo(loopW * 0.62, -loopH * 0.62, loopW * 0.82, -loopH * 0.14)
      ctx.stroke()
      ctx.restore()
    }

    bow(-1)
    bow(1)

    // Knot
    sphere(ctx, 0, 0, h * 0.17, '#ec4899', '#ffe0f0', 0.2)

    // Tails
    ctx.save()
    ctx.strokeStyle = '#f0559b'
    ctx.lineWidth = Math.max(3, h * 0.05)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-h * 0.02, h * 0.1)
    ctx.quadraticCurveTo(-h * 0.18, h * 0.34, -h * 0.1, h * 0.5)
    ctx.moveTo(h * 0.02, h * 0.1)
    ctx.quadraticCurveTo(h * 0.18, h * 0.34, h * 0.1, h * 0.5)
    ctx.stroke()
    ctx.restore()
    ctx.restore()
  },

  // 15. Heart Blush 💖
  heart_blush(ctx, g) {
    const s = g.eyeDist
    heart(ctx, g.blushL.x, g.blushL.y - s * 0.16, s * 0.52, '#f43f5e')
    heart(ctx, g.blushR.x, g.blushR.y - s * 0.16, s * 0.52, '#f43f5e')

    heart(ctx, g.headTop.x - s * 0.55, g.headTop.y - s * 0.32, s * 0.26, '#fb7185')
    heart(ctx, g.headTop.x + s * 0.5, g.headTop.y - s * 0.46, s * 0.32, '#fda4af')
    heart(ctx, g.headTop.x, g.headTop.y - s * 0.62, s * 0.2, '#fb7185')
  },

  // 16. Star Glam ✨
  star_glam(ctx, g) {
    const s = g.eyeDist
    sparkle(ctx, g.blushL.x, g.blushL.y, s * 0.3, '#facc15')
    sparkle(ctx, g.blushR.x, g.blushR.y, s * 0.3, '#facc15')
    sparkle(ctx, g.headTop.x, g.headTop.y + s * 0.18, s * 0.34, '#ffffff')
    sparkle(ctx, g.blushL.x - s * 0.3, g.blushL.y - s * 0.24, s * 0.14, '#ffffff')
    sparkle(ctx, g.blushR.x + s * 0.3, g.blushR.y - s * 0.2, s * 0.14, '#ffffff')
  },

  // 17. Cyber Shades 🕶️
  shades(ctx, g) {
    const s = g.eyeDist
    const w = s * 2.25
    const hh = s * 0.8

    ctx.save()
    ctx.translate(g.eyeMid.x, g.eyeMid.y - s * 0.02)
    ctx.rotate(g.roll)

    // Temple arms
    capsule(ctx, -w * 0.52, -s * 0.04, w * 0.16, s * 0.08, '#111827')
    capsule(ctx, w * 0.52, -s * 0.04, w * 0.16, s * 0.08, '#111827')

    // Frame
    capsule(ctx, 0, 0, w, hh, '#101828')

    // Lenses
    const lens = (cx, c1) => {
      const lg = ctx.createLinearGradient(cx - w * 0.2, -hh * 0.3, cx + w * 0.2, hh * 0.3)
      lg.addColorStop(0, shiftColor(c1, 55))
      lg.addColorStop(0.5, c1)
      lg.addColorStop(1, shiftColor(c1, -55))
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.roundRect(cx - w * 0.2, -hh * 0.32, w * 0.38, hh * 0.64, s * 0.12)
      ctx.fill()

      // Reflection
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(cx - w * 0.2, -hh * 0.32, w * 0.38, hh * 0.64, s * 0.12)
      ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.42)'
      ctx.beginPath()
      ctx.moveTo(cx - w * 0.24, hh * 0.4)
      ctx.lineTo(cx - w * 0.02, -hh * 0.42)
      ctx.lineTo(cx + w * 0.08, -hh * 0.42)
      ctx.lineTo(cx - w * 0.14, hh * 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    lens(-w * 0.235, '#0891b2')
    lens(w * 0.235, '#c026d3')

    // Bridge
    capsule(ctx, 0, -hh * 0.06, w * 0.1, hh * 0.12, '#1f2937')
    ctx.restore()
  },

  // 18. Gentleman 👓
  retro_glasses(ctx, g) {
    const s = g.eyeDist
    const r = s * 0.4

    ctx.save()
    ctx.translate(g.eyeMid.x, g.eyeMid.y)
    ctx.rotate(g.roll)

    const ring = (cx) => {
      // Frame shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'
      ctx.lineWidth = Math.max(4, s * 0.075)
      ctx.beginPath()
      ctx.arc(cx + s * 0.015, s * 0.02, r, 0, Math.PI * 2)
      ctx.stroke()

      // Metallic frame
      const metal = ctx.createLinearGradient(cx - r, -r, cx + r, r)
      metal.addColorStop(0, '#f8fafc')
      metal.addColorStop(0.35, '#64748b')
      metal.addColorStop(0.6, '#1e293b')
      metal.addColorStop(1, '#94a3b8')
      ctx.strokeStyle = metal
      ctx.lineWidth = Math.max(3, s * 0.055)
      ctx.beginPath()
      ctx.arc(cx, 0, r, 0, Math.PI * 2)
      ctx.stroke()

      // Lens glint
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = Math.max(1.5, s * 0.02)
      ctx.beginPath()
      ctx.arc(cx, 0, r * 0.82, Math.PI * 1.1, Math.PI * 1.55)
      ctx.stroke()
    }

    ring(-s * 0.56)
    ring(s * 0.56)

    // Bridge
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = Math.max(2.5, s * 0.045)
    ctx.beginPath()
    ctx.moveTo(-s * 0.56 + r, -r * 0.1)
    ctx.quadraticCurveTo(0, -r * 0.5, s * 0.56 - r, -r * 0.1)
    ctx.stroke()
    ctx.restore()

    // Curled 3D moustache
    ctx.save()
    ctx.translate(g.noseBase.x, g.noseBase.y + s * 0.14)
    ctx.rotate(g.roll)

    const wing = (side) => {
      ctx.save()
      ctx.scale(side, 1)

      const mw = s * 0.72
      const path = () => {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.bezierCurveTo(mw * 0.3, -s * 0.1, mw * 0.72, -s * 0.02, mw * 0.86, s * 0.12)
        ctx.bezierCurveTo(mw * 0.92, -s * 0.02, mw * 0.82, -s * 0.18, mw * 0.7, -s * 0.16)
        ctx.bezierCurveTo(mw * 0.4, -s * 0.18, mw * 0.16, -s * 0.08, 0, s * 0.06)
        ctx.closePath()
      }

      path()
      const grad = ctx.createLinearGradient(0, -s * 0.2, mw * 0.9, s * 0.16)
      grad.addColorStop(0, '#3b4657')
      grad.addColorStop(0.45, '#171e29')
      grad.addColorStop(1, '#0a0f16')
      ctx.fillStyle = grad
      ctx.fill()

      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = Math.max(1.2, s * 0.016)
      ctx.beginPath()
      ctx.moveTo(mw * 0.14, -s * 0.01)
      ctx.quadraticCurveTo(mw * 0.55, -s * 0.11, mw * 0.78, -s * 0.02)
      ctx.stroke()
      ctx.restore()
    }

    wing(-1)
    wing(1)
    ctx.restore()
  },

  // 19. Cowboy Hat 🤠
  cowboy(ctx, g) {
    const { hw: h } = g
    const brimW = h * 1.25

    ctx.save()
    ctx.translate(g.headTop.x, g.headTop.y)
    ctx.rotate(g.roll)

    // Brim
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(h * 0.04, h * 0.1, brimW, h * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    const brim = ctx.createLinearGradient(0, -h * 0.22, 0, h * 0.24)
    brim.addColorStop(0, '#a9743c')
    brim.addColorStop(0.45, '#7c4a1e')
    brim.addColorStop(1, '#3b1d06')
    ctx.fillStyle = brim
    ctx.beginPath()
    ctx.ellipse(0, 0, brimW, h * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()

    // Crown
    const cw = h * 0.8
    const ch = h * 0.62
    const crownPath = () => {
      ctx.beginPath()
      ctx.moveTo(-cw, 0)
      ctx.quadraticCurveTo(-cw * 0.86, -ch * 0.9, -cw * 0.4, -ch)
      ctx.quadraticCurveTo(0, -ch * 0.82, cw * 0.4, -ch)
      ctx.quadraticCurveTo(cw * 0.86, -ch * 0.9, cw, 0)
      ctx.closePath()
    }

    crownPath()
    const crownGrad = ctx.createLinearGradient(-cw, -ch, cw, 0)
    crownGrad.addColorStop(0, '#5a3411')
    crownGrad.addColorStop(0.4, '#8d5a24')
    crownGrad.addColorStop(0.72, '#a9743c')
    crownGrad.addColorStop(1, '#4a2a0b')
    ctx.fillStyle = crownGrad
    ctx.fill()

    // Crease
    ctx.save()
    crownPath()
    ctx.clip()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = Math.max(2, h * 0.04)
    ctx.beginPath()
    ctx.moveTo(0, -ch * 0.95)
    ctx.quadraticCurveTo(0, -ch * 0.5, 0, -ch * 0.05)
    ctx.stroke()
    ctx.restore()

    // Band
    const band = ctx.createLinearGradient(0, -ch * 0.24, 0, -ch * 0.05)
    band.addColorStop(0, '#2b1503')
    band.addColorStop(1, '#120800')
    ctx.fillStyle = band
    ctx.fillRect(-cw, -ch * 0.24, cw * 2, ch * 0.19)

    // Sheriff star
    sparkle(ctx, 0, -ch * 0.145, h * 0.1, '#fbbf24')
    ctx.restore()
  },

  // 20. Party Cone 🥳
  party(ctx, g) {
    const { hw: h } = g
    const cw = h * 0.52
    const ch = h * 1.05

    ctx.save()
    ctx.translate(g.headTop.x + h * 0.16, g.headTop.y - h * 0.02)
    ctx.rotate(g.roll + 0.22)

    // Shadow
    ctx.save()
    ctx.translate(h * 0.03, h * 0.02)
    ctx.beginPath()
    ctx.moveTo(-cw, 0)
    ctx.lineTo(0, -ch)
    ctx.lineTo(cw, 0)
    ctx.closePath()
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.fill()
    ctx.restore()

    // Body + stripes clipped inside the cone
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(-cw, 0)
    ctx.lineTo(0, -ch)
    ctx.lineTo(cw, 0)
    ctx.closePath()
    ctx.clip()

    const base = ctx.createLinearGradient(-cw, 0, cw, 0)
    base.addColorStop(0, '#8b1c5a')
    base.addColorStop(0.5, '#ff5fa2')
    base.addColorStop(1, '#6b1444')
    ctx.fillStyle = base
    ctx.fillRect(-cw, -ch, cw * 2, ch)

    const stripes = ['#f472b6', '#22d3ee', '#facc15', '#a855f7']
    stripes.forEach((color, i) => {
      const y0 = -ch + i * (ch / 4)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.92
      ctx.fillRect(-cw, y0, cw * 2, ch / 8)
    })
    ctx.globalAlpha = 1

    // Cylindrical shading
    const shade = ctx.createLinearGradient(-cw, 0, cw, 0)
    shade.addColorStop(0, 'rgba(0,0,0,0.45)')
    shade.addColorStop(0.42, 'rgba(255,255,255,0.28)')
    shade.addColorStop(0.62, 'rgba(255,255,255,0.06)')
    shade.addColorStop(1, 'rgba(0,0,0,0.5)')
    ctx.fillStyle = shade
    ctx.fillRect(-cw, -ch, cw * 2, ch)
    ctx.restore()

    // Pompom
    sphere(ctx, 0, -ch, cw * 0.34, '#fde047', '#fffde7', 0.18)

    // Confetti
    ;[
      [-h * 0.55, -h * 0.42, '#22d3ee'],
      [h * 0.5, -h * 0.55, '#f472b6'],
      [-h * 0.38, -h * 0.78, '#facc15'],
      [h * 0.42, -h * 0.9, '#a855f7'],
    ].forEach(([cx, cy, color]) => sphere(ctx, cx, cy, h * 0.045, color, '#ffffff', 0.1))

    ctx.restore()
  },
}

/**
 * Renders the selected 3D AR filter for every detected face.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<{x:number,y:number,z:number}>>} faceLandmarksList
 * @param {(x:number, y:number) => {x:number, y:number}} toCanvas
 * @param {string} filterId
 */
export function renderArFilter(ctx, faceLandmarksList, toCanvas, filterId) {
  if (!faceLandmarksList?.length || !filterId || filterId === 'none') return

  const renderer = RENDERERS_3D[filterId]
  if (!renderer) return

  faceLandmarksList.forEach((landmarks) => {
    if (!landmarks || landmarks.length < 468) return
    renderer(ctx, extract3DFaceGeometry(landmarks, toCanvas))
  })
}
