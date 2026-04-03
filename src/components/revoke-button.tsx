"use client";

import { useState } from "react";

interface Props {
  connection: string;
  label: string;
}

export function RevokeButton({ connection, label }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  async function handleRevoke() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/connections/${connection}`, {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Failed");
      setResult("success");
      setConfirming(false);
      // Trigger a custom event so TokenStatus can refresh
      window.dispatchEvent(new Event("connection-changed"));
    } catch {
      setResult("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleReconnect() {
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${connection}`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Failed");
      setResult(null);
      window.dispatchEvent(new Event("connection-changed"));
    } catch {
      // Stay in disconnected state
    } finally {
      setLoading(false);
    }
  }

  if (result === "success") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Disconnected.
        </span>
        <button
          onClick={handleReconnect}
          disabled={loading}
          className="rounded border border-primary/30 px-2 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Reconnect"}
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Disconnect {label}?</span>
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
        >
          {loading ? "..." : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          No
        </button>
        {result === "error" && (
          <span className="text-xs text-red-400">Failed. Try again.</span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:border-red-500/50 hover:text-red-400 transition-colors"
    >
      Disconnect
    </button>
  );
}
