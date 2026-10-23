import type { CSSProperties } from "react"

import { buildPlant, corollaPath, leafletPath, leafletVeins } from "@/lib/plant"

const plant = buildPlant()
export const plantAnchors = plant.anchors

const greens = ["#56703c", "#647f45", "#71894c", "#5d7741"]
const backGreens = ["#8c9a73", "#97a47e", "#a2ad88"]
const lilacs = ["#c9b6e8", "#bba3df", "#d6c7ef"]

const delay = (s: number) => ({ "--delay": `${(s * 0.4).toFixed(2)}s` }) as CSSProperties

/**
 * The aerial part of the specimen, drawn like an ink and wash plate. The
 * strokes ink themselves in on load; the washes follow.
 */
export function PlantDrawing() {
  const backLeaves = plant.leaves.filter((l) => l.back)
  const frontLeaves = plant.leaves.filter((l) => !l.back)

  const renderLeaf = (leaf: (typeof plant.leaves)[number], i: number, back: boolean) => (
    <g key={i} className={back ? "pl-leaf pl-leaf-back" : "pl-leaf"} style={delay(0.5 + i * 0.12)}>
      <path className="pl-ink pl-rachis" d={leaf.rachis} pathLength={1} />
      {leaf.leaflets.map((lf, k) => {
        const pal = back ? backGreens : greens
        const fill = pal[Math.abs(Math.floor(lf.tone * 10)) % pal.length]
        return (
          <g key={k} transform={`translate(${lf.x.toFixed(1)} ${lf.y.toFixed(1)}) rotate(${lf.rot.toFixed(1)})`}>
            <path className="pl-blade" d={leafletPath(lf.l, lf.w)} style={{ fill }} pathLength={1} />
            {lf.l > 30 ? <path className="pl-vein" d={leafletVeins(lf.l, lf.w)} /> : null}
          </g>
        )
      })}
    </g>
  )

  return (
    <svg className="plant" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <radialGradient id="berry" cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#b6c483" />
          <stop offset="0.55" stopColor="#6f8a3f" />
          <stop offset="1" stopColor="#3f5626" />
        </radialGradient>
        <radialGradient id="corolla" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7d5fae" />
          <stop offset="0.35" stopColor="#a68bd2" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d9cbef" stopOpacity="0" />
        </radialGradient>
      </defs>

      {backLeaves.map((l, i) => renderLeaf(l, i, true))}

      {plant.stems.map((s, i) => (
        <g key={i} className="pl-stem" style={delay(i * 0.18)}>
          <path className="pl-stem-fill" d={s.fill} />
          <path className="pl-ink pl-stem-line" d={s.fill} pathLength={1} />
          <path className="pl-stem-spine" d={s.spine} />
        </g>
      ))}

      {frontLeaves.map((l, i) => renderLeaf(l, i + backLeaves.length, false))}

      <g className="pl-cyme" style={delay(1.4)}>
        {plant.pedicels.map((d, i) => (
          <path key={i} className="pl-ink pl-pedicel" d={d} pathLength={1} />
        ))}
        {plant.buds.map((b, i) => (
          <g key={i} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.rot.toFixed(1)})`}>
            <ellipse className="pl-bud" rx={b.r * 0.7} ry={b.r * 1.2} />
            <path className="pl-sepal" d={`M${-b.r * 0.7} ${b.r * 0.5}Q0 ${b.r * 0.1} ${b.r * 0.7} ${b.r * 0.5}`} />
          </g>
        ))}
        {plant.berries.map((b, i) => (
          <g key={i} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`}>
            <circle className="pl-berry" r={b.r} />
            <path
              className="pl-calyx"
              d={`M0 ${-b.r}l-7 -6M0 ${-b.r}l7 -6M0 ${-b.r}l-10 1M0 ${-b.r}l10 1M0 ${-b.r}l0 -9`}
            />
            <ellipse className="pl-gloss" cx={-b.r * 0.35} cy={-b.r * 0.38} rx={b.r * 0.22} ry={b.r * 0.14} />
          </g>
        ))}
        {plant.flowers.map((fl, i) => (
          <g
            key={i}
            className="pl-flower"
            transform={`translate(${fl.x.toFixed(1)} ${fl.y.toFixed(1)}) rotate(${fl.rot.toFixed(1)}) scale(1 ${fl.tilt.toFixed(2)})`}
          >
            <path
              className="pl-corolla"
              d={corollaPath(fl.r)}
              style={{ fill: lilacs[Math.floor(fl.tone * lilacs.length) % lilacs.length] }}
            />
            <circle r={fl.r * 0.62} fill="url(#corolla)" opacity="0.55" />
            {[0, 1, 2, 3, 4].map((k) => (
              <path
                key={k}
                className="pl-crease"
                d={`M0 0L${(Math.sin((k * 2 * Math.PI) / 5) * fl.r * 0.82).toFixed(1)} ${(-Math.cos((k * 2 * Math.PI) / 5) * fl.r * 0.82).toFixed(1)}`}
              />
            ))}
            <g className="pl-anthers">
              {[0, 1, 2, 3, 4].map((k) => (
                <ellipse
                  key={k}
                  cx={(Math.sin((k * 2 * Math.PI) / 5 + 0.6) * fl.r * 0.16).toFixed(1)}
                  cy={(-Math.cos((k * 2 * Math.PI) / 5 + 0.6) * fl.r * 0.16).toFixed(1)}
                  rx={fl.r * 0.11}
                  ry={fl.r * 0.2}
                  transform={`rotate(${((k * 360) / 5 + 34).toFixed(0)} ${(Math.sin((k * 2 * Math.PI) / 5 + 0.6) * fl.r * 0.16).toFixed(1)} ${(-Math.cos((k * 2 * Math.PI) / 5 + 0.6) * fl.r * 0.16).toFixed(1)})`}
                />
              ))}
              <circle r={fl.r * 0.05} className="pl-stigma" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  )
}
