import "server-only";
import fs from "fs";
import { quotesPath, tradesPath } from "./paths";
import { readQuotesParquet, readTradesParquet } from "./parquet";
import {
  computeSessionStats,
  filterTicker,
  resampleTradesToBars,
  sampleSpreadSeries,
} from "./resample";
import { getSession, listSessions } from "./sessions";
import type { QuoteTick, SessionInfo, SessionStats, SpreadPoint, TradeTick } from "./types";
import type { Bar } from "../types";

export function listAvailableSessions(): SessionInfo[] {
  return listSessions();
}

export function requireSession(date: string): SessionInfo {
  const s = getSession(date);
  if (!s) {
    throw new Error(
      `Session ${date} is not ingested. Run: pnpm ingest -- --from ${date} --to ${date}`,
    );
  }
  return s;
}

export async function loadSessionTrades(date: string, ticker?: string): Promise<TradeTick[]> {
  const session = requireSession(date);
  const file = tradesPath(date);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing trades file for ${date}: ${file}`);
  }
  const all = await readTradesParquet(file);
  return filterTicker(all, ticker ?? session.frontMonth);
}

export async function loadSessionQuotes(date: string, ticker?: string): Promise<QuoteTick[]> {
  const session = requireSession(date);
  const file = quotesPath(date);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing quotes file for ${date}: ${file}`);
  }
  const all = await readQuotesParquet(file);
  return filterTicker(all, ticker ?? session.frontMonth);
}

export async function getSessionOverview(
  date: string,
  resolutionSec = 60,
): Promise<{
  session: SessionInfo;
  stats: SessionStats;
  bars: Bar[];
  spreads: SpreadPoint[];
}> {
  const session = requireSession(date);
  const [trades, quotes] = await Promise.all([
    loadSessionTrades(date),
    loadSessionQuotes(date),
  ]);
  const stats = computeSessionStats(date, session.frontMonth, trades, quotes);
  const bars = resampleTradesToBars(trades, resolutionSec, date);
  const spreads = sampleSpreadSeries(quotes, Math.max(resolutionSec, 5));
  return { session, stats, bars, spreads };
}

export async function getTapeWindow(
  date: string,
  startSec: number,
  endSec: number,
  limit = 500,
): Promise<{ trades: TradeTick[]; quotes: QuoteTick[] }> {
  const NS = 1e9;
  const startNs = startSec * NS;
  const endNs = endSec * NS;
  const [tradesAll, quotesAll] = await Promise.all([
    loadSessionTrades(date),
    loadSessionQuotes(date),
  ]);
  const trades = tradesAll
    .filter((t) => t.timestamp >= startNs && t.timestamp < endNs)
    .slice(0, limit);
  const quotes = quotesAll
    .filter((q) => q.timestamp >= startNs && q.timestamp < endNs)
    .slice(0, limit);
  return { trades, quotes };
}
