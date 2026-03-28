import { NextRequest, NextResponse } from "next/server";

import { loadTrajectoryData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project") ?? undefined;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const limit = searchParams.get("limit");

  const payload = await loadTrajectoryData({
    project,
    start: start ? Number(start) : undefined,
    end: end ? Number(end) : undefined,
    limit: limit ? Number(limit) : 100
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
