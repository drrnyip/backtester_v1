import type {
  Bar,
  BacktestRequest,
  BacktestResult,
  EquityPoint,
  ProductSpec,
  Trade,
} from "../types";
import { computeSignals } from "./strategies";
import { computeMetrics } from "./metrics";

interface OpenPosition {
  side: 1 | -1;
  entryPrice: number;
  entryTime: number;
  entryBar: number;
  contracts: number;
}

/**
 * Event-driven, bar-by-bar simulator.
 *
 * Timing model (no lookahead): the signal computed on bar `t-1` is the target
 * for bar `t`. Within a bar we process events in chronological order:
 *   1. open  - signal-driven exit/flip executes at the open (market)
 *   2. range - stop-loss / take-profit checked against the bar high/low
 *   3. close - session-end flatten executes at the close
 * A fresh entry happens on the same bar only when the position is flat at the
 * open; exits triggered intrabar (SL/TP/EOD) wait until the next bar to re-enter.
 */
export function runBacktest(
  bars: Bar[],
  spec: ProductSpec,
  req: BacktestRequest,
): BacktestResult {
  const signals = computeSignals(req.strategyId, bars, req.strategyParams);
  const { multiplier, tickSize } = spec;
  const slip = req.slippageTicks * tickSize;
  const contracts = Math.max(1, Math.round(req.contracts));
  const commissionPerSide = req.commissionPerContract * contracts;

  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  const sessionEndEquity: number[] = [];

  let realizedPnl = 0;
  let pos: OpenPosition | null = null;

  const grossPnl = (side: 1 | -1, entry: number, exit: number): number =>
    side * (exit - entry) * multiplier * contracts;

  const closePosition = (
    exitPrice: number,
    exitTime: number,
    exitBar: number,
    reason: string,
  ) => {
    if (!pos) return;
    const gross = grossPnl(pos.side, pos.entryPrice, exitPrice);
    const commission = commissionPerSide * 2; // entry + exit
    const net = gross - commission;
    realizedPnl += net;
    trades.push({
      side: pos.side === 1 ? "long" : "short",
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      exitTime,
      exitPrice,
      contracts,
      grossPnl: gross,
      commission,
      netPnl: net,
      reason,
      barsHeld: exitBar - pos.entryBar,
    });
    pos = null;
  };

  const isLastBarOfSession = (i: number): boolean =>
    i === bars.length - 1 || bars[i + 1].sessionDate !== bars[i].sessionDate;

  for (let t = 0; t < bars.length; t++) {
    const bar = bars[t];
    const sig = t >= 1 ? signals[t - 1] : 0;
    const prevClose = t >= 1 ? bars[t - 1].close : bar.open;
    let exitedIntrabarOrClose = false;

    // 1) Signal-driven exit / flip at the open.
    if (pos && sig !== pos.side) {
      const exitPrice = pos.side === 1 ? bar.open - slip : bar.open + slip;
      closePosition(exitPrice, bar.time, t, sig === 0 ? "signal exit" : "signal flip");
    }

    // 2) Intrabar stop-loss / take-profit.
    if (pos && (req.stopLossTicks > 0 || req.takeProfitTicks > 0)) {
      const slDist = req.stopLossTicks * tickSize;
      const tpDist = req.takeProfitTicks * tickSize;
      if (pos.side === 1) {
        const stop = pos.entryPrice - slDist;
        const target = pos.entryPrice + tpDist;
        if (req.stopLossTicks > 0 && bar.low <= stop) {
          closePosition(stop - slip, bar.time, t, "stop loss");
          exitedIntrabarOrClose = true;
        } else if (req.takeProfitTicks > 0 && bar.high >= target) {
          closePosition(target - slip, bar.time, t, "take profit");
          exitedIntrabarOrClose = true;
        }
      } else {
        const stop = pos.entryPrice + slDist;
        const target = pos.entryPrice - tpDist;
        if (req.stopLossTicks > 0 && bar.high >= stop) {
          closePosition(stop + slip, bar.time, t, "stop loss");
          exitedIntrabarOrClose = true;
        } else if (req.takeProfitTicks > 0 && bar.low <= target) {
          closePosition(target + slip, bar.time, t, "take profit");
          exitedIntrabarOrClose = true;
        }
      }
    }

    // 3) Session-end flatten at the close.
    const lastOfSession = isLastBarOfSession(t);
    if (pos && req.flattenAtSessionEnd && lastOfSession) {
      const exitPrice = pos.side === 1 ? bar.close - slip : bar.close + slip;
      closePosition(exitPrice, bar.time, t, "session end");
      exitedIntrabarOrClose = true;
    }

    // 4) Entry toward the signal (only if flat and not just stopped/flattened this bar).
    const canEnter =
      !pos && sig !== 0 && !(exitedIntrabarOrClose) &&
      !(req.flattenAtSessionEnd && lastOfSession);
    if (canEnter) {
      const side: 1 | -1 = sig > 0 ? 1 : -1;
      let fill: number | null = null;
      if (req.entryOrderType === "market") {
        fill = side === 1 ? bar.open + slip : bar.open - slip;
      } else if (req.entryOrderType === "stop") {
        // Breakout: trigger if price trades through the stop level this bar.
        const trigger: number =
          side === 1
            ? prevClose + req.entryOffsetTicks * tickSize
            : prevClose - req.entryOffsetTicks * tickSize;
        if (side === 1 && bar.high >= trigger) fill = Math.max(trigger, bar.open) + slip;
        else if (side === -1 && bar.low <= trigger) fill = Math.min(trigger, bar.open) - slip;
      } else {
        // limit: favourable fill if price retraces to the limit this bar.
        const limit: number =
          side === 1
            ? prevClose - req.entryOffsetTicks * tickSize
            : prevClose + req.entryOffsetTicks * tickSize;
        if (side === 1 && bar.low <= limit) fill = Math.min(limit, bar.open);
        else if (side === -1 && bar.high >= limit) fill = Math.max(limit, bar.open);
      }
      if (fill !== null) {
        pos = { side, entryPrice: fill, entryTime: bar.time, entryBar: t, contracts };
      }
    }

    // Mark-to-market equity at the bar close.
    const unrealized = pos ? grossPnl(pos.side, pos.entryPrice, bar.close) : 0;
    const equity = req.startingCapital + realizedPnl + unrealized;
    equityCurve.push({ time: bar.time, equity });
    if (lastOfSession) sessionEndEquity.push(equity);
  }

  // Close any dangling position at the final bar's close.
  if (pos && bars.length) {
    const last = bars[bars.length - 1];
    const exitPrice = pos.side === 1 ? last.close - slip : last.close + slip;
    closePosition(exitPrice, last.time, bars.length - 1, "end of data");
    const unrealized = 0;
    const equity = req.startingCapital + realizedPnl + unrealized;
    equityCurve[equityCurve.length - 1] = { time: last.time, equity };
    sessionEndEquity[sessionEndEquity.length - 1] = equity;
  }

  const metrics = computeMetrics(trades, equityCurve, sessionEndEquity, req.startingCapital);

  return {
    request: req,
    spec,
    bars,
    trades,
    equityCurve,
    metrics,
    barCount: bars.length,
    rangeStart: bars.length ? bars[0].sessionDate : req.fromDate,
    rangeEnd: bars.length ? bars[bars.length - 1].sessionDate : req.toDate,
  };
}
