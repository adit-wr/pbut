/**
 * Real-3D AR face filters for HTML5 Canvas (no WebGL / no dependencies).
 *
 * How it works
 * ------------
 * 1. Head pose: a full 3-axis rotation (X = right, U = up, F = forward) is
 *    rebuilt from the 3D face landmarks (incl. z) and lightly smoothed, so props
 *    follow yaw / pitch / roll with real perspective.
 * 2. Props are real meshes (lathe, tube, ellipsoid, "puffy" extrusion, faceted
 *    gems) living in head space. Every triangle is transformed, back-face culled,
 *    depth sorted and shaded per frame (diffuse + hemisphere ambient + bounce +
 *    specular + rim + fake metal environment).
 * 3. Parts that swing behind the head are drawn first and then cut by the
 *    head silhouette (an ellipsoid), so ears / wings / orbiting hearts correctly
 *    disappear behind the user's head.
 * 4. Everything is rendered on an off-screen layer and composited with one soft
 *    drop shadow, then animated with time (spinning hearts, flapping wings, …).
 *
 * Units: 1 model unit = half head width (cheek to cheek / 2). Origin = skull
 * centre, +x = face right axis, +y = up, +z = out of the face.
 *
 * Public API is unchanged:
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

function shade(n, m, base) {
  base = base || m.base
  const ndl = Math.max(0, dot(n, LIGHT))
  const ndv = Math.max(0, -n[2])
  const up = 0.5 - 0.5 * n[1]
  let lit
  if (m.metal) {
    const e = clamp(0.5 + n[2] * n[1], 0, 1) // reflection elevation (sky = 1)
    lit = (0.2 + 0.85 * e * e + 0.4 * Math.exp(-Math.pow((e - 0.5) * 8, 2))) * (0.7 + 0.4 * ndl)
  } else {
    lit = m.ambient * (0.55 + 0.45 * up) + (1 - m.ambient) * 1.08 * ndl + 0.12 * Math.max(0, dot(n, BOUNCE))
  }
  const sh = clamp(0.8 - lit, 0, 0.8)
  let r = base[0] * lit * (1 - 0.25 * sh)
  let g = base[1] * lit * (1 - 0.2 * sh)
  let b = base[2] * lit * (1 + 0.1 * sh) + 14 * sh
  if (m.ks > 0) {
    const s = m.ks * Math.pow(Math.max(0, dot(n, HALF)), m.shine) * 255
    if (s > 1) {
      const sc = m.metal ? lighten(base, 0.55) : [255, 255, 255]
      r += (sc[0] / 255) * s
      g += (sc[1] / 255) * s
      b += (sc[2] / 255) * s
    }
  }
  if (m.rim) {
    const rm = m.rim * Math.pow(1 - ndv, 2.4) * (0.7 + 0.55 * up)
    const rc = m.rimColor || lighten(base, 0.5)
    r += rc[0] * rm
    g += rc[1] * rm
    b += rc[2] * rm
  }
  if (m.glow) {
    r += base[0] * m.glow
    g += base[1] * m.glow
    b += base[2] * m.glow
  }
  return `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`
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

/** Sweep a circle along a 3D path (antlers, whiskers, frames, tails…). */
function tube(path, radius, seg = 8, o = {}) {
  let pts = path.slice()
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
  const ang = o.ang || 40
  const rings = o.rings || 6
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
  const idx = (side, k, j) => (side > 0 || k === rings ? 0 : (rings + 1) * ang) + k * ang + j
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
  // back vertices were pushed after the front ones but skip rim: reindex faces accordingly
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
  void idx
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
    this.back = []
    this.front = []
  }
  push(z, fn, layer, pt) {
    const g = this.g
    // Depth behind the skull centre, ignoring the head-up axis so that the
    // natural backward lean of landmarks (level face) never pushes
    // top-of-head props "behind" the head.
    let rel = (z - g.O[2]) / g.u
    if (pt) {
      const d = sub(pt, g.O)
      rel = (d[2] - dot(d, g.U) * g.U[2]) / g.u
    }
    const isBack = layer ? layer === 'back' : rel > 0.6
    ;(isBack ? this.back : this.front).push([z, fn])
  }
  run(ctx, occlude) {
    const draw = (list) => {
      list.sort((a, b) => b[0] - a[0])
      list.forEach(([, fn]) => {
        ctx.save()
        fn(ctx)
        ctx.restore()
      })
    }
    draw(this.back)
    if (occlude && this.back.length) {
      ctx.save()
      occlude(ctx)
      ctx.restore()
    }
    draw(this.front)
  }
}

function renderMesh(ctx, g, mesh, cam, m, o) {
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
  const list = []
  for (let f = 0; f < mesh.F.length; f += 1) {
    const [a, b, c] = mesh.F[f]
    let tx
    let ty
    let tz
    if (mesh.FN) {
      const n = mesh.FN[f]
      tx = (n[0] * A[0] + n[1] * B[0] + n[2] * C[0]) * ik
      ty = (n[0] * A[1] + n[1] * B[1] + n[2] * C[1]) * ik
      tz = (n[0] * A[2] + n[1] * B[2] + n[2] * C[2]) * ik
    } else {
      tx = nx[a] + nx[b] + nx[c]
      ty = ny[a] + ny[b] + ny[c]
      tz = nz[a] + nz[b] + nz[c]
      const l = Math.hypot(tx, ty, tz) || 1
      tx /= l
      ty /= l
      tz /= l
    }
    if (tz > 0.08) {
      if (!m.double) continue
      tx = -tx
      ty = -ty
      tz = -tz
    }
    list.push([(sz[a] + sz[b] + sz[c]) / 3, f, tx, ty, tz])
  }
  list.sort((p, q) => q[0] - p[0])
  ctx.lineJoin = 'round'
  ctx.lineWidth = 0.9
  const tmp = [0, 0, 0]
  for (let i = 0; i < list.length; i += 1) {
    const [, f, tx, ty, tz] = list[i]
    tmp[0] = tx
    tmp[1] = ty
    tmp[2] = tz
    const col = shade(tmp, m, mesh.FC ? mesh.FC[f] : null)
    const [a, b, c] = mesh.F[f]
    ctx.fillStyle = col
    ctx.strokeStyle = col
    ctx.beginPath()
    ctx.moveTo(sx[a], sy[a])
    ctx.lineTo(sx[b], sy[b])
    ctx.lineTo(sx[c], sy[c])
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

/** Queue a mesh. o.face = hide when its local +Y axis points away from the camera (decor on a surface). */
function drawMesh(S, mesh, tf, m, o = {}) {
  const g = S.g
  const cam = g.cam(tf)
  if (o.face !== undefined && cam.B[2] / cam.k > o.face) return
  const c = mesh.cen
  const zc = cam.P[2] + c[0] * cam.A[2] + c[1] * cam.B[2] + c[2] * cam.C[2]
  S.push(zc, (ctx) => renderMesh(ctx, g, mesh, cam, m, o), o.layer,
    add(cam.P, add(add(mul(cam.A, c[0]), mul(cam.B, c[1])), mul(cam.C, c[2]))))
}

const ALPHA_V = Math.acos(dot(LIGHT, VIEW))
const W_DIR = norm(sub(VIEW, mul(LIGHT, dot(LIGHT, VIEW))))

function sphereFill(ctx, x, y, r, m, base) {
  const hx = x + LIGHT[0] * r * 0.5
  const hy = y + LIGHT[1] * r * 0.5
  const gr = ctx.createRadialGradient(hx, hy, 0, x, y, r)
  const steps = 8
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const al = t * (ALPHA_V + Math.PI / 2)
    const n = add(mul(LIGHT, Math.cos(al)), mul(W_DIR, Math.sin(al)))
    gr.addColorStop(t, shade(n, { ...m, ks: 0 }, base))
  }
  ctx.fillStyle = gr
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  if (m.ks > 0.12) {
    const sxp = x + HALF[0] * r * 0.98
    const syp = y + HALF[1] * r * 0.98
    const hr = r * (m.shine > 45 ? 0.26 : 0.4)
    const sg = ctx.createRadialGradient(sxp, syp, 0, sxp, syp, hr)
    const a = clamp(m.ks, 0, 1)
    sg.addColorStop(0, `rgba(255,255,255,${0.95 * a})`)
    sg.addColorStop(0.45, `rgba(255,255,255,${0.35 * a})`)
    sg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(sxp, syp, hr, 0, TAU)
    ctx.fill()
  }
}

/** Sphere impostor (analytic lit sphere); r is in local units of tf. */
function drawSphere(S, tf, r, m, o = {}) {
  const g = S.g
  const cam = g.cam(tf)
  const R = r * cam.k
  S.push(cam.P[2], (ctx) => {
    const p = g.project(cam.P)
    sphereFill(ctx, p[0], p[1], R * p[3], m, o.base)
  }, o.layer, cam.P)
}

/** Flat 2D drawing placed with a 3D frame (1 local unit = tf.s head units). */
function decal(S, tf, fn, o = {}) {
  const g = S.g
  const cam = g.cam(tf)
  const p0 = g.project(cam.P)
  const px = g.project(add(cam.P, cam.A))
  const py = g.project(add(cam.P, cam.B))
  S.push(cam.P[2] + (o.bias || 0), (ctx) => {
    ctx.transform(px[0] - p0[0], px[1] - p0[1], py[0] - p0[0], py[1] - p0[1], p0[0], p0[1])
    fn(ctx)
  }, o.layer, cam.P)
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
// face geometry + head pose
// =============================================================================

const POSE = []

function buildFace(lms, toCanvas, idx) {
  const c0 = toCanvas(0, 0)
  const c1 = toCanvas(1, 0)
  const zs = Math.abs(c1.x - c0.x) || 1
  const P = (i) => {
    const l = lms[i]
    if (!l) return null
    const c = toCanvas(l.x, l.y)
    return [c.x, c.y, (l.z || 0) * zs]
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
  if (prev) {
    X = norm(lerp3(prev.X, X, 0.55))
    U = norm(lerp3(prev.U, U, 0.55))
    U = norm(sub(U, mul(X, dot(U, X))))
  }
  POSE[idx] = { X, U }
  let F = norm(cross(X, U))
  if (F[2] > 0) F = mul(F, -1) // always points toward the camera

  const u = Math.max(w3, w2) / 2
  const O = sub(eyeMid, mul(F, 0.8 * u))
  const toM = (p) => {
    const d = sub(p, O)
    return [dot(d, X) / u, dot(d, U) / u, dot(d, F) / u]
  }
  const top = clamp(toM(forehead)[1] + 0.32, 1.0, 2.0)
  const faceH = len(sub(forehead, chin)) || u * 2.7
  const gap = len(sub(P(14) || chin, P(13) || chin)) / faceH
  const open = clamp((gap - 0.02) / 0.07, 0, 1)

  const g = {
    O, X, U, F, u, zref: eyeMid[2], D: u * 7, top,
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
// off-screen layer + compositing
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

function drawFaceScene(ctx, g, time, renderer) {
  const S = new Scene(g, time)
  renderer(S, g)
  const occlude = (c) => {
    const e = g.headEllipse()
    c.globalCompositeOperation = 'destination-out'
    c.fillStyle = '#000'
    c.beginPath()
    c.ellipse(e.x, e.y, e.r1, e.r2, e.rot, 0, TAU)
    c.fill()
  }
  const t = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const sc = Math.abs(t.a) || 1
  const cv = ctx.canvas
  const layer = cv && getLayer(cv)
  if (!layer) {
    S.run(ctx, null)
    return
  }
  // Region around the head in user space → device pixels (works with mirrored / dpr-scaled contexts)
  const half = g.u * 4.6
  const ux0 = g.O[0] - half
  const uy0 = g.O[1] - half
  const dxa = ux0 * t.a + t.e
  const dxb = (ux0 + half * 2) * t.a + t.e
  const dya = uy0 * t.d + t.f
  const dyb = (uy0 + half * 2) * t.d + t.f
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
  lc.rect(ux0, uy0, half * 2, half * 2)
  lc.clip()
  S.run(lc, occlude)
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
const RED_GLOSS = gloss('#e11d48', { rim: 0.55, rimColor: [255, 170, 170] })

const hearth = (pts = 56) => {
  const poly = []
  for (let i = 0; i < pts; i += 1) {
    const t = (i / pts) * TAU
    poly.push([(16 * Math.sin(t) ** 3) / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - 0.0])
  }
  return poly
}

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// =============================================================================
// the 20 renderers
// =============================================================================


// ---- helpers used by the Photo-Booth style filters --------------------------

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
  // 1. Puppy 🐶 — floppy furry ears, glossy nose, lolling tongue
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
      const tf = frame([sd * 0.98, T - 0.85, -0.05], [-sd * 0.28, 1, 0], [sd * 0.9, 0, 0.45], 0.85)
      drawMesh(S, earMesh, tf, earMat)
      drawMesh(S, innerMesh, tf.go(0, -0.05, 0.115), PINK_IN)
    })
    // brown eye patch
    const e = g.eR
    softBlob(S, [e[0] * 1.02, e[1] + 0.02, e[2] + 0.02], 0.42, 0.36, [106, 58, 26], 0.8, 0.35, { bias: 3 })
    const n = g.at(1)
    drawSphere(S, at([n[0], n[1] - 0.01, n[2] + 0.05]), 0.17, NOSE_BLACK)
    // tongue
    const long = g.open > 0.45
    const L = long ? 0.62 : 0.4
    const tongue = cache(`tongue${long}`, () =>
      puffy([[-0.16, 0], [0.16, 0], [0.19, -0.35 * L], [0.15, -0.75 * L], [0, -L], [-0.15, -0.75 * L], [-0.19, -0.35 * L]], 0.07, { center: [0, -0.45 * L], ang: 30, rings: 5 }),
    )
    const m14 = g.at(14)
    const ttf = at([m14[0], m14[1] + 0.03, m14[2] + 0.02]).rx(-0.22)
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

  // 2. Kitty 🐱 — pointed fluffy ears, gem nose, 3D whiskers
  kitty(S, g) {
    const T = g.top
    const ear = cache('catEar', () =>
      deform(lathe([[0.4, 0], [0.36, 0.22], [0.2, 0.52], [0.0, 0.78]], 16), (v) => [v[0], v[1], v[2] * 0.42]),
    )
    const earIn = cache('catEarIn', () => deform(lathe([[0.4, 0], [0.34, 0.2], [0.17, 0.46], [0.0, 0.66]], 16), (v) => [v[0], v[1], v[2] * 0.3]))
    const furW = fur('#f4f1ff', { ambient: 0.5 })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.62, 0.1, -0.06)
      const tf = frame(p, [sd * 0.3, 1, -0.1], [0, 0, 1], 1)
      drawMesh(S, ear, tf, furW)
      drawMesh(S, earIn, tf.go(0, 0.02, 0.1).sc(0.8), fur('#ff7fb0', { ambient: 0.5 }))
    })
    const n = g.at(1)
    const ntf = at([n[0], n[1] - 0.01, n[2] + 0.04])
    drawMesh(S, cache('catNose', () => deform(ellipsoid(0.16, 0.11, 0.1, 14, 9), (v) => [v[0], v[1] + (v[1] < 0 ? 0 : 0), v[2]])), ntf, NOSE_PINK)
    // whiskers
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
        drawMesh(S, mesh, at([p[0] + sd * 0.1, p[1] + 0.02, p[2] + 0.04]), wm, { layer: 'front' })
      })
    })
    blushAt(S, g, 205, 0.32, [255, 120, 170], 0.45)
    blushAt(S, g, 425, 0.32, [255, 120, 170], 0.45)
  },

  // 3. Bunny 🐰 — tall ears (one cheekily floppy), teeth, pink nose
  bunny(S, g) {
    const T = g.top
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
      const tf = frame(p, [sd * (floppy ? 0.18 : 0.12), 1, -0.08], [0, 0, 1], 0.95)
      drawMesh(S, floppy ? earFlopOut : earOut, tf, WHITE_FUR)
      drawMesh(S, floppy ? earFlopIn : earIn, tf.go(0, 0, 0.075), fur('#ff8fb0', { ambient: 0.5 }))
    })
    const n = g.at(1)
    drawSphere(S, at([n[0], n[1], n[2] + 0.05]), 0.12, NOSE_PINK)
    // buck teeth
    const m0 = g.at(0)
    const tooth = cache('tooth', () => deform(ellipsoid(0.08, 0.11, 0.04, 12, 8, { oy: -0.1 }), (v) => v))
    ;[-0.07, 0.07].forEach((dx) => drawMesh(S, tooth, at([m0[0] + dx, m0[1] - 0.04, m0[2] + 0.02]), mat('#ffffff', { ks: 0.5, ambient: 0.62, rim: 0.2 })))
    blushAt(S, g, 205, 0.34, [255, 120, 170], 0.5)
    blushAt(S, g, 425, 0.34, [255, 120, 170], 0.5)
  },

  // 4. Teddy bear 🐻 — round fluffy ears, cream muzzle, little smile
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
    // smile "ω"
    const smile = cache('bearSmile', () => {
      const pts = []
      for (let k = 0; k <= 20; k += 1) {
        const t = k / 20
        const x = (t - 0.5) * 0.36
        const y = -0.1 - 0.07 * Math.sin(t * TAU * 1 + Math.PI) * 0 - 0.07 * Math.abs(Math.sin(t * Math.PI * 2)) * 0.9
        pts.push([x, y, 0])
      }
      return tube(pts, 0.018, 6, { cap: true })
    })
    drawMesh(S, smile, at([mz[0], mz[1], zAt(0, -0.14) + 0.01]), DARK_LINE)
    drawMesh(S, cache('bearLine', () => tube([[0, 0, 0], [0, -0.1, 0]], 0.018, 6, { cap: true })), at([mz[0], mz[1] + 0.01, zAt(0, -0.05) + 0.01]), DARK_LINE)
    blushAt(S, g, 205, 0.3, [255, 120, 120], 0.4)
    blushAt(S, g, 425, 0.3, [255, 120, 120], 0.4)
  },

  // 5. Froggy 🐸 — bulging googly eyes on the head
  froggy(S, g) {
    const green = gloss('#3fb04e', { ks: 0.55, shine: 34, rim: 0.5, rimColor: [190, 255, 170] })
    const spot = mat('#2b8a3c', { ks: 0.2 })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.56, 0.12, 0.12)
      drawSphere(S, at(p), 0.5, green)
      // eyeball
      const eb = [p[0], p[1] + 0.03, p[2] + 0.27]
      drawSphere(S, at(eb), 0.36, mat('#ffffff', { ks: 0.7, shine: 60, ambient: 0.55, rim: 0.2 }))
      drawSphere(S, at([eb[0] + sd * 0.02, eb[1] - 0.03, eb[2] + 0.28]), 0.18, NOSE_BLACK)
      drawSphere(S, at([eb[0] - 0.05 + sd * 0.02, eb[1] + 0.03, eb[2] + 0.4]), 0.045, mat('#fff', { ks: 0, ambient: 1.2 }))
      // eyelid ridge
      drawMesh(S, cache('lid', () => ellipsoid(0.4, 0.4, 0.4, 20, 8, { lat0: 0.05, lat1: Math.PI / 2 })), at([eb[0], eb[1] + 0.03, eb[2] - 0.06]).rx(-0.55), green, { layer: 'front' })
      drawSphere(S, at([p[0] + sd * 0.3, p[1] + 0.18, p[2] - 0.08]), 0.1, spot)
      drawSphere(S, at([p[0] - sd * 0.28, p[1] + 0.3, p[2] - 0.1]), 0.07, spot)
    })
    blushAt(S, g, 205, 0.3, [255, 130, 150], 0.5)
    blushAt(S, g, 425, 0.3, [255, 130, 150], 0.5)
  },

  // 6. Panda 🐼 — ears, eye patches, bamboo sprig
  panda(S, g) {
    const black = fur('#1d2432', { ambient: 0.34, rimColor: [160, 180, 215] })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.7, -0.04, 0.02)
      drawSphere(S, at(p), 0.34, black)
      drawSphere(S, at([p[0], p[1], p[2] + 0.2]), 0.18, fur('#4b566b', { ambient: 0.4 }))
    })
    ;[g.eL, g.eR].forEach((e, i) => {
      const sd = e[0] < 0 ? -1 : 1
      softBlob(S, [e[0] + sd * 0.06, e[1] - 0.04, e[2] + 0.02], 0.46, 0.34, [20, 26, 38], 0.92, sd * -0.55, { bias: 5 })
      void i
    })
    const n = g.at(1)
    drawMesh(S, cache('pandaNose', () => ellipsoid(0.17, 0.12, 0.1, 14, 10)), at([n[0], n[1] - 0.0, n[2] + 0.05]), NOSE_BLACK)
    // bamboo sprig tucked at the side
    const stalk = cache('bamboo', () => tube([[0, 0, 0], [0.03, 0.5, 0], [0.06, 1.0, 0]], 0.055, 8, { cap: true }))
    const bam = mat('#7ccf6a', { ks: 0.5, shine: 30, rim: 0.4 })
    const base = g.ep(-0.56, 0.1, -0.04)
    const tf = frame(base, [-0.25, 1, 0.05])
    drawMesh(S, stalk, tf, bam)
    ;[0.33, 0.68].forEach((y) => drawMesh(S, cache('bamNode', () => lathe([[0.062, -0.012], [0.075, 0], [0.062, 0.012]], 10)), tf.go(0.03 * (y / 0.5), y, 0), mat('#4d9a45', { ks: 0.3 })))
    ;[[0.0, 0.9, 1.1, 1], [0.0, 0.75, 1.2, -1]].forEach(([, y, ang, sd]) => {
      const lf = cache('bamLeaf', () => ellipsoid(0.07, 0.34, 0.012, 10, 6, { oy: 0.34 }))
      drawMesh(S, lf, tf.go(0.05, y, 0).rz(-sd * ang), GREEN_LEAF)
    })
    blushAt(S, g, 205, 0.3, [255, 130, 140], 0.4)
    blushAt(S, g, 425, 0.3, [255, 130, 140], 0.4)
  },

  // 7. Reindeer 🦌 — branching antlers, glowing red nose, jingle ornaments
  reindeer(S, g) {
    const T = g.top
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
      const tf = frame(p, [sd * 0.3, 1, -0.2], [0, 0, 1], 0.88)
      antler(sd).forEach((mesh) => drawMesh(S, mesh, tf, antlerMat))
      const ball = tf.go(sd * 0.65, 1.1, 0.12)
      drawSphere(S, ball, 0.07, gloss(sd < 0 ? '#e11d48' : '#2fa84f', { rim: 0.5 }))
      // small ears
      const ep = g.ep(sd * 0.98, 0, -0.18)
      const etf = frame(ep, [sd * 0.9, 0.55, 0.0], [0, 0, 1], 1)
      drawMesh(S, cache('deerEar', () => ellipsoid(0.17, 0.4, 0.07, 14, 8, { oy: 0.2 })), etf, fur('#8a5a30', { ambient: 0.42 }))
      drawMesh(S, cache('deerEarIn', () => ellipsoid(0.09, 0.28, 0.03, 12, 8, { oy: 0.22 })), etf.go(0, 0, 0.065), PINK_IN)
    })
    const n = g.at(1)
    const pulse = 0.55 + 0.45 * Math.sin(S.t * 3)
    softBlob(S, [n[0], n[1], n[2] + 0.1], 0.85, 0.85, [255, 40, 40], 0.35 + 0.25 * pulse, 0, { add: true, bias: -10 })
    drawSphere(S, at([n[0], n[1] - 0.01, n[2] + 0.1]), 0.23, gloss('#f0163f', { rim: 0.6, rimColor: [255, 150, 150], glow: 0.1 }))
  },

  // 8. Crown 👑 — gold crown with velvet dome, jewels and pearls
  crown(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.45, -0.05], [0, 1, -0.06])
    const band = cache('crownBand', () => lathe([[0.76, 0.0], [0.82, 0.0], [0.86, 0.04], [0.86, 0.3], [0.82, 0.34], [0.76, 0.34]], 40))
    drawMesh(S, band, tf, GOLD)
    const dome = cache('crownDome', () => {
      const prof = [[0, 0.3]]
      for (let i = 0; i <= 8; i += 1) {
        const a = (i / 8) * (Math.PI / 2)
        prof.push([0.74 * Math.cos(a), 0.3 + 0.5 * Math.sin(a)])
      }
      return lathe(prof.slice().reverse().map((p) => p).reverse(), 30)
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
    // jewels + pearls on the band
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

  // 9. Flower wreath 🌸 — vine ring with layered 3D blossoms
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

  // 10. Angel 😇 — glowing halo + flapping feather wings
  angel(S, g) {
    const T = g.top
    const bob = Math.sin(S.t * 2) * 0.05
    const tf = frame([0, T + 0.35 + bob, -0.12], [0, 1, -0.2])
    softBlob(S, tf.p, 1.1, 0.5, [255, 214, 90], 0.5, 0, { add: true, bias: -20 })
    const ring = cache('halo', () => {
      const pts = []
      for (let i = 0; i < 56; i += 1) pts.push([0.66 * Math.cos((i / 56) * TAU), 0, 0.66 * Math.sin((i / 56) * TAU)])
      return tube(pts, 0.075, 12, { closed: true, up: [0, 1, 0] })
    })
    drawMesh(S, ring, tf, mat('#ffd54a', { ks: 0.95, shine: 36, ambient: 0.5, rim: 0.7, rimColor: [255, 250, 190], glow: 0.35 }), { layer: 'front' })
    // wings
    const feather = cache('feather', () => deform(ellipsoid(0.12, 0.6, 0.035, 12, 9, { oy: 0.6 }), (v) => [v[0] + 0.12 * (v[1] / 1.2) ** 2, v[1], v[2]]))
    const flap = Math.sin(S.t * 3.2) * 0.1
    ;[-1, 1].forEach((sd) => {
      const base = [sd * 0.95, T - 0.8, -0.55]
      const lens = [0.9, 1.12, 1.15, 1.0, 0.8]
      lens.forEach((L, k) => {
        const ang = 0.15 + k * 0.3 + flap
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

  // 11. Devil 😈 — ridged curved horns with ember glow
  devil(S, g) {
    const horn = (sd) =>
      cache(`horn${sd}`, () => {
        const pts = []
        for (let i = 0; i <= 26; i += 1) {
          const t = i / 26
          pts.push([sd * (0.35 * t + 0.28 * t * t * t - 0.22 * t * t * 0), 0.95 * t - 0.12 * t * t, 0.12 * Math.sin(t * Math.PI)])
        }
        return tube(pts, (t) => (0.17 * (1 - t) ** 1.2 + 0.012) * (1 + 0.08 * Math.sin(t * 46)), 12, { cap: true })
      })
    const hm = mat('#c8192b', { ks: 0.9, shine: 46, ambient: 0.3, rim: 0.7, rimColor: [255, 150, 90] })
    ;[-1, 1].forEach((sd) => {
      const p = g.ep(sd * 0.54, 0.0, -0.04)
      const tf = frame(p, [sd * 0.3, 1, 0.1], [0, 0, 1], 1.05)
      softBlob(S, tf.go(sd * 0.1, 0.2, 0).p, 0.45, 0.45, [255, 60, 40], 0.3, 0, { add: true, bias: -20 })
      drawMesh(S, horn(sd), tf, hm)
      drawMesh(S, cache('hornBase', () => lathe([[0, 0], [0.24, 0], [0.22, 0.05], [0.16, 0.1], [0, 0.11]], 16)), tf.go(0, -0.06, 0), mat('#3b0a12', { ks: 0.4, rim: 0.4 }))
    })
    sparkleAt(S, [-0.5, g.top + 0.55, 0.0], 0.07, S.t, 0.4, [255, 140, 80])
    sparkleAt(S, [0.62, g.top + 0.75, 0.05], 0.06, S.t, 2.2, [255, 110, 70])
  },

  // 12. Strawberry 🍓 — strawberry beanie with seeds and leafy calyx
  strawberry(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.72, -0.04], [0, 1, -0.05])
    const prof = [[0, 0], [0.64, 0], [0.84, 0.13], [0.92, 0.32], [0.88, 0.55], [0.72, 0.8], [0.44, 1.02], [0.2, 1.12], [0, 1.15]]
    const body = cache('strawBody', () => lathe(prof, 32))
    drawMesh(S, body, tf, gloss('#e8193f', { ks: 0.55, shine: 34, ambient: 0.34, rim: 0.7, rimColor: [255, 150, 150] }))
    // seeds placed on the surface in a spiral
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
    // calyx
    const leaf = cache('calyxLeaf', () => ellipsoid(0.17, 0.42, 0.035, 12, 8, { oy: 0.42 }))
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU + 0.2
      const lf = tf.child([0, 1.12, 0], [Math.cos(a) * 0.95, 0.35, Math.sin(a) * 0.95], [0, 1, 0], 0.85)
      drawMesh(S, leaf, lf, mat(i % 2 ? '#2f9e4f' : '#3fbf63', { ks: 0.35, rim: 0.4, double: true }))
    }
    drawMesh(S, cache('stem', () => tube([[0, 0, 0], [0.03, 0.2, 0], [0.1, 0.33, 0]], 0.05, 8, { cap: true })), tf.go(0, 1.12, 0), mat('#2c7a3a', { ks: 0.3 }))
    blushAt(S, g, 205, 0.32, [255, 100, 130], 0.5)
    blushAt(S, g, 425, 0.32, [255, 100, 130], 0.5)
  },

  // 13. Toadstool 🍄 — spotted cap with cream gills
  mushroom(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.78, -0.02], [0, 1, -0.05])
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

  // 14. Ribbon 🎀 — satin bow with real volume
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
    const tf = frame([0.5, T - 0.5, 0.18], [0.35, 1, 0.1], [0, 0, 1], 0.78).rz(-0.2)
    ;[0.4, -0.4].forEach((a) => drawMesh(S, tail, tf.go(0, -0.02, -0.05).rz(a), mat('#f2428f', { ks: 0.8, shine: 55, rim: 0.45 })))
    ;[-1, 1].forEach((sd) => {
      drawMesh(S, loop(sd), tf, SATIN_PINK)
      drawMesh(S, fold(sd), tf.go(0, 0, 0.1), mat('#ff9fcb', { ks: 0.9, shine: 70, ambient: 0.4, rim: 0.4 }))
    })
    drawMesh(S, cache('knot', () => ellipsoid(0.22, 0.26, 0.2, 16, 12)), tf.go(0, 0, 0.06), mat('#f2428f', { ks: 0.95, shine: 60, rim: 0.5 }))
    sparkleAt(S, tf.go(0.8, 0.55, 0.3).p, 0.08, S.t, 0.9, [255, 200, 230])
    blushAt(S, g, 205, 0.32, [255, 110, 160], 0.5)
    blushAt(S, g, 425, 0.32, [255, 110, 160], 0.5)
  },

  // 15. Heart blush 💖 — glossy puffy hearts that spin around the head
  heart_blush(S, g) {
    const T = g.top
    const heart = cache('heart', () => puffy(hearth(), 0.3, { center: [0, 0.05], ang: 44, rings: 7, pow: 0.55 }))
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

  // 16. Star glam ✨ — faceted metal stars, glints and glitter
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
    // glitter under the eyes
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

  // 17. Cyber shades 🕶️ — neon visor with a sweeping glare
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
        // static reflection + sweeping glare
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
    // bridge + temples
    const bridge = cache('bridge', () => tube([[-0.16, 0.1, 0], [-0.07, 0.17, 0.05], [0.07, 0.17, 0.05], [0.16, 0.1, 0]], 0.04, 8, { cap: true }))
    drawMesh(S, bridge, at([0, cy, ez]), frameMat)
    ;[-1, 1].forEach((sd) => {
      const arm = cache(`arm${sd}${w.toFixed(2)}`, () => {
        const pts = []
        const x0 = sd * (w / 2)
        for (let i = 0; i <= 14; i += 1) {
          const t = i / 14
          pts.push([x0 + sd * 0.0 + sd * (0.99 - ex - w / 2) * t, h * 0.3 - 0.1 * t * t, -1.9 * t])
        }
        return tube(pts, 0.036, 8, { cap: true })
      })
      drawMesh(S, arm, at([sd * ex, cy, ez]), frameMat)
    })
  },

  // 18. Gentleman 👓 — round gold spectacles + curled moustache
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
          pts.push([sd * R, R * 0.2 - 0.12 * t * t, -1.9 * t])
        }
        pts.forEach((p) => {
          p[0] += sd * (1.0 - ex - R) * (pts.indexOf(p) / 12)
        })
        return tube(pts, 0.024, 6, { cap: true })
      })
      drawMesh(S, arm, at(c), wire)
    })
    drawMesh(S, cache('rbridge', () => tube([[-0.28, 0.05, 0], [-0.12, 0.2, 0.05], [0.12, 0.2, 0.05], [0.28, 0.05, 0]], 0.026, 8, { cap: true })), at([0, cy, ez]).sc(ex / 0.5), wire)
    // moustache
    const n = g.at(2)
    const lip = g.at(0)
    const mp = [lerp3(n, lip, 0.5)[0], lerp3(n, lip, 0.5)[1] + 0.0, Math.max(n[2], lip[2]) + 0.06]
    const wing = (sd) =>
      cache(`mwing${sd}`, () => {
        const base = [[0, 0.02], [0.14, -0.03], [0.3, -0.07], [0.47, -0.04], [0.6, 0.06], [0.65, 0.18], [0.58, 0.26], [0.49, 0.23], [0.47, 0.16]]
        return tube(base.map(([x, y]) => [sd * x, y, 0.0]), (t) => 0.115 * Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI * 0.75) + 0.014, 10, { cap: true })
      })
    const mm = gloss('#1a1a22', { ks: 0.8, shine: 28, ambient: 0.3, rim: 0.7, rimColor: [120, 130, 160] })
    ;[-1, 1].forEach((sd) => drawMesh(S, wing(sd), at(mp, 0.9), mm))
  },

  // 19. Cowboy 🤠 — felt hat with curled brim, band, buckle and star
  cowboy(S, g) {
    const T = g.top
    const tf = frame([0, T - 0.56, -0.05], [0, 1, -0.1], [0, 0, 1])
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

  // 20. Party 🥳 — swirl cone hat, tinsel, elastic strap and tumbling confetti
  party(S, g) {
    const T = g.top
    const tf = frame([0.22, T - 0.5, -0.05], [0.28, 1, -0.15], [0, 0, 1])
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
    // fluffy pompom
    const tip = tf.go(0, 1.36, 0)
    drawSphere(S, tip, 0.14, fur('#ffe45c', { ambient: 0.5, rim: 0.8 }))
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU
      drawSphere(S, tip.go(Math.cos(a) * 0.1, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.1), 0.07, fur('#fff0a0', { ambient: 0.55, rim: 0.7 }))
    }
    // strap hugging the jaw
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
    // confetti
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
  // 21. Love 💕 — hearts float up from the head (Photo Booth "Love")
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

  // 22. Birds 🐤 — three chirping birds circling above the head
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

  // 23. Storm cloud ⛈️ — a little rain cloud with falling drops and lightning
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

  // 24. Snowfall ❄️ — snow cap, drifting flakes and 6-arm crystals
  snowfall(S, g) {
    const T = g.top
    const snow = mat('#ffffff', { ambient: 1.0, glow: 0.3, rim: 0.2, rimColor: [200, 225, 255], ks: 0.05 })
    ;[-0.62, -0.31, 0, 0.31, 0.62].forEach((x, i) => {
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

  // 25. Music notes 🎵 — glossy 3D notes drifting up from both sides
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

  // 26. Butterflies 🦋 — flapping wings, fluttering around the head
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

  // 27. Bubbles 🫧 — iridescent soap bubbles rising around the head
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