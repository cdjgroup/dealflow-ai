"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/50 p-0.5" aria-hidden="true">
        <div className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
          <Sun className="size-3.5" />
        </div>
        <div className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
          <Moon className="size-3.5" />
        </div>
        <div className="flex size-7 items-center justify-center rounded-md text-muted-foreground">
          <Monitor className="size-3.5" />
        </div>
      </div>
    )
  }

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/50 p-0.5" role="radiogroup" aria-label="Theme selection">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-checked={theme === value}
          role="radio"
          className={`flex size-7 items-center justify-center rounded-md text-xs transition-colors ${
            theme === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
