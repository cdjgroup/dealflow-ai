"use client";

import { useEffect } from "react";

export default function ClosePage() {
  useEffect(() => {
    // Notify the opener that authorization completed, with origin validation
    if (window.opener) {
      window.opener.postMessage(
        { type: "auth0-connect-success" },
        window.location.origin
      );
    }
    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Authorization complete. You can close this window.</p>
    </div>
  );
}
