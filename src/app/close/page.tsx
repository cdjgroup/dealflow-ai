"use client";

import { useEffect } from "react";

export default function ClosePage() {
  useEffect(() => {
    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Authorization complete. You can close this window.</p>
    </div>
  );
}
