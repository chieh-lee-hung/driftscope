"use client";

import { useEffect, useState } from "react";

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const key = `ack:${alertId}`;
  const [acked, setAcked] = useState(false);
  const [ackedAt, setAckedAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored) { setAcked(true); setAckedAt(stored); }
  }, [key]);

  function handleAck() {
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    localStorage.setItem(key, ts);
    setAcked(true);
    setAckedAt(ts);
  }

  if (acked) {
    return (
      <span className="ac-btn ac-btn-acked" title={`Acknowledged at ${ackedAt}`}>
        ✓ Acknowledged {ackedAt && <span style={{ opacity: 0.6, marginLeft: 4 }}>{ackedAt}</span>}
      </span>
    );
  }

  return (
    <button className="ac-btn ac-btn-ghost ac-btn-ghost-active" onClick={handleAck}>
      Acknowledge
    </button>
  );
}
