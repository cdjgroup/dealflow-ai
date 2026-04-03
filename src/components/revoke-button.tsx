"use client";

import { useState } from "react";

interface Props {
  connection: string;
  label: string;
  disabled?: boolean;
}

export function RevokeButton({ connection, label, disabled = false }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disconnected, setDisconnected] = useState(disabled);
  const [error, setError] = useState(false);

  async function handleRevoke() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/connections/${connection}`, {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Failed");
      setDisconnected(true);
      setConfirming(false);
      window.dispatchEvent(new Event("connection-changed"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleReconnect() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/connections/${connection}`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Failed");
      setDisconnected(false);
      window.dispatchEvent(new Event("connection-changed"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (disconnected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Disconnected.</span>
        <button
          onClick={handleReconnect}
          disabled={loading}
          className="rounded border border-primary/30 px-2 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Reconnect"}
        </button>
        {error && (
          <span className="text-xs text-red-400">Failed. Try again.</span>
        )}
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
        {error && (
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
