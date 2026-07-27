import { NextResponse } from "next/server";
import { listAvailableSessions } from "@/lib/data/reader";

export async function GET() {
  try {
    const sessions = listAvailableSessions();
    return NextResponse.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
