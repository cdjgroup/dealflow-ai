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
  const handledRef = useRef(false);

  const connectionLabel =
    connection === "google-oauth2" ? "Google" : connection;

  // Listen for postMessage from the close page (origin-validated)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "auth0-connect-success" && !handledRef.current) {
        handledRef.current = true;
        popupRef.current = null;
        onAuthorized();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAuthorized]);

  const handleAuthorize = useCallback(() => {
    handledRef.current = false;
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
  }, [connection, scopes]);

  useEffect(() => {
    return () => {
      popupRef.current?.close();
    };
  }, []);

  return (
    <div className="bg-chart-4/10 border border-chart-4/20 rounded-lg p-4 my-4">
      <div className="flex items-start gap-3">
        <div className="text-chart-4 text-xl mt-0.5">🔐</div>
        <div className="flex-1">
          <h3 className="text-foreground font-semibold">
            Authorization Required
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            The agent needs access to your {connectionLabel} account to complete
            this action.
          </p>
          {scopes && scopes.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground/70">Requested scopes:</span>{" "}
              {scopes.map((s) => s.split("/").pop()).join(", ")}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleAuthorize}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-1.5 rounded transition-colors"
            >
              Authorize {connectionLabel}
            </button>
            <button
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground text-sm px-3 py-1.5 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
