"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface CibaWaitingCardProps {
  authReqId: string;
  bindingMessage: string;
  expiresIn: number;
  interval: number;
  onApproved: () => void;
  onDenied: (reason: string) => void;
  onDismiss: () => void;
}

export function CibaWaitingCard({
  authReqId,
  bindingMessage,
  expiresIn,
  interval,
  onApproved,
  onDenied,
  onDismiss,
}: CibaWaitingCardProps) {
  const [timeLeft, setTimeLeft] = useState(expiresIn);
  const [status, setStatus] = useState<"waiting" | "approved" | "denied" | "expired">("waiting");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  useEffect(() => {
    // Countdown timer
    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          cleanup();
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Poll CIBA status
    const pollInterval = Math.max(interval, 2) * 1000;
    pollRef.current = setInterval(async () => {
      if (handledRef.current) return;
      try {
        const res = await fetch(`/api/ciba/status/${authReqId}`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        const data = await res.json();

        if (data.status === "approved" && !handledRef.current) {
          handledRef.current = true;
          cleanup();
          setStatus("approved");
          setTimeout(() => onApproved(), 500);
        } else if (data.status === "denied" && !handledRef.current) {
          handledRef.current = true;
          cleanup();
          setStatus("denied");
          onDenied(data.error || "Authorization denied");
        } else if (data.status === "expired" && !handledRef.current) {
          handledRef.current = true;
          cleanup();
          setStatus("expired");
        }
      } catch {
        // Network error — keep polling
      }
    }, pollInterval);

    return cleanup;
  }, [authReqId, interval, cleanup, onApproved, onDenied]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="bg-chart-4/10 border border-chart-4/20 rounded-lg p-4 my-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl mt-0.5">
          {status === "waiting" && "📱"}
          {status === "approved" && "✅"}
          {status === "denied" && "❌"}
          {status === "expired" && "⏰"}
        </div>
        <div className="flex-1">
          <h3 className="text-foreground font-semibold">
            {status === "waiting" && "Device Verification Required"}
            {status === "approved" && "Approved on Device"}
            {status === "denied" && "Authorization Denied"}
            {status === "expired" && "Request Expired"}
          </h3>

          <p className="text-sm text-muted-foreground mt-1">
            {status === "waiting" && (
              <>
                A push notification has been sent to your phone.
                Please approve on your Auth0 Guardian app.
              </>
            )}
            {status === "approved" && "Authorization confirmed. Proceeding with action..."}
            {status === "denied" && "You denied this action on your device."}
            {status === "expired" && "The authorization request timed out. You can try again."}
          </p>

          <div className="mt-2 text-xs bg-card/50 border border-border rounded px-3 py-2">
            <span className="text-muted-foreground/70">Action: </span>
            <span className="text-foreground/80">{bindingMessage}</span>
          </div>

          {status === "waiting" && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-chart-4 rounded-full animate-pulse" />
                Waiting for approval...
              </div>
              <div className="text-xs text-muted-foreground/60">
                {minutes}:{seconds.toString().padStart(2, "0")} remaining
              </div>
            </div>
          )}

          {(status === "denied" || status === "expired") && (
            <div className="mt-3">
              <button
                onClick={onDismiss}
                className="text-muted-foreground hover:text-foreground text-sm px-3 py-1.5 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
