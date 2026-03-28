import { NextRequest, NextResponse } from "next/server";

// Notion "My tasks" database — ChiehLee's workspace
const NOTION_DB_ID = "49e8cc095c3a4f0a83f1c664e9fef0f7";
const NOTION_API   = "https://api.notion.com/v1";

export async function POST(req: NextRequest) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "NOTION_TOKEN not set" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { project, runtimeAction, actions } = body as {
    project: string;
    runtimeAction: string;
    actions: Array<{ id: string; label: string; detail: string }>;
  };

  const title = `⚠ DriftScope Alert: ${runtimeAction} — ${project}`;

  // Build checklist content blocks
  const checklistBlocks = (actions ?? []).map((a) => ({
    object: "block",
    type: "to_do",
    to_do: {
      rich_text: [
        {
          type: "text",
          text: { content: a.label },
          annotations: { bold: true },
        },
        {
          type: "text",
          text: { content: `  —  ${a.detail}` },
        },
      ],
      checked: false,
    },
  }));

  const notionBody = {
    parent: { database_id: NOTION_DB_ID },
    properties: {
      "Task name": {
        title: [{ type: "text", text: { content: title } }],
      },
      Status: {
        status: { name: "In progress" },
      },
    },
    children: [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `DriftScope detected hidden drift in project "${project}". Observer triggered: ${runtimeAction}.`,
              },
            },
          ],
          icon: { emoji: "🔍" },
          color: "orange_background",
        },
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Recommended Actions" } }],
        },
      },
      ...checklistBlocks,
    ],
  };

  try {
    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify(notionBody),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Notion API error:", err);
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const page = await res.json();
    return NextResponse.json({ url: page.url, id: page.id });
  } catch (err) {
    console.error("create-notion-task error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
