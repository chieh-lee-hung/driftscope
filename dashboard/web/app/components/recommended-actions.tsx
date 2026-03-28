"use client";

import { useState } from "react";

type Action = {
  id: string;
  label: string;
  detail: string;
};

const DEFAULT_ACTIONS: Action[] = [
  {
    id: "gate_refunds",
    label: "Gate refunds — require human approval",
    detail: "100% of refund requests now route through human review before processing.",
  },
  {
    id: "audit_traces",
    label: "Audit last 48 h of refund decisions",
    detail:
      "Review tool traces from the past 48 hours for check_seller_type + verify_photo_evidence calls.",
  },
  {
    id: "update_baseline",
    label: "Update DriftScope baseline after policy sign-off",
    detail:
      "Once the policy change is approved, re-baseline the observer so the new path becomes the new normal.",
  },
];

export function RecommendedActions({
  project,
  runtimeAction,
  runtimeMessage,
}: {
  project: string;
  runtimeAction: string;
  runtimeMessage: string;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notionStatus, setNotionStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [notionUrl, setNotionUrl] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "loading" | "done" | "fallback" | "error"
  >("idle");

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const allDone = DEFAULT_ACTIONS.every((a) => checked[a.id]);

  const createNotionTask = async () => {
    setNotionStatus("loading");
    try {
      const res = await fetch("/api/create-notion-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          runtimeAction,
          actions: DEFAULT_ACTIONS,
        }),
      });
      const data = await res.json();
      if (data.url) {
        setNotionUrl(data.url);
        setNotionStatus("done");
      } else {
        setNotionStatus("error");
      }
    } catch {
      setNotionStatus("error");
    }
  };

  const notifyOwner = async () => {
    setEmailStatus("loading");
    try {
      const res = await fetch("/api/send-alert-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          runtimeAction,
          runtimeMessage,
          actions: DEFAULT_ACTIONS,
        }),
      });
      const data = await res.json();
      if (data.delivered) {
        setEmailStatus("done");
        return;
      }
      if (data.fallback === "mailto" && data.mailto) {
        window.location.href = data.mailto;
        setEmailStatus("fallback");
        return;
      }
      setEmailStatus("error");
    } catch {
      setEmailStatus("error");
    }
  };

  return (
    <div className="panel" style={{ borderLeft: "3px solid var(--orange)" }}>
      <div className="panel-header">
        <p className="panel-super">Observer Agent · Conditional Branch Triggered</p>
        <p className="panel-title">Operator Follow-up</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {DEFAULT_ACTIONS.map((action) => (
          <label
            key={action.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 8,
              background: checked[action.id]
                ? "rgba(34,197,94,0.06)"
                : "var(--surface)",
              border: `1px solid ${checked[action.id] ? "rgba(34,197,94,0.25)" : "var(--border)"}`,
              transition: "all 0.15s ease",
            }}
          >
            <input
              type="checkbox"
              checked={!!checked[action.id]}
              onChange={() => toggle(action.id)}
              style={{
                marginTop: 2,
                accentColor: "var(--orange)",
                width: 16,
                height: 16,
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: checked[action.id] ? "var(--text-3)" : "var(--text-1)",
                  textDecoration: checked[action.id] ? "line-through" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {action.label}
              </p>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: "0.75rem",
                  color: "var(--text-3)",
                  lineHeight: 1.4,
                }}
              >
                {action.detail}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={notifyOwner}
          disabled={emailStatus === "loading" || emailStatus === "done"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 8,
            border: "1px solid rgba(37,99,235,0.28)",
            background:
              emailStatus === "done"
                ? "rgba(22,163,74,0.08)"
                : "rgba(37,99,235,0.08)",
            color: emailStatus === "done" ? "var(--green, #22c55e)" : "var(--blue, #2563eb)",
            fontWeight: 600,
            fontSize: "0.82rem",
            cursor:
              emailStatus === "loading" || emailStatus === "done"
                ? "default"
                : "pointer",
          }}
        >
          {emailStatus === "loading"
            ? "Sending email…"
            : emailStatus === "done"
              ? "✓ Owner notified"
              : emailStatus === "fallback"
                ? "Opened email draft"
                : "Notify owner by email →"}
        </button>

        {notionStatus !== "done" ? (
          <button
            onClick={createNotionTask}
            disabled={notionStatus === "loading"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid var(--orange)",
              background:
                notionStatus === "loading"
                  ? "rgba(234,88,12,0.05)"
                  : "rgba(234,88,12,0.10)",
              color: "var(--orange)",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: notionStatus === "loading" ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1rem" }}>N</span>
            {notionStatus === "loading"
              ? "Creating task…"
              : "Create Notion task →"}
          </button>
        ) : (
          <a
            href={notionUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid rgba(34,197,94,0.4)",
              background: "rgba(34,197,94,0.08)",
              color: "var(--green, #22c55e)",
              fontWeight: 600,
              fontSize: "0.82rem",
              textDecoration: "none",
            }}
          >
            ✓ Task created in Notion — open →
          </a>
        )}

        {notionStatus === "error" && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
            Could not connect to Notion. Check NOTION_TOKEN in .env.
          </span>
        )}

        {emailStatus === "error" && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
            Could not send email. Set ALERT_EMAIL_TO and optionally RESEND_API_KEY.
          </span>
        )}

        {emailStatus === "fallback" && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
            Opened a pre-filled draft because no email delivery key is configured.
          </span>
        )}

        {allDone && notionStatus !== "done" && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
            All actions completed ✓
          </span>
        )}
      </div>
    </div>
  );
}
