import type { QuoteState, QuoteTick, TradeTick } from "../data/types";
import type { StrategyDef } from "../types";
import { nsToSec } from "../data/resample";

export const STRATEGIES: StrategyDef[] = [
  {
    id: "opening_range_breakout",
    name: "Opening Range Breakout",
    description:
      "Build an opening range from the first N minutes of trades, then go long/short on breakouts of that range.",
    params: [
      {
        key: "openingRangeMinutes",
        label: "Opening range (minutes)",
        type: "number",
        default: 30,
        min: 1,
        max: 120,
        step: 1,
      },
      { key: "allowShort", label: "Allow short", type: "boolean", default: true },
    ],
  },
  {
    id: "spread_fade",
    name: "Spread Widen Fade",
    description:
      "When the bid/ask spread widens beyond a threshold (in ticks), fade the next tightening move with a mean-reversion exit.",
    params: [
      {
        key: "widenTicks",
        label: "Widen threshold (ticks)",
        type: "number",
        default: 3,
        min: 2,
        max: 20,
        step: 1,
      },
      {
        key: "holdSeconds",
        label: "Max hold (seconds)",
        type: "number",
        default: 60,
        min: 5,
        max: 600,
        step: 5,
      },
      { key: "allowShort", label: "Allow short", type: "boolean", default: true },
    ],
  },
  {
    id: "trade_imbalance",
    name: "Trade Imbalance",
    description:
      "Track consecutive upticks vs downticks on the tape; enter when imbalance exceeds a streak threshold.",
    params: [
      {
        key: "streak",
        label: "Streak length",
        type: "number",
        default: 5,
        min: 2,
        max: 30,
        step: 1,
      },
      {
        key: "exitStreak",
        label: "Exit streak",
        type: "number",
        default: 3,
        min: 1,
        max: 20,
        step: 1,
      },
      { key: "allowShort", label: "Allow short", type: "boolean", default: true },
    ],
  },
];

export function getStrategy(id: string): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

type Params = Record<string, number | boolean | string>;

function num(params: Params, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function bool(params: Params, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === "boolean" ? v : fallback;
}

export interface StrategyContext {
  trade: TradeTick;
  index: number;
  quote: QuoteState;
  tickSize: number;
}

/**
 * Strategies produce a target position in {-1, 0, +1} for each trade event.
 * They may only use information available up to and including the current trade
 * (and the as-of quote state already joined for that timestamp).
 */
export type SignalFn = (ctx: StrategyContext) => number;

export function createSignalFn(
  strategyId: string,
  trades: TradeTick[],
  params: Params,
  tickSize: number,
): SignalFn {
  switch (strategyId) {
    case "opening_range_breakout":
      return openingRangeBreakout(trades, params);
    case "spread_fade":
      return spreadFade(params, tickSize);
    case "trade_imbalance":
      return tradeImbalance(params);
    default:
      throw new Error(`Unknown strategy: ${strategyId}`);
  }
}

function openingRangeBreakout(trades: TradeTick[], params: Params): SignalFn {
  const minutes = Math.round(num(params, "openingRangeMinutes", 30));
  const allowShort = bool(params, "allowShort", true);
  if (trades.length === 0) return () => 0;

  const sessionStartSec = nsToSec(trades[0].timestamp);
  const rangeEndSec = sessionStartSec + minutes * 60;
  let hi = -Infinity;
  let lo = Infinity;
  let rangeReady = false;
  let pos = 0;

  return ({ trade }) => {
    const sec = nsToSec(trade.timestamp);
    if (sec < rangeEndSec) {
      hi = Math.max(hi, trade.price);
      lo = Math.min(lo, trade.price);
      pos = 0;
      return 0;
    }
    if (!rangeReady) rangeReady = Number.isFinite(hi) && Number.isFinite(lo);
    if (rangeReady && pos === 0) {
      if (trade.price > hi) pos = 1;
      else if (allowShort && trade.price < lo) pos = -1;
    }
    return pos;
  };
}

function spreadFade(params: Params, tickSize: number): SignalFn {
  const widenTicks = Math.round(num(params, "widenTicks", 3));
  const holdSeconds = Math.round(num(params, "holdSeconds", 60));
  const allowShort = bool(params, "allowShort", true);
  const widen = widenTicks * tickSize;
  let pos = 0;
  let entrySec = 0;
  let entryMid: number | null = null;

  return ({ trade, quote }) => {
    const sec = nsToSec(trade.timestamp);
    const spread = quote.spread;
    const mid = quote.mid;

    if (pos !== 0) {
      if (sec - entrySec >= holdSeconds) {
        pos = 0;
        entryMid = null;
        return 0;
      }
      if (mid != null && entryMid != null) {
        // Exit when price reverts toward entry mid.
        if (pos === 1 && mid >= entryMid) {
          pos = 0;
          entryMid = null;
        } else if (pos === -1 && mid <= entryMid) {
          pos = 0;
          entryMid = null;
        }
      }
      // Also exit when spread tightens back to 1 tick.
      if (spread != null && spread <= tickSize * 1.01) {
        pos = 0;
        entryMid = null;
      }
      return pos;
    }

    if (spread == null || mid == null || spread < widen) return 0;

    // Fade: if last trade is at/above ask while wide, short; at/below bid, long.
    if (quote.ask != null && trade.price >= quote.ask) {
      if (allowShort) {
        pos = -1;
        entrySec = sec;
        entryMid = mid;
      }
    } else if (quote.bid != null && trade.price <= quote.bid) {
      pos = 1;
      entrySec = sec;
      entryMid = mid;
    }
    return pos;
  };
}

function tradeImbalance(params: Params): SignalFn {
  const streakNeed = Math.round(num(params, "streak", 5));
  const exitStreak = Math.round(num(params, "exitStreak", 3));
  const allowShort = bool(params, "allowShort", true);
  let up = 0;
  let down = 0;
  let lastPrice: number | null = null;
  let pos = 0;

  return ({ trade }) => {
    if (lastPrice != null) {
      if (trade.price > lastPrice) {
        up++;
        down = 0;
      } else if (trade.price < lastPrice) {
        down++;
        up = 0;
      }
    }
    lastPrice = trade.price;

    if (pos === 0) {
      if (up >= streakNeed) pos = 1;
      else if (allowShort && down >= streakNeed) pos = -1;
    } else if (pos === 1 && down >= exitStreak) {
      pos = 0;
    } else if (pos === -1 && up >= exitStreak) {
      pos = 0;
    }
    return pos;
  };
}

/** Advance quote state with a quote tick (partial BBO updates allowed). */
export function applyQuote(state: QuoteState, q: QuoteTick): QuoteState {
  const bid = q.bidPrice != null && q.bidSize > 0 ? q.bidPrice : state.bid;
  const ask = q.askPrice != null && q.askSize > 0 ? q.askPrice : state.ask;
  const bidSize = q.bidPrice != null && q.bidSize > 0 ? q.bidSize : state.bidSize;
  const askSize = q.askPrice != null && q.askSize > 0 ? q.askSize : state.askSize;
  const ok = bid != null && ask != null && ask >= bid;
  return {
    bid,
    ask,
    bidSize,
    askSize,
    spread: ok ? ask! - bid! : null,
    mid: ok ? (ask! + bid!) / 2 : null,
    timestamp: q.timestamp,
  };
}

export function emptyQuoteState(): QuoteState {
  return {
    bid: null,
    ask: null,
    bidSize: 0,
    askSize: 0,
    spread: null,
    mid: null,
    timestamp: 0,
  };
}
