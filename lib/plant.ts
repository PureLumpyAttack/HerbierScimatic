/**
 * Deterministic 2D botanical drawing of the aerial part of Solanum tuberosum,
 * in a 1000 × 1000 box whose stem base sits at the bottom centre (500, 1000)
 * so it lines up with the root system drawn in the next section.
 */

type P = [number, number]

export interface Leaflet {
  x: number
  y: number
  rot: number
  l: number
  w: number
  tone: number
}

export interface Leaf {
  rachis: string
  leaflets: Leaflet[]
  back: boolean
}

export interface Flower {
  x: number
  y: number
  r: number
  rot: number
  tilt: number
  tone: number
}

export interface Plant {
  stems: { fill: string; spine: string }[]
  leaves: Leaf[]
  pedicels: string[]
  flowers: Flower[]
  buds: { x: number; y: number; r: number; rot: number }[]
  berries: { x: number; y: number; r: number }[]
  anchors: Record<"tige" | "feuille" | "fleur" | "baie", P>
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

const f = (n: number) => n.toFixed(1)

/** Dense Catmull-Rom sampling through control points. */
function sample(points: P[], per = 12): P[] {
  const out: P[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    for (let k = 0; k < per; k++) {
      const t = k / per
      const t2 = t * t
      const t3 = t2 * t
      const c = (a: number, b: number, c2: number, d: number) =>
        0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3)
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(points[points.length - 1])
  return out
}

function polyline(pts: P[]) {
  return pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("")
}

function at(pts: P[], t: number): { p: P; a: number } {
  const i = Math.min(pts.length - 2, Math.max(0, Math.floor(t * (pts.length - 1))))
  const p = pts[i]
  const q = pts[i + 1]
  return { p, a: Math.atan2(q[1] - p[1], q[0] - p[0]) }
}

/** Tapered ribbon around a centreline: the drawn stem. */
function ribbon(pts: P[], w0: number, w1: number) {
  const left: P[] = []
  const right: P[] = []
  pts.forEach((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)]
    const o = pts[Math.max(0, i - 1)]
    const a = Math.atan2(q[1] - o[1], q[0] - o[0])
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2
    left.push([p[0] + Math.cos(a - Math.PI / 2) * w, p[1] + Math.sin(a - Math.PI / 2) * w])
    right.push([p[0] + Math.cos(a + Math.PI / 2) * w, p[1] + Math.sin(a + Math.PI / 2) * w])
  })
  return polyline([...left, ...right.reverse()]) + "Z"
}

/** Leaflet outline along +x, ovate with an acuminate tip. */
export function leafletPath(l: number, w: number) {
  return (
    `M0 0C${f(l * 0.18)} ${f(-w * 0.62)} ${f(l * 0.66)} ${f(-w * 0.6)} ${f(l)} 0` +
    `C${f(l * 0.66)} ${f(w * 0.6)} ${f(l * 0.18)} ${f(w * 0.62)} 0 0Z`
  )
}

export function leafletVeins(l: number, w: number) {
  let d = `M${f(l * 0.04)} 0L${f(l * 0.9)} 0`
  for (const t of [0.26, 0.46, 0.64]) {
    const x = l * t
    d += `M${f(x)} 0Q${f(x + l * 0.1)} ${f(-w * 0.22)} ${f(x + l * 0.2)} ${f(-w * 0.3)}`
    d += `M${f(x)} 0Q${f(x + l * 0.1)} ${f(w * 0.22)} ${f(x + l * 0.2)} ${f(w * 0.3)}`
  }
  return d
}

/** Five-lobed rotate corolla, pointing along +y before rotation. */
export function corollaPath(r: number) {
  const pts: string[] = []
  const n = 60
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const lobe = Math.pow(Math.abs(Math.cos((5 * t) / 2)), 0.7)
    const rr = r * (0.58 + 0.42 * lobe)
    pts.push(`${i ? "L" : "M"}${f(Math.sin(t) * rr)} ${f(-Math.cos(t) * rr)}`)
  }
  return pts.join("") + "Z"
}

export function buildPlant(seed = 1022): Plant {
  const rng = mulberry32(seed)
  const jitter = (s: number) => (rng() - 0.5) * s

  const stemDefs: { pts: P[]; w0: number; w1: number }[] = [
    // main stem, ends in the flowering cyme
    { pts: [[500, 1060], [494, 880], [478, 700], [470, 520], [478, 360], [470, 250]], w0: 15, w1: 5 },
    // right stem, carries the berries
    { pts: [[506, 1060], [520, 900], [566, 760], [620, 610], [660, 470]], w0: 12, w1: 4.5 },
    // left stem, leafy
    { pts: [[494, 1060], [476, 920], [430, 790], [370, 670], [318, 560]], w0: 11, w1: 4 },
  ]
  const spines = stemDefs.map((s) => sample(s.pts, 14))
  const stems = stemDefs.map((s, i) => ({ fill: ribbon(spines[i], s.w0, s.w1), spine: polyline(spines[i]) }))

  const leaves: Leaf[] = []
  const makeLeaf = (origin: P, angle: number, len: number, droop: number, back: boolean, pairs: number) => {
    // rachis: an arching curve
    const ctrl: P[] = [origin]
    let a = angle
    let [x, y] = origin
    const steps = 6
    for (let i = 0; i < steps; i++) {
      a += droop / steps
      x += Math.cos(a) * (len / steps)
      y += Math.sin(a) * (len / steps)
      ctrl.push([x, y])
    }
    const rach = sample(ctrl, 8)
    const leaflets: Leaflet[] = []
    const tone = rng()
    const scale = len / 200
    // lateral pairs, growing toward the tip
    for (let k = 0; k < pairs; k++) {
      const t = 0.3 + (k / Math.max(1, pairs - 1)) * 0.52
      const { p, a: la } = at(rach, t)
      const size = (0.72 + t * 0.35) * scale
      for (const side of [-1, 1]) {
        const spread = (1.02 - t * 0.28 + jitter(0.16)) * side
        leaflets.push({
          x: p[0],
          y: p[1],
          rot: ((la + spread) * 180) / Math.PI,
          l: 66 * size * (0.92 + rng() * 0.16),
          w: 38 * size,
          tone: tone + jitter(0.3),
        })
      }
      // small intercalary leaflets between the pairs
      if (k < pairs - 1) {
        const q = at(rach, t + 0.12)
        for (const side of [-1, 1]) {
          leaflets.push({
            x: q.p[0],
            y: q.p[1],
            rot: ((q.a + side * 1.25) * 180) / Math.PI,
            l: 20 * size,
            w: 12 * size,
            tone: tone + jitter(0.3),
          })
        }
      }
    }
    // terminal leaflet, the largest
    const end = rach[rach.length - 1]
    const endA = at(rach, 0.98).a
    leaflets.push({
      x: end[0],
      y: end[1],
      rot: (endA * 180) / Math.PI,
      l: 84 * scale,
      w: 50 * scale,
      tone,
    })
    leaves.push({ rachis: polyline(rach), leaflets, back })
    return { end, endA, scale }
  }

  // leaves along each stem: [stem, t, side, length, back]
  const leafPlan: [number, number, number, number, boolean][] = [
    [0, 0.2, -1, 250, true],
    [0, 0.34, 1, 240, false],
    [0, 0.52, -1, 210, false],
    [0, 0.68, 1, 180, true],
    [0, 0.8, -1, 150, false],
    [1, 0.48, 1, 210, true],
    [1, 0.55, 1, 200, false],
    [1, 0.78, -1, 150, true],
    [2, 0.36, -1, 230, false],
    [2, 0.62, 1, 170, true],
    [2, 0.86, -1, 170, false],
  ]
  let featured: P = [0, 0]
  leafPlan.forEach(([s, t, side, len, back], i) => {
    const { p, a } = at(spines[s], t)
    const angle = a + side * (1.05 + jitter(0.25))
    const droop = side * (0.5 + rng() * 0.35)
    const res = makeLeaf(p, angle, len, droop, back, len > 200 ? 4 : 3)
    if (i === 2) {
      const r = (res.endA * 180) / Math.PI
      featured = [
        res.end[0] + Math.cos((r * Math.PI) / 180) * 84 * res.scale * 0.45,
        res.end[1] + Math.sin((r * Math.PI) / 180) * 84 * res.scale * 0.45,
      ]
    }
  })

  // inflorescence: a forked cyme on the main stem
  const pedicels: string[] = []
  const flowers: Flower[] = []
  const buds: Plant["buds"] = []
  const top = spines[0][spines[0].length - 1]
  const forks: P[] = [
    [top[0] - 70, top[1] - 82],
    [top[0] + 64, top[1] - 70],
  ]
  forks.forEach((fk, fi) => {
    pedicels.push(polyline(sample([top, [(top[0] + fk[0]) / 2 + jitter(10), (top[1] + fk[1]) / 2 - 12], fk], 8)))
    const n = fi === 0 ? 4 : 3
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.62 + (fi === 0 ? -0.35 : 0.35) + jitter(0.15)
      const L = 42 + rng() * 28
      const end: P = [fk[0] + Math.cos(a) * L, fk[1] + Math.sin(a) * L]
      pedicels.push(polyline(sample([fk, [fk[0] + Math.cos(a) * L * 0.5 + jitter(8), fk[1] + Math.sin(a) * L * 0.5], end], 6)))
      if (k === n - 1 && fi === 1) {
        buds.push({ x: end[0], y: end[1], r: 9, rot: (a * 180) / Math.PI + 90 })
      } else {
        flowers.push({
          x: end[0],
          y: end[1],
          r: 30 + rng() * 6,
          rot: jitter(30),
          tilt: 0.62 + rng() * 0.3,
          tone: rng(),
        })
      }
    }
  })
  // a couple of buds tucked under the cyme
  buds.push({ x: top[0] - 16, y: top[1] - 30, r: 8, rot: -20 })
  pedicels.push(polyline([top, [top[0] - 16, top[1] - 30]]))

  // berries hang from the right stem
  const rTop = spines[1][spines[1].length - 1]
  const berries: Plant["berries"] = []
  const berryEnds: P[] = [
    [rTop[0] + 52, rTop[1] + 30],
    [rTop[0] + 86, rTop[1] - 4],
    [rTop[0] + 30, rTop[1] - 34],
  ]
  berryEnds.forEach((e, i) => {
    pedicels.push(polyline(sample([rTop, [(rTop[0] + e[0]) / 2, Math.min(rTop[1], e[1]) - 18], e], 8)))
    berries.push({ x: e[0], y: e[1] + 12, r: i === 1 ? 17 : 20 })
  })

  const mid = at(spines[0], 0.42).p
  const mainFlower = flowers[1]

  return {
    stems,
    leaves,
    pedicels,
    flowers,
    buds,
    berries,
    anchors: {
      tige: [mid[0] + 2, mid[1]],
      feuille: featured,
      fleur: [mainFlower.x, mainFlower.y],
      baie: [berries[0].x, berries[0].y],
    },
  }
}
