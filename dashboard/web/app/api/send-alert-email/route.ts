import { NextRequest, NextResponse } from "next/server";

type AlertAction = {
  id: string;
  label: string;
  detail: string;
};

function buildEmailContent(params: {
  project: string;
  runtimeAction: string;
  runtimeMessage: string;
  actions: AlertAction[];
}) {
  const { project, runtimeAction, runtimeMessage, actions } = params;
  const subject = `[Picnic] DriftScope alert — ${runtimeAction} (${project})`;
  const actionLines = actions
    .map((action, index) => `${index + 1}. ${action.label}\n   ${action.detail}`)
    .join("\n\n");

  const text = [
    `Hi Picnic agent owner,`,
    "",
    `DriftScope detected behavioral drift for agent "${project}".`,
    "",
    `Observer action: ${runtimeAction}`,
    "",
    runtimeMessage,
    "",
    "Recommended actions:",
    actionLines,
    "",
    "Open dashboard:",
    `http://localhost:3000/dashboard?project=${project}`,
  ].join("\n");

  return { subject, text };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    project,
    runtimeAction,
    runtimeMessage,
    actions = [],
  } = body as {
    project: string;
    runtimeAction: string;
    runtimeMessage: string;
    actions?: AlertAction[];
  };

  if (!project || !runtimeAction) {
    return NextResponse.json({ error: "Missing project or runtimeAction" }, { status: 400 });
  }

  const emailTo = process.env.ALERT_EMAIL_TO;
  const emailFrom = process.env.ALERT_EMAIL_FROM;
  const resendKey = process.env.RESEND_API_KEY;
  const { subject, text } = buildEmailContent({
    project,
    runtimeAction,
    runtimeMessage: runtimeMessage || "Observer agent triggered a runtime protection action.",
    actions,
  });

  if (!emailTo) {
    return NextResponse.json(
      { error: "ALERT_EMAIL_TO not set" },
      { status: 500 }
    );
  }

  if (!resendKey || !emailFrom) {
    const mailto = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    return NextResponse.json({
      delivered: false,
      fallback: "mailto",
      mailto,
    });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [emailTo],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("send-alert-email error:", err);
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const payload = await res.json();
    return NextResponse.json({ delivered: true, id: payload.id ?? null });
  } catch (err) {
    console.error("send-alert-email fetch failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
