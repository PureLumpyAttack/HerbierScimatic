"use client"

import { useEffect, useRef, type ReactNode } from "react"

export function PlantIntro({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const plant = ref.current?.querySelector(".plant")
    if (!plant) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      ref.current?.setAttribute("data-entered", "")
      observer.disconnect()
    })
    observer.observe(plant)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className="plant-intro">{children}</div>
}
