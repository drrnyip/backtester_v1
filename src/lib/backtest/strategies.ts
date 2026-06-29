import type { Bar, StrategyDef } from "../types";
import { sma, rsi, bollinger } from "./indicators";

// Each strategy turns bar history into a target position series in {-1, 0, +1}.
// Signals only use information available up to and including bar i (no lookahead);
// the engine executes the position change on the following bar.

export const STRATEGIES: StrategyDef[] = [
  {
    id: "sma_crossover",
    name: "SMA Crossover",
    description:
      "Go long when the fast SMA is above the slow SMA; optionally go short when it is below.",
    params: [
      { key: "fastPeriod", label: "Fast SMA period", type: "number", default: 9, min: 1, max: 200, step: 1 },
      { key: "slowPeriod", label: "Slow SMA period", type: "number", default: 21, min: 2, max: 400, step: 1 },
      { key: "allowShort", label: "Allow short", type: "boolean", default: true },
    ],
  },
  {
    id: "rsi_reversion",
    name: "RSI Mean Reversion",
    description:
      "Buy when RSI is oversold and exit when it reverts to the midline; optional symmetric shorts.",
    params: [
      { key: "rsiPeriod", label: "RSI period", type: "number", default: 14, min: 2, max: 100, step: 1 },
      { key: "oversold", label: "Oversold level", type: "number", default: 30, min: 1, max: 49, step: 1 },
      { key: "overbought", label: "Overbought level", type: "number", default: 70, min: 51, max: 99, step: 1 },
      { key: "exitLevel", label: "Exit (midline)", type: "number", default: 50, min: 10, max: 90, step: 1 },
      { key: "allowShort", label: "Allow short", type: "boolean", default: true },
    ],
  },
  {
    id: "opening_range_breakout",
    name: "Opening Range Breakout",
    description:
      "Define the opening range over the first N minutes of each session, then trade breakouts of that range.",
    params: [
      { key: "openingRangeMinutes", label: "Opening range (minutes)", type: "number", default: 30, min: 1, max: 240, step: 1 },
      { key: "allowShort", label: "Allow short", type: "boolean", default: true },
    ],
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    description:
      "Mean-reversion or breakout trades using Bollinger Bands; positions exit on a return to the middle band.",
    params: [
      { key: "period", label: "Period", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { key: "mult", label: "Std-dev multiplier", type: "number", default: 2, min: 0.5, max: 4, step: 0.1 },
      {
        key: "mode",
        label: "Mode",
        type: "select",
        default: "reversion",
        options: [
          { label: "Mean reversion", value: "reversion" },
          { label: "Breakout", value: "breakout" },
        ],
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
function str(params: Params, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}

export function computeSignals(strategyId: string, bars: Bar[], params: Params): number[] {
  switch (strategyId) {
    case "sma_crossover":
      return smaCrossover(bars, params);
    case "rsi_reversion":
      return rsiReversion(bars, params);
    case "opening_range_breakout":
      return openingRangeBreakout(bars, params);
    case "bollinger":
      return bollingerSignals(bars, params);
    default:
      throw new Error(`Unknown strategy: ${strategyId}`);
  }
}

function smaCrossover(bars: Bar[], params: Params): number[] {
  const fastP = Math.round(num(params, "fastPeriod", 9));
  const slowP = Math.round(num(params, "slowPeriod", 21));
  const allowShort = bool(params, "allowShort", true);
  const closes = bars.map((b) => b.close);
  const fast = sma(closes, fastP);
  const slow = sma(closes, slowP);
  return bars.map((_, i) => {
    if (Number.isNaN(fast[i]) || Number.isNaN(slow[i])) return 0;
    if (fast[i] > slow[i]) return 1;
    if (fast[i] < slow[i]) return allowShort ? -1 : 0;
    return 0;
  });
}

function rsiReversion(bars: Bar[], params: Params): number[] {
  const period = Math.round(num(params, "rsiPeriod", 14));
  const oversold = num(params, "oversold", 30);
  const overbought = num(params, "overbought", 70);
  const exitLevel = num(params, "exitLevel", 50);
  const allowShort = bool(params, "allowShort", true);
  const r = rsi(bars.map((b) => b.close), period);
  const out = new Array<number>(bars.length).fill(0);
  let pos = 0;
  for (let i = 0; i < bars.length; i++) {
    const v = r[i];
    if (!Number.isNaN(v)) {
      if (pos === 0) {
        if (v < oversold) pos = 1;
        else if (allowShort && v > overbought) pos = -1;
      } else if (pos === 1 && v >= exitLevel) {
        pos = 0;
      } else if (pos === -1 && v <= exitLevel) {
        pos = 0;
      }
    }
    out[i] = pos;
  }
  return out;
}

function openingRangeBreakout(bars: Bar[], params: Params): number[] {
  const minutes = Math.round(num(params, "openingRangeMinutes", 30));
  const allowShort = bool(params, "allowShort", true);
  const out = new Array<number>(bars.length).fill(0);

  let i = 0;
  while (i < bars.length) {
    const session = bars[i].sessionDate;
    let j = i;
    while (j < bars.length && bars[j].sessionDate === session) j++;
    // Session spans [i, j).
    const rangeEndTime = bars[i].time + minutes * 60;
    let hi = -Infinity;
    let lo = Infinity;
    let rangeReady = false;
    let pos = 0;
    for (let k = i; k < j; k++) {
      if (bars[k].time < rangeEndTime) {
        hi = Math.max(hi, bars[k].high);
        lo = Math.min(lo, bars[k].low);
        out[k] = 0;
        continue;
      }
      if (!rangeReady) rangeReady = true;
      if (rangeReady && pos === 0) {
        if (bars[k].close > hi) pos = 1;
        else if (allowShort && bars[k].close < lo) pos = -1;
      }
      out[k] = pos;
    }
    i = j;
  }
  return out;
}

function bollingerSignals(bars: Bar[], params: Params): number[] {
  const period = Math.round(num(params, "period", 20));
  const mult = num(params, "mult", 2);
  const mode = str(params, "mode", "reversion");
  const allowShort = bool(params, "allowShort", true);
  const closes = bars.map((b) => b.close);
  const { middle, upper, lower } = bollinger(closes, period, mult);
  const out = new Array<number>(bars.length).fill(0);
  let pos = 0;
  for (let i = 0; i < bars.length; i++) {
    const c = closes[i];
    const mid = middle[i];
    const up = upper[i];
    const lo = lower[i];
    if (!Number.isNaN(mid)) {
      if (mode === "reversion") {
        if (pos === 0) {
          if (c < lo) pos = 1;
          else if (allowShort && c > up) pos = -1;
        } else if (pos === 1 && c >= mid) pos = 0;
        else if (pos === -1 && c <= mid) pos = 0;
      } else {
        // breakout
        if (pos === 0) {
          if (c > up) pos = 1;
          else if (allowShort && c < lo) pos = -1;
        } else if (pos === 1 && c < mid) pos = 0;
        else if (pos === -1 && c > mid) pos = 0;
      }
    }
    out[i] = pos;
  }
  return out;
}
