import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Nav({ userName }: { userName?: string }) {
  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-xs font-bold text-white">
              D
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">DealFlow AI</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Chat
            </Link>
            <Link
              href="/dashboard/permissions"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Permissions
            </Link>
            <Link
              href="/dashboard/audit"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Audit Log
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {userName && (
            <span className="text-sm text-muted-foreground">{userName}</span>
          )}
          <a
            href="/auth/logout"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign Out
          </a>
        </div>
      </div>
    </nav>
  );
}
