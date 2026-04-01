"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeedButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSeed = async () => {
    setLoading(true);
    await fetch("/api/seed", { method: "POST" });
    setLoading(false);
    router.refresh();
  };

  return (
    <button
      onClick={handleSeed}
      disabled={loading}
      className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium px-4 py-3 rounded-lg transition-colors"
    >
      {loading ? "Seeding..." : "Load Demo Data"}
    </button>
  );
}
