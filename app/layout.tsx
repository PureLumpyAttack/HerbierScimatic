import type { Metadata } from "next"
import { Cormorant_Garamond, IBM_Plex_Mono, Newsreader } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils"

// Variable font: one file per style covers every weight (300–600) we use,
// instead of eight static files.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
})

const text = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-text",
})

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-label",
  // only used far below the fold (Earth section): don't compete with the hero
  preload: false,
})

export const metadata: Metadata = {
  title: "Solanum tuberosum L. — Herbier Scimatic - Nathan Shin",
  description:
    "Herbier pour SciMaTic 5e secondaire",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
      className={cn("antialiased", display.variable, text.variable, mono.variable)}
    >
      <body>{children}</body>
    </html>
  )
}
