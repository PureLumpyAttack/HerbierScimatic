"use client"

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"

export type CameraStop = {
  at: number
  y: number
  anchorY?: number
  reveal?: number
}

/**
 * Writes the element's scroll progress (0–1) into the CSS variable `--p`.
 *
 * - "sticky": progress while a tall section scrolls past a sticky stage
 *   (0 when its top reaches the viewport top, 1 when its bottom reaches the
 *   viewport bottom).
 * - "reveal": progress of the section entering from the bottom of the
 *   viewport, so anything drawn with `--p` keeps its tip at the screen edge.
 */
export function ScrollVar({
  as: Tag = "section",
  mode = "sticky",
  camera,
  grounded = false,
  worldHeight = 1000,
  className,
  style,
  children,
  ...rest
}: {
  as?: "section" | "div"
  mode?: "sticky" | "reveal"
  camera?: CameraStop[]
  grounded?: boolean
  worldHeight?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-hidden"?: boolean
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let last = -1
    let lastY = NaN
    let lastReveal = NaN
    let lastGate = NaN
    const stage = el.firstElementChild as HTMLElement
    const plate = camera ? el.querySelector<HTMLElement>(".plate") : null
    // Reveal window: an overflow-clipping box whose bottom edge follows the
    // camera, with its content counter-shifted so the drawing stays put. Both
    // move with transforms only, so revealing never repaints the (huge) plate
    // the way animating stroke-dashoffset did on every scroll frame.
    const cameraReveal = el.querySelector<HTMLElement>("[data-camera-reveal]")
    const cameraRevealInner = cameraReveal?.firstElementChild as HTMLElement | null
    let height = stage.clientHeight
    let size = Math.min(stage.clientWidth, height)
    const progressTargets = Array.from(el.querySelectorAll<HTMLElement | SVGElement>("[data-progress]"))
    if (!progressTargets.length) progressTargets.push(el)
    const progressValues = new Map<Element, number>()
    const gated = Array.from(el.querySelectorAll<HTMLElement>("[data-at]"), (element) => ({ element, at: Number(element.dataset.at) }))
    const gateStops = [...new Set(gated.flatMap(({ at }) => [at, at + 0.16]))].sort((a, b) => a - b)
    // The section's document offset is cached and only re-measured on resize,
    // so scroll frames never call getBoundingClientRect() — which would force
    // a synchronous style/layout pass after the other scenes wrote their styles.
    let docTop = 0
    let elHeight = 1
    let vh = window.innerHeight
    const measureOffset = () => {
      const r = el.getBoundingClientRect()
      docTop = r.top + window.scrollY
      elHeight = r.height
      vh = window.innerHeight
    }
    measureOffset()
    const update = () => {
      raf = 0
      const top = docTop - window.scrollY
      const r = { top, height: elHeight, bottom: top + elHeight }
      const p =
        mode === "sticky"
          ? -r.top / Math.max(1, r.height - vh)
          : (vh - r.top) / Math.max(1, r.height)
      const c = Math.min(1, Math.max(0, p))
      const visible = r.top < vh && r.bottom > 0
      if (el.dataset.visible !== String(visible)) {
        el.dataset.visible = String(visible)
        last = -1
        lastGate = NaN
      }
      if (Math.abs(c - last) <= 0.0005) return
      if (camera?.length && plate) {
        let next = camera.findIndex((stop) => stop.at > c)
        if (next < 0) next = camera.length - 1
        const from = camera[Math.max(0, next - 1)]
        const to = camera[next]
        const t = Math.min(1, Math.max(0, (c - from.at) / Math.max(0.0001, to.at - from.at)))
        const eased = t * t * (3 - 2 * t)
        const mix = (a: number, b: number) => a + (b - a) * eased
        const unit = size / 1000
        const worldY = mix(from.y, to.y)
        const y = height * mix(from.anchorY ?? 0.58, to.anchorY ?? 0.58) - worldY * unit
        const reveal = Math.min(1, Math.max(0, mix(from.reveal ?? 0, to.reveal ?? 0)))
        if (cameraReveal && cameraRevealInner && reveal !== lastReveal) {
          const shift = ((1 - reveal) * 100).toFixed(3)
          cameraReveal.style.transform = `translate3d(0, -${shift}%, 0)`
          cameraRevealInner.style.transform = `translate3d(0, ${shift}%, 0)`
          lastReveal = reveal
        }
        const position = Math.round((grounded ? Math.max(height - size, y) : y) * 10) / 10
        if (position !== lastY) {
          plate.style.transform = `translate3d(0, ${position}px, 0)`
          lastY = position
          el.dispatchEvent(new Event("scene-move"))
        }
      }
      if (Math.abs(c - last) > 0.0005) {
        last = c
        for (const target of progressTargets) {
          const value = Math.min(c, Number(target.dataset.progress) || 1)
          if (progressValues.get(target) === value) continue
          target.style.setProperty("--p", value.toFixed(4))
          progressValues.set(target, value)
        }
        const gate = gateStops.findIndex((at) => at > c)
        if (gate === lastGate) return
        lastGate = gate
        const active = visible ? gated.findLast(({ at }) => c >= at)?.element : undefined
        for (const { element: g, at } of gated) {
          const on = c >= at
          const past = c >= at + 0.16
          if (g.dataset.past !== String(past)) g.dataset.past = String(past)
          if (g.dataset.on !== String(on)) {
            g.dataset.on = String(on)
            g.inert = !on
          }
          const current = g === active
          if (g.dataset.active !== String(current)) {
            g.dataset.active = String(current)
            g.dispatchEvent(new Event("spot-active"))
          }
        }
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const measure = () => {
      height = stage.clientHeight
      size = Math.min(stage.clientWidth, height)
      el.style.setProperty("--scene-size", `${size}px`)
      measureOffset()
      last = -1
      lastY = NaN
      lastGate = NaN
      onScroll()
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    // anything above this section changing height moves its offset
    observer.observe(document.documentElement)
    el.style.setProperty("--scene-size", `${size}px`)
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", measure)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", measure)
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [mode, camera, grounded])

  return (
    <Tag
      ref={ref as never}
      className={`${className ?? ""}${camera ? " camera-scene" : ""}`}
      style={{ "--p": 0, "--world-ratio": worldHeight / 1000, ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  )
}
