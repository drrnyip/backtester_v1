import type { Bar } from "../types";
import type { QuoteTick, SessionStats, SpreadPoint, TradeTick } from "./types";

const NS = 1e9;

export function nsToSec(ns: number): number {
  return Math.floor(ns / NS);
}

/** Build OHLCV bars from trades. `resolutionSec` is bar width in seconds. */
export function resampleTradesToBars(
  trades: TradeTick[],
  resolutionSec: number,
  sessionDate: string,
): Bar[] {
  if (trades.length === 0 || resolutionSec <= 0) return [];
  const bars: Bar[] = [];
  let bucket = -1;
  let cur: Bar | null = null;

  for (const t of trades) {
    if (t.correction !== 0) continue;
    const sec = nsToSec(t.timestamp);
    const b = Math.floor(sec / resolutionSec) * resolutionSec;
    if (b !== bucket || !cur) {
      if (cur) bars.push(cur);
      bucket = b;
      cur = {
        time: b,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: t.size,
        sessionDate,
      };
    } else {
      cur.high = Math.max(cur.high, t.price);
      cur.low = Math.min(cur.low, t.price);
      cur.close = t.price;
      cur.volume += t.size;
    }
  }
  if (cur) bars.push(cur);
  return bars;
}

/** Sample mid/spread from quotes for charting (at most one point per `resolutionSec`). */
export function sampleSpreadSeries(
  quotes: QuoteTick[],
  resolutionSec: number,
): SpreadPoint[] {
  if (quotes.length === 0 || resolutionSec <= 0) return [];
  const out: SpreadPoint[] = [];
  let bucket = -1;
  let bid: number | null = null;
  let ask: number | null = null;

  for (const q of quotes) {
    if (q.bidPrice != null && q.bidSize > 0) bid = q.bidPrice;
    if (q.askPrice != null && q.askSize > 0) ask = q.askPrice;
    if (bid == null || ask == null || ask < bid) continue;
    const sec = nsToSec(q.timestamp);
    const b = Math.floor(sec / resolutionSec) * resolutionSec;
    if (b === bucket && out.length) continue;
    bucket = b;
    out.push({
      time: b,
      bid,
      ask,
      mid: (bid + ask) / 2,
      spread: ask - bid,
    });
  }
  return out;
}

export function computeSessionStats(
  date: string,
  ticker: string,
  trades: TradeTick[],
  quotes: QuoteTick[],
): SessionStats {
  let volume = 0;
  let notional = 0;
  let high: number | null = null;
  let low: number | null = null;
  let open: number | null = null;
  let close: number | null = null;
  let tradeCount = 0;

  for (const t of trades) {
    if (t.ticker !== ticker || t.correction !== 0) continue;
    tradeCount++;
    volume += t.size;
    notional += t.price * t.size;
    if (open === null) open = t.price;
    close = t.price;
    high = high === null ? t.price : Math.max(high, t.price);
    low = low === null ? t.price : Math.min(low, t.price);
  }

  const spreads: number[] = [];
  let bid: number | null = null;
  let ask: number | null = null;
  let quoteCount = 0;
  for (const q of quotes) {
    if (q.ticker !== ticker) continue;
    quoteCount++;
    if (q.bidPrice != null && q.bidSize > 0) bid = q.bidPrice;
    if (q.askPrice != null && q.askSize > 0) ask = q.askPrice;
    if (bid != null && ask != null && ask >= bid) spreads.push(ask - bid);
  }
  spreads.sort((a, b) => a - b);
  const avgSpread =
    spreads.length > 0 ? spreads.reduce((s, x) => s + x, 0) / spreads.length : null;
  const medianSpread =
    spreads.length > 0 ? spreads[Math.floor(spreads.length / 2)] : null;

  return {
    date,
    ticker,
    tradeCount,
    quoteCount,
    volume,
    vwap: volume > 0 ? notional / volume : null,
    high,
    low,
    open,
    close,
    avgSpread,
    medianSpread,
  };
}

export function filterTicker<T extends { ticker: string }>(rows: T[], ticker: string): T[] {
  return rows.filter((r) => r.ticker === ticker);
}

/** Pick front-month as the ES outright with the highest trade count. */
export function pickFrontMonth(trades: TradeTick[]): string | null {
  const counts = new Map<string, number>();
  for (const t of trades) {
    if (t.correction !== 0) continue;
    counts.set(t.ticker, (counts.get(t.ticker) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = -1;
  for (const [ticker, n] of counts) {
    if (n > bestN) {
      best = ticker;
      bestN = n;
    }
  }
  return best;
}
