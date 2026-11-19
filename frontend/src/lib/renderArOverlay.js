/**
 * Procedural vector AR face tracking overlays rendered on HTML5 Canvas.
 * Supports 20 aesthetic props with sub-pixel crispness at any canvas resolution.
 */

// Helper: draw a 4-point sparkle star
function drawStar(ctx, cx, cy, r, color = '#facc15') {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i += 1) {
    const rad = (i * Math.PI) / 4
    const dist = i % 2 === 0 ? r : r * 0.35
    const x = cx + Math.cos(rad) * dist
    const y = cy + Math.sin(rad) * dist
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Helper: draw a heart path
function drawHeart(ctx, x, y, size) {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  const topCurveHeight = size * 0.3
  ctx.moveTo(0, topCurveHeight)
  ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight)
  ctx.bezierCurveTo(-size / 2, (size + topCurveHeight) / 2, 0, (size + topCurveHeight) / 1.5, 0, size)
  ctx.bezierCurveTo(0, (size + topCurveHeight) / 1.5, size / 2, (size + topCurveHeight) / 2, size / 2, topCurveHeight)
  ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// Helper: draw soft blush circle
function drawBlush(ctx, x, y, radius, color = 'rgba(251, 113, 133, 0.42)') {
  ctx.save()
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(251, 113, 133, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Extracts key face geometry from 478 MediaPipe face landmarks.
 */
function extractFaceGeometry(landmarks, toCanvas) {
  const p = (idx) => {
    const lm = landmarks[idx] || landmarks[0]
    return toCanvas(lm.x, lm.y)
  }

  const eyeL = p(468) || p(33) // eye center left
  const eyeR = p(473) || p(263) // eye center right
  const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 }
  const eyeDist = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y)
  const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x)

  const forehead = p(10) // hairline
  const chin = p(152) // chin tip
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y)

  const nose = p(1) // nose tip
  const noseBase = p(2)
  const cheekL = p(234) // outer cheek edge left
  const cheekR = p(454) // outer cheek edge right
  const blushL = p(205) || p(116) // cheek apple left
  const blushR = p(425) || p(345) // cheek apple right

  const mouthTop = p(13)
  const mouthBottom = p(14)
  const mouthL = p(61)
  const mouthR = p(291)
  const mouthOpen = Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y) / (faceHeight || 1) > 0.045

  // Head center between forehead and eyes
  const headTop = {
    x: eyeMid.x - Math.sin(roll) * (faceHeight * 0.55),
    y: eyeMid.y - Math.cos(roll) * (faceHeight * 0.55),
  }

  return {
    eyeL,
    eyeR,
    eyeMid,
    eyeDist,
    roll,
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

/**
 * 20 AR Filter Renderers
 */
const FILTER_RENDERERS = {
  // 1. Puppy 🐶
  puppy(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    // Floppy ears
    const earW = s * 0.65
    const earH = s * 1.35

    const drawEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.85, -s * 0.1)
      ctx.rotate(0.35)

      // Outer ear
      ctx.fillStyle = '#92400e'
      ctx.beginPath()
      ctx.ellipse(0, earH * 0.45, earW * 0.5, earH * 0.55, 0.15, 0, Math.PI * 2)
      ctx.fill()

      // Inner ear fold
      ctx.fillStyle = '#b45309'
      ctx.beginPath()
      ctx.ellipse(0, earH * 0.48, earW * 0.32, earH * 0.4, 0.15, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawEar(-1) // Left
    drawEar(1) // Right
    ctx.restore()

    // Shiny Dog Nose
    ctx.save()
    ctx.translate(geo.nose.x, geo.nose.y)
    ctx.rotate(geo.roll)
    const noseR = s * 0.22
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.ellipse(0, 0, noseR * 1.25, noseR * 0.85, 0, 0, Math.PI * 2)
    ctx.fill()

    // Nose shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.beginPath()
    ctx.ellipse(-noseR * 0.35, -noseR * 0.25, noseR * 0.3, noseR * 0.18, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Playful pink tongue
    ctx.save()
    ctx.translate(geo.mouthBottom.x, geo.mouthBottom.y)
    ctx.rotate(geo.roll)
    const tongueW = s * 0.32
    const tongueH = s * (geo.mouthOpen ? 0.6 : 0.42)
    ctx.fillStyle = '#fb7185'
    ctx.beginPath()
    ctx.moveTo(-tongueW * 0.5, 0)
    ctx.quadraticCurveTo(-tongueW * 0.6, tongueH, 0, tongueH)
    ctx.quadraticCurveTo(tongueW * 0.6, tongueH, tongueW * 0.5, 0)
    ctx.closePath()
    ctx.fill()

    // Tongue divider line
    ctx.strokeStyle = '#e11d48'
    ctx.lineWidth = Math.max(2, s * 0.025)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, tongueH * 0.75)
    ctx.stroke()
    ctx.restore()
  },

  // 2. Kitty 🐱
  kitty(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    // Pointed cat ears
    const earW = s * 0.65
    const earH = s * 0.85

    const drawCatEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.75, -s * 0.05)
      ctx.rotate(0.2)

      // Outer ear
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = Math.max(2, s * 0.035)
      ctx.beginPath()
      ctx.moveTo(-earW * 0.5, 0)
      ctx.lineTo(0, -earH)
      ctx.lineTo(earW * 0.5, 0)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Inner pink triangle
      ctx.fillStyle = '#f472b6'
      ctx.beginPath()
      ctx.moveTo(-earW * 0.3, -earH * 0.08)
      ctx.lineTo(0, -earH * 0.82)
      ctx.lineTo(earW * 0.3, -earH * 0.08)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    drawCatEar(-1)
    drawCatEar(1)
    ctx.restore()

    // Pink triangle nose
    ctx.save()
    ctx.translate(geo.nose.x, geo.nose.y)
    ctx.rotate(geo.roll)
    const noseS = s * 0.16
    ctx.fillStyle = '#f43f5e'
    ctx.beginPath()
    ctx.moveTo(-noseS, -noseS * 0.5)
    ctx.lineTo(noseS, -noseS * 0.5)
    ctx.lineTo(0, noseS * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // Whiskers on cheeks
    const drawWhiskers = (side, cx, cy) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(geo.roll)
      ctx.scale(side, 1)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.lineWidth = Math.max(2, s * 0.04)
      ctx.lineCap = 'round'

      const len = s * 0.85
      ;[-0.15, 0, 0.15].forEach((angle) => {
        ctx.beginPath()
        ctx.moveTo(s * 0.1, 0)
        ctx.lineTo(s * 0.1 + Math.cos(angle) * len, Math.sin(angle) * len)
        ctx.stroke()
      })
      ctx.restore()
    }

    drawWhiskers(-1, geo.blushL.x, geo.blushL.y)
    drawWhiskers(1, geo.blushR.x, geo.blushR.y)
  },

  // 3. Bunny 🐰
  bunny(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    // Tall bunny ears
    const earW = s * 0.42
    const earH = s * 1.65

    const drawBunnyEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.5, -s * 0.25)
      ctx.rotate(0.08)

      // Outer white ear
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = Math.max(2, s * 0.03)
      ctx.beginPath()
      ctx.ellipse(0, -earH * 0.5, earW * 0.5, earH * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Inner pink ear
      ctx.fillStyle = '#fb7185'
      ctx.beginPath()
      ctx.ellipse(0, -earH * 0.5, earW * 0.3, earH * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawBunnyEar(-1)
    drawBunnyEar(1)
    ctx.restore()

    // Cute pink nose
    ctx.save()
    ctx.translate(geo.nose.x, geo.nose.y)
    ctx.rotate(geo.roll)
    const nR = s * 0.14
    ctx.fillStyle = '#f472b6'
    ctx.beginPath()
    ctx.ellipse(0, 0, nR * 1.1, nR * 0.85, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Rosy bunny cheeks
    drawBlush(ctx, geo.blushL.x, geo.blushL.y, s * 0.38)
    drawBlush(ctx, geo.blushR.x, geo.blushR.y, s * 0.38)
  },

  // 4. Teddy Bear 🐻
  bear(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    // Round bear ears
    const earR = s * 0.42
    const drawBearEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.85, -s * 0.1)

      // Outer ear
      ctx.fillStyle = '#78350f'
      ctx.beginPath()
      ctx.arc(0, 0, earR, 0, Math.PI * 2)
      ctx.fill()

      // Inner ear
      ctx.fillStyle = '#fde68a'
      ctx.beginPath()
      ctx.arc(0, 0, earR * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawBearEar(-1)
    drawBearEar(1)
    ctx.restore()

    // Teddy Muzzle & Nose
    ctx.save()
    ctx.translate(geo.nose.x, geo.nose.y + s * 0.08)
    ctx.rotate(geo.roll)
    const mW = s * 0.48
    const mH = s * 0.35
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.ellipse(0, 0, mW, mH, 0, 0, Math.PI * 2)
    ctx.fill()

    // Small black nose
    ctx.fillStyle = '#1e1b4b'
    ctx.beginPath()
    ctx.ellipse(0, -mH * 0.25, s * 0.14, s * 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  },

  // 5. Froggy 🐸
  froggy(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const eyeR = s * 0.36
    const drawFrogEye = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.65, -s * 0.15)

      // Green eyelid
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(0, 0, eyeR, 0, Math.PI * 2)
      ctx.fill()

      // White eye
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, eyeR * 0.75, 0, Math.PI * 2)
      ctx.fill()

      // Black pupil
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(0, 0, eyeR * 0.45, 0, Math.PI * 2)
      ctx.fill()

      // Catchlight
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(-eyeR * 0.15, -eyeR * 0.15, eyeR * 0.16, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawFrogEye(-1)
    drawFrogEye(1)
    ctx.restore()

    drawBlush(ctx, geo.blushL.x, geo.blushL.y, s * 0.35, 'rgba(253, 164, 175, 0.45)')
    drawBlush(ctx, geo.blushR.x, geo.blushR.y, s * 0.35, 'rgba(253, 164, 175, 0.45)')
  },

  // 6. Panda 🐼
  panda(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const earR = s * 0.4
    const drawPandaEar = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.85, -s * 0.08)
      ctx.fillStyle = '#0f172a'
      ctx.beginPath()
      ctx.arc(0, 0, earR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawPandaEar(-1)
    drawPandaEar(1)
    ctx.restore()

    // Panda eye spots
    const drawEyePatch = (eye) => {
      ctx.save()
      ctx.translate(eye.x, eye.y)
      ctx.rotate(geo.roll)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)'
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.32, s * 0.26, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawEyePatch(geo.eyeL)
    drawEyePatch(geo.eyeR)

    // Panda nose
    ctx.save()
    ctx.translate(geo.nose.x, geo.nose.y)
    ctx.rotate(geo.roll)
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.18, s * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  },

  // 7. Reindeer 🦌
  reindeer(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const drawAntler = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.6, -s * 0.2)
      ctx.rotate(0.3)
      ctx.strokeStyle = '#854d0e'
      ctx.lineWidth = Math.max(3, s * 0.09)
      ctx.lineCap = 'round'

      // Main beam
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(-s * 0.2, -s * 0.8, -s * 0.1, -s * 1.3)
      ctx.stroke()

      // Tines
      ctx.beginPath()
      ctx.moveTo(-s * 0.12, -s * 0.5)
      ctx.lineTo(s * 0.2, -s * 0.7)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(-s * 0.15, -s * 0.9)
      ctx.lineTo(s * 0.15, -s * 1.15)
      ctx.stroke()
      ctx.restore()
    }

    drawAntler(-1)
    drawAntler(1)
    ctx.restore()

    // Rudolph Glowing Red Nose
    ctx.save()
    ctx.translate(geo.nose.x, geo.nose.y)
    ctx.rotate(geo.roll)
    const noseR = s * 0.22

    // Red glow
    const glow = ctx.createRadialGradient(0, 0, noseR * 0.3, 0, 0, noseR * 2.2)
    glow.addColorStop(0, 'rgba(239, 68, 68, 0.7)')
    glow.addColorStop(1, 'rgba(239, 68, 68, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, noseR * 2.2, 0, Math.PI * 2)
    ctx.fill()

    // Core nose
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(0, 0, noseR, 0, Math.PI * 2)
    ctx.fill()

    // Shine
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(-noseR * 0.35, -noseR * 0.35, noseR * 0.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  },

  // 8. Royal Crown 👑
  crown(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const w = s * 1.4
    const h = s * 0.9

    // Gold gradient
    const gold = ctx.createLinearGradient(0, -h, 0, 0)
    gold.addColorStop(0, '#fde047')
    gold.addColorStop(0.5, '#eab308')
    gold.addColorStop(1, '#ca8a04')

    ctx.fillStyle = gold
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, 0)
    ctx.lineTo(-w * 0.45, -h * 0.7)
    ctx.lineTo(-w * 0.25, -h * 0.4)
    ctx.lineTo(0, -h)
    ctx.lineTo(w * 0.25, -h * 0.4)
    ctx.lineTo(w * 0.45, -h * 0.7)
    ctx.lineTo(w * 0.5, 0)
    ctx.closePath()
    ctx.fill()

    // Base band
    ctx.fillStyle = '#a16207'
    ctx.fillRect(-w * 0.5, 0, w, h * 0.15)

    // Jewels
    const jewels = ['#ef4444', '#3b82f6', '#10b981', '#ec4899', '#3b82f6']
    jewels.forEach((col, i) => {
      const jx = -w * 0.38 + i * (w * 0.19)
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(jx, h * 0.075, s * 0.055, 0, Math.PI * 2)
      ctx.fill()
    })

    // Sparkles on peaks
    drawStar(ctx, 0, -h * 1.05, s * 0.14, '#ffffff')
    drawStar(ctx, -w * 0.45, -h * 0.75, s * 0.1, '#fef08a')
    drawStar(ctx, w * 0.45, -h * 0.75, s * 0.1, '#fef08a')
    ctx.restore()
  },

  // 9. Flower Wreath 🌸
  flower_crown(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y + s * 0.1)
    ctx.rotate(geo.roll)

    const w = s * 1.3
    // Leaves arc
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = Math.max(2, s * 0.04)
    ctx.beginPath()
    ctx.arc(0, s * 0.4, w * 0.65, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()

    // Flowers along the arc
    const flowerColors = ['#f472b6', '#fde047', '#fb7185', '#c084fc', '#f472b6', '#fde047']
    const count = flowerColors.length
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI * 1.2 + (i / (count - 1)) * (Math.PI * 0.6)
      const fx = Math.cos(angle) * (w * 0.65)
      const fy = s * 0.4 + Math.sin(angle) * (w * 0.65)

      // Draw petals
      ctx.fillStyle = flowerColors[i]
      for (let p = 0; p < 5; p += 1) {
        const pr = (p * Math.PI * 2) / 5
        const px = fx + Math.cos(pr) * (s * 0.1)
        const py = fy + Math.sin(pr) * (s * 0.1)
        ctx.beginPath()
        ctx.arc(px, py, s * 0.075, 0, Math.PI * 2)
        ctx.fill()
      }
      // Center
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(fx, fy, s * 0.05, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  },

  // 10. Angel Halo 😇
  angel(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y - s * 0.5)
    ctx.rotate(geo.roll)

    const rx = s * 0.85
    const ry = s * 0.28

    // Outer warm aura
    ctx.shadowColor = '#fde047'
    ctx.shadowBlur = s * 0.4
    ctx.strokeStyle = '#fef08a'
    ctx.lineWidth = Math.max(3, s * 0.09)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Inner bright core
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1.5, s * 0.04)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Floating sparkle dust
    drawStar(ctx, -rx * 0.8, -ry * 1.2, s * 0.12, '#ffffff')
    drawStar(ctx, rx * 0.7, -ry * 1.4, s * 0.15, '#fef08a')
    drawStar(ctx, rx * 1.1, ry * 0.6, s * 0.09, '#fef08a')
    ctx.restore()
  },

  // 11. Devil Horns 😈
  devil(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const drawHorn = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.translate(s * 0.55, -s * 0.05)

      // Ruby red horn curve
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.moveTo(-s * 0.12, 0)
      ctx.quadraticCurveTo(-s * 0.15, -s * 0.55, s * 0.1, -s * 0.8)
      ctx.quadraticCurveTo(0, -s * 0.45, s * 0.12, 0)
      ctx.closePath()
      ctx.fill()

      // Horn highlight sheen
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
      ctx.lineWidth = Math.max(1.5, s * 0.025)
      ctx.beginPath()
      ctx.moveTo(-s * 0.06, -s * 0.15)
      ctx.quadraticCurveTo(-s * 0.08, -s * 0.45, s * 0.05, -s * 0.68)
      ctx.stroke()
      ctx.restore()
    }

    drawHorn(-1)
    drawHorn(1)
    ctx.restore()
  },

  // 12. Strawberry Hat 🍓
  strawberry(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const w = s * 1.2
    const h = s * 0.85

    // Red strawberry cap
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.ellipse(0, -h * 0.45, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // Seeds
    ctx.fillStyle = '#fef08a'
    const seedPositions = [
      [-w * 0.25, -h * 0.5],
      [0, -h * 0.6],
      [w * 0.25, -h * 0.5],
      [-w * 0.15, -h * 0.3],
      [w * 0.15, -h * 0.3],
    ]
    seedPositions.forEach(([sx, sy]) => {
      ctx.beginPath()
      ctx.ellipse(sx, sy, s * 0.02, s * 0.045, 0.2, 0, Math.PI * 2)
      ctx.fill()
    })

    // Leaf stem at top
    ctx.fillStyle = '#22c55e'
    for (let l = 0; l < 4; l += 1) {
      const la = (l * Math.PI) / 2
      ctx.beginPath()
      ctx.ellipse(Math.cos(la) * s * 0.12, -h * 0.95 + Math.sin(la) * s * 0.05, s * 0.1, s * 0.05, la, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
    drawBlush(ctx, geo.blushL.x, geo.blushL.y, s * 0.35)
    drawBlush(ctx, geo.blushR.x, geo.blushR.y, s * 0.35)
  },

  // 13. Toadstool Mushroom 🍄
  mushroom(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const w = s * 1.4
    const h = s * 0.85

    // Red mushroom dome
    ctx.fillStyle = '#e11d48'
    ctx.beginPath()
    ctx.arc(0, -h * 0.2, w * 0.48, Math.PI, 0)
    ctx.closePath()
    ctx.fill()

    // Mushroom underside
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.ellipse(0, -h * 0.2, w * 0.48, h * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()

    // White polka dots
    ctx.fillStyle = '#ffffff'
    ;[
      [0, -h * 0.55, s * 0.12],
      [-w * 0.25, -h * 0.4, s * 0.09],
      [w * 0.25, -h * 0.4, s * 0.09],
      [-w * 0.12, -h * 0.28, s * 0.07],
      [w * 0.12, -h * 0.28, s * 0.07],
    ].forEach(([dx, dy, dr]) => {
      ctx.beginPath()
      ctx.arc(dx, dy, dr, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.restore()
  },

  // 14. Ribbon Bow 🎀
  ribbon(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y - s * 0.1)
    ctx.rotate(geo.roll)

    const rw = s * 0.7
    const rh = s * 0.55

    const drawBowWing = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.fillStyle = '#f472b6'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(rw * 0.6, -rh, rw, -rh * 0.5, rw * 0.85, 0)
      ctx.bezierCurveTo(rw, rh * 0.5, rw * 0.6, rh, 0, 0)
      ctx.fill()

      // Inner shadow fold
      ctx.fillStyle = '#db2777'
      ctx.beginPath()
      ctx.ellipse(rw * 0.45, 0, rw * 0.15, rh * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    drawBowWing(-1)
    drawBowWing(1)

    // Center knot
    ctx.fillStyle = '#ec4899'
    ctx.beginPath()
    ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  },

  // 15. Heart Blush 💖
  heart_blush(ctx, geo) {
    const s = geo.eyeDist
    // Pink heart blush on cheeks
    ctx.fillStyle = 'rgba(244, 63, 94, 0.48)'
    drawHeart(ctx, geo.blushL.x, geo.blushL.y - s * 0.15, s * 0.4)
    drawHeart(ctx, geo.blushR.x, geo.blushR.y - s * 0.15, s * 0.4)

    // Floating hearts above head
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)
    ctx.fillStyle = '#fb7185'
    drawHeart(ctx, -s * 0.55, -s * 0.5, s * 0.25)
    drawHeart(ctx, s * 0.45, -s * 0.65, s * 0.3)
    drawHeart(ctx, 0, -s * 0.8, s * 0.2)
    ctx.restore()
  },

  // 16. Star Glam ✨
  star_glam(ctx, geo) {
    const s = geo.eyeDist
    drawStar(ctx, geo.blushL.x, geo.blushL.y, s * 0.22, '#facc15')
    drawStar(ctx, geo.blushL.x + s * 0.2, geo.blushL.y + s * 0.08, s * 0.12, '#ffffff')
    drawStar(ctx, geo.blushR.x, geo.blushR.y, s * 0.22, '#facc15')
    drawStar(ctx, geo.blushR.x - s * 0.2, geo.blushR.y + s * 0.08, s * 0.12, '#ffffff')

    // Forehead star
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y + s * 0.2)
    ctx.rotate(geo.roll)
    drawStar(ctx, 0, 0, s * 0.28, '#ffffff')
    ctx.restore()
  },

  // 17. Cyber Shades 🕶️
  shades(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.eyeMid.x, geo.eyeMid.y)
    ctx.rotate(geo.roll)

    const w = s * 1.55
    const h = s * 0.65

    // Dark sleek frame
    ctx.fillStyle = '#0f172a'
    ctx.beginPath()
    ctx.roundRect(-w * 0.5, -h * 0.4, w, h * 0.8, s * 0.15)
    ctx.fill()

    // Neon gradient lens
    const neon = ctx.createLinearGradient(-w * 0.45, 0, w * 0.45, 0)
    neon.addColorStop(0, '#06b6d4')
    neon.addColorStop(0.5, '#3b82f6')
    neon.addColorStop(1, '#d946ef')
    ctx.fillStyle = neon

    // Left lens
    ctx.beginPath()
    ctx.roundRect(-w * 0.45, -h * 0.3, w * 0.4, h * 0.6, s * 0.08)
    ctx.fill()

    // Right lens
    ctx.beginPath()
    ctx.roundRect(w * 0.05, -h * 0.3, w * 0.4, h * 0.6, s * 0.08)
    ctx.fill()

    // Glare slash
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.lineWidth = Math.max(2, s * 0.035)
    ctx.beginPath()
    ctx.moveTo(-w * 0.38, -h * 0.15)
    ctx.lineTo(-w * 0.15, h * 0.15)
    ctx.moveTo(w * 0.12, -h * 0.15)
    ctx.lineTo(w * 0.35, h * 0.15)
    ctx.stroke()
    ctx.restore()
  },

  // 18. Gentleman Glasses & Mustache 👓
  retro_glasses(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.eyeMid.x, geo.eyeMid.y)
    ctx.rotate(geo.roll)

    const r = s * 0.36
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = Math.max(2.5, s * 0.05)

    // Left circle glass
    ctx.beginPath()
    ctx.arc(-s * 0.5, 0, r, 0, Math.PI * 2)
    ctx.stroke()

    // Right circle glass
    ctx.beginPath()
    ctx.arc(s * 0.5, 0, r, 0, Math.PI * 2)
    ctx.stroke()

    // Bridge
    ctx.beginPath()
    ctx.arc(0, -r * 0.25, r * 0.45, Math.PI, 0)
    ctx.stroke()
    ctx.restore()

    // Curled Mustache
    ctx.save()
    ctx.translate(geo.noseBase.x, geo.noseBase.y + s * 0.12)
    ctx.rotate(geo.roll)
    const mw = s * 0.65
    ctx.fillStyle = '#334155'

    const drawStacheWing = (side) => {
      ctx.save()
      ctx.scale(side, 1)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(mw * 0.4, -s * 0.08, mw * 0.75, s * 0.06)
      ctx.quadraticCurveTo(mw * 0.85, -s * 0.04, mw * 0.8, -s * 0.12)
      ctx.quadraticCurveTo(mw * 0.45, s * 0.08, 0, s * 0.08)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    drawStacheWing(-1)
    drawStacheWing(1)
    ctx.restore()
  },

  // 19. Cowboy Hat 🤠
  cowboy(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll)

    const bw = s * 2.1
    const bh = s * 0.45

    // Curved brim
    ctx.fillStyle = '#78350f'
    ctx.beginPath()
    ctx.ellipse(0, 0, bw * 0.5, bh * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()

    // Crown
    const cw = s * 1.1
    const ch = s * 0.85
    ctx.fillStyle = '#92400e'
    ctx.beginPath()
    ctx.moveTo(-cw * 0.5, 0)
    ctx.lineTo(-cw * 0.4, -ch)
    ctx.quadraticCurveTo(0, -ch * 0.8, cw * 0.4, -ch)
    ctx.lineTo(cw * 0.5, 0)
    ctx.closePath()
    ctx.fill()

    // Hatband
    ctx.fillStyle = '#451a03'
    ctx.fillRect(-cw * 0.48, -ch * 0.18, cw * 0.96, ch * 0.18)

    // Gold sheriff star badge
    drawStar(ctx, 0, -ch * 0.09, s * 0.12, '#facc15')
    ctx.restore()
  },

  // 20. Party Cone 🥳
  party(ctx, geo) {
    const s = geo.eyeDist
    ctx.save()
    ctx.translate(geo.headTop.x, geo.headTop.y)
    ctx.rotate(geo.roll + 0.1)

    const w = s * 0.85
    const h = s * 1.35

    // Cone body
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(-w * 0.5, 0)
    ctx.lineTo(0, -h)
    ctx.lineTo(w * 0.5, 0)
    ctx.closePath()
    ctx.clip()

    // Striped pattern
    const stripeColors = ['#ec4899', '#06b6d4', '#facc15', '#a855f7']
    stripeColors.forEach((color, idx) => {
      ctx.fillStyle = color
      ctx.fillRect(-w * 0.6, -h + idx * (h * 0.28), w * 1.2, h * 0.28)
    })
    ctx.restore()

    // Fluffy pompom ball at top
    ctx.fillStyle = '#fde047'
    ctx.beginPath()
    ctx.arc(0, -h, s * 0.18, 0, Math.PI * 2)
    ctx.fill()

    // Confetti particles
    const confetti = [
      [-s * 0.6, -s * 0.4, '#06b6d4'],
      [s * 0.65, -s * 0.5, '#ec4899'],
      [-s * 0.45, -s * 0.8, '#facc15'],
      [s * 0.5, -s * 0.9, '#a855f7'],
    ]
    confetti.forEach(([cx, cy, col]) => {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.06, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.restore()
  },
}

/**
 * Renders the chosen AR filter onto a 2D canvas context for all detected faces.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Array<{x: number, y: number, z: number}>>} faceLandmarksList
 * @param {(x: number, y: number) => {x: number, y: number}} toCanvas
 * @param {string} filterId
 */
export function renderArFilter(ctx, faceLandmarksList, toCanvas, filterId) {
  if (!faceLandmarksList || !faceLandmarksList.length || !filterId || filterId === 'none') {
    return
  }

  const renderer = FILTER_RENDERERS[filterId]
  if (!renderer) return

  faceLandmarksList.forEach((landmarks) => {
    if (!landmarks || landmarks.length < 468) return
    const geo = extractFaceGeometry(landmarks, toCanvas)
    renderer(ctx, geo)
  })
}
