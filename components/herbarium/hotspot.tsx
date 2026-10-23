"use client"

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"

export function Hotspot({
  x,
  y,
  at,
  worldHeight = 1000,
  mark,
  label,
  sub,
  side = "right",
  variant = "organ",
  className,
  children,
}: {
  x: number
  y: number
  at: number
  worldHeight?: number
  mark?: ReactNode
  label: ReactNode
  sub?: ReactNode
  side?: "left" | "right"
  variant?: "organ" | "taxon" | "species"
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const pop = popRef.current
    const btn = btnRef.current
    if (!pop || !btn) return
    const spot = btn.parentElement!
    const scene = spot.closest(".camera-scene")
    let automatic = false
    let intersecting = false
    let frame = 0
    let lastPosition = ""
    const mobileViewport = window.matchMedia("(max-width: 720px)")
    let mobile = mobileViewport.matches
    const onViewportChange = () => { mobile = mobileViewport.matches }
    mobileViewport.addEventListener("change", onViewportChange)
    let pending: ReturnType<typeof setTimeout>
    const visibility = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      if (intersecting) onActive()
      else {
        clearTimeout(pending)
        if (pop.matches(":popover-open")) pop.hidePopover()
      }
    })

    const place = () => {
      frame = 0
      if (!pop.matches(":popover-open")) return
      const r = btn.getBoundingClientRect()
      const w = pop.offsetWidth
      const h = pop.offsetHeight
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const gap = variant === "species" && vw > 1100 ? 120 : 18
      let left = side === "left" && variant !== "species" ? r.left - gap - w : r.right + gap
      if (left + w > vw - 12) left = r.left - gap - w
      if (left < 12) left = Math.min(vw - w - 12, Math.max(12, r.right + gap))
      const anchor = r.top + r.height / 2
      let top = variant === "species" ? anchor - h / 2 : Math.min(vh - h - 12, Math.max(12, anchor - h / 2))
      if (variant === "species") {
        const plate = spot.closest(".plate")?.getBoundingClientRect()
        if (plate) {
          const unit = plate.width / 1000
          const targetLeft = plate.left + 735 * unit
          if (targetLeft >= 12 && targetLeft + w <= vw - 12) {
            left = targetLeft
            top = Math.min(anchor - 310 * unit, anchor + 170 * unit - h - 24)
          }
        }
      }
      if (vw <= 720) {
        const viewport = window.visualViewport
        const edge = (viewport?.offsetTop ?? 0) + 12
        const bottom = edge + (viewport?.height ?? vh) - 24
        left = (vw - w) / 2
        top = scene?.classList.contains("hero") ? edge + 56 : bottom - h
        if (variant === "species" && pop.dataset.expanded !== "true") {
          const photo = scene?.querySelector(".taxon-photo-species")?.getBoundingClientRect()
          if (photo) top = photo.bottom + 16
          if (top + h > bottom) top = r.top - h - 20
        }
        top = Math.max(edge, Math.min(bottom - h, top))
      }
      const position = `translate3d(${left.toFixed(2)}px, ${top.toFixed(2)}px, 0)`
      if (position !== lastPosition) {
        pop.style.transform = position
        lastPosition = position
      }
    }

    const schedulePlace = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    const onSceneMove = () => {
      if (mobile && (variant !== "species" || pop.dataset.expanded === "true")) return
      schedulePlace()
    }
    const sizeObserver = new ResizeObserver(schedulePlace)
    const onScroll = () => {
      if (automatic) onSceneMove()
      else if (pop.matches(":popover-open")) pop.hidePopover()
    }
    const onActive = () => {
      if (variant === "taxon") return
      clearTimeout(pending)
      if (spot.dataset.active !== "true") {
        if (automatic && pop.matches(":popover-open")) pop.hidePopover()
        return
      }
      if (!intersecting || pop.matches(":popover-open")) return
      pending = setTimeout(() => {
        const r = btn.getBoundingClientRect()
        if (spot.dataset.active !== "true" || r.bottom <= 0 || r.top >= window.innerHeight) return
        automatic = true
        pop.showPopover()
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120)
    }
    const onToggle = () => {
      const open = pop.matches(":popover-open")
      btn.setAttribute("aria-expanded", String(open))
      if (open) {
        if (variant === "species") automatic = true
        schedulePlace()
        window.addEventListener("scroll", onScroll, { passive: true })
        window.addEventListener("resize", schedulePlace)
        window.visualViewport?.addEventListener("resize", schedulePlace)
        window.visualViewport?.addEventListener("scroll", schedulePlace)
        sizeObserver.observe(pop)
        scene?.addEventListener("scene-move", onSceneMove)
      } else {
        setExpanded(false)
        sizeObserver.disconnect()
        automatic = false
        cancelAnimationFrame(frame)
        frame = 0
        window.removeEventListener("scroll", onScroll)
        window.removeEventListener("resize", schedulePlace)
        window.visualViewport?.removeEventListener("resize", schedulePlace)
        window.visualViewport?.removeEventListener("scroll", schedulePlace)
        scene?.removeEventListener("scene-move", onSceneMove)
      }
    }
    spot.addEventListener("spot-active", onActive)
    spot.addEventListener("transitionend", onSceneMove)
    pop.addEventListener("toggle", onToggle)
    if (pop.matches(":popover-open")) {
      automatic = variant !== "taxon" && spot.dataset.active === "true"
      onToggle()
    }
    visibility.observe(btn)
    onActive()
    return () => {
      clearTimeout(pending)
      cancelAnimationFrame(frame)
      mobileViewport.removeEventListener("change", onViewportChange)
      visibility.disconnect()
      sizeObserver.disconnect()
      spot.removeEventListener("spot-active", onActive)
      spot.removeEventListener("transitionend", onSceneMove)
      pop.removeEventListener("toggle", onToggle)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", schedulePlace)
      window.visualViewport?.removeEventListener("resize", schedulePlace)
      window.visualViewport?.removeEventListener("scroll", schedulePlace)
      scene?.removeEventListener("scene-move", onSceneMove)
    }
  }, [side, variant])

  return (
    <div
      className={`spot spot-${variant} spot-${side}${className ? ` ${className}` : ""}`}
      data-at={at}
      style={{ "--x": `${x / 10}%`, "--y": `${(y / worldHeight) * 100}%` } as CSSProperties}
    >
      <button
        ref={btnRef}
        type="button"
        className="spot-btn"
        popoverTarget={variant === "species" ? undefined : id}
        onClick={variant === "species" ? () => {
          const pop = popRef.current
          if (pop && !pop.matches(":popover-open")) pop.showPopover()
        } : undefined}
        aria-expanded="false"
      >
        <span className="spot-dot" aria-hidden="true">
          {mark}
        </span>
        <span className="spot-label">
          <span className="spot-name">{label}</span>
          {sub ? <span className="spot-sub">{sub}</span> : null}
        </span>
      </button>
      <div ref={popRef} id={id} popover={variant === "species" ? "manual" : "auto"} className={`spot-card spot-card-${variant}`} data-expanded={expanded}>
        <button type="button" className="spot-card-close" aria-label="Fermer la fiche" onClick={() => popRef.current?.hidePopover()}>×</button>
        {children}
        {variant === "species" ? (
          <button type="button" className="spot-card-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Réduire la fiche" : "Voir la fiche complète"}
          </button>
        ) : null}
      </div>
    </div>
  )
}
