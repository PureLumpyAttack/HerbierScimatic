import type { CSSProperties, ReactNode } from "react"
import Image from "next/image"

import { EarthStage } from "@/components/herbarium/earth-stage"
import { Hotspot } from "@/components/herbarium/hotspot"
import { PlantIntro } from "@/components/herbarium/plant-intro"
import { PlantDrawing, plantAnchors } from "@/components/herbarium/plant-drawing"
import { ScrollVar, type CameraStop } from "@/components/herbarium/scroll-var"
import { CloudShader } from "@/components/ui/cloud-shader"
import { buildLineage, buildPebbles, buildRoots } from "@/lib/roots"
import { taxonPhotos } from "@/lib/taxon-photos"
import { isRootSketch, simplifyPoints, sketchPath } from "@/lib/root-sketch"
import rootDrawing from "@/data/taxon-root-drawing.json"
import { classification, photoGroups, photoLayouts } from "@/lib/taxonomy"

/* ------------------------------------------------------------------ */
/* Contenu                                                             */
/* ------------------------------------------------------------------ */


const species = [
  ["Publication", <><i>Species plantarum</i> 1 : 185 (Linnaeus, 1753)</>],
  ["Noms communs", "Pomme de terre, patate (fr.) ; papa (esp., du quechua) ; potato (angl.)"],
  ["Aire d’origine", "Ouest et sud de l’Amérique du Sud (Royal Botanic Gardens, Kew, s.d.)"],
  ["Type biologique", "Géophyte à tubercules, cultivée comme annuelle"],
  ["Ploïdie", "Tétraploïde, 2n = 4x = 48 (Potato Genome Sequencing Consortium, 2011)"],
] as const

const organs: { n: string; key: string; name: string; latin: string; text: string }[] = [
  {
    n: "1",
    key: "tige",
    name: "Tige",
    latin: "caulis",
    text: "Herbacée, dressée puis étalée, de 30 cm à 1 m. Les tiges sont anguleuses, souvent ailées, vertes ou teintées de pourpre.",
  },
  {
    n: "5",
    key: "tubercule",
    name: "Tubercule",
    latin: "tuber",
    text: "Tige souterraine renflée qui se forme à l’extrémité d’un stolon et accumule l’amidon. Les « yeux » sont des bourgeons axillaires disposés en spirale, plus serrés vers la couronne qu’au talon.",
  },
  {
    n: "2",
    key: "feuille",
    name: "Feuille",
    latin: "folium",
    text: "Alterne, composée imparipennée : trois à quatre paires de folioles ovales, une foliole terminale et de petites folioles intercalaires.",
  },
  {
    n: "3",
    key: "fleur",
    name: "Fleur",
    latin: "flos",
    text: "En cymes au sommet des tiges. Corolle rotacée à cinq lobes soudés, blanche, rose ou violette ; cinq anthères jaunes conniventes en cône autour du style.",
  },
  {
    n: "4",
    key: "baie",
    name: "Baie",
    latin: "bacca",
    text: "Fruit globuleux, vert, de 1 à 4 cm, riche en graines. Comme les feuilles et les tubercules verdis, elle contient des glycoalcaloïdes (α-solanine, α-chaconine) : elle est toxique (Friedman, 2006).",
  },
  {
    n: "6",
    key: "stolon",
    name: "Stolon",
    latin: "stolo",
    text: "Tige souterraine horizontale née à la base de la tige ; son extrémité se renfle en tubercule.",
  },
  {
    n: "7",
    key: "racines",
    name: "Racines",
    latin: "radices",
    text: "Adventives et fasciculées, elles naissent aux nœuds enterrés de la tige et restent assez superficielles.",
  },
]

const references: ReactNode[] = [
  <>
    Friedman, M. (2006). Potato glycoalkaloids and metabolites: Roles in the plant and in the diet. <i>Journal of Agricultural and Food Chemistry</i>, <i>54</i>(23), 8655–8681.{" "}
    <a href="https://doi.org/10.1021/jf061471t">https://doi.org/10.1021/jf061471t</a>
  </>,
  <>
    Linnaeus, C. (1753). <i>Species plantarum</i> (Vol. 1, p. 185). Impensis Laurentii Salvii.
  </>,
  <>
    Potato Genome Sequencing Consortium. (2011). Genome sequence and analysis of the tuber crop potato. <i>Nature</i>, <i>475</i>(7355), 189–195.{" "}
    <a href="https://doi.org/10.1038/nature10158">https://doi.org/10.1038/nature10158</a>
  </>,
  <>
    Royal Botanic Gardens, Kew. (s.d.). <i>Solanum tuberosum</i> L. Dans <i>Plants of the World Online</i>. Consulté le 22 octobre 2026, à{" "}
    <a href="https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:821337-1">https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:821337-1</a>
  </>,
]

const roots = buildRoots()
const lineageTaxa = [...classification, { rank: "Espèce", name: "Solanum tuberosum", author: "L.", italic: true, note: null }]
const ROOT_HEIGHT = 4200
const lineage = buildLineage(lineageTaxa.length, 1753, ROOT_HEIGHT)
const pebbles = Array.from({ length: 4 }, (_, band) =>
  buildPebbles(4 + band).map((pebble) => ({ ...pebble, y: pebble.y + band * 1000 }))
).flat()
  // fade out over the last 30% of the layer (was a CSS mask)
  .map((pebble) => ({ ...pebble, fade: Math.min(1, Math.max(0, (1 - pebble.y / 4000) / 0.3)) }))
  .filter((pebble) => pebble.fade > 0.01)

const atFraction = (t: number) => Math.min(0.995, t)

const importedDrawing: unknown = rootDrawing
if (!isRootSketch(importedDrawing)) throw new Error("Invalid root drawing")
const drawnRoots = importedDrawing.groups
/* Hand-drawn strokes, bent toward each lineage node, simplified and rounded
   once at build time: the raw drawing would weigh ~200 KB of path data. */
const taxonSketches = lineage.nodes.map((node, group) =>
  drawnRoots[group].map((stroke) => ({
    id: stroke.id,
    width: stroke.width,
    d: sketchPath(simplifyPoints(stroke.points.map(([x, y]): [number, number] => [
      x + (node.x - 500) * Math.max(0, 1 - Math.abs(x - 500) / 120), y,
    ]))),
  }))
)
const photoNodes = lineage.nodes.flatMap((node, group) => {
  const last = group === lineage.nodes.length - 1
  const direction = last ? 1 : -node.side
  return photoGroups[group].map((key, example) => {
    const [distance, offset] = photoLayouts[photoGroups[group].length][example]
    return {
      group, last,
      x: 500 + direction * distance,
      y: node.y + offset,
      photo: taxonPhotos.find((photo) => photo.key === key)!,
      at: atFraction(node.t),
    }
  })
})

const organ = (key: string) => organs.find((o) => o.key === key)!
const aerial = [
  { o: organ("fleur"), pos: plantAnchors.fleur, at: 0.14, side: "right" as const },
  { o: organ("feuille"), pos: plantAnchors.feuille, at: 0.32, side: "left" as const },
  { o: organ("baie"), pos: plantAnchors.baie, at: 0.48, side: "right" as const },
  { o: organ("tige"), pos: plantAnchors.tige, at: 0.66, side: "left" as const },
]
const underground = [
  {
    o: organ("racines"),
    pos: [...roots.mainMids].sort((a, b) => b[0] - a[0])[0],
    at: 0.14,
    side: "right" as const,
  },
  { o: organ("stolon"), pos: roots.stolonMids[0], at: 0.23, side: "left" as const },
  {
    o: organ("tubercule"),
    pos: [roots.tubers[1].cx, roots.tubers[1].cy] as [number, number],
    at: 0.3,
    side: "right" as const,
  },
]

const heroCamera: CameraStop[] = [
  { at: 0, y: 0, anchorY: 0.42 },
  { at: 0.13, y: 1000, anchorY: 1 },
  { at: 1, y: 1000, anchorY: 1 },
]

const rootsCamera: CameraStop[] = [
  { at: 0, y: 0, anchorY: 0 },
  { at: 0.35, y: 0, anchorY: 0 },
  // reveal: fraction of the world height drawn so far (the line runs downward,
  // so its tip sits at the camera's depth)
  ...lineage.nodes.map((n) => ({ at: atFraction(n.t), y: n.y, reveal: n.y / ROOT_HEIGHT })),
]

const v = (vars: Record<string, number | string>) => vars as CSSProperties

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Page() {
  return (
    <main className="herbier">
      {/* I. Hero: the aerial part, its organs pointed out while scrolling */}
      <ScrollVar className="hero" camera={heroCamera} grounded aria-labelledby="titre">
        <div className="hero-stage">
          <div className="hero-clouds" aria-hidden="true">
            <CloudShader
              transparent
              count={6}
              speed={0}
              cloudColor="#fffdf6"
              skyTopColor="#3078b5"
              skyBottomColor="#b6dff2"
              className="hero-clouds-canvas"
            />
          </div>
          <header className="masthead">
            <span className="masthead-mark">Herbier Scimatic - Nathan Shin</span>
            <nav aria-label="Sections">
              <a href="#identite">Identité</a>
              <a href="#lieu">Lieu</a>
              <a href="#sources">Sources</a>
            </nav>
          </header>

          <div className="hero-type">
            <h1 id="titre" className="hero-name">
              Solanum tuberosum<span className="hero-author">L.</span>
            </h1>
            <p className="hero-common">pomme de terre</p>
          </div>

          <div className="plate">
            <div className="plant-sway">
              <PlantIntro><PlantDrawing /></PlantIntro>
              {aerial.map(({ o, pos, at, side }) => (
                <Hotspot
                  key={o.key}
                  x={pos[0]}
                  y={pos[1]}
                  at={at}
                  side={side}
                  mark={o.n}
                  label={o.name}
                  sub={<i>{o.latin}</i>}
                >
                  <p className="spot-card-kicker">
                    {o.n} · <i>{o.latin}</i>
                  </p>
                  <h3>{o.name}</h3>
                  <p>{o.text}</p>
                </Hotspot>
              ))}
            </div>
            <div className="hero-ground" aria-hidden="true" />
          </div>

          <p className="hero-meta hero-meta-left">Solanaceae · Planche n°&nbsp;001</p>
          <p className="hero-meta hero-meta-right">Récolte · 22.10.2026</p>
          <p className="hero-hint" aria-hidden="true">
            Morphologie — touchez un point
          </p>
        </div>
      </ScrollVar>

      {/* II. Under the soil: roots, organs, and the lineage of the name */}
      <ScrollVar id="identite" className="roots" mode="reveal" camera={rootsCamera} worldHeight={ROOT_HEIGHT} aria-label="Identité : de la racine au nom">
        <div className="roots-stage">
          <div className="soil-depth" data-progress="1" aria-hidden="true">
            <div className="soil-texture" aria-hidden="true" />
            <div className="soil-grit-layer" aria-hidden="true">
              <svg className="soil-grit" viewBox="0 0 1600 4000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                {pebbles.map((s, i) => (
                  <ellipse
                    key={i}
                    className={`pebble pebble-${s.tone}`}
                    cx={s.x.toFixed(1)}
                    cy={s.y.toFixed(1)}
                    rx={s.rx.toFixed(1)}
                    ry={s.ry.toFixed(1)}
                    transform={`rotate(${s.rot.toFixed(0)} ${s.x.toFixed(1)} ${s.y.toFixed(1)})`}
                    fillOpacity={s.fade < 1 ? s.fade.toFixed(2) : undefined}
                  />
                ))}
              </svg>
            </div>
            <div className="soil-exit" />
          </div>

          <div className="plate plate-roots">
            <svg data-progress="0.35" className="grow roots-svg" viewBox={`0 0 1000 ${ROOT_HEIGHT}`} aria-hidden="true">
              <path className="roots-stem" d="M492.5 -2 L491 38 Q500 46 509 38 L507.5 -2 Z" />
              {roots.paths.filter((r) => r.depth < 3).map((r, i) => (
                <path
                  key={i}
                  className={`root root-${r.depth}`}
                  d={r.d}
                  pathLength={1}
                  strokeWidth={r.width}
                  style={v({ "--d": r.delay.toFixed(3), "--s": r.span.toFixed(3) })}
                />
              ))}
              {roots.tubers.map((t, i) => (
                <g
                  key={i}
                  className="roots-tuber"
                  style={v({ "--d": t.delay.toFixed(3) })}
                  transform={`translate(${t.cx.toFixed(1)} ${t.cy.toFixed(1)}) rotate(${t.rot.toFixed(1)})`}
                >
                  <g className="roots-tuber-body">
                    <ellipse rx={t.rx} ry={t.ry} />
                    <ellipse className="roots-tuber-shade" rx={t.rx * 0.8} ry={t.ry * 0.62} cx={t.rx * 0.08} cy={t.ry * 0.2} />
                    {t.eyes.map((e, k) => (
                      <path key={k} d={`M${(e.x - 3).toFixed(1)} ${e.y.toFixed(1)} q3 -2.4 6 0`} />
                    ))}
                  </g>
                </g>
              ))}
            </svg>
            <div className="lineage-reveal" data-camera-reveal aria-hidden="true">
              <div className="lineage-reveal-inner">
                <svg className="roots-svg" viewBox={`0 0 1000 ${ROOT_HEIGHT}`}>
                  <path className="root lineage" d={lineage.d} />
                </svg>
              </div>
            </div>

            <svg className="roots-svg taxon-sketch" viewBox={`0 0 1000 ${ROOT_HEIGHT}`} aria-hidden="true">
              {lineage.nodes.map((node, group) => (
                <g key={group} className="taxon-branch" data-at={atFraction(node.t)} transform={`translate(0 ${node.y - 350})`}>
                  {taxonSketches[group].map((stroke) => (
                    <path key={stroke.id} strokeWidth={stroke.width} d={stroke.d} />
                  ))}
                </g>
              ))}
            </svg>

            {photoNodes.map((p, i) => {
              const photo = p.photo
              return (
                <figure
                  key={i}
                  className={`taxon-photo${p.last ? " taxon-photo-species" : ""}`}
                  data-at={p.at}
                  data-group={p.group}
                  aria-label={`${lineageTaxa[p.group].name} : ${p.photo.name}`}
                  style={v({ "--x": `${p.x / 10}%`, "--y": `${p.y / ROOT_HEIGHT * 100}%` })}
                >
                  <Image src={photo.src} alt={`${photo.name} — ${photo.scientificName}`} width={500} height={500} sizes={p.last ? "190px" : "140px"} />
                  <figcaption>
                    <span>{photo.name}</span>
                    <i>{photo.scientificName}</i>
                  </figcaption>
                </figure>
              )
            })}

            {underground.map(({ o, pos, at, side }) => (
              <Hotspot
                key={o.key}
                x={pos[0]}
                y={pos[1]}
                at={at}
                worldHeight={ROOT_HEIGHT}
                side={side}
                mark={o.n}
                label={o.name}
                sub={<i>{o.latin}</i>}
                className="spot-dark"
              >
                <p className="spot-card-kicker">
                  {o.n} · <i>{o.latin}</i>
                </p>
                <h3>{o.name}</h3>
                <p>{o.text}</p>
              </Hotspot>
            ))}

            {lineage.nodes.map((n, i) => {
              const c = lineageTaxa[i]
              const last = i === lineage.nodes.length - 1
              const name = (
                <>
                  {c.italic ? <i>{c.name}</i> : c.name}
                  {c.author ? <span className="spot-author"> {c.author}</span> : null}
                </>
              )
              return (
                <Hotspot
                  key={c.name}
                  x={n.x}
                  y={n.y}
                  at={atFraction(n.t)}
                  worldHeight={ROOT_HEIGHT}
                  side={n.side > 0 ? "right" : "left"}
                  variant={last ? "species" : "taxon"}
                  label={name}
                  sub={c.rank}
                >
                  <p className="spot-card-kicker">{c.rank}</p>
                  <h3>{name}</h3>
                  {last ? (
                    <dl className="spot-facts">
                      {species.map(([k, val]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{val}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>{c.note}</p>
                  )}
                </Hotspot>
              )
            })}
          </div>

        </div>
      </ScrollVar>

      {/* III. Earth → Montréal --------------------------------------- */}
      <EarthStage />

      <section id="sources" className="section sources" aria-labelledby="sources-titre">
        <div className="section-head">
          <h2 id="sources-titre">Références</h2>
          <p className="section-intro">Présentées selon les normes APA (7ᵉ édition).</p>
        </div>
        <ol className="refs">
          {references.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ol>
        <details className="photo-credits">
          <summary>Crédits photographiques</summary>
          <p>Photos recadrées pour la présentation.</p>
          <ul>
            {taxonPhotos.map((photo) => (
              <li key={photo.key}>
                <a href={photo.source}>{photo.name}</a> — {photo.author} · <a href={photo.licenseUrl}>{photo.license}</a>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <footer className="colophon">
        <p>
          <i>Solanum tuberosum</i> L. · Herbier Scimatic - Nathan Shin · Planche n°&nbsp;001
        </p>
        <p>Récolté à la maison · Montréal · 22 octobre 2026</p>
      </footer>
    </main>
  )
}
