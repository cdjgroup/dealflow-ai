"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"

const CYCLE = ["light", "dark", "system"] as const

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button className="flex size-8 items-center justify-center rounded-md text-muted-foreground" aria-hidden="true">
        <Monitor className="size-4" />
      </button>
    )
  }

  const currentIndex = CYCLE.indexOf(theme as typeof CYCLE[number])
  const nextTheme = CYCLE[(currentIndex + 1) % CYCLE.length]

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor
  const label = theme === "light" ? "Light mode" : theme === "dark" ? "Dark mode" : "System mode"

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      aria-label={`${label} — click to switch`}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon className="size-4" />
    </button>
  )
}
