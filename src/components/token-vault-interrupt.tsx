"use client";

import { useCallback, useEffect, useRef } from "react";

interface TokenVaultInterruptProps {
  connection: string;
  scopes?: string[];
  onAuthorized: () => void;
  onDismiss: () => void;
}

export function TokenVaultInterrupt({
  connection,
  scopes,
  onAuthorized,
  onDismiss,
}: TokenVaultInterruptProps) {
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectionLabel =
    connection === "google-oauth2" ? "Google" : connection;

  const handleAuthorize = useCallback(() => {
    const params = new URLSearchParams({
      connection,
      returnTo: "/close",
    });
    if (scopes?.length) {
      params.set("scope", scopes.join(" "));
    }

    const popup = window.open(
      `/auth/connect?${params.toString()}`,
      "auth0-connect",
      "width=500,height=600,scrollbars=yes"
    );
    popupRef.current = popup;

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (popup?.closed) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        onAuthorized();
      }
    }, 500);
  }, [connection, scopes, onAuthorized]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      popupRef.current?.close();
    };
  }, []);

  return (
    <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4 my-4">
      <div className="flex items-start gap-3">
        <div className="text-amber-400 text-xl mt-0.5">🔐</div>
        <div className="flex-1">
          <h3 className="text-amber-200 font-semibold">
            Authorization Required
          </h3>
          <p className="text-sm text-amber-300/70 mt-1">
            The agent needs access to your {connectionLabel} account to complete
            this action.
          </p>
          {scopes && scopes.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">
              <span className="text-slate-500">Requested scopes:</span>{" "}
              {scopes.map((s) => s.split("/").pop()).join(", ")}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAuthorize}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
            >
              Authorize {connectionLabel}
            </button>
            <button
              onClick={onDismiss}
              className="text-slate-400 hover:text-slate-300 text-sm px-3 py-1.5 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
