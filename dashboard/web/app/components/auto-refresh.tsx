"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh();
      setLastRefresh(Date.now());
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return (
    <div className="auto-refresh">
      <span>Auto refresh {Math.round(intervalMs / 1000)}s</span>
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setLastRefresh(Date.now());
        }}
      >
        Refresh now
      </button>
      <span>Last refresh {new Date(lastRefresh).toLocaleTimeString("en-GB")}</span>
    </div>
  );
}
