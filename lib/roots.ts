/**
 * Deterministic botanical root drawing, rendered as SVG paths that "grow"
 * with scroll. Each path carries the scroll window in which it draws:
 * `d` (delay, 0–1) and `l` (length of its window, 0–1).
 */

export interface RootPath {
  d: string
  width: number
  delay: number
  span: number
  depth: number
}

export interface Tuber {
  cx: number
  cy: number
  rx: number
  ry: number
  rot: number
  delay: number
  eyes: { x: number; y: number }[]
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type P = [number, number]

/** Catmull-Rom through points → smooth cubic Bézier path. */
function smooth(points: P[]) {
  const f = (n: number) => n.toFixed(1)
  let d = `M${f(points[0][0])} ${f(points[0][1])}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

export function buildRoots(seed = 20261022, width = 1000, height = 1000) {
  const rng = mulberry32(seed)
  const paths: RootPath[] = []
  const mainMids: P[] = []
  const stolonMids: P[] = []
  const origin: P = [width / 2, 34]

  const grow = (
    start: P,
    angle: number,
    length: number,
    depth: number,
    delay: number,
    span: number
  ) => {
    const steps = Math.max(4, Math.round(length / 26))
    const pts: P[] = [start]
    let a = angle
    let [x, y] = start
    const seg = length / steps
    for (let i = 0; i < steps; i++) {
      // geotropism pulls toward straight down (π/2), plus wander
      a += (Math.PI / 2 - a) * 0.08 + (rng() - 0.5) * 0.42
      x += Math.cos(a) * seg
      y += Math.sin(a) * seg
      pts.push([x, y])
    }
    if (depth === 0) mainMids.push(pts[Math.floor(pts.length * 0.42)])
    paths.push({
      d: smooth(pts),
      width: [2.2, 1.25, 0.8, 0.6][depth] ?? 0.6,
      delay,
      span,
      depth,
    })

    if (depth >= 3) return
    const branches = depth === 0 ? 5 : depth === 1 ? 3 : 2
    for (let b = 0; b < branches; b++) {
      const t = 0.12 + rng() * 0.8
      const idx = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)))
      const p = pts[idx]
      const q = pts[idx + 1]
      const local = Math.atan2(q[1] - p[1], q[0] - p[0])
      const side = rng() > 0.5 ? 1 : -1
      grow(
        p,
        local + side * (0.6 + rng() * 0.7),
        length * (0.28 + rng() * 0.26),
        depth + 1,
        delay + span * t,
        span * 0.62
      )
    }
  }

  const mains = 7
  for (let i = 0; i < mains; i++) {
    const spread = (i / (mains - 1) - 0.5) * 2 // -1..1
    const angle = Math.PI / 2 + spread * 0.95 + (rng() - 0.5) * 0.2
    const start: P = [origin[0] + spread * 14, origin[1] + rng() * 12]
    grow(start, angle, height * (0.62 + rng() * 0.32), 0, rng() * 0.08, 0.52)
  }

  // stolons ending in swelling tubers
  const tubers: Tuber[] = []
  const stolons = [
    { side: -1, len: 250, drop: 120 },
    { side: 1, len: 300, drop: 190 },
    { side: -1, len: 175, drop: 300 },
    { side: 1, len: 150, drop: 70 },
  ]
  stolons.forEach((s, i) => {
    const pts: P[] = [[origin[0], origin[1] - 6 + i * 6]]
    const n = 7
    for (let k = 1; k <= n; k++) {
      const t = k / n
      pts.push([
        origin[0] + s.side * s.len * t + (rng() - 0.5) * 10,
        origin[1] + s.drop * Math.sin((t * Math.PI) / 2) + (rng() - 0.5) * 8,
      ])
    }
    const delay = 0.12 + i * 0.05
    stolonMids.push(pts[Math.floor(n / 2)])
    paths.push({ d: smooth(pts), width: 1.8, delay, span: 0.3, depth: 0 })
    const end = pts[pts.length - 1]
    const rx = 34 + rng() * 18
    const ry = rx * (0.62 + rng() * 0.12)
    const rot = s.side * (8 + rng() * 18)
    const eyes = Array.from({ length: 5 }, () => ({
      x: (rng() - 0.5) * rx * 1.3,
      y: (rng() - 0.5) * ry * 1.1,
    }))
    tubers.push({
      cx: end[0] + s.side * rx * 0.8,
      cy: end[1] + 4,
      rx,
      ry,
      rot,
      delay: delay + 0.26,
      eyes,
    })
  })

  return { paths, tubers, mainMids, stolonMids }
}

/**
 * The "line of descent": a main root running from the crown to the deepest
 * tip. Taxa are hung along it, from the kingdom near the surface to the
 * species at the tip. Each node also sheds a short side root, the lineages
 * that went elsewhere.
 */
export function buildLineage(count: number, seed = 1753, height = 1000) {
  const rng = mulberry32(seed)
  const pts: P[] = [[500, 34]]
  let x = 500
  let a = Math.PI / 2
  const bottom = height * 0.93
  const step = 22
  for (let y = 34; y < bottom; ) {
    a += (Math.PI / 2 - a) * 0.18 + (rng() - 0.5) * 0.3
    x += Math.cos(a) * step + (500 - x) * 0.04
    y += Math.sin(a) * step
    pts.push([x, Math.min(y, bottom)])
  }
  // cumulative chord length → arc-length fractions
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  const total = cum[cum.length - 1]
  const targets = Array.from({ length: count }, (_, i) =>
    i === count - 1 ? 1 : 0.42 + (i / (count - 1)) * 0.58
  )
  const nodes = targets.map((t, i) => {
    let k = cum.findIndex((c) => c / total >= t)
    if (k < 0) k = pts.length - 1
    const side = i % 2 === 0 ? 1 : -1
    return { x: pts[k][0], y: pts[k][1], t: cum[k] / total, side, k }
  })
  return { d: smooth(pts), nodes }
}

/** Pebbles and grit scattered through the soil (1600 × 1000 box). */
export function buildPebbles(seed = 4, count = 90) {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, () => {
    const big = rng() > 0.82
    const r = big ? 7 + rng() * 9 : 1.5 + rng() * 3.5
    return {
      x: rng() * 1600,
      y: 30 + rng() * 960,
      rx: r * (1 + rng() * 0.6),
      ry: r,
      rot: rng() * 180,
      tone: Math.floor(rng() * 4),
    }
  })
}
