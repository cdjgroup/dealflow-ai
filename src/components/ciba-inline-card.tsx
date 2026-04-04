"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface CibaInlineCardProps {
  authReqId: string;
  bindingMessage: string;
  expiresIn: number;
  interval: number;
}

export function CibaInlineCard({
  authReqId,
  bindingMessage,
  expiresIn,
  interval,
}: CibaInlineCardProps) {
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

    const pollMs = Math.max(interval, 2) * 1000;
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
        } else if (data.status === "denied" && !handledRef.current) {
          handledRef.current = true;
          cleanup();
          setStatus("denied");
        } else if (data.status === "expired" && !handledRef.current) {
          handledRef.current = true;
          cleanup();
          setStatus("expired");
        }
      } catch {
        // Network error — keep polling
      }
    }, pollMs);

    return cleanup;
  }, [authReqId, interval, cleanup]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="bg-chart-4/10 border border-chart-4/20 rounded-lg p-4 my-2">
      <div className="flex items-start gap-3">
        <div className="text-xl mt-0.5">
          {status === "waiting" && "📱"}
          {status === "approved" && "✅"}
          {status === "denied" && "❌"}
          {status === "expired" && "⏰"}
        </div>
        <div className="flex-1">
          <h3 className="text-foreground font-semibold text-sm">
            {status === "waiting" && "Device Verification Required"}
            {status === "approved" && "Approved on Device"}
            {status === "denied" && "Authorization Denied"}
            {status === "expired" && "Request Expired"}
          </h3>

          <p className="text-xs text-muted-foreground mt-1">
            {status === "waiting" && "Check your Auth0 Guardian app and approve the request."}
            {status === "approved" && "Approved! Resend your message to complete the action."}
            {status === "denied" && "You denied this action on your device."}
            {status === "expired" && "The request timed out. Try again."}
          </p>

          <div className="mt-2 text-xs bg-card/50 border border-border rounded px-2 py-1.5">
            <span className="text-muted-foreground/70">Action: </span>
            <span className="text-foreground/80">{bindingMessage}</span>
          </div>

          {status === "waiting" && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-chart-4 rounded-full animate-pulse" />
                Waiting...
              </div>
              <div className="text-xs text-muted-foreground/60">
                {minutes}:{seconds.toString().padStart(2, "0")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
