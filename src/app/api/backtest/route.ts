import { NextResponse } from "next/server";
import { ES_SPEC } from "@/lib/es";
import { loadSessionQuotes, loadSessionTrades, requireSession } from "@/lib/data/reader";
import { getStrategy } from "@/lib/backtest/strategies";
import { runTickBacktest } from "@/lib/backtest/engine";
import type { BacktestRequest } from "@/lib/types";

function clamp(n: number, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export async function POST(req: Request) {
  let body: Partial<BacktestRequest>;
  try {
    body = (await req.json()) as Partial<BacktestRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionDate = body.sessionDate ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json({ error: "sessionDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!getStrategy(body.strategyId ?? "")) {
    return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
  }

  const request: BacktestRequest = {
    sessionDate,
    strategyId: body.strategyId as string,
    strategyParams: body.strategyParams ?? {},
    contracts: clamp(body.contracts ?? 1, 1, 1000),
    slippageTicks: clamp(body.slippageTicks ?? 1, 0, 100),
    commissionPerContract: clamp(body.commissionPerContract ?? 2.5, 0, 1000),
    stopLossTicks: clamp(body.stopLossTicks ?? 0, 0, 100000),
    takeProfitTicks: clamp(body.takeProfitTicks ?? 0, 0, 100000),
    flattenAtSessionEnd: body.flattenAtSessionEnd ?? true,
    startingCapital: clamp(body.startingCapital ?? 100000, 1, 1e9),
  };

  try {
    requireSession(sessionDate);
    const [trades, quotes] = await Promise.all([
      loadSessionTrades(sessionDate),
      loadSessionQuotes(sessionDate),
    ]);
    if (trades.length === 0) {
      return NextResponse.json({ error: "No trades for this session" }, { status: 404 });
    }
    const result = runTickBacktest(trades, quotes, ES_SPEC, request, sessionDate);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backtest failed";
    const status = message.includes("not ingested") ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
