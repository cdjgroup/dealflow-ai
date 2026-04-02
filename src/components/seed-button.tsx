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
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
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
        className="w-full bg-card hover:bg-secondary disabled:opacity-50 border border-border text-foreground/80 text-sm font-medium px-4 py-3 rounded-lg transition-colors"
      >
        {loading ? "Seeding..." : "Load Demo Data"}
      </button>
      {error && (
        <p className="text-destructive text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
