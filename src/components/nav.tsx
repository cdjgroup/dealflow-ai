import Link from "next/link";

export function Nav({ userName }: { userName?: string }) {
  return (
    <nav className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold text-white">
            DealFlow AI
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Chat
            </Link>
            <Link
              href="/dashboard/permissions"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Permissions
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {userName && (
            <span className="text-sm text-slate-400">{userName}</span>
          )}
          <a
            href="/auth/logout"
            className="text-sm text-slate-500 hover:text-white transition-colors"
          >
            Sign Out
          </a>
        </div>
      </div>
    </nav>
  );
}
