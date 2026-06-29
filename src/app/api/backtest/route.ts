import { NextResponse } from "next/server";
import { getAggregates } from "@/lib/massive";
import { getProductSpec } from "@/lib/products";
import { getStrategy } from "@/lib/backtest/strategies";
import { runBacktest } from "@/lib/backtest/engine";
import type { BacktestRequest, OrderType } from "@/lib/types";

const RESOLUTION = "1min";
const MAX_RANGE_DAYS = 45;

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

const ORDER_TYPES: OrderType[] = ["market", "limit", "stop"];

export async function POST(req: Request) {
  let body: Partial<BacktestRequest>;
  try {
    body = (await req.json()) as Partial<BacktestRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const spec = getProductSpec(body.productCode ?? "");
  if (!spec) {
    return NextResponse.json({ error: "Unknown or missing product code" }, { status: 400 });
  }
  if (!body.ticker) {
    return NextResponse.json({ error: "Missing contract ticker" }, { status: 400 });
  }
  if (!getStrategy(body.strategyId ?? "")) {
    return NextResponse.json({ error: "Unknown strategy" }, { status: 400 });
  }
  const from = body.fromDate ?? "";
  const to = body.toDate ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Dates must be YYYY-MM-DD" }, { status: 400 });
  }
  const span = daysBetween(from, to);
  if (span < 0) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }
  if (span > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: `Date range too large for 1-minute data (max ${MAX_RANGE_DAYS} days).` },
      { status: 400 },
    );
  }

  const orderType: OrderType = ORDER_TYPES.includes(body.entryOrderType as OrderType)
    ? (body.entryOrderType as OrderType)
    : "market";

  const request: BacktestRequest = {
    ticker: body.ticker,
    productCode: spec.code,
    fromDate: from,
    toDate: to,
    strategyId: body.strategyId as string,
    strategyParams: body.strategyParams ?? {},
    contracts: clamp(body.contracts ?? 1, 1, 1000),
    entryOrderType: orderType,
    entryOffsetTicks: clamp(body.entryOffsetTicks ?? 0, 0, 1000),
    slippageTicks: clamp(body.slippageTicks ?? 1, 0, 100),
    commissionPerContract: clamp(body.commissionPerContract ?? 2.5, 0, 1000),
    stopLossTicks: clamp(body.stopLossTicks ?? 0, 0, 100000),
    takeProfitTicks: clamp(body.takeProfitTicks ?? 0, 0, 100000),
    flattenAtSessionEnd: body.flattenAtSessionEnd ?? true,
    startingCapital: clamp(body.startingCapital ?? 100000, 1, 1e9),
  };

  try {
    const bars = await getAggregates(request.ticker, RESOLUTION, from, to);
    if (bars.length === 0) {
      return NextResponse.json(
        { error: "No bars returned for this contract and date range. Try a different range or contract." },
        { status: 404 },
      );
    }
    const result = runBacktest(bars, spec, request);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backtest failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function clamp(n: number, min: number, max: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
