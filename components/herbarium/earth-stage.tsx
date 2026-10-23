"use client"

import { useEffect, useRef } from "react"

export function EarthStage() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const soilRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLParagraphElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const finalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    const host = hostRef.current
    if (!section || !stage || !host) return

    let cancelled = false
    let started = false
    let dispose: (() => void) | undefined
    const start = () => {
      if (started || cancelled) return
      started = true
      observer.disconnect()
      void import("./earth-scene").then(({ createEarthScene }) => {
        if (cancelled) return
        dispose = createEarthScene({
          section, stage, host,
          soil: soilRef.current,
          caption: captionRef.current,
          pin: pinRef.current,
          final: finalRef.current,
        })
      })
    }
    // Fallback: prepare the scene when it's two screens away.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start()
    }, { rootMargin: "200% 0px" })
    observer.observe(section)
    // Preferred: prepare it while the reader is still at the top of the page,
    // once the hero has settled, so its setup (shader compiles, texture
    // uploads, cloud bake) never overlaps the scroll into the Earth.
    // Skipped on low-memory devices, where holding the textures early hurts.
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    let timer: ReturnType<typeof setTimeout> | undefined
    let idleId = 0
    let lastScroll = 0
    const onScroll = () => { lastScroll = performance.now() }
    window.addEventListener("scroll", onScroll, { passive: true })
    // wait for an idle moment when the page isn't being scrolled
    const startWhenQuiet = () => {
      const quiet = performance.now() - lastScroll
      if (quiet < 250) timer = setTimeout(startWhenQuiet, 250 - quiet + 16)
      else start()
    }
    const prepareEarly = () => {
      timer = setTimeout(() => {
        idleId = typeof requestIdleCallback === "function"
          ? requestIdleCallback(startWhenQuiet, { timeout: 3000 })
          : (setTimeout(startWhenQuiet, 0) as unknown as number)
      }, 1200)
    }
    if (memory >= 4) {
      if (document.readyState === "complete") prepareEarly()
      else window.addEventListener("load", prepareEarly, { once: true })
    }
    return () => {
      cancelled = true
      observer.disconnect()
      window.removeEventListener("load", prepareEarly)
      window.removeEventListener("scroll", onScroll)
      clearTimeout(timer)
      if (idleId && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId)
      dispose?.()
    }
  }, [])

  return (
    <section ref={sectionRef} id="lieu" className="earth" aria-labelledby="lieu-titre">
      <div ref={stageRef} className="earth-stage">
        <div ref={hostRef} className="earth-canvas" />

        <div className="earth-soil-entry" aria-hidden="true">
          <div ref={soilRef} className="earth-soil" />
        </div>

        <p ref={captionRef} className="earth-caption">
          Sous la terre<span>…</span> la Terre.
        </p>

        <div ref={pinRef} className="earth-pin" aria-hidden="true">
          <svg className="earth-pin-marker" viewBox="0 0 40 52" fill="none">
            <path d="M20 50S3 30 3 19a17 17 0 1 1 34 0C37 30 20 50 20 50Z" />
            <circle cx="20" cy="19" r="5" />
          </svg>
          <span className="earth-pin-text">
            Île de Montréal
            <small>45° 30′ N · 73° 34′ O</small>
          </span>
        </div>

        <div ref={finalRef} className="earth-final">
          <p className="earth-kicker">Lieu de culture</p>
          <h2 id="lieu-titre">Récolté à la maison</h2>
          <p className="earth-where">Montréal, Québec</p>
          <p className="earth-when">22 octobre 2026</p>
        </div>

        <p className="earth-credit">
          Imagerie : NASA Blue Marble · Sentinel-2 cloudless 2016 © EOX (Copernicus) · Relief : Mapzen Terrain
          Tiles · Contour : © OpenStreetMap
        </p>
      </div>
    </section>
  )
}
