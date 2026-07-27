import { NextResponse } from "next/server";
import { getTapeWindow } from "@/lib/data/reader";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  const { date } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const url = new URL(req.url);
  const start = Number(url.searchParams.get("start"));
  const end = Number(url.searchParams.get("end"));
  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit") ?? "500")));

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return NextResponse.json(
      { error: "Query params start and end (unix seconds) are required" },
      { status: 400 },
    );
  }

  try {
    const tape = await getTapeWindow(date, start, end, limit);
    return NextResponse.json(tape);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tape";
    const status = message.includes("not ingested") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
