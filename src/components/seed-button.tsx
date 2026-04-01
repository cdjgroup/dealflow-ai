"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeedButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSeed}
        disabled={loading}
        className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium px-4 py-3 rounded-lg transition-colors"
      >
        {loading ? "Seeding..." : "Load Demo Data"}
      </button>
      {error && (
        <p className="text-red-400 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
