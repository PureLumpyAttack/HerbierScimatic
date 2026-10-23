export type SketchPoint = [number, number]
export type SketchStroke = { id: string; width: number; points: SketchPoint[] }
export type RootSketch = { version: 1; updatedAt: number; groups: Record<string, SketchStroke[]> }

export function isRootSketch(value: unknown): value is RootSketch {
  if (!value || typeof value !== "object") return false
  const doc = value as RootSketch
  return doc.version === 1 && Number.isFinite(doc.updatedAt) && !!doc.groups &&
    typeof doc.groups === "object" && !Array.isArray(doc.groups) &&
    Object.entries(doc.groups).every(([key, strokes]) => /^[0-7]$/.test(key) && Array.isArray(strokes) && strokes.length <= 500 &&
      strokes.every((s) => s && typeof s.id === "string" && s.id.length <= 80 && Number.isFinite(s.width) && s.width >= 0.5 && s.width <= 8 &&
        Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= 5000 &&
        s.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 1000 && p[1] >= 0 && p[1] <= 700)))
}

/** Rounds to 0.1 user unit and drops trailing zeros: plenty in a 1000-wide viewBox. */
const r1 = (n: number) => String(Math.round(n * 10) / 10)

export function sketchPath(points: SketchPoint[]) {
  if (!points.length) return ""
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i], [nx, ny] = points[i + 1]
    d += `Q${r1(x)} ${r1(y)} ${r1((x + nx) / 2)} ${r1((y + ny) / 2)}`
  }
  const [lx, ly] = points.at(-1)!
  return d + `L${r1(lx)} ${r1(ly)}`
}

/**
 * Ramer–Douglas–Peucker: drops points that deviate less than `tolerance`
 * from the simplified line. Hand-drawn strokes are sampled densely, so this
 * removes most points without any visible change.
 */
export function simplifyPoints(points: SketchPoint[], tolerance = 0.35): SketchPoint[] {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  const t2 = tolerance * tolerance
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a], [bx, by] = points[b]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let max = 0, index = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      let d2: number
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
      }
      if (d2 > max) { max = d2; index = i }
    }
    if (max > t2) {
      keep[index] = 1
      stack.push([a, index], [index, b])
    }
  }
  return points.filter((_, i) => keep[i])
}
