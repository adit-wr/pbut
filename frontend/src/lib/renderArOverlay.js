/**
 * Real-3D AR face filters for HTML5 Canvas (no WebGL / no dependencies).
 *
 * Versi SMOOTH:
 *  - Supersampling adaptif (render 2x lalu diperkecil) -> tepi halus, tidak kotak-kotak
 *  - Soft tone-mapping (highlight tidak terpotong keras)
 *  - Siluet kepala lembut saat properti masuk ke belakang kepala
 *  - Landmark wajah di-smooth adaptif (anti-getar saat diam, responsif saat bergerak)
 *  - Gerakan sekunder (spring) -> telinga / pita / sayap mengayun saat kepala bergerak
 *
 * Units: 1 model unit = half head width (cheek to cheek / 2). Origin = skull
 * centre, +x = face right axis, +y = up, +z = out of the face.
 *
 * Public API:
 *   renderArFilter(ctx, faceLandmarksList, toCanvas, filterId)
 */

// =============================================================================
// math + colour
// =============================================================================

const TAU = Math.PI * 2
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

const hex = (h) => {
  let s = h.slice(1)
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  const n = parseInt(s, 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const lighten = (c, t) => mixc(c, [255, 255, 255], t)
const css = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`

// =============================================================================
// materials + lighting
// =============================================================================

const mat = (h, o = {}) => ({
  base: hex(h),
  ks: 0.3,
  shine: 30,
  ambient: 0.36,
  rim: 0,
  rimColor: null,
  metal: false,
  double: false,
  glow: 0,
  wrap: 0.22,
  ...o,
})
const fur = (h, o = {}) => mat(h, { ks: 0.1, shine: 12, ambient: 0.44, rim: 0.55, ...o })
const gloss = (h, o = {}) => mat(h, { ks: 0.95, shine: 70, ambient: 0.3, rim: 0.4, ...o })
const gold = (h = '#e8b226', o = {}) => mat(h, { ks: 0.8, shine: 40, ambient: 0.3, metal: true, rim: 0.25, ...o })

// Light comes from the top-left, in front of the camera (camera space: x right, y down, z into screen).
const LIGHT = norm([-0.45, -0.62, -0.64])
const VIEW = [0, 0, -1]
const HALF = norm(add(LIGHT, VIEW))
const BOUNCE = norm([0.6, 0.55, -0.3])

/** Soft shoulder: highlight di atas 180 dikompres halus, bukan dipotong keras. */
const shoulder = (v) => (v < 180 ? v : 180 + 75 * (1 - Math.exp(-(v - 180) / 75)))

/** Per-pixel Phong-style shading. n = unit camera-space normal (viewer is at -z). Writes rgb into out. */
function shadeInto(nx, ny, nz, m, br, bg, bb, out) {
  const raw = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
  const wr = m.wrap
  const ndl = clamp((raw + wr) / (1 + wr), 0, 1)
  const ndv = Math.max(0, -nz)
  const up = 0.5 - 0.5 * ny
  let lit
  if (m.metal) {
    const e = clamp(0.5 + nz * ny, 0, 1)
    const d = (e - 0.5) * 8
    lit = (0.2 + 0.85 * e * e + 0.4 * Math.exp(-d * d)) * (0.7 + 0.4 * ndl)
  } else {
    lit = m.ambient * (0.55 + 0.45 * up) + (1 - m.ambient) * 1.08 * ndl * ndl * (3 - 2 * ndl) * 0.5 + (1 - m.ambient) * 0.54 * ndl + 0.12 * Math.max(0, nx * BOUNCE[0] + ny * BOUNCE[1] + nz * BOUNCE[2])
  }
  const sh = lit < 0.8 ? 0.8 - lit : 0
  let r = br * lit * (1 - 0.25 * sh)
  let g = bg * lit * (1 - 0.2 * sh)
  let b = bb * lit * (1 + 0.1 * sh) + 14 * sh
  if (m.ks > 0) {
    const ndh = nx * HALF[0] + ny * HALF[1] + nz * HALF[2]
    if (ndh > 0.4) {
      const s = m.ks * Math.pow(ndh, m.shine) * 255
      if (s > 0.5) {
        if (m.metal) {
          r += (br * 0.45 + 140) * (s / 255)
          g += (bg * 0.45 + 140) * (s / 255)
          b += (bb * 0.45 + 140) * (s / 255)
        } else {
          r += s
          g += s
          b += s
        }
      }
    }
  }
  if (m.rim) {
    const e = 1 - ndv
    if (e > 0.2) {
      const rm = m.rim * Math.pow(e, 2.4) * (0.7 + 0.55 * up)
      const rc = m.rimColor
      if (rc) {
        r += rc[0] * rm
        g += rc[1] * rm
        b += rc[2] * rm
      } else {
        r += (br * 0.5 + 127) * rm
        g += (bg * 0.5 + 127) * rm
        b += (bb * 0.5 + 127) * rm
      }
    }
  }
  if (m.glow) {
    r += br * m.glow
    g += bg * m.glow
    b += bb * m.glow
  }
  out[0] = shoulder(r)
  out[1] = shoulder(g)
  out[2] = shoulder(b)
}

// =============================================================================
// mesh builders
// =============================================================================

const centerOf = (V) => {
  const c = [0, 0, 0]
  V.forEach((v) => {
    c[0] += v[0]
    c[1] += v[1]
    c[2] += v[2]
  })
  return mul(c, 1 / (V.length || 1))
}
const mk = (V, N, F, FC, FN) => ({ V, N, F, FC: FC || null, FN: FN || null, cen: centerOf(V) })

/** Recompute smooth normals from geometry (orientation taken from the old normals). */
function renormal(m) {
  const acc = m.V.map(() => [0, 0, 0])
  m.F.forEach(([a, b, c]) => {
    let gn = cross(sub(m.V[b], m.V[a]), sub(m.V[c], m.V[a]))
    const hint = add(add(m.N[a], m.N[b]), m.N[c])
    if (dot(gn, hint) < 0) gn = mul(gn, -1)
    ;[a, b, c].forEach((i) => {
      acc[i] = add(acc[i], gn)
    })
  })
  m.N = acc.map(norm)
}
function deform(m, fn) {
  m.V = m.V.map(fn)
  renormal(m)
  m.cen = centerOf(m.V)
  return m
}

/** Surface of revolution around Y. profile = [[r, y], …] bottom → top (counter-clockwise for solids). */
function lathe(profile, seg = 28, o = {}) {
  seg = Math.min(72, Math.round(seg * 1.6))
  const np = profile.length
  const V = []
  const N = []
  const F = []
  const FC = o.colorFn ? [] : null
  const pn = profile.map((p, i) => {
    const a = profile[Math.max(0, i - 1)]
    const b = profile[Math.min(np - 1, i + 1)]
    const dr = b[0] - a[0]
    const dy = b[1] - a[1]
    const l = Math.hypot(dr, dy) || 1
    return [dy / l, -dr / l]
  })
  for (let i = 0; i < np; i += 1) {
    for (let j = 0; j < seg; j += 1) {
      const th = (TAU * j) / seg
      const c = Math.cos(th)
      const s = Math.sin(th)
      V.push([profile[i][0] * c, profile[i][1], profile[i][0] * s])
      N.push(norm([pn[i][0] * c, pn[i][1], pn[i][0] * s]))
    }
  }
  for (let i = 0; i < np - 1; i += 1) {
    for (let j = 0; j < seg; j += 1) {
      const a = i * seg + j
      const b = i * seg + ((j + 1) % seg)
      const c = (i + 1) * seg + j
      const d = (i + 1) * seg + ((j + 1) % seg)
      F.push([a, b, d], [a, d, c])
      if (FC) {
        const col = o.colorFn(((j + 0.5) / seg) * TAU, (i + 0.5) / (np - 1))
        FC.push(col, col)
      }
    }
  }
  return mk(V, N, F, FC)
}

function ellipsoid(rx, ry, rz, seg = 16, rings = 10, o = {}) {
  seg = Math.min(56, Math.round(seg * 1.7))
  rings = Math.min(40, Math.round(rings * 1.6))
  const l0 = o.lat0 ?? -Math.PI / 2
  const l1 = o.lat1 ?? Math.PI / 2
  const V = []
  const N = []
  const F = []
  const FC = o.colorFn ? [] : null
  for (let i = 0; i <= rings; i += 1) {
    const lat = l0 + ((l1 - l0) * i) / rings
    const cl = Math.cos(lat)
    const sl = Math.sin(lat)
    for (let j = 0; j < seg; j += 1) {
      const th = (TAU * j) / seg
      const x = cl * Math.cos(th)
      const z = cl * Math.sin(th)
      V.push([x * rx, sl * ry + (o.oy || 0), z * rz])
      N.push(norm([x / rx, sl / ry, z / rz]))
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < seg; j += 1) {
      const a = i * seg + j
      const b = i * seg + ((j + 1) % seg)
      const c = (i + 1) * seg + j
      const d = (i + 1) * seg + ((j + 1) % seg)
      F.push([a, b, d], [a, d, c])
      if (FC) {
        const col = o.colorFn((i + 0.5) / rings, (j + 0.5) / seg)
        FC.push(col, col)
      }
    }
  }
  return mk(V, N, F, FC)
}

function densify(path, closed) {
  const n = path.length
  if (n >= 30 || n < 2) return path
  const out = []
  const P = (i) => (closed ? path[(i + n * 4) % n] : path[clamp(i, 0, n - 1)])
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i += 1) {
    const p0 = P(i - 1)
    const p1 = P(i)
    const p2 = P(i + 1)
    const p3 = P(i + 2)
    for (let k = 0; k < 4; k += 1) {
      const t = k / 4
      const t2 = t * t
      const t3 = t2 * t
      out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)))
    }
  }
  if (!closed) out.push(path[n - 1])
  return out
}

/** Sweep a circle along a 3D path (antlers, whiskers, frames, tails…). */
function tube(path, radius, seg = 8, o = {}) {
  seg = Math.min(18, Math.max(10, Math.round(seg * 1.5)))
  let pts = densify(path, !!o.closed).slice()
  let rad = typeof radius === 'function' ? radius : () => radius
  if (o.cap && !o.closed) {
    const t0 = norm(sub(pts[0], pts[1]))
    const tn = norm(sub(pts[pts.length - 1], pts[pts.length - 2]))
    const r0 = rad(0)
    const r1 = rad(1)
    const base = pts
    pts = [add(base[0], mul(t0, r0 * 0.95)), add(base[0], mul(t0, r0 * 0.5)), ...base,
      add(base[base.length - 1], mul(tn, r1 * 0.5)), add(base[base.length - 1], mul(tn, r1 * 0.95))]
    const inner = rad
    const n0 = base.length
    rad = (t) => {
      const idx = t * (pts.length - 1)
      if (idx < 0.5) return 0.001
      if (idx < 1.5) return inner(0) * 0.8
      if (idx > pts.length - 1.5) return 0.001
      if (idx > pts.length - 2.5) return inner(1) * 0.8
      return inner(clamp((idx - 2) / (n0 - 1), 0, 1))
    }
  }
  const n = pts.length
  const V = []
  const N = []
  const F = []
  let prevN = null
  for (let i = 0; i < n; i += 1) {
    const a = pts[o.closed ? (i + n - 1) % n : Math.max(0, i - 1)]
    const b = pts[o.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
    const T = norm(sub(b, a))
    let Nn
    if (o.up) Nn = norm(sub(o.up, mul(T, dot(o.up, T))))
    else if (!prevN) {
      const helper = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      Nn = norm(cross(helper, T))
    } else Nn = norm(sub(prevN, mul(T, dot(prevN, T))))
    prevN = Nn
    const Bn = cross(T, Nn)
    const r = rad(i / (n - 1))
    for (let j = 0; j < seg; j += 1) {
      const ph = (TAU * j) / seg
      const d = add(mul(Nn, Math.cos(ph)), mul(Bn, Math.sin(ph)))
      V.push(add(pts[i], mul(d, r)))
      N.push(d)
    }
  }
  const rows = o.closed ? n : n - 1
  for (let i = 0; i < rows; i += 1) {
    const i2 = (i + 1) % n
    for (let j = 0; j < seg; j += 1) {
      const a = i * seg + j
      const b = i * seg + ((j + 1) % seg)
      const c = i2 * seg + j
      const d = i2 * seg + ((j + 1) % seg)
      F.push([a, b, d], [a, d, c])
    }
  }
  return mk(V, N, F)
}

function polyRadius(poly, c, th) {
  const dx = Math.cos(th)
  const dy = Math.sin(th)
  let best = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = ((a[0] - c[0]) * ey - (a[1] - c[1]) * ex) / den
    const s = ((a[0] - c[0]) * dy - (a[1] - c[1]) * dx) / den
    if (t > 0 && s >= 0 && s <= 1) best = Math.max(best, t)
  }
  return best
}

/** Pillow-like inflated version of a star-convex 2D polygon (hearts, bow loops, tongues…). */
function puffy(poly, H, o = {}) {
  const ang = Math.min(72, Math.round((o.ang || 40) * 1.4))
  const rings = Math.min(14, Math.round((o.rings || 6) * 1.7))
  const pw = o.pow || 0.6
  const c = o.center || [
    poly.reduce((s, p) => s + p[0], 0) / poly.length,
    poly.reduce((s, p) => s + p[1], 0) / poly.length,
  ]
  const R = []
  for (let j = 0; j < ang; j += 1) R.push(polyRadius(poly, c, (TAU * j) / ang))
  const V = []
  const N = []
  const F = []
  for (const side of [1, -1]) {
    for (let k = 0; k <= rings; k += 1) {
      if (side < 0 && k === rings) continue
      const rho = k / rings
      for (let j = 0; j < ang; j += 1) {
        const th = (TAU * j) / ang
        const dx = Math.cos(th)
        const dy = Math.sin(th)
        const h = H * Math.pow(Math.max(0, 1 - rho * rho), pw)
        V.push([c[0] + rho * R[j] * dx, c[1] + rho * R[j] * dy, side * h])
        const rr = Math.min(rho, 0.985)
        const G = clamp((H * 2 * pw * rr * Math.pow(1 - rr * rr, pw - 1)) / (R[j] || 1), 0, 8)
        N.push(k === rings ? norm([dx, dy, 0]) : norm([G * dx, G * dy, side]))
      }
    }
  }
  const frontCount = (rings + 1) * ang
  const bIdx = (k, j) => (k === rings ? rings * ang + j : frontCount + k * ang + j)
  for (let k = 0; k < rings; k += 1) {
    for (let j = 0; j < ang; j += 1) {
      const j2 = (j + 1) % ang
      const fa = k * ang + j
      const fb = k * ang + j2
      const fc = (k + 1) * ang + j
      const fd = (k + 1) * ang + j2
      F.push([fa, fb, fd], [fa, fd, fc])
      const ba = bIdx(k, j)
      const bb = bIdx(k, j2)
      const bc = bIdx(k + 1, j)
      const bd = bIdx(k + 1, j2)
      F.push([ba, bd, bb], [ba, bc, bd])
    }
  }
  return mk(V, N, F)
}

/** Flat-shaded triangles with outward normals (gems, stars). Origin must be inside the shape. */
function faceted(tris) {
  const V = []
  const F = []
  const FN = []
  tris.forEach((t) => {
    const i = V.length
    V.push(t[0], t[1], t[2])
    F.push([i, i + 1, i + 2])
    let n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])))
    const cen = mul(add(add(t[0], t[1]), t[2]), 1 / 3)
    if (dot(n, cen) < 0) n = mul(n, -1)
    FN.push(n)
  })
  return mk(V, null, F, null, FN)
}
function starMesh(R = 1, r = 0.46, h = 0.3, n = 5) {
  const pts = []
  for (let i = 0; i < n * 2; i += 1) {
    const a = Math.PI / 2 + (i * TAU) / (n * 2)
    const rad = i % 2 === 0 ? R : r
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad, 0])
  }
  const tris = []
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    tris.push([[0, 0, h], p, q], [[0, 0, -h], q, p])
  }
  return faceted(tris)
}

const MESH = {}
const cache = (k, f) => MESH[k] || (MESH[k] = f())

// =============================================================================
// transforms in head space
// =============================================================================

class Tf {
  constructor(p = [0, 0, 0], a = [1, 0, 0], b = [0, 1, 0], c = [0, 0, 1], s = 1) {
    this.p = p
    this.a = a
    this.b = b
    this.c = c
    this.s = s
  }
  cl() {
    return new Tf(this.p.slice(), this.a.slice(), this.b.slice(), this.c.slice(), this.s)
  }
  go(x, y, z) {
    const q = this.cl()
    q.p = add(q.p, mul(add(add(mul(q.a, x), mul(q.b, y)), mul(q.c, z)), q.s))
    return q
  }
  rx(t) {
    const q = this.cl()
    const c = Math.cos(t)
    const s = Math.sin(t)
    const b = add(mul(this.b, c), mul(this.c, s))
    const cc = add(mul(this.b, -s), mul(this.c, c))
    q.b = b
    q.c = cc
    return q
  }
  ry(t) {
    const q = this.cl()
    const c = Math.cos(t)
    const s = Math.sin(t)
    const cc = add(mul(this.c, c), mul(this.a, s))
    const a = add(mul(this.a, c), mul(this.c, -s))
    q.a = a
    q.c = cc
    return q
  }
  rz(t) {
    const q = this.cl()
    const c = Math.cos(t)
    const s = Math.sin(t)
    const a = add(mul(this.a, c), mul(this.b, s))
    const b = add(mul(this.a, -s), mul(this.b, c))
    q.a = a
    q.b = b
    return q
  }
  sc(k) {
    const q = this.cl()
    q.s *= k
    return q
  }
  /** Child frame: yDir / zHint are given in THIS frame's coordinates. */
  child(p, yDir, zHint = [0, 0, 1], s = 1) {
    const M = (v) => add(add(mul(this.a, v[0]), mul(this.b, v[1])), mul(this.c, v[2]))
    const b = norm(yDir)
    let c = sub(zHint, mul(b, dot(zHint, b)))
    if (len(c) < 1e-5) c = sub([1, 0, 0], mul(b, b[0]))
    c = norm(c)
    const a = cross(b, c)
    return new Tf(add(this.p, mul(M(p), this.s)), M(a), M(b), M(c), this.s * s)
  }
}
const ROOT = new Tf()
const frame = (p, yDir = [0, 1, 0], zHint = [0, 0, 1], s = 1) => ROOT.child(p, yDir, zHint, s)
const at = (p, s = 1) => new Tf(p, [1, 0, 0], [0, 1, 0], [0, 0, 1], s)

// =============================================================================
// scene + primitives
// =============================================================================

class Scene {
  constructor(g, t) {
    this.g = g
    this.t = t
    this.items = [] // rasterised geometry (meshes + sphere impostors)
    this.under = [] // canvas parts drawn below the geometry (skin decals)
    this.over = [] // canvas parts drawn above (glows, sparkles, lenses…)
  }
  isBack(z, pt, layer) {
    if (layer) return layer === 'back'
    const g = this.g
    let rel = (z - g.O[2]) / g.u
    if (pt) {
      const d = sub(pt, g.O)
      rel = (d[2] - dot(d, g.U) * g.U[2]) / g.u
    }
    return rel > 0.6
  }
  inHead(pt) {
    const g = this.g
    const e = g.headEllipse()
    const q = g.project(pt)
    const dx = q[0] - e.x
    const dy = q[1] - e.y
    const c = Math.cos(e.rot)
    const s = Math.sin(e.rot)
    const a = (dx * c + dy * s) / e.r1
    const b = (-dx * s + dy * c) / e.r2
    return a * a + b * b < 1
  }
  push(z, fn, layer, pt, under = false) {
    if (pt && this.isBack(z, pt, layer) && this.inHead(pt)) return
    ;(under ? this.under : this.over).push([z, fn])
  }
}

/** Queue a mesh. o.face = hide when its local +Y axis points away from the camera (decor on a surface). */
function drawMesh(S, mesh, tf, m, o = {}) {
  const g = S.g
  const cam = g.cam(tf)
  if (o.face !== undefined && cam.B[2] / cam.k > o.face) return
  const { P, A, B, C, k } = cam
  const { O, D, zref } = g
  const nv = mesh.V.length
  const sx = new Float32Array(nv)
  const sy = new Float32Array(nv)
  const sz = new Float32Array(nv)
  const nx = mesh.N ? new Float32Array(nv) : null
  const ny = mesh.N ? new Float32Array(nv) : null
  const nz = mesh.N ? new Float32Array(nv) : null
  const ik = 1 / k
  for (let i = 0; i < nv; i += 1) {
    const v = mesh.V[i]
    const wx = P[0] + v[0] * A[0] + v[1] * B[0] + v[2] * C[0]
    const wy = P[1] + v[0] * A[1] + v[1] * B[1] + v[2] * C[1]
    const wz = P[2] + v[0] * A[2] + v[1] * B[2] + v[2] * C[2]
    const kf = D / Math.max(D * 0.3, D + (wz - zref))
    sx[i] = O[0] + (wx - O[0]) * kf
    sy[i] = O[1] + (wy - O[1]) * kf
    sz[i] = wz
    if (nx) {
      const n = mesh.N[i]
      nx[i] = (n[0] * A[0] + n[1] * B[0] + n[2] * C[0]) * ik
      ny[i] = (n[0] * A[1] + n[1] * B[1] + n[2] * C[1]) * ik
      nz[i] = (n[0] * A[2] + n[1] * B[2] + n[2] * C[2]) * ik
    }
  }
  let fnx = null
  let fny = null
  let fnz = null
  if (mesh.FN) {
    const nf = mesh.FN.length
    fnx = new Float32Array(nf)
    fny = new Float32Array(nf)
    fnz = new Float32Array(nf)
    for (let f = 0; f < nf; f += 1) {
      const n = mesh.FN[f]
      fnx[f] = (n[0] * A[0] + n[1] * B[0] + n[2] * C[0]) * ik
      fny[f] = (n[0] * A[1] + n[1] * B[1] + n[2] * C[1]) * ik
      fnz[f] = (n[0] * A[2] + n[1] * B[2] + n[2] * C[2]) * ik
    }
  }
  const c = mesh.cen
  const wc = add(P, add(add(mul(A, c[0]), mul(B, c[1])), mul(C, c[2])))
  S.items.push({ kind: 0, back: S.isBack(wc[2], wc, o.layer), mesh, m, sx, sy, sz, nx, ny, nz, fnx, fny, fnz })
}

/** Sphere impostor — rasterised per pixel as a perfect sphere (smooth lighting, correct depth). */
function drawSphere(S, tf, r, m, o = {}) {
  const g = S.g
  const cam = g.cam(tf)
  const p = g.project(cam.P)
  S.items.push({
    kind: 1, back: S.isBack(cam.P[2], cam.P, o.layer), m, base: o.base || m.base,
    x: p[0], y: p[1], R: r * cam.k * p[3], z: cam.P[2], Rz: r * cam.k,
  })
}

/** Flat 2D drawing placed with a 3D frame. bias > 0 draws under the geometry (skin decals), otherwise over it. */
function decal(S, tf, fn, o = {}) {
  const g = S.g
  const cam = g.cam(tf)
  const p0 = g.project(cam.P)
  const px = g.project(add(cam.P, cam.A))
  const py = g.project(add(cam.P, cam.B))
  const bias = o.bias || 0
  S.push(cam.P[2] + bias, (ctx) => {
    ctx.transform(px[0] - p0[0], px[1] - p0[1], py[0] - p0[0], py[1] - p0[1], p0[0], p0[1])
    fn(ctx)
  }, o.layer, cam.P, bias > 0)
}

// -----------------------------------------------------------------------------
// software rasteriser (z-buffer + per-pixel normals)
// -----------------------------------------------------------------------------

const RB = { data: null, zb: null, copy: null, cap: 0, canvas: null }
const _px = [0, 0, 0]

function getRaster(w, h) {
  const n = w * h
  if (!RB.data || RB.cap < n) {
    RB.cap = Math.ceil(n * 1.3)
    RB.data = new Uint8ClampedArray(RB.cap * 4)
    RB.copy = new Uint8ClampedArray(RB.cap * 4)
    RB.zb = new Float32Array(RB.cap)
  }
  RB.data.fill(0, 0, n * 4)
  RB.zb.fill(Infinity, 0, n)
  return { w, h, data: RB.data, zb: RB.zb, ox: 0, oy: 0, k: 1 }
}

function rasMesh(B, it) {
  const { mesh, m, sx, sy, sz, nx, ny, nz, fnx, fny, fnz } = it
  const { w, h, data, zb, ox, oy, k } = B
  const F = mesh.F
  const FC = mesh.FC
  const dbl = m.double
  const flat = !!fnx
  for (let f = 0; f < F.length; f += 1) {
    const tri = F[f]
    const ia = tri[0]
    const ib = tri[1]
    const ic = tri[2]
    const fz = flat ? fnz[f] : (nz[ia] + nz[ib] + nz[ic]) / 3
    if (fz > 0.08 && !dbl) continue
    const x0 = (sx[ia] - ox) * k
    const y0 = (sy[ia] - oy) * k
    const x1 = (sx[ib] - ox) * k
    const y1 = (sy[ib] - oy) * k
    const x2 = (sx[ic] - ox) * k
    const y2 = (sy[ic] - oy) * k
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
    const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
    const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)))
    if (minX > maxX || minY > maxY) continue
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-5) continue
    const inv = 1 / area
    const z0 = sz[ia]
    const z1 = sz[ib]
    const z2 = sz[ic]
    let br = m.base[0]
    let bg = m.base[1]
    let bb = m.base[2]
    if (FC) {
      const c = FC[f]
      br = c[0]
      bg = c[1]
      bb = c[2]
    }
    for (let y = minY; y <= maxY; y += 1) {
      const py = y + 0.5
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv
        const w2 = 1 - w0 - w1
        if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue
        const z = w0 * z0 + w1 * z1 + w2 * z2
        const idx = y * w + x
        if (z >= zb[idx]) continue
        let ax
        let ay
        let az
        if (flat) {
          ax = fnx[f]
          ay = fny[f]
          az = fnz[f]
        } else {
          ax = w0 * nx[ia] + w1 * nx[ib] + w2 * nx[ic]
          ay = w0 * ny[ia] + w1 * ny[ib] + w2 * ny[ic]
          az = w0 * nz[ia] + w1 * nz[ib] + w2 * nz[ic]
          const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1
          ax /= l
          ay /= l
          az /= l
        }
        if (az > 0) {
          if (!dbl && az > 0.35) continue
          ax = -ax
          ay = -ay
          az = -az
        }
        shadeInto(ax, ay, az, m, br, bg, bb, _px)
        zb[idx] = z
        const o = idx * 4
        data[o] = _px[0]
        data[o + 1] = _px[1]
        data[o + 2] = _px[2]
        data[o + 3] = 255
      }
    }
  }
}

function rasSphere(B, it) {
  const { m, base } = it
  const { w, h, data, zb, ox, oy, k } = B
  const cx = (it.x - ox) * k
  const cy = (it.y - oy) * k
  const R = it.R * k
  if (R < 0.3) return
  const minX = Math.max(0, Math.floor(cx - R))
  const maxX = Math.min(w - 1, Math.ceil(cx + R))
  const minY = Math.max(0, Math.floor(cy - R))
  const maxY = Math.min(h - 1, Math.ceil(cy + R))
  const iR = 1 / R
  for (let y = minY; y <= maxY; y += 1) {
    const dy = (y + 0.5 - cy) * iR
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x + 0.5 - cx) * iR
      const r2 = dx * dx + dy * dy
      if (r2 > 1) continue
      const nzc = Math.sqrt(1 - r2)
      const z = it.z - nzc * it.Rz
      const idx = y * w + x
      if (z >= zb[idx]) continue
      shadeInto(dx, dy, -nzc, m, base[0], base[1], base[2], _px)
      zb[idx] = z
      const o = idx * 4
      data[o] = _px[0]
      data[o + 1] = _px[1]
      data[o + 2] = _px[2]
      data[o + 3] = 255
    }
  }
}

/** Cut the head silhouette out of everything drawn so far — with a SOFT edge. */
function eraseEllipse(B, e) {
  const { w, h, data, zb, ox, oy, k } = B
  const cx = (e.x - ox) * k
  const cy = (e.y - oy) * k
  const r1 = e.r1 * k
  const r2 = e.r2 * k
  const rr = Math.max(r1, r2)
  const c = Math.cos(e.rot)
  const s = Math.sin(e.rot)
  const minX = Math.max(0, Math.floor(cx - rr))
  const maxX = Math.min(w - 1, Math.ceil(cx + rr))
  const minY = Math.max(0, Math.floor(cy - rr))
  const maxY = Math.min(h - 1, Math.ceil(cy + rr))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const a = (dx * c + dy * s) / r1
      const b = (-dx * s + dy * c) / r2
      const d = a * a + b * b
      if (d < 1) {
        const idx = y * w + x
        const f = d < 0.86 ? 0 : (d - 0.86) / 0.14
        data[idx * 4 + 3] *= f * f * (3 - 2 * f)
        if (f === 0) zb[idx] = Infinity
      }
    }
  }
}

/** Cheap silhouette anti-aliasing (dipakai hanya bila tidak di-supersample). */
function smoothEdges(B) {
  const { w, h, data } = B
  const n = w * h * 4
  const src = RB.copy
  src.set(data.subarray(0, n))
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const idx = y * w + x
      const a0 = src[idx * 4 + 3]
      const a1 = src[(idx - 1) * 4 + 3]
      const a2 = src[(idx + 1) * 4 + 3]
      const a3 = src[(idx - w) * 4 + 3]
      const a4 = src[(idx + w) * 4 + 3]
      if (a0 > 250 && a1 > 250 && a2 > 250 && a3 > 250 && a4 > 250) continue
      if (a0 === 0 && a1 === 0 && a2 === 0 && a3 === 0 && a4 === 0) continue
      let sa = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const j = (idx + dy * w + dx) * 4
          const aj = src[j + 3]
          if (aj) {
            sa += aj
            sr += src[j] * aj
            sg += src[j + 1] * aj
            sb += src[j + 2] * aj
          }
        }
      }
      if (sa === 0) continue
      const o = idx * 4
      data[o] = sr / sa
      data[o + 1] = sg / sa
      data[o + 2] = sb / sa
      data[o + 3] = Math.min(255, (sa / 9) * (a0 > 0 ? 1.15 : 1))
    }
  }
}

function glint(c, x, y, r, a = 1) {
  c.globalCompositeOperation = 'lighter'
  const gr = c.createRadialGradient(x, y, 0, x, y, r)
  gr.addColorStop(0, `rgba(255,255,255,${a})`)
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = gr
  c.beginPath()
  c.arc(x, y, r, 0, TAU)
  c.fill()
  c.fillStyle = `rgba(255,255,255,${a})`
  c.beginPath()
  c.moveTo(x, y - r * 1.7)
  c.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r * 1.7, y)
  c.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r * 1.7)
  c.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r * 1.7, y)
  c.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r * 1.7)
  c.fill()
}

function sparkleAt(S, p, r, t, phase = 0, tint = [255, 255, 255]) {
  const tw = 0.5 + 0.5 * Math.sin(t * 3.2 + phase)
  decal(S, at(p), (c) => {
    c.globalCompositeOperation = 'lighter'
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, r * 2)
    gr.addColorStop(0, css(tint, 0.55 * tw))
    gr.addColorStop(1, css(tint, 0))
    c.fillStyle = gr
    c.beginPath()
    c.arc(0, 0, r * 2, 0, TAU)
    c.fill()
    glint(c, 0, 0, r * (0.5 + 0.5 * tw), 0.9)
  }, { layer: 'front', bias: -5 })
}

function softBlob(S, p, rx, ry, col, a, rot = 0, o = {}) {
  decal(S, at(p), (c) => {
    if (o.add) c.globalCompositeOperation = 'lighter'
    c.rotate(rot)
    c.scale(1, ry / rx)
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, rx)
    gr.addColorStop(0, css(col, a))
    gr.addColorStop(0.55, css(col, a * 0.55))
    gr.addColorStop(1, css(col, 0))
    c.fillStyle = gr
    c.beginPath()
    c.arc(0, 0, rx, 0, TAU)
    c.fill()
  }, { layer: o.layer || 'front', bias: o.bias || 0 })
}

function blushAt(S, g, i, r = 0.34, col = [255, 110, 150], a = 0.5) {
  if (g.facing < 0.2) return
  const p = g.at(i)
  softBlob(S, [p[0], p[1] - 0.02, p[2] + 0.02], r, r * 0.8, col, a, 0, { bias: 4 })
}

// =============================================================================
// face geometry + head pose (dengan smoothing adaptif + gerakan sekunder)
// =============================================================================

const POSE = []
const LMS = []

function buildFace(lms, toCanvas, idx) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const c0 = toCanvas(0, 0)
  const c1 = toCanvas(1, 0)
  const zs = Math.abs(c1.x - c0.x) || 1
  const la = lms[234]
  const lb = lms[454]
  if (!la || !lb) return null
  const ca = toCanvas(la.x, la.y)
  const cb = toCanvas(lb.x, lb.y)
  const fw = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 100

  // --- smoothing adaptif per-landmark (gaya One-Euro): diam = halus, cepat = responsif
  const store = LMS[idx] || (LMS[idx] = { t: 0, p: new Map() })
  const fdt = clamp((now - store.t) / 1000, 0.004, 0.4)
  const fresh = store.t > 0 && fdt < 0.25
  if (!fresh) store.p.clear()
  store.t = now
  const P = (i) => {
    const l = lms[i]
    if (!l) return null
    const e = store.p.get(i)
    if (e && e.stamp === now) return e.v
    const c = toCanvas(l.x, l.y)
    const raw = [c.x, c.y, (l.z || 0) * zs]
    let v = raw
    if (e && fresh) {
      const speed = Math.hypot(raw[0] - e.v[0], raw[1] - e.v[1]) / (fw * fdt) // lebar-wajah / detik
      const tau = 0.14 - 0.125 * smooth(0.05, 1.2, speed)
      v = lerp3(e.v, raw, 1 - Math.exp(-fdt / tau))
    }
    store.p.set(i, { v, stamp: now })
    return v
  }

  const cheekL = P(234)
  const cheekR = P(454)
  const forehead = P(10)
  const chin = P(152)
  if (!cheekL || !cheekR || !forehead || !chin) return null
  const eye = (a, b, iris) => (lms.length > iris && lms[iris] ? P(iris) : mul(add(P(a), P(b)), 0.5))
  const eyeA = eye(33, 133, 468)
  const eyeB = eye(362, 263, 473)
  const eyeMid = mul(add(eyeA, eyeB), 0.5)

  let X = sub(cheekR, cheekL)
  const w2 = Math.hypot(X[0], X[1])
  const w3 = Math.min(len(X), w2 * 1.3)
  X[2] *= 0.85
  X = norm(X)
  let Ur = sub(forehead, chin)
  Ur[2] *= 0.85
  Ur = norm(Ur)
  let U = norm(sub(Ur, mul(X, dot(Ur, X))))
  const prev = POSE[idx]
  const dt = prev ? clamp((now - prev.t) / 1000, 0.004, 0.4) : 1
  const live = !!prev && dt < 0.25
  if (live) {
    const speed = (len(sub(X, prev.X)) + len(sub(U, prev.U))) / dt
    const tau = 0.1 - 0.082 * smooth(0.25, 2.5, speed)
    const kr = 1 - Math.exp(-dt / tau)
    X = norm(lerp3(prev.X, X, kr))
    U = norm(lerp3(prev.U, U, kr))
    U = norm(sub(U, mul(X, dot(U, X))))
  }
  let F = norm(cross(X, U))
  if (F[2] > 0) F = mul(F, -1) // always points toward the camera

  const kp = 1 - Math.exp(-dt / 0.04)
  let u = Math.max(w3, w2) / 2
  if (live) u = prev.u + (u - prev.u) * kp
  let O = sub(eyeMid, mul(F, 0.8 * u))
  if (live) O = lerp3(prev.O, O, kp)
  const toM = (p) => {
    const d = sub(p, O)
    return [dot(d, X) / u, dot(d, U) / u, dot(d, F) / u]
  }
  let top = clamp(toM(forehead)[1] + 0.32, 1.0, 2.0)
  if (live) top = prev.top + (top - prev.top) * (1 - Math.exp(-dt / 0.15))

  // --- gerakan sekunder: pegas teredam yang digerakkan kecepatan kepala (radian)
  let sw = [0, 0]
  let sv = [0, 0]
  if (live && prev.sw) {
    const d = sub(O, prev.O)
    const h = Math.min(dt, 0.033)
    const tx = clamp((-dot(d, X) / (u * dt)) * 0.1, -0.6, 0.6)
    const ty = clamp((-dot(d, U) / (u * dt)) * 0.1, -0.6, 0.6)
    sv = [prev.sv[0] + ((tx - prev.sw[0]) * 90 - prev.sv[0] * 11) * h, prev.sv[1] + ((ty - prev.sw[1]) * 90 - prev.sv[1] * 11) * h]
    sw = [clamp(prev.sw[0] + sv[0] * h, -0.8, 0.8), clamp(prev.sw[1] + sv[1] * h, -0.8, 0.8)]
  }
  POSE[idx] = { X, U, u, O, top, t: now, sw, sv }

  const faceH = len(sub(forehead, chin)) || u * 2.7
  const gap = len(sub(P(14) || chin, P(13) || chin)) / faceH
  const open = clamp((gap - 0.02) / 0.07, 0, 1)

  const g = {
    O, X, U, F, u, zref: eyeMid[2], D: u * 7, top, sway: sw,
    rx: 1.02, rz: 1.1, ry: 1.45, cy: top - 1.45,
    open, facing: clamp(-F[2], -1, 1),
    eL: toM(eyeA), eR: toM(eyeB),
    at: (i) => toM(P(i) || eyeMid),
    cam(tf) {
      const W = (m) => [X[0] * m[0] + U[0] * m[1] + F[0] * m[2], X[1] * m[0] + U[1] * m[1] + F[1] * m[2], X[2] * m[0] + U[2] * m[1] + F[2] * m[2]]
      const k = tf.s * u
      return { P: add(O, mul(W(tf.p), u)), A: mul(W(tf.a), k), B: mul(W(tf.b), k), C: mul(W(tf.c), k), k }
    },
    project(w) {
      const kf = this.D / Math.max(this.D * 0.3, this.D + (w[2] - this.zref))
      return [O[0] + (w[0] - O[0]) * kf, O[1] + (w[1] - O[1]) * kf, w[2], kf]
    },
    /** point on the top of the skull for lateral x / depth z */
    ep(x, z = 0, lift = 0) {
      const q = 1 - (x / this.rx) ** 2 - (z / this.rz) ** 2
      return [x, this.cy + this.ry * Math.sqrt(Math.max(0.02, q)) + lift, z]
    },
    headEllipse() {
      const ax = [mul([X[0], X[1]], 1.02 * u), mul([U[0], U[1]], 1.45 * u), mul([F[0], F[1]], 1.1 * u)]
      let s11 = 0
      let s22 = 0
      let s12 = 0
      ax.forEach((v) => {
        s11 += v[0] * v[0]
        s22 += v[1] * v[1]
        s12 += v[0] * v[1]
      })
      const tr = (s11 + s22) / 2
      const dd = Math.sqrt(((s11 - s22) / 2) ** 2 + s12 * s12)
      const c = this.project(add(O, mul(U, this.cy * u)))
      return { x: c[0], y: c[1], r1: Math.sqrt(Math.max(1, tr + dd)) * 0.96, r2: Math.sqrt(Math.max(1, tr - dd)) * 0.96, rot: 0.5 * Math.atan2(2 * s12, s11 - s22) }
    },
  }
  return g
}

// =============================================================================
// off-screen layer + compositing (supersampling adaptif)
// =============================================================================

let LAYER = null
function getLayer(cv) {
  if (typeof document === 'undefined') return null
  if (!LAYER || LAYER.width !== cv.width || LAYER.height !== cv.height) {
    LAYER = document.createElement('canvas')
    LAYER.width = cv.width
    LAYER.height = cv.height
  }
  return LAYER
}

const MAX_RASTER_PIXELS = 900000
let QS = 2 // faktor supersampling adaptif (1..2), turun otomatis bila perangkat berat

function drawFaceScene(ctx, g, time, renderer) {
  const cv = ctx.canvas
  const layer = cv && getLayer(cv)
  if (!layer || typeof document === 'undefined') return
  const S = new Scene(g, time)
  renderer(S, g)
  const t = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const sc = Math.abs(t.a) || 1
  // Region around the head in user space → device pixels (works with mirrored / dpr-scaled contexts)
  const half = g.u * 4.6
  const rx0 = g.O[0] - half
  const ry0 = g.O[1] - half
  const rx1 = g.O[0] + half
  const ry1 = g.O[1] + half
  const dxa = rx0 * t.a + t.e
  const dxb = rx1 * t.a + t.e
  const dya = ry0 * t.d + t.f
  const dyb = ry1 * t.d + t.f
  const x0 = Math.max(0, Math.floor(Math.min(dxa, dxb)))
  const y0 = Math.max(0, Math.floor(Math.min(dya, dyb)))
  const x1 = Math.min(layer.width, Math.ceil(Math.max(dxa, dxb)))
  const y1 = Math.min(layer.height, Math.ceil(Math.max(dya, dyb)))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 2 || h <= 2) return

  const lc = layer.getContext('2d')
  lc.setTransform(1, 0, 0, 1, 0, 0)
  lc.clearRect(x0, y0, w, h)
  lc.setTransform(t.a, t.b, t.c, t.d, t.e, t.f)
  lc.save()
  lc.beginPath()
  lc.rect(rx0, ry0, half * 2, half * 2)
  lc.clip()
  const run = (list) => {
    list.sort((a, b) => b[0] - a[0])
    list.forEach(([, fn]) => {
      lc.save()
      fn(lc)
      lc.restore()
    })
  }
  run(S.under)

  // ---- rasterise all meshes + spheres with a z-buffer
  const items = S.items
  if (items.length) {
    let bx0 = Infinity
    let by0 = Infinity
    let bx1 = -Infinity
    let by1 = -Infinity
    items.forEach((it) => {
      if (it.kind === 1) {
        bx0 = Math.min(bx0, it.x - it.R)
        bx1 = Math.max(bx1, it.x + it.R)
        by0 = Math.min(by0, it.y - it.R)
        by1 = Math.max(by1, it.y + it.R)
      } else {
        for (let i = 0; i < it.sx.length; i += 1) {
          if (it.sx[i] < bx0) bx0 = it.sx[i]
          if (it.sx[i] > bx1) bx1 = it.sx[i]
          if (it.sy[i] < by0) by0 = it.sy[i]
          if (it.sy[i] > by1) by1 = it.sy[i]
        }
      }
    })
    const ux0 = Math.max(rx0, bx0 - 3)
    const uy0 = Math.max(ry0, by0 - 3)
    const ux1 = Math.min(rx1, bx1 + 3)
    const uy1 = Math.min(ry1, by1 + 3)
    if (ux1 - ux0 > 2 && uy1 - uy0 > 2) {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0
      const area = (ux1 - ux0) * (uy1 - uy0)
      const k = Math.min(sc * QS, Math.sqrt(MAX_RASTER_PIXELS / area)) // supersample
      const bw = Math.max(2, Math.ceil((ux1 - ux0) * k))
      const bh = Math.max(2, Math.ceil((uy1 - uy0) * k))
      const B = getRaster(bw, bh)
      B.ox = ux0
      B.oy = uy0
      B.k = k
      let anyBack = false
      items.forEach((it) => {
        if (!it.back) return
        anyBack = true
        if (it.kind === 1) rasSphere(B, it)
        else rasMesh(B, it)
      })
      if (anyBack) eraseEllipse(B, g.headEllipse())
      items.forEach((it) => {
        if (it.back) return
        if (it.kind === 1) rasSphere(B, it)
        else rasMesh(B, it)
      })
      if (k < sc * 1.4) smoothEdges(B) // blur tepi hanya jika tidak di-supersample
      if (!RB.canvas) RB.canvas = document.createElement('canvas')
      if (RB.canvas.width !== bw || RB.canvas.height !== bh) {
        RB.canvas.width = bw
        RB.canvas.height = bh
      }
      RB.canvas.getContext('2d').putImageData(new ImageData(RB.data.subarray(0, bw * bh * 4), bw, bh), 0, 0)
      lc.imageSmoothingEnabled = true
      lc.imageSmoothingQuality = 'high'
      lc.drawImage(RB.canvas, ux0, uy0, bw / k, bh / k)
      if (t0) {
        const ms = performance.now() - t0
        QS = clamp(QS + (ms > 20 ? -0.08 : ms < 9 ? 0.04 : 0), 1, 2) // otomatis turun jika berat
      }
    }
  }
  run(S.over)
  lc.restore()

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.shadowColor = 'rgba(14,8,34,0.42)'
  ctx.shadowBlur = 14 * sc
  ctx.shadowOffsetX = 2 * sc
  ctx.shadowOffsetY = 5 * sc
  ctx.drawImage(layer, x0, y0, w, h, x0, y0, w, h)
  ctx.restore()
}

// =============================================================================
// shared materials
// =============================================================================

const WHITE_FUR = fur('#fbfbff', { ambient: 0.5 })
const PINK_IN = fur('#ff9db8', { ambient: 0.5, rim: 0.3 })
const NOSE_BLACK = gloss('#181d29', { ks: 1, shine: 80, ambient: 0.22, rimColor: [130, 160, 210] })
const NOSE_PINK = gloss('#ff5c86', { rim: 0.45 })
const DARK_LINE = mat('#3a2418', { ks: 0.2, ambient: 0.5 })
const SATIN_PINK = mat('#ff5fa8', { ks: 0.85, shine: 55, ambient: 0.34, rim: 0.5 })
const GOLD = gold()
const GREEN_LEAF = mat('#34b25a', { ks: 0.35, shine: 24, ambient: 0.4, rim: 0.4, double: true })

const hearth = (pts = 56) => {
  const poly = []
  for (let i = 0; i < pts; i += 1) {
    const t = (i / pts) * TAU
    poly.push([(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - 0.0])
  }
  return poly
}

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// =============================================================================
// the renderers
// =============================================================================

const heartMesh = () => cache('heart', () => puffy(hearth(), 0.3, { center: [0, 0.05], ang: 44, rings: 7, pow: 0.55 }))
const HEART_COLS = ['#ff3d71', '#ff7aa8', '#ff9ec4', '#e11d48', '#ff5c8a', '#ffb3cf', '#ff2d6a']
const HEART_MATS = HEART_COLS.map((c) => gloss(c, { ks: 1, shine: 50, rim: 0.5, rimColor: [255, 190, 210], ambient: 0.34 }))
const pop = (ph, a = 0.1, b = 0.85) => smooth(0, a, ph) * (1 - smooth(b, 1, ph))

/** Translucent soap bubble (screen-space impostor, 3D position). */
function bubblePart(S, p, r, a = 1) {
  const g = S.g
  const cam = g.cam(at(p))
  S.push(cam.P[2], (c) => {
    const q = g.project(cam.P)
    const R = r * cam.k * q[3]
    const body = c.createRadialGradient(q[0], q[1], R * 0.5, q[0], q[1], R)
    body.addColorStop(0, `rgba(255,255,255,${0.03 * a})`)
    body.addColorStop(0.8, `rgba(190,230,255,${0.16 * a})`)
    body.addColorStop(1, `rgba(255,255,255,${0.45 * a})`)
    c.fillStyle = body
    c.beginPath()
    c.arc(q[0], q[1], R, 0, TAU)
    c.fill()
    const rim = c.createLinearGradient(q[0] - R, q[1] - R, q[0] + R, q[1] + R)
    rim.addColorStop(0, `rgba(255,120,200,${0.6 * a})`)
    rim.addColorStop(0.5, `rgba(120,230,255,${0.55 * a})`)
    rim.addColorStop(1, `rgba(255,235,120,${0.6 * a})`)
    c.strokeStyle = rim
    c.lineWidth = Math.max(1, R * 0.08)
    c.beginPath()
    c.arc(q[0], q[1], R * 0.95, 0, TAU)
    c.stroke()
    c.lineCap = 'round'
    c.strokeStyle = `rgba(255,255,255,${0.95 * a})`
    c.lineWidth = Math.max(1, R * 0.11)
    c.beginPath()
    c.arc(q[0], q[1], R * 0.72, Math.PI * 1.12, Math.PI * 1.42)
    c.stroke()
    c.strokeStyle = `rgba(255,255,255,${0.45 * a})`
    c.lineWidth = Math.max(1, R * 0.06)
    c.beginPath()
    c.arc(q[0], q[1], R * 0.7, Math.PI * 0.1, Math.PI * 0.3)
    c.stroke()
  }, undefined, cam.P)
}

function crystal(c, r, rot) {
  c.globalCompositeOperation = 'lighter'
  c.rotate(rot)
  c.strokeStyle = 'rgba(235,245,255,0.95)'
  c.lineWidth = r * 0.13
  c.lineCap = 'round'
  for (let k = 0; k < 6; k += 1) {
    c.save()
    c.rotate((k * Math.PI) / 3)
    c.beginPath()
    c.moveTo(0, 0)
    c.lineTo(0, -r)
    c.moveTo(0, -r * 0.55)
    c.lineTo(r * 0.3, -r * 0.82)
    c.moveTo(0, -r * 0.55)
    c.lineTo(-r * 0.3, -r * 0.82)
    c.stroke()
    c.restore()
  }
}

const RENDERERS_3D = {
  // 1. Puppy 🐶 — telinga menggantung mengayun, hidung glossy, lidah
  puppy(S, g) {
    const T = g.top
    const earMesh = cache('puppyEar', () =>
      deform(
        ellipsoid(0.34, 0.74, 0.13, 18, 12, { oy: -0.74, colorFn: (t) => mixc(hex('#4a230d'), hex('#b8692f'), smooth(0, 0.9, t)) }),
        (v) => [v[0] + 0.1 * (v[1] / 1.48) ** 2, v[1], v[2] - 0.2 * (v[1] / 1.48) ** 2],
      ),
    )
    const innerMesh = cache('puppyEarIn', () =>
      deform(ellipsoid(0.2, 0.56, 0.05, 14, 9, { oy: -0.62 }), (v) => [v[0], v[1], v[2] - 0.12 * (v[1] / 1.2) ** 2]),
    )
    const earMat = fur('#8a4a1d', { ambient: 0.4 })
    ;[-1, 1].forEach((sd) => {
      const tf = frame([sd * 0.98, T - 0.85, -0.05], [-sd * 0.28, 1, 0], [sd * 0.9, 0, 0.45], 0.85).rz(g.sway[0] * 0.9)
      drawMesh(S, earMesh, tf, earMat)
      drawMesh(S, innerMesh, tf.go(0, -0.05, 0.115), PINK_IN)
    })
    const e = g.eR
    softBlob(S, [e[0] * 1.02, e[1] + 0.02, e[2] + 0.02], 0.42, 0.36, [106, 58, 26], 0.8, 0.35, { bias: 3 })
    const n = g.at(1)
    drawSphere(S, at([n[0], n[1] - 0.01, n[2] + 0.05]), 0.17, NOSE_BLACK)
    const long = g.open > 0.45
    const L = long ? 0.62 : 0.4
    const tongue = cache(`tongue${long}`, () =>
      puffy([[-0.16, 0], [0.16, 0], [0.19, -0.35 * L], [0.15, -0.75 * L], [0, -L], [-0.15, -0.75 * L], [-0.19, -0.35 * L]], 0.07, { center: [0, -0.45 * L], ang: 30, rings: 5 }),
    )
    const m14 = g.at(14)
    const ttf = at([m14[0], m14[1] + 0.03, m14[2] + 0.02]).rx(-0.22).rz(g.sway[0] * 0.5)
    drawMesh(S, tongue, ttf, gloss('#ff6f91', { ks: 0.6, shine: 30, rim: 0.4 }))
    decal(S, ttf.go(0, 0, 0.075), (c) => {
      c.strokeStyle = 'rgba(150,20,60,0.55)'
      c.lineWidth = 0.022
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(0, -0.04)
      c.lineTo(0, -0.62 * L)
      c.stroke()
    }, { bias: -1 })
  },

  // 2. Kitty 🐱
  kitty(S, g) {
    const ear = cache('catEar', () =>
      deform(lathe([[0.4, 0], [0.36, 0.22], [0.2, 0.52], [0.0, 0.78]], 16), (v) => [v[0], v[1], v[2] * 0.42]),
    )
    const earIn = cache('catEarIn', () => deform(lathe([[0.4, 0], [0.34, 0.2], [0.17, 0.46], [0.0, 0.66]], 16), (v) => [v[0], v[1], v[2] * 0.3]))
    const furW = fur('#f4f1ff', { ambient: 0.5 })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.62, 0.1, -0.06)
      const tf = frame(p, [sd * 0.3, 1, -0.1], [0, 0, 1], 1).rz(-g.sway[0] * 0.35)
      drawMesh(S, ear, tf, furW)
      drawMesh(S, earIn, tf.go(0, 0.02, 0.1).sc(0.8), fur('#ff7fb0', { ambient: 0.5 }))
    })
    const n = g.at(1)
    const ntf = at([n[0], n[1] - 0.01, n[2] + 0.04])
    drawMesh(S, cache('catNose', () => ellipsoid(0.16, 0.11, 0.1, 14, 9)), ntf, NOSE_PINK)
    const wm = mat('#ffffff', { ks: 0.5, shine: 24, ambient: 0.7, rim: 0.4 })
    ;[205, 425].forEach((idx) => {
      const p = g.at(idx)
      const sd = p[0] < 0 ? -1 : 1
      ;[-0.26, 0, 0.26].forEach((a, i) => {
        const key = `whisk${sd}${i}`
        const mesh = cache(key, () => {
          const pts = []
          for (let k = 0; k <= 12; k += 1) {
            const t = k / 12
            pts.push([sd * 1.05 * t, a * 0.55 * t - 0.2 * t * t, -0.34 * t])
          }
          return tube(pts, (t) => 0.02 * (1 - t * 0.8) + 0.004, 6, { cap: true })
        })
        drawMesh(S, mesh, at([p[0] + sd * 0.1, p[1] + 0.02, p[2] + 0.04]).rz(g.sway[0] * 0.25), wm, { layer: 'front' })
      })
    })
    blushAt(S, g, 205, 0.32, [255, 120, 170], 0.45)
    blushAt(S, g, 425, 0.32, [255, 120, 170], 0.45)
  },

  // 3. Bunny 🐰
  bunny(S, g) {
    const earOut = cache('bunnyEarOut', () => deform(ellipsoid(0.21, 0.98, 0.09, 18, 14, { oy: 0.98 }), (v) => [v[0], v[1], v[2] - 0.18 * (v[1] / 1.96) ** 2]))
    const earIn = cache('bunnyEarIn', () => deform(ellipsoid(0.12, 0.76, 0.04, 14, 12, { oy: 0.92 }), (v) => [v[0], v[1], v[2] - 0.18 * (v[1] / 1.96) ** 2]))
    const flop = (v) => {
      const t = Math.max(0, v[1] / 1.96 - 0.4)
      return [v[0] + 1.3 * t * t, v[1] - 1.1 * t * t, v[2] - 0.2 * (v[1] / 1.96) ** 2]
    }
    const earFlopOut = cache('bunnyEarFlop', () => deform(ellipsoid(0.21, 0.98, 0.09, 18, 18, { oy: 0.98 }), flop))
    const earFlopIn = cache('bunnyEarFlopIn', () => deform(ellipsoid(0.12, 0.76, 0.04, 14, 16, { oy: 0.92 }), flop))
    ;[-1, 1].forEach((sd) => {
      const floppy = sd > 0
      const p = g.ep(sd * 0.44, -0.05, -0.08)
      const tf = frame(p, [sd * (floppy ? 0.18 : 0.12), 1, -0.08], [0, 0, 1], 0.95).rz(-g.sway[0] * (floppy ? 1.1 : 0.6))
      drawMesh(S, floppy ? earFlopOut : earOut, tf, WHITE_FUR)
      drawMesh(S, floppy ? earFlopIn : earIn, tf.go(0, 0, 0.075), fur('#ff8fb0', { ambient: 0.5 }))
    })
    const n = g.at(1)
    drawSphere(S, at([n[0], n[1], n[2] + 0.05]), 0.12, NOSE_PINK)
    const m0 = g.at(0)
    const tooth = cache('tooth', () => ellipsoid(0.08, 0.11, 0.04, 12, 8, { oy: -0.1 }))
    ;[-0.07, 0.07].forEach((dx) => drawMesh(S, tooth, at([m0[0] + dx, m0[1] - 0.04, m0[2] + 0.02]), mat('#ffffff', { ks: 0.5, ambient: 0.62, rim: 0.2 })))
    blushAt(S, g, 205, 0.34, [255, 120, 170], 0.5)
    blushAt(S, g, 425, 0.34, [255, 120, 170], 0.5)
  },

  // 4. Teddy bear 🐻
  bear(S, g) {
    const brown = fur('#8a5226', { ambient: 0.42 })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.7, -0.04, 0.02)
      drawSphere(S, at(p), 0.36, brown)
      drawSphere(S, at([p[0] - sd * 0.01, p[1] - 0.01, p[2] + 0.2]), 0.21, fur('#e9c58c', { ambient: 0.5 }))
    })
    const n = g.at(1)
    const mz = [n[0], n[1] - 0.17, n[2] - 0.1]
    const muz = cache('muzzle', () => ellipsoid(0.5, 0.36, 0.3, 22, 14))
    drawMesh(S, muz, at(mz), fur('#f0d9b0', { ambient: 0.5, ks: 0.14 }))
    const zAt = (x, y) => mz[2] + 0.3 * Math.sqrt(Math.max(0.02, 1 - (x / 0.5) ** 2 - (y / 0.36) ** 2))
    drawMesh(S, cache('bearNose', () => ellipsoid(0.17, 0.12, 0.1, 14, 10)), at([mz[0], mz[1] + 0.1, zAt(0, 0.1) - 0.02]), NOSE_BLACK)
    const smile = cache('bearSmile', () => {
      const pts = []
      for (let k = 0; k <= 20; k += 1) {
        const t = k / 20
        const x = (t - 0.5) * 0.36
        const y = -0.1 - 0.07 * Math.abs(Math.sin(t * Math.PI * 2)) * 0.9
        pts.push([x, y, 0])
      }
      return tube(pts, 0.018, 6, { cap: true })
    })
    drawMesh(S, smile, at([mz[0], mz[1], zAt(0, -0.14) + 0.01]), DARK_LINE)
    drawMesh(S, cache('bearLine', () => tube([[0, 0, 0], [0, -0.1, 0]], 0.018, 6, { cap: true })), at([mz[0], mz[1] + 0.01, zAt(0, -0.05) + 0.01]), DARK_LINE)
    blushAt(S, g, 205, 0.3, [255, 120, 120], 0.4)
    blushAt(S, g, 425, 0.3, [255, 120, 120], 0.4)
  },

  // 5. Froggy 🐸
  froggy(S, g) {
    const green = gloss('#3fb04e', { ks: 0.55, shine: 34, rim: 0.5, rimColor: [190, 255, 170] })
    const spot = mat('#2b8a3c', { ks: 0.2 })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.56, 0.12, 0.12)
      drawSphere(S, at(p), 0.5, green)
      const eb = [p[0], p[1] + 0.03, p[2] + 0.27]
      drawSphere(S, at(eb), 0.36, mat('#ffffff', { ks: 0.7, shine: 60, ambient: 0.55, rim: 0.2 }))
      drawSphere(S, at([eb[0] + sd * 0.02, eb[1] - 0.03, eb[2] + 0.28]), 0.18, NOSE_BLACK)
      drawSphere(S, at([eb[0] - 0.05 + sd * 0.02, eb[1] + 0.03, eb[2] + 0.4]), 0.045, mat('#fff', { ks: 0, ambient: 1.2 }))
      drawMesh(S, cache('lid', () => ellipsoid(0.4, 0.4, 0.4, 20, 8, { lat0: 0.05, lat1: Math.PI / 2 })), at([eb[0], eb[1] + 0.03, eb[2] - 0.06]).rx(-0.55), green, { layer: 'front' })
      drawSphere(S, at([p[0] + sd * 0.3, p[1] + 0.18, p[2] - 0.08]), 0.1, spot)
      drawSphere(S, at([p[0] - sd * 0.28, p[1] + 0.3, p[2] - 0.1]), 0.07, spot)
    })
    blushAt(S, g, 205, 0.3, [255, 130, 150], 0.5)
    blushAt(S, g, 425, 0.3, [255, 130, 150], 0.5)
  },

  // 6. Panda 🐼
  panda(S, g) {
    const black = fur('#1d2432', { ambient: 0.34, rimColor: [160, 180, 215] })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.7, -0.04, 0.02)
      drawSphere(S, at(p), 0.34, black)
      drawSphere(S, at([p[0], p[1], p[2] + 0.2]), 0.18, fur('#4b566b', { ambient: 0.4 }))
    })
    ;[g.eL, g.eR].forEach((e) => {
      const sd = e[0] < 0 ? -1 : 1
      softBlob(S, [e[0] + sd * 0.06, e[1] - 0.04, e[2] + 0.02], 0.46, 0.34, [20, 26, 38], 0.92, sd * -0.55, { bias: 5 })
    })
    const n = g.at(1)
    drawMesh(S, cache('pandaNose', () => ellipsoid(0.17, 0.12, 0.1, 14, 10)), at([n[0], n[1], n[2] + 0.05]), NOSE_BLACK)
    const stalk = cache('bamboo', () => tube([[0, 0, 0], [0.03, 0.5, 0], [0.06, 1.0, 0]], 0.055, 8, { cap: true }))
    const bam = mat('#7ccf6a', { ks: 0.5, shine: 30, rim: 0.4 })
    const base = g.ep(-0.56, 0.1, -0.04)
    const tf = frame(base, [-0.25, 1, 0.05]).rz(-g.sway[0] * 0.3)
    drawMesh(S, stalk, tf, bam)
    ;[0.33, 0.68].forEach((y) => drawMesh(S, cache('bamNode', () => lathe([[0.062, -0.012], [0.075, 0], [0.062, 0.012]], 10)), tf.go(0.03 * (y / 0.5), y, 0), mat('#4d9a45', { ks: 0.3 })))
    ;[[0.0, 0.9, 1.1, 1], [0.0, 0.75, 1.2, -1]].forEach(([, y, ang, sd]) => {
      const lf = cache('bamLeaf', () => ellipsoid(0.07, 0.34, 0.012, 10, 6, { oy: 0.34 }))
      drawMesh(S, lf, tf.go(0.05, y, 0).rz(-sd * ang + g.sway[0] * 0.5 * sd), GREEN_LEAF)
    })
    blushAt(S, g, 205, 0.3, [255, 130, 140], 0.4)
    blushAt(S, g, 425, 0.3, [255, 130, 140], 0.4)
  },

  // 7. Reindeer 🦌
  reindeer(S, g) {
    const antlerMat = mat('#c6a066', { ks: 0.25, shine: 18, ambient: 0.4, rim: 0.4 })
    const antler = (sd) =>
      cache(`antler${sd}`, () => {
        const bez = (t) => {
          const P = [[0, 0, 0], [sd * 0.28, 0.55, -0.12], [sd * 0.8, 0.9, 0.02], [sd * 0.62, 1.55, 0.2]]
          const u = 1 - t
          return [0, 1, 2].map((i) => u * u * u * P[0][i] + 3 * u * u * t * P[1][i] + 3 * u * t * t * P[2][i] + t * t * t * P[3][i])
        }
        const beam = []
        for (let i = 0; i <= 22; i += 1) beam.push(bez(i / 22))
        const parts = [tube(beam, (t) => 0.12 * (1 - t * 0.72) + 0.02, 10, { cap: true })]
        ;[[0.28, 0.5], [0.52, 0.45], [0.75, 0.38]].forEach(([t, l], i) => {
          const s0 = bez(t)
          const pts = []
          for (let k = 0; k <= 8; k += 1) {
            const q = k / 8
            pts.push([s0[0] + sd * (0.35 + i * 0.05) * q, s0[1] + l * q + 0.1 * q * q, s0[2] + 0.18 * q])
          }
          parts.push(tube(pts, (q) => 0.062 * (1 - q * 0.75) + 0.016, 8, { cap: true }))
        })
        const tip = bez(1)
        parts.push(tube([tip, [tip[0] - sd * 0.18, tip[1] + 0.22, tip[2] + 0.06]], 0.035, 6, { cap: true }))
        return parts
      })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.5, -0.1, -0.05)
      const tf = frame(p, [sd * 0.3, 1, -0.2], [0, 0, 1], 0.88).rz(-g.sway[0] * 0.3)
      antler(sd).forEach((mesh) => drawMesh(S, mesh, tf, antlerMat))
      const ball = tf.go(sd * 0.65, 1.1, 0.12)
      drawSphere(S, ball, 0.07, gloss(sd < 0 ? '#e11d48' : '#2fa84f', { rim: 0.5 }))
      const ep = g.ep(sd * 0.98, 0, -0.18)
      const etf = frame(ep, [sd * 0.9, 0.55, 0.0], [0, 0, 1], 1).rz(g.sway[0] * 0.5)
      drawMesh(S, cache('deerEar', () => ellipsoid(0.17, 0.4, 0.07, 14, 8, { oy: 0.2 })), etf, fur('#8a5a30', { ambient: 0.42 }))
      drawMesh(S, cache('deerEarIn', () => ellipsoid(0.09, 0.28, 0.03, 12, 8, { oy: 0.22 })), etf.go(0, 0, 0.065), PINK_IN)
    })
    const n = g.at(1)
    const pulse = 0.55 + 0.45 * Math.sin(S.t * 3)
    softBlob(S, [n[0], n[1], n[2] + 0.1], 0.85, 0.85, [255, 40, 40], 0.35 + 0.25 * pulse, 0, { add: true, bias: -10 })
    drawSphere(S, at([n[0], n[1] - 0.01, n[2] + 0.1]), 0.23, gloss('#f0163f', { rim: 0.6, rimColor: [255, 150, 150], glow: 0.1 }))
  },

  // 8. Crown 👑
  crown(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.45, -0.05], [0, 1, -0.06]).rz(-g.sway[0] * 0.15)
    const band = cache('crownBand', () => lathe([[0.76, 0.0], [0.82, 0.0], [0.86, 0.04], [0.86, 0.3], [0.82, 0.34], [0.76, 0.34]], 40))
    drawMesh(S, band, tf, GOLD)
    const dome = cache('crownDome', () => {
      const prof = [[0, 0.3]]
      for (let i = 0; i <= 8; i += 1) {
        const a = (i / 8) * (Math.PI / 2)
        prof.push([0.74 * Math.cos(a), 0.3 + 0.5 * Math.sin(a)])
      }
      return lathe(prof.slice().reverse().reverse(), 30)
    })
    drawMesh(S, dome, tf, fur('#b3122e', { ks: 0.4, shine: 14, ambient: 0.4, rim: 0.9, rimColor: [255, 110, 120] }))
    const spike = cache('crownSpike', () => lathe([[0.0, 0], [0.13, 0], [0.1, 0.18], [0.04, 0.42], [0.0, 0.52]], 12))
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * TAU
      const hgt = i === 0 ? 1.3 : 1
      const p = [0.8 * Math.sin(a), 0.33, 0.8 * Math.cos(a)]
      const stf = tf.go(p[0], p[1], p[2])
      drawMesh(S, spike, hgt === 1 ? stf : stf.sc(hgt), GOLD)
      drawSphere(S, stf.go(0, 0.52 * hgt + 0.04, 0), 0.06, gloss(i % 2 ? '#fff0f6' : '#fff6d6', { ks: 0.9, rim: 0.3 }))
    }
    ;[[-0.62, '#e11d48', 0.075], [0, '#2563eb', 0.1], [0.62, '#10b981', 0.075]].forEach(([a, col, r]) => {
      drawSphere(S, tf.go(0.87 * Math.sin(a), 0.18, 0.87 * Math.cos(a)), r, gloss(col, { rim: 0.6, ks: 1 }))
    })
    for (let i = -5; i <= 5; i += 1) {
      const a = i * 0.26
      if (Math.abs(a - 0) < 0.1 || Math.abs(Math.abs(a) - 0.62) < 0.08) continue
      drawSphere(S, tf.go(0.86 * Math.sin(a), 0.045, 0.86 * Math.cos(a)), 0.035, gloss('#fffaf0', { rim: 0.2 }))
    }
    sparkleAt(S, tf.go(0.0, 0.62, 0.0).p, 0.12, S.t, 0, [255, 235, 160])
  },

  // 9. Flower wreath 🌸
  flower_crown(S, g) {
    const T = g.top
    const yr = T - 0.58
    const sc = Math.sqrt(1 - ((yr - g.cy) / g.ry) ** 2)
    const rx = g.rx * sc + 0.03
    const rz = g.rz * sc + 0.03
    const pt = (phi, lift = 0) => [rx * Math.sin(phi), yr - 0.1 * Math.cos(phi) + lift, rz * Math.cos(phi) - 0.02]
    const vine = cache(`vine${T.toFixed(1)}`, () => {
      const pts = []
      for (let i = 0; i <= 44; i += 1) pts.push(pt(-2.5 + (i / 44) * 5.0))
      return tube(pts, 0.045, 8, { cap: true })
    })
    drawMesh(S, vine, ROOT, mat('#3b9150', { ks: 0.25, ambient: 0.4, rim: 0.4 }), { layer: undefined })
    const pal = [['#ff7eb6', '#ffe14d'], ['#fff3a0', '#ff9f43'], ['#c79bff', '#fff6b0'], ['#ff9ab0', '#ffd34d'], ['#8fd3ff', '#ffe56a'], ['#ffffff', '#ffc94d'], ['#ff6b8b', '#fff0a0']]
    const petal = cache('petal', () => deform(ellipsoid(0.15, 0.04, 0.25, 10, 6, { oy: 0 }), (v) => [v[0], v[1] + 0.2 * v[2] * v[2], v[2] + 0.2]))
    const leaf = cache('leafW', () => ellipsoid(0.08, 0.02, 0.24, 10, 6, { oy: 0 }))
    const n = 9
    for (let i = 0; i < n; i += 1) {
      const phi = -1.85 + (i / (n - 1)) * 3.7
      const p = pt(phi, 0.0)
      const out = [Math.sin(phi) * 0.8, 0.55, Math.cos(phi) * 0.8]
      const f = frame(p, out, [0, 1, 0], i % 3 === 0 ? 1.45 : 1.15)
      if (g.cam(f).B[2] / g.cam(f).k > 0.8) continue
      const [pc, cc] = pal[i % pal.length]
      const pm = mat(pc, { ks: 0.4, shine: 28, ambient: 0.42, rim: 0.45, double: true })
      for (let k = 0; k < 6; k += 1) drawMesh(S, petal, f.ry((k / 6) * TAU).rx(-0.12), pm)
      drawSphere(S, f.go(0, 0.06, 0), 0.1, gloss(cc, { ks: 0.5, rim: 0.3 }))
      if (i % 2 === 0) {
        const lf = frame(pt(phi + 0.2, 0.0), [Math.sin(phi + 0.2) * 0.9, 0.2, Math.cos(phi + 0.2) * 0.9], [0, 1, 0])
        drawMesh(S, leaf, lf, GREEN_LEAF)
      }
    }
  },

  // 10. Angel 😇 — halo + sayap mengepak dan mengayun
  angel(S, g) {
    const T = g.top
    const bob = Math.sin(S.t * 2) * 0.05
    const tf = frame([0, T + 0.35 + bob, -0.12], [0, 1, -0.2]).rz(-g.sway[0] * 0.25)
    softBlob(S, tf.p, 1.1, 0.5, [255, 214, 90], 0.5, 0, { add: true, bias: -20 })
    const ring = cache('halo', () => {
      const pts = []
      for (let i = 0; i < 56; i += 1) pts.push([0.66 * Math.cos((i / 56) * TAU), 0, 0.66 * Math.sin((i / 56) * TAU)])
      return tube(pts, 0.075, 12, { closed: true, up: [0, 1, 0] })
    })
    drawMesh(S, ring, tf, mat('#ffd54a', { ks: 0.95, shine: 36, ambient: 0.5, rim: 0.7, rimColor: [255, 250, 190], glow: 0.35 }), { layer: 'front' })
    const feather = cache('feather', () => deform(ellipsoid(0.12, 0.6, 0.035, 12, 9, { oy: 0.6 }), (v) => [v[0] + 0.12 * (v[1] / 1.2) ** 2, v[1], v[2]]))
    const flap = Math.sin(S.t * 3.2) * 0.1
    ;[-1, 1].forEach((sd) => {
      const base = [sd * 0.95, T - 0.8, -0.55]
      const lens = [0.9, 1.12, 1.15, 1.0, 0.8]
      lens.forEach((L, k) => {
        const ang = 0.15 + k * 0.3 + flap + g.sway[0] * 0.5 * sd
        const dir = [sd * Math.sin(ang), Math.cos(ang) * 0.9, -0.3]
        const f = frame(base, dir, [0, 0, 1], L * 0.9)
        drawMesh(S, feather, f, mat(k % 2 ? '#e8f4ff' : '#ffffff', { ks: 0.2, ambient: 0.55, rim: 0.5, rimColor: [190, 225, 255] }), { layer: 'back' })
      })
    })
    sparkleAt(S, [-0.9, T + 0.75, 0.05], 0.1, S.t, 0, [255, 240, 170])
    sparkleAt(S, [0.82, T + 0.95, 0.1], 0.13, S.t, 1.7, [255, 250, 200])
    sparkleAt(S, [1.25, T + 0.35, 0.1], 0.08, S.t, 3.1, [255, 240, 170])
    blushAt(S, g, 205, 0.32, [255, 130, 150], 0.42)
    blushAt(S, g, 425, 0.32, [255, 130, 150], 0.42)
  },

  // 11. Devil 😈
  devil(S, g) {
    const horn = (sd) =>
      cache(`horn${sd}`, () => {
        const pts = []
        for (let i = 0; i <= 26; i += 1) {
          const t = i / 26
          pts.push([sd * (0.35 * t + 0.28 * t * t * t), 0.95 * t - 0.12 * t * t, 0.12 * Math.sin(t * Math.PI)])
        }
        return tube(pts, (t) => (0.17 * (1 - t) ** 1.2 + 0.012) * (1 + 0.08 * Math.sin(t * 46)), 12, { cap: true })
      })
    const hm = mat('#c8192b', { ks: 0.9, shine: 46, ambient: 0.3, rim: 0.7, rimColor: [255, 150, 90] })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.54, 0.0, -0.04)
      const tf = frame(p, [sd * 0.3, 1, 0.1], [0, 0, 1], 1.05).rz(-g.sway[0] * 0.15)
      softBlob(S, tf.go(sd * 0.1, 0.2, 0).p, 0.45, 0.45, [255, 60, 40], 0.3, 0, { add: true, bias: -20 })
      drawMesh(S, horn(sd), tf, hm)
      drawMesh(S, cache('hornBase', () => lathe([[0, 0], [0.24, 0], [0.22, 0.05], [0.16, 0.1], [0, 0.11]], 16)), tf.go(0, -0.06, 0), mat('#3b0a12', { ks: 0.4, rim: 0.4 }))
    })
    sparkleAt(S, [-0.5, g.top + 0.55, 0.0], 0.07, S.t, 0.4, [255, 140, 80])
    sparkleAt(S, [0.62, g.top + 0.75, 0.05], 0.06, S.t, 2.2, [255, 110, 70])
  },

  // 12. Strawberry 🍓
  strawberry(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.72, -0.04], [0, 1, -0.05]).rz(-g.sway[0] * 0.2)
    const prof = [[0, 0], [0.64, 0], [0.84, 0.13], [0.92, 0.32], [0.88, 0.55], [0.72, 0.8], [0.44, 1.02], [0.2, 1.12], [0, 1.15]]
    const body = cache('strawBody', () => lathe(prof, 32))
    drawMesh(S, body, tf, gloss('#e8193f', { ks: 0.55, shine: 34, ambient: 0.34, rim: 0.7, rimColor: [255, 150, 150] }))
    const seed = cache('seed', () => ellipsoid(0.028, 0.05, 0.016, 8, 5))
    const sm = mat('#ffe58a', { ks: 0.5, ambient: 0.55 })
    const surf = (t) => {
      const f = t * (prof.length - 1)
      const i = Math.min(prof.length - 2, Math.floor(f))
      const k = f - i
      const a = prof[i]
      const b = prof[i + 1]
      const r = a[0] + (b[0] - a[0]) * k
      const y = a[1] + (b[1] - a[1]) * k
      const dr = b[0] - a[0]
      const dy = b[1] - a[1]
      const l = Math.hypot(dr, dy) || 1
      return { r, y, nr: dy / l, ny: -dr / l }
    }
    for (let i = 0; i < 44; i += 1) {
      const s = surf(0.18 + 0.7 * (i / 44))
      const th = i * 2.399
      const c = Math.cos(th)
      const sn = Math.sin(th)
      const n = [s.nr * c, s.ny, s.nr * sn]
      const p = [(s.r + 0.012) * c, s.y, (s.r + 0.012) * sn]
      drawMesh(S, seed, tf.child(p, n, [0, 1, 0]), sm, { face: 0.4 })
    }
    const leaf = cache('calyxLeaf', () => ellipsoid(0.17, 0.42, 0.035, 12, 8, { oy: 0.42 }))
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + 0.2
      const lf = tf.child([0, 1.12, 0], [Math.cos(a) * 0.95, 0.35 + g.sway[0] * 0.3 * Math.cos(a), Math.sin(a) * 0.95], [0, 1, 0], 0.85)
      drawMesh(S, leaf, lf, mat(i % 2 ? '#2f9e4f' : '#3fbf63', { ks: 0.35, rim: 0.4, double: true }))
    }
    drawMesh(S, cache('stem', () => tube([[0, 0, 0], [0.03, 0.2, 0], [0.1, 0.33, 0]], 0.05, 8, { cap: true })), tf.go(0, 1.12, 0), mat('#2c7a3a', { ks: 0.3 }))
    blushAt(S, g, 205, 0.32, [255, 100, 130], 0.5)
    blushAt(S, g, 425, 0.32, [255, 100, 130], 0.5)
  },

  // 13. Toadstool 🍄
  mushroom(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.78, -0.02], [0, 1, -0.05]).rz(-g.sway[0] * 0.2)
    const prof = [[0, 0.02], [0.5, 0.02], [0.86, 0.05], [0.97, 0.12], [0.96, 0.24], [0.84, 0.42], [0.6, 0.57], [0.3, 0.65], [0, 0.68]]
    const cap = cache('cap', () =>
      lathe(prof, 36, { colorFn: (th, t) => (t < 0.2 ? hex('#f7e9c9') : mixc(hex('#e0193f'), hex('#ff5a6e'), smooth(0.5, 1, t) * 0.4)) }),
    )
    drawMesh(S, cap, tf, gloss('#e0193f', { ks: 0.6, shine: 36, ambient: 0.34, rim: 0.6, rimColor: [255, 170, 170] }))
    const surf = (t) => {
      const f = t * (prof.length - 1)
      const i = Math.min(prof.length - 2, Math.floor(f))
      const k = f - i
      const a = prof[i]
      const b = prof[i + 1]
      const dr = b[0] - a[0]
      const dy = b[1] - a[1]
      const l = Math.hypot(dr, dy) || 1
      return { r: a[0] + dr * k, y: a[1] + dy * k, nr: dy / l, ny: -dr / l }
    }
    const spot = cache('spot', () => ellipsoid(1, 0.28, 1, 18, 6))
    ;[[0.0, 0.88, 0.17], [0.9, 0.7, 0.13], [-0.9, 0.7, 0.13], [0.45, 0.82, 0.1], [-0.5, 0.84, 0.095], [1.6, 0.58, 0.11], [-1.55, 0.58, 0.1], [0.25, 0.55, 0.085]].forEach(([th, t, r]) => {
      const s = surf(t)
      const a = th
      const n = [s.nr * Math.sin(a), s.ny, s.nr * Math.cos(a)]
      const p = [(s.r + 0.005) * Math.sin(a), s.y, (s.r + 0.005) * Math.cos(a)]
      drawMesh(S, spot, tf.child(p, n, [0, 1, 0], r), mat('#fffdf4', { ks: 0.5, shine: 30, ambient: 0.5, rim: 0.2 }), { face: 0.45 })
    })
    sparkleAt(S, [0.95, T + 0.3, 0.2], 0.08, S.t, 0.5, [255, 255, 255])
    blushAt(S, g, 205, 0.32, [255, 110, 140], 0.5)
    blushAt(S, g, 425, 0.32, [255, 110, 140], 0.5)
  },

  // 14. Ribbon 🎀 — pita mengayun
  ribbon(S, g) {
    const T = g.top
    const loop = (sd) =>
      cache(`loop${sd}`, () => {
        const poly = []
        for (let i = 0; i < 40; i += 1) {
          const t = (i / 40) * TAU
          poly.push([sd * (0.52 + 0.52 * Math.cos(t)), 0.46 * Math.sin(t) * (0.55 + 0.45 * Math.cos(t))])
        }
        return puffy(poly, 0.17, { center: [sd * 0.52, 0], ang: 36, rings: 6 })
      })
    const fold = (sd) =>
      cache(`fold${sd}`, () => {
        const poly = []
        for (let i = 0; i < 32; i += 1) {
          const t = (i / 32) * TAU
          poly.push([sd * (0.48 + 0.3 * Math.cos(t)), 0.2 * Math.sin(t) * (0.6 + 0.4 * Math.cos(t))])
        }
        return puffy(poly, 0.05, { center: [sd * 0.48, 0], ang: 24, rings: 4 })
      })
    const tail = cache('tail', () => puffy([[-0.14, 0], [0.14, 0], [0.25, -0.66], [0, -0.52], [-0.25, -0.66]], 0.07, { center: [0, -0.3], ang: 30, rings: 5 }))
    const tf = frame([0.5, T - 0.5, 0.18], [0.35, 1, 0.1], [0, 0, 1], 0.78).rz(-0.2 - g.sway[0] * 0.4)
    ;[0.4, -0.4].forEach((a) => drawMesh(S, tail, tf.go(0, -0.02, -0.05).rz(a + g.sway[0] * 0.8), mat('#f2428f', { ks: 0.8, shine: 55, rim: 0.45 })))
    ;[-1, 1].forEach((sd) => {
      drawMesh(S, loop(sd), tf, SATIN_PINK)
      drawMesh(S, fold(sd), tf.go(0, 0, 0.1), mat('#ff9fcb', { ks: 0.9, shine: 70, ambient: 0.4, rim: 0.4 }))
    })
    drawMesh(S, cache('knot', () => ellipsoid(0.22, 0.26, 0.2, 16, 12)), tf.go(0, 0, 0.06), mat('#f2428f', { ks: 0.95, shine: 60, rim: 0.5 }))
    sparkleAt(S, tf.go(0.8, 0.55, 0.3).p, 0.08, S.t, 0.9, [255, 200, 230])
    blushAt(S, g, 205, 0.32, [255, 110, 160], 0.5)
    blushAt(S, g, 425, 0.32, [255, 110, 160], 0.5)
  },

  // 15. Heart blush 💖
  heart_blush(S, g) {
    const T = g.top
    const heart = heartMesh()
    const cols = ['#ff3d71', '#ff7aa8', '#ff9ec4', '#e11d48', '#ff5c8a', '#ffb3cf']
    const pm = (c) => gloss(c, { ks: 1, shine: 50, rim: 0.5, rimColor: [255, 190, 210], ambient: 0.34 })
    const pulse = 1 + 0.09 * Math.sin(S.t * 5)
    ;[205, 425].forEach((i) => {
      const p = g.at(i)
      const tf = at([p[0], p[1] - 0.02, p[2] + 0.1], 0.3 * pulse).rz(p[0] < 0 ? 0.2 : -0.2)
      if (g.facing > 0.15) drawMesh(S, heart, tf, pm('#ff2d6a'))
    })
    for (let i = 0; i < 6; i += 1) {
      const a = S.t * 0.7 + (i / 6) * TAU
      const bob = Math.sin(S.t * 1.7 + i * 1.3) * 0.18
      const p = [Math.sin(a) * 1.5, T + 0.15 + 0.5 * ((i % 3) / 2) + bob, Math.cos(a) * 0.9 - 0.15]
      const size = 0.22 + (i % 3) * 0.06
      drawMesh(S, heart, at(p, size).ry(S.t * 1.8 + i).rz(Math.sin(S.t + i) * 0.25), pm(cols[i]))
      if (i % 2 === 0) sparkleAt(S, add(p, [0.15, 0.2, 0.1]), 0.05, S.t, i, [255, 210, 230])
    }
  },

  // 16. Star glam ✨
  star_glam(S, g) {
    const T = g.top
    const star = cache('star3d', () => starMesh(1, 0.47, 0.3))
    const metals = [gold('#ffd24a', { ks: 1, shine: 60 }), gold('#f6f1ff', { ks: 1, shine: 60 }), gold('#ff9ed0', { ks: 1, shine: 60 }), gold('#8fe3ff', { ks: 1, shine: 60 })]
    ;[205, 425].forEach((i, k) => {
      const p = g.at(i)
      if (g.facing > 0.15) {
        drawMesh(S, star, at([p[0], p[1] - 0.04, p[2] + 0.12], 0.22).rz(k ? 0.25 : -0.25).ry(Math.sin(S.t * 2 + k) * 0.35), metals[0])
        sparkleAt(S, [p[0] + (k ? 0.3 : -0.3), p[1] + 0.22, p[2] + 0.25], 0.06, S.t, k * 2, [255, 255, 255])
      }
    })
    ;[g.eL, g.eR].forEach((e, k) => {
      for (let i = 0; i < 5; i += 1) {
        const a = -0.6 + i * 0.35
        const sd = e[0] < 0 ? -1 : 1
        if (g.facing > 0.15) drawSphere(S, at([e[0] + sd * 0.3 * Math.sin(a) * 1.4, e[1] - 0.32 - 0.1 * Math.cos(a * 2), e[2] + 0.08]), 0.028 + (i % 2) * 0.012, gold(['#ffffff', '#ffd24a', '#ff9ed0'][(i + k) % 3], { ks: 1, shine: 70, ambient: 0.6 }))
      }
    })
    for (let i = 0; i < 6; i += 1) {
      const a = S.t * 0.55 + (i / 6) * TAU
      const p = [Math.sin(a) * 1.45, T + 0.12 + 0.35 * ((i * 7) % 3) + Math.sin(S.t * 1.5 + i) * 0.15, Math.cos(a) * 0.9 - 0.1]
      const size = 0.2 + (i % 3) * 0.07
      drawMesh(S, star, at(p, size).ry(S.t * 1.5 + i).rz(S.t * 0.6 + i), metals[i % metals.length])
      sparkleAt(S, p, 0.06 + (i % 2) * 0.03, S.t, i * 1.3, [255, 255, 255])
    }
  },

  // 17. Cyber shades 🕶️
  shades(S, g) {
    const ez = Math.max(g.eL[2], g.eR[2]) + 0.14
    const ex = Math.max(0.5, (Math.abs(g.eL[0]) + Math.abs(g.eR[0])) / 2)
    const cy = (g.eL[1] + g.eR[1]) / 2 + 0.02
    const w = ex * 1.52 + 0.1
    const h = w * 0.6
    const rr = h * 0.34
    const rect = (ww, hh, r, n = 7) => {
      const pts = []
      const cs = [[ww / 2 - r, hh / 2 - r, 0], [-ww / 2 + r, hh / 2 - r, 1], [-ww / 2 + r, -hh / 2 + r, 2], [ww / 2 - r, -hh / 2 + r, 3]]
      cs.forEach(([x, y, q]) => {
        for (let i = 0; i <= n; i += 1) {
          const a = (q * Math.PI) / 2 + ((i / n) * Math.PI) / 2
          pts.push([x + r * Math.cos(a), y + r * Math.sin(a), 0])
        }
      })
      return pts
    }
    const key = `rect${w.toFixed(2)}`
    const frameMesh = cache(`frame${key}`, () => tube(rect(w, h, rr), 0.05, 8, { closed: true, up: [0, 0, 1] }))
    const frameMat = gloss('#0b1020', { ks: 1, shine: 60, ambient: 0.28, rim: 1, rimColor: [70, 220, 255] })
    const lensColors = [['#22d3ee', '#0e7490'], ['#e879f9', '#a21caf']]
    ;[-1, 1].forEach((sd, k) => {
      const c = [sd * ex, cy, ez]
      drawMesh(S, frameMesh, at(c), frameMat)
      const poly = rect(w, h, rr)
      decal(S, at(c), (cx) => {
        cx.beginPath()
        poly.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])))
        cx.closePath()
        const gr = cx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
        gr.addColorStop(0, css(lighten(hex(lensColors[k][0]), 0.2), 0.88))
        gr.addColorStop(0.55, css(hex(lensColors[k][0]), 0.82))
        gr.addColorStop(1, css(hex(lensColors[k][1]), 0.9))
        cx.fillStyle = gr
        cx.fill()
        cx.save()
        cx.clip()
        cx.fillStyle = 'rgba(255,255,255,0.35)'
        cx.beginPath()
        cx.moveTo(-w * 0.45, h * 0.5)
        cx.lineTo(-w * 0.05, -h * 0.5)
        cx.lineTo(w * 0.1, -h * 0.5)
        cx.lineTo(-w * 0.3, h * 0.5)
        cx.fill()
        const sweep = ((S.t * 0.45 + k * 0.15) % 1.6) - 0.3
        const sx = -w / 2 + sweep * w * 1.3
        const sg = cx.createLinearGradient(sx - w * 0.12, 0, sx + w * 0.12, 0)
        sg.addColorStop(0, 'rgba(255,255,255,0)')
        sg.addColorStop(0.5, 'rgba(255,255,255,0.55)')
        sg.addColorStop(1, 'rgba(255,255,255,0)')
        cx.fillStyle = sg
        cx.fillRect(sx - w * 0.12, -h / 2, w * 0.24, h)
        const hl = cx.createLinearGradient(0, -h / 2, 0, h / 2)
        hl.addColorStop(0, 'rgba(255,255,255,0.28)')
        hl.addColorStop(0.4, 'rgba(255,255,255,0)')
        hl.addColorStop(1, 'rgba(0,0,0,0.25)')
        cx.fillStyle = hl
        cx.fillRect(-w / 2, -h / 2, w, h)
        cx.restore()
      }, { bias: -2 })
    })
    const bridge = cache('bridge', () => tube([[-0.16, 0.1, 0], [-0.07, 0.17, 0.05], [0.07, 0.17, 0.05], [0.16, 0.1, 0]], 0.04, 8, { cap: true }))
    drawMesh(S, bridge, at([0, cy, ez]), frameMat)
    ;[-1, 1].forEach((sd) => {
      const arm = cache(`arm${sd}${w.toFixed(2)}`, () => {
        const pts = []
        const x0 = sd * (w / 2)
        for (let i = 0; i <= 14; i += 1) {
          const t = i / 14
          pts.push([x0 + sd * (0.99 - ex - w / 2) * t, h * 0.3 - 0.1 * t * t, -1.9 * t])
        }
        return tube(pts, 0.036, 8, { cap: true })
      })
      drawMesh(S, arm, at([sd * ex, cy, ez]), frameMat)
    })
  },

  // 18. Gentleman 👓
  retro_glasses(S, g) {
    const ez = Math.max(g.eL[2], g.eR[2]) + 0.12
    const ex = Math.max(0.5, (Math.abs(g.eL[0]) + Math.abs(g.eR[0])) / 2)
    const cy = (g.eL[1] + g.eR[1]) / 2 + 0.01
    const R = ex * 0.62
    const ringMesh = cache(`ring${R.toFixed(2)}`, () => {
      const pts = []
      for (let i = 0; i < 40; i += 1) pts.push([R * Math.cos((i / 40) * TAU), R * Math.sin((i / 40) * TAU), 0])
      return tube(pts, 0.032, 8, { closed: true, up: [0, 0, 1] })
    })
    const wire = gold('#e0b53f', { ks: 1, shine: 60 })
    ;[-1, 1].forEach((sd) => {
      const c = [sd * ex, cy, ez]
      drawMesh(S, ringMesh, at(c), wire)
      decal(S, at(c), (cx) => {
        cx.beginPath()
        cx.arc(0, 0, R, 0, TAU)
        const gr = cx.createRadialGradient(-R * 0.3, -R * 0.35, 0, 0, 0, R)
        gr.addColorStop(0, 'rgba(255,255,255,0.28)')
        gr.addColorStop(1, 'rgba(150,200,255,0.1)')
        cx.fillStyle = gr
        cx.fill()
        cx.strokeStyle = 'rgba(255,255,255,0.7)'
        cx.lineWidth = R * 0.07
        cx.lineCap = 'round'
        cx.beginPath()
        cx.arc(0, 0, R * 0.76, Math.PI * 1.12, Math.PI * 1.45)
        cx.stroke()
      }, { bias: -2 })
      const arm = cache(`rarm${sd}${R.toFixed(2)}`, () => {
        const pts = []
        for (let i = 0; i <= 12; i += 1) {
          const t = i / 12
          pts.push([sd * R + sd * (1.0 - ex - R) * t, R * 0.2 - 0.12 * t * t, -1.9 * t])
        }
        return tube(pts, 0.024, 6, { cap: true })
      })
      drawMesh(S, arm, at(c), wire)
    })
    drawMesh(S, cache('rbridge', () => tube([[-0.28, 0.05, 0], [-0.12, 0.2, 0.05], [0.12, 0.2, 0.05], [0.28, 0.05, 0]], 0.026, 8, { cap: true })), at([0, cy, ez]).sc(ex / 0.5), wire)
    const n = g.at(2)
    const lip = g.at(0)
    const mp = [lerp3(n, lip, 0.5)[0], lerp3(n, lip, 0.5)[1], Math.max(n[2], lip[2]) + 0.06]
    const wing = (sd) =>
      cache(`mwing${sd}`, () => {
        const base = [[0, 0.02], [0.14, -0.03], [0.3, -0.07], [0.47, -0.04], [0.6, 0.06], [0.65, 0.18], [0.58, 0.26], [0.49, 0.23], [0.47, 0.16]]
        return tube(base.map(([x, y]) => [sd * x, y, 0.0]), (t) => 0.115 * Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI * 0.75) + 0.014, 10, { cap: true })
      })
    const mm = gloss('#1a1a22', { ks: 0.8, shine: 28, ambient: 0.3, rim: 0.7, rimColor: [120, 130, 160] })
    ;[-1, 1].forEach((sd) => drawMesh(S, wing(sd), at(mp, 0.9), mm))
  },

  // 19. Cowboy 🤠
  cowboy(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.56, -0.05], [0, 1, -0.1], [0, 0, 1]).rz(-g.sway[0] * 0.15)
    const brim = cache('brim', () =>
      deform(
        lathe([[0.5, -0.03], [1.5, -0.03], [1.6, 0.0], [1.5, 0.04], [0.5, 0.04]], 52),
        (v) => [v[0], v[1] + 0.4 * (v[0] / 1.6) ** 2 - 0.1 * (v[2] / 1.6) ** 2, v[2]],
      ),
    )
    const felt = mat('#b88b55', { ks: 0.14, shine: 10, ambient: 0.42, rim: 0.4, double: true })
    drawMesh(S, brim, tf, felt)
    const crownMesh = cache('hatCrown', () =>
      deform(
        lathe([[0.6, 0.0], [0.64, 0.12], [0.64, 0.38], [0.58, 0.64], [0.46, 0.78], [0.24, 0.82], [0, 0.8]], 40),
        (v) => [v[0], v[1] - 0.17 * Math.exp(-((v[0] / 0.2) ** 2)) * smooth(0.5, 0.8, v[1]), v[2] * (1 - 0.08 * smooth(0.4, 0.8, v[1]))],
      ),
    )
    drawMesh(S, crownMesh, tf, mat('#c79b62', { ks: 0.16, shine: 12, ambient: 0.4, rim: 0.4 }))
    drawMesh(S, cache('hatBand', () => lathe([[0.63, 0.1], [0.68, 0.1], [0.68, 0.24], [0.63, 0.24]], 40)), tf, mat('#3a1f0e', { ks: 0.5, shine: 24, ambient: 0.36, rim: 0.4 }))
    const bz = 0.7
    drawMesh(S, cache('buckle', () => ellipsoid(0.15, 0.12, 0.04, 16, 8)), tf.go(0, 0.17, bz), GOLD)
    drawMesh(S, cache('hatStar', () => starMesh(1, 0.46, 0.35)), tf.go(0, 0.17, bz + 0.04).sc(0.085), gold('#fff0a0', { ks: 1, shine: 60 }))
    for (let i = -3; i <= 3; i += 1) {
      if (i === 0) continue
      const a = i * 0.36
      drawSphere(S, tf.go(0.69 * Math.sin(a), 0.17, 0.69 * Math.cos(a)), 0.035, GOLD)
    }
  },

  // 20. Party 🥳
  party(S, g) {
    const T = g.top
    const tf = frame([0.22, T - 0.5, -0.05], [0.28, 1, -0.15], [0, 0, 1]).rz(-g.sway[0] * 0.4)
    const pal = ['#ff5fa2', '#22d3ee', '#ffd400', '#a855f7'].map(hex)
    const cone = cache('partyCone', () =>
      lathe([[0.64, 0], [0.55, 0.26], [0.42, 0.58], [0.26, 0.92], [0.1, 1.2], [0, 1.34]], 36, {
        colorFn: (th, t) => pal[Math.floor(((th / TAU) * 3 + t * 6) % 4 + 4) % 4],
      }),
    )
    drawMesh(S, cone, tf, mat('#ff5fa2', { ks: 0.5, shine: 34, ambient: 0.4, rim: 0.5 }))
    const tinsel = cache('tinsel', () => {
      const pts = []
      for (let i = 0; i < 36; i += 1) pts.push([0.64 * Math.cos((i / 36) * TAU), 0, 0.64 * Math.sin((i / 36) * TAU)])
      return tube(pts, 0.07, 8, { closed: true, up: [0, 1, 0] })
    })
    drawMesh(S, tinsel, tf, mat('#ffd54a', { ks: 0.8, shine: 36, ambient: 0.4, rim: 0.7, metal: true }))
    const tip = tf.go(0, 1.36, 0)
    drawSphere(S, tip, 0.14, fur('#ffe45c', { ambient: 0.5, rim: 0.8 }))
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU
      drawSphere(S, tip.go(Math.cos(a) * 0.1, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.1), 0.07, fur('#fff0a0', { ambient: 0.55, rim: 0.7 }))
    }
    const s1 = g.at(234)
    const s2 = g.at(152)
    const s3 = g.at(454)
    if (g.facing > 0.1) {
      const strap = [
        [-0.5, T - 0.5, 0.05], [s1[0] * 1.03, s1[1] + 0.2, s1[2] + 0.02], [s1[0] * 1.02, s1[1] - 0.25, s1[2] + 0.04], [s1[0] * 0.55, s2[1] + 0.2, s2[2] + 0.05], [0, s2[1] - 0.04, s2[2] + 0.06],
        [s3[0] * 0.55, s2[1] + 0.2, s2[2] + 0.05], [s3[0] * 1.02, s3[1] - 0.25, s3[2] + 0.04], [s3[0] * 1.03, s3[1] + 0.2, s3[2] + 0.02], [0.5, T - 0.5, 0.05],
      ]
      const curve = []
      for (let i = 0; i < strap.length - 1; i += 1) {
        const p0 = strap[Math.max(0, i - 1)]
        const p1 = strap[i]
        const p2 = strap[i + 1]
        const p3 = strap[Math.min(strap.length - 1, i + 2)]
        for (let k = 0; k < 6; k += 1) {
          const t = k / 6
          const t2 = t * t
          const t3 = t2 * t
          curve.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)))
        }
      }
      curve.push(strap[strap.length - 1])
      drawMesh(S, tube(curve, 0.016, 5), ROOT, mat('#1b1b25', { ks: 0.4, rim: 0.3 }), { layer: 'front' })
    }
    const cols = ['#22d3ee', '#ff5fa2', '#ffd400', '#a855f7', '#4ade80', '#fb923c']
    const disc = cache('confetti', () => ellipsoid(0.07, 0.012, 0.045, 8, 4))
    for (let i = 0; i < 14; i += 1) {
      const ph = (S.t * 0.22 + i * 0.173) % 1
      const sd = i % 2 ? 1 : -1
      const p = [sd * (1.35 + 0.35 * Math.sin(i * 2.1 + S.t * 0.8)), T + 1.1 - ph * 3.8, -0.5 + 1.2 * ((i * 0.37) % 1)]
      const m = mat(cols[i % cols.length], { ks: 0.6, shine: 30, ambient: 0.55, rim: 0.4, double: true })
      drawMesh(S, disc, at(p, 1.2).rx(S.t * 3 + i).ry(S.t * 2.2 + i * 2), m)
    }
  },

  // 21. Love 💕
  love(S, g) {
    const T = g.top
    const heart = heartMesh()
    softBlob(S, [0, T + 0.5, 0], 1.3, 0.8, [255, 90, 150], 0.28, 0, { add: true, bias: -20 })
    const N = 13
    for (let i = 0; i < N; i += 1) {
      const ph = (S.t * 0.26 + i / N) % 1
      const x = Math.sin(i * 2.7) * (0.25 + 0.8 * ph) + Math.sin(S.t * 1.6 + i * 1.9) * 0.14
      const y = T + 0.0 + ph * 2.1
      const z = Math.cos(i * 1.9) * 0.35 - 0.1
      const size = (0.14 + (0.14 * ((i * 5) % 4)) / 3) * pop(ph, 0.12, 0.82)
      if (size < 0.012) continue
      drawMesh(S, heart, at([x, y, z], size).ry(S.t * 1.7 + i).rz(Math.sin(S.t * 2 + i) * 0.3), HEART_MATS[i % HEART_MATS.length])
      if (i % 4 === 0) sparkleAt(S, [x + 0.14, y + 0.16, z + 0.1], 0.05, S.t, i, [255, 210, 230])
    }
    blushAt(S, g, 205, 0.34, [255, 100, 150], 0.5)
    blushAt(S, g, 425, 0.34, [255, 100, 150], 0.5)
  },

  // 22. Birds 🐤
  birds(S, g) {
    const T = g.top
    const P = cache('birdParts', () => ({
      body: ellipsoid(0.17, 0.15, 0.23, 16, 10),
      beak: lathe([[0.05, 0], [0.032, 0.07], [0, 0.12]], 10),
      wing: ellipsoid(0.22, 0.022, 0.11, 14, 6),
      tail: ellipsoid(0.06, 0.02, 0.15, 10, 5),
    }))
    const specs = [['#ffd83a', '#f2b400'], ['#5aa9ff', '#2f7be0'], ['#ff7eb6', '#e0488e']]
    const beakM = gloss('#ff8a1f', { ks: 0.6, rim: 0.4 })
    softBlob(S, [0, T + 0.5, 0], 1.4, 0.6, [255, 240, 150], 0.2, 0, { add: true, bias: -20 })
    for (let i = 0; i < 3; i += 1) {
      const a = S.t * 1.5 + (i * TAU) / 3
      const p = [1.3 * Math.sin(a), T + 0.7 + 0.12 * Math.sin(S.t * 3 + i * 2), 1.0 * Math.cos(a) - 0.1]
      const v = [1.3 * Math.cos(a), 0, -1.0 * Math.sin(a)]
      const tf = frame(p, [0, 1, 0], v, 1.7).rz(Math.sin(S.t * 4 + i) * 0.12)
      const bm = fur(specs[i][0], { ks: 0.35, shine: 24, ambient: 0.46, rim: 0.7 })
      const wm = fur(specs[i][1], { ks: 0.2, ambient: 0.45, rim: 0.5, double: true })
      drawMesh(S, P.body, tf, bm)
      drawSphere(S, tf.go(0, 0.13, 0.2), 0.13, bm)
      drawMesh(S, P.beak, tf.go(0, 0.11, 0.32).rx(Math.PI / 2), beakM)
      ;[-1, 1].forEach((sd) => {
        drawSphere(S, tf.go(sd * 0.075, 0.17, 0.3), 0.032, NOSE_BLACK)
        const flap = 0.15 + 0.75 * Math.sin(S.t * 16 + i * 1.7)
        drawMesh(S, P.wing, tf.go(sd * 0.12, 0.06, 0).rz(sd * flap).go(sd * 0.2, 0, 0), wm)
      })
      drawMesh(S, P.tail, tf.go(0, 0.04, -0.25).rx(0.35), wm)
      if (Math.sin(S.t * 5 + i * 2) > 0.92) sparkleAt(S, add(p, [0.1, 0.25, 0.1]), 0.05, S.t, i, [255, 255, 255])
    }
  },

  // 23. Storm cloud ⛈️
  storm_cloud(S, g) {
    const T = g.top
    const cp = [0, T + 1.0 + Math.sin(S.t * 1.6) * 0.05, 0]
    const k = S.t % 3.6
    const flash = k < 0.35 ? (1 - k / 0.35) * (Math.sin(k * 60) > -0.3 ? 1 : 0.4) : 0
    const cm = flash > 0.3 ? fur('#dfe6ff', { ambient: 0.7, rim: 0.8, ks: 0.1 }) : fur('#8d97ac', { ambient: 0.5, rim: 0.7, ks: 0.1 })
    ;[[-0.62, -0.05, 0, 0.4], [-0.28, 0.12, 0.05, 0.5], [0.18, 0.2, 0, 0.55], [0.62, 0, 0, 0.45], [0, -0.12, 0.28, 0.45], [-0.4, -0.14, 0.25, 0.36], [0.4, -0.12, 0.22, 0.38], [0.05, 0.1, -0.25, 0.5]].forEach(([x, y, z, r]) => {
      drawSphere(S, at([cp[0] + x, cp[1] + y, cp[2] + z]), r, cm)
    })
    if (flash > 0) {
      softBlob(S, [cp[0], cp[1], cp[2] + 0.2], 1.8, 1.2, [210, 225, 255], 0.5 * flash, 0, { add: true, bias: -30 })
      decal(S, at([cp[0] + 0.05, cp[1] - 0.25, cp[2] + 0.5]), (c) => {
        c.globalCompositeOperation = 'lighter'
        c.fillStyle = `rgba(255,244,160,${0.4 + 0.6 * flash})`
        c.beginPath()
        ;[[0, 0], [-0.13, -0.38], [0.03, -0.35], [-0.12, -0.82], [0.22, -0.3], [0.05, -0.32], [0.16, 0]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
        c.closePath()
        c.fill()
      }, { bias: -10 })
    }
    const drop = cache('rainDrop', () => ellipsoid(0.035, 0.1, 0.035, 8, 6))
    const dm = gloss('#7cc4ff', { ks: 1, shine: 50, ambient: 0.5, rim: 0.5 })
    for (let i = 0; i < 18; i += 1) {
      const ph = (S.t * 1.0 + i * 0.173) % 1
      const x = cp[0] - 0.8 + 1.6 * ((i * 0.618) % 1)
      const y = cp[1] - 0.35 - ph * (cp[1] + 1.2)
      const z = 0.15 + 0.4 * Math.sin(i * 2.3)
      drawMesh(S, drop, at([x, y, z], 1 - smooth(0.88, 1, ph)), dm)
    }
  },

  // 24. Snowfall ❄️
  snowfall(S, g) {
    const T = g.top
    const snow = mat('#ffffff', { ambient: 1.0, glow: 0.3, rim: 0.2, rimColor: [200, 225, 255], ks: 0.05 })
    ;[-0.62, -0.31, 0, 0.31, 0.62].forEach((x) => {
      const p = g.ep(x, 0.05, 0.03)
      drawSphere(S, at([p[0], p[1] - 0.1, p[2]]), 0.34 - Math.abs(x) * 0.12, snow)
      drawSphere(S, at(g.ep(x * 0.8, 0.42, -0.02)), 0.27, snow)
    })
    drawSphere(S, at(g.ep(0, 0.2, 0.3)), 0.28, snow)
    drawSphere(S, at(g.ep(0, -0.3, 0.2, 0.05)), 0.3, snow)
    const fm = mat('#ffffff', { ks: 0, ambient: 1.15, rim: 0 })
    for (let i = 0; i < 34; i += 1) {
      const ph = (S.t * (0.1 + 0.04 * ((i * 7) % 3)) + i * 0.137) % 1
      const y = T + 2.0 - ph * (T + 3.8)
      const x = 1.9 * Math.sin(i * 2.399) + 0.2 * Math.sin(S.t * 1.1 + i)
      const z = 1.2 * Math.cos(i * 1.7)
      if (i % 4 === 0) {
        const rr = 0.09 + 0.04 * ((i * 3) % 3)
        const rot = S.t * 0.8 + i
        decal(S, at([x, y, z]), (c) => crystal(c, rr, rot), { bias: 0 })
      } else {
        drawSphere(S, at([x, y, z]), 0.03 + 0.028 * ((i * 3) % 3), fm)
      }
    }
    blushAt(S, g, 205, 0.34, [255, 130, 160], 0.4)
    blushAt(S, g, 425, 0.34, [255, 130, 160], 0.4)
  },

  // 25. Music notes 🎵
  music_notes(S, g) {
    const T = g.top
    const head = cache('noteHead', () => ellipsoid(0.13, 0.09, 0.06, 12, 8))
    const stem = cache('noteStem', () => tube([[0.11, 0.02, 0], [0.11, 0.5, 0]], 0.022, 6, { cap: true }))
    const flag = cache('noteFlag', () => tube([[0.11, 0.5, 0], [0.2, 0.42, 0], [0.27, 0.3, 0], [0.24, 0.2, 0]], (t) => 0.03 * (1 - t * 0.5), 6, { cap: true }))
    const beam = cache('noteBeam', () => tube([[0.11, 0.5, 0], [0.62, 0.58, 0]], 0.04, 6, { cap: true }))
    const stem2 = cache('noteStem2', () => tube([[0.62, 0.08, 0], [0.62, 0.58, 0]], 0.022, 6, { cap: true }))
    const cols = ['#ff5fa2', '#22d3ee', '#ffd400', '#a855f7', '#4ade80', '#ffffff']
    const N = 9
    for (let i = 0; i < N; i += 1) {
      const ph = (S.t * 0.22 + i / N) % 1
      const sd = i % 2 ? 1 : -1
      const x = sd * (0.95 + 0.4 * ph) + Math.sin(S.t * 2.2 + i * 1.7) * 0.18 - (i % 3 === 0 ? 0.25 : 0)
      const y = 0.2 + ph * (T + 1.5)
      const z = -0.1 + 0.3 * Math.sin(i * 2.1)
      const size = (0.75 + (0.5 * ((i * 3) % 3)) / 2) * pop(ph, 0.1, 0.85)
      if (size < 0.02) continue
      const m = cache(`noteMat${i % cols.length}`, () => gloss(cols[i % cols.length], { ks: 1, shine: 50, rim: 0.5 }))
      const tf = at([x, y, z], size).rz(Math.sin(S.t * 2 + i) * 0.25).ry(Math.sin(S.t * 1.3 + i) * 0.6)
      drawMesh(S, head, tf.rz(0.4), m)
      drawMesh(S, stem, tf, m)
      if (i % 3 === 0) {
        drawMesh(S, head, tf.go(0.51, 0.08, 0).rz(0.4), m)
        drawMesh(S, beam, tf, m)
        drawMesh(S, stem2, tf, m)
      } else drawMesh(S, flag, tf, m)
      if (i % 4 === 1) sparkleAt(S, [x + 0.2, y + 0.3, z + 0.1], 0.05, S.t, i, [255, 255, 255])
    }
  },

  // 26. Butterflies 🦋
  butterflies(S, g) {
    const T = g.top
    const wing = (kind, sd) =>
      cache(`bw${kind}${sd}`, () => {
        const poly = []
        for (let i = 0; i < 40; i += 1) {
          const t = (i / 40) * TAU
          if (kind === 'u') {
            const x = 0.32 + 0.32 * Math.cos(t)
            poly.push([sd * x, 0.16 + 0.36 * Math.sin(t) * (0.5 + 0.5 * Math.cos(t)) + 0.18 * x])
          } else {
            const x = 0.22 + 0.22 * Math.cos(t)
            poly.push([sd * x, -0.2 + 0.24 * Math.sin(t) * (0.5 + 0.5 * Math.cos(t))])
          }
        }
        return puffy(poly, 0.03, { center: kind === 'u' ? [sd * 0.32, 0.22] : [sd * 0.22, -0.2], ang: 28, rings: 5 })
      })
    const body = cache('bBody', () => ellipsoid(0.035, 0.2, 0.035, 10, 8))
    const ant = (sd) => cache(`bAnt${sd}`, () => tube([[0, 0.18, 0], [sd * 0.05, 0.3, 0], [sd * 0.13, 0.36, 0]], 0.009, 5, { cap: true }))
    const pal = [['#ff8f2b', '#3a1a0a', '#ffd9a0'], ['#4aa8ff', '#10305e', '#bfe3ff'], ['#ff6fb5', '#6a1040', '#ffd0ea']]
    for (let i = 0; i < 3; i += 1) {
      const a = S.t * 0.6 + i * 2.1
      const p = [1.25 * Math.sin(a), T + 0.45 + 0.45 * Math.sin(a * 1.7 + i), 0.55 * Math.cos(a * 1.3) + 0.2]
      const tf = at(p, 0.78 + 0.08 * i).rz(Math.cos(a) * 0.35)
      const th = 0.2 + 0.95 * Math.abs(Math.sin(S.t * 8 + i * 2))
      const [c1, c2, c3] = pal[i]
      const wm = mat(c1, { ks: 0.5, shine: 30, ambient: 0.55, rim: 0.5, double: true })
      ;[-1, 1].forEach((sd) => {
        const wtf = tf.ry(-sd * th)
        ;[['u', 1], ['l', 0.85]].forEach(([kind]) => {
          drawMesh(S, wing(kind, sd), wtf, wm)
          const poly = kind === 'u' ? [0.32, 0.22, 0.3, 0.34] : [0.22, -0.2, 0.2, 0.22]
          decal(S, wtf.go(0, 0, 0.034), (c) => {
            c.beginPath()
            c.ellipse(sd * poly[0] * 0.95, poly[1], poly[2] * 0.62, poly[3] * 0.62, sd * 0.3, 0, TAU)
            c.fillStyle = css(hex(c3), 0.75)
            c.fill()
            c.strokeStyle = css(hex(c2), 0.9)
            c.lineWidth = 0.04
            c.beginPath()
            c.ellipse(sd * poly[0], poly[1], poly[2] * 0.97, poly[3] * 0.97, 0, 0, TAU)
            c.stroke()
            c.fillStyle = 'rgba(255,255,255,0.9)'
            for (let k = 0; k < 3; k += 1) {
              c.beginPath()
              c.arc(sd * (poly[0] + poly[2] * 0.7 * Math.cos(0.5 + k * 0.7)), poly[1] + poly[3] * 0.8 * Math.sin(0.5 + k * 0.7), 0.024, 0, TAU)
              c.fill()
            }
          }, { bias: -1 })
        })
        drawMesh(S, ant(sd), tf, mat(c2, { ks: 0.2 }))
      })
      drawMesh(S, body, tf, gloss(c2, { ks: 0.5, rim: 0.4 }))
      drawSphere(S, tf.go(0, 0.2, 0), 0.045, gloss(c2, { ks: 0.5 }))
    }
  },

  // 27. Bubbles 🫧
  bubbles(S, g) {
    const T = g.top
    for (let i = 0; i < 15; i += 1) {
      const ph = (S.t * (0.1 + 0.03 * ((i * 5) % 4)) + i * 0.071) % 1
      const x = 1.9 * Math.sin(i * 2.399) * (0.55 + 0.45 * Math.cos(i)) + 0.12 * Math.sin(S.t * 1.3 + i)
      const y = -1.9 + ph * (T + 4.0)
      const z = Math.cos(i * 1.3)
      const r = 0.1 + (0.2 * ((i * 7) % 5)) / 4
      const popping = ph > 0.94
      const k = popping ? 1 + (ph - 0.94) * 9 : 1
      const a = popping ? 1 - (ph - 0.94) / 0.06 : 1
      if (a <= 0) continue
      bubblePart(S, [x, y, z], r * k, a)
    }
  },
}

// =============================================================================
// public API
// =============================================================================

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
  const time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
  faceLandmarksList.forEach((landmarks, idx) => {
    if (!landmarks || landmarks.length < 468) return
    const g = buildFace(landmarks, toCanvas, idx)
    if (g) drawFaceScene(ctx, g, time, renderer)
  })
}

export const AR_FILTER_IDS = Object.keys(RENDERERS_3D)

/** UI labels for every filter id (handy for the photobooth menu). */
export const AR_FILTER_LABELS = {
  puppy: '🐶 Puppy', kitty: '🐱 Kitty', bunny: '🐰 Bunny', bear: '🐻 Teddy', froggy: '🐸 Froggy',
  panda: '🐼 Panda', reindeer: '🦌 Reindeer', crown: '👑 Crown', flower_crown: '🌸 Flowers', angel: '😇 Angel',
  devil: '😈 Devil', strawberry: '🍓 Strawberry', mushroom: '🍄 Toadstool', ribbon: '🎀 Ribbon',
  heart_blush: '💖 Heart Blush', star_glam: '✨ Star Glam', shades: '🕶️ Cyber Shades',
  retro_glasses: '👓 Gentleman', cowboy: '🤠 Cowboy', party: '🥳 Party',
  love: '💕 Love', birds: '🐤 Birds', storm_cloud: '⛈️ Storm Cloud', snowfall: '❄️ Snowfall',
  music_notes: '🎵 Music', butterflies: '🦋 Butterflies', bubbles: '🫧 Bubbles',
}