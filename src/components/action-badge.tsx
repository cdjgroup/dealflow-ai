"use client";

import { useState, useEffect } from "react";

const headers = { "X-Requested-With": "XMLHttpRequest" };

export function ActionBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/actions?status=pending", { headers });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active && Array.isArray(data.actions)) {
          setCount(data.actions.length);
        }
      } catch {
        // ignore
      }
    };

    const id = setInterval(poll, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (count <= 0) return null;

  return (
    <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-[10px] font-medium text-white">
      {count}
    </span>
  );
}
