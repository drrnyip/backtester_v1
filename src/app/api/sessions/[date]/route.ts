import { NextResponse } from "next/server";
import { getSessionOverview } from "@/lib/data/reader";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ date: string }> },
) {
  const { date } = await ctx.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const url = new URL(req.url);
  const resolution = Number(url.searchParams.get("resolution") ?? "60");
  const resolutionSec = [1, 5, 15, 30, 60].includes(resolution) ? resolution : 60;

  try {
    const overview = await getSessionOverview(date, resolutionSec);
    return NextResponse.json(overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load session";
    const status = message.includes("not ingested") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
