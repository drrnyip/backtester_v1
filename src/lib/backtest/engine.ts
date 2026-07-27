import type {
  BacktestRequest,
  BacktestResult,
  EquityPoint,
  ProductSpec,
  Trade,
} from "../types";
import type { QuoteTick, TradeTick } from "../data/types";
import { nsToSec, resampleTradesToBars } from "../data/resample";
import {
  applyQuote,
  createSignalFn,
  emptyQuoteState,
} from "./strategies";
import { computeMetrics } from "./metrics";

interface OpenPosition {
  side: 1 | -1;
  entryPrice: number;
  entryTime: number;
  entryIndex: number;
  contracts: number;
}

/**
 * Event-driven simulator over trade ticks with as-of quote state.
 *
 * Timing (no lookahead):
 * 1. Advance quotes with timestamp <= trade.timestamp
 * 2. Evaluate strategy signal on this trade + quote
 * 3. Execute position changes on the *next* trade fill (signal from prior trade)
 * 4. Check stop / take-profit against the current trade price
 */
export function runTickBacktest(
  trades: TradeTick[],
  quotes: QuoteTick[],
  spec: ProductSpec,
  req: BacktestRequest,
  sessionDate: string,
): BacktestResult {
  const { multiplier, tickSize } = spec;
  const slip = req.slippageTicks * tickSize;
  const contracts = Math.max(1, Math.round(req.contracts));
  const commissionPerSide = req.commissionPerContract * contracts;

  const signalAt = createSignalFn(req.strategyId, trades, req.strategyParams, tickSize);

  const closed: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  let realizedPnl = 0;
  let pos: OpenPosition | null = null;
  let pendingSignal = 0;
  let quoteState = emptyQuoteState();
  let qi = 0;

  const grossPnl = (side: 1 | -1, entry: number, exit: number): number =>
    side * (exit - entry) * multiplier * contracts;

  const closePosition = (
    exitPrice: number,
    exitTime: number,
    exitIndex: number,
    reason: string,
  ) => {
    if (!pos) return;
    const gross = grossPnl(pos.side, pos.entryPrice, exitPrice);
    const commission = commissionPerSide * 2;
    const net = gross - commission;
    realizedPnl += net;
    closed.push({
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
      barsHeld: exitIndex - pos.entryIndex,
    });
    pos = null;
  };

  const fillPrice = (side: 1 | -1, trade: TradeTick): number => {
    // Prefer touching the book when available; else trade +/- slip.
    if (side === 1) {
      if (quoteState.ask != null) return quoteState.ask + slip;
      return trade.price + slip;
    }
    if (quoteState.bid != null) return quoteState.bid - slip;
    return trade.price - slip;
  };

  // Equity sampling: every N trades to keep the curve manageable.
  const sampleEvery = Math.max(1, Math.floor(trades.length / 2000));

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    if (trade.correction !== 0) continue;

    while (qi < quotes.length && quotes[qi].timestamp <= trade.timestamp) {
      quoteState = applyQuote(quoteState, quotes[qi]);
      qi++;
    }

    const sec = nsToSec(trade.timestamp);
    let exited = false;

    // Execute pending signal from previous trade on this fill.
    if (pos && pendingSignal !== pos.side) {
      const exitPx = pos.side === 1 ? trade.price - slip : trade.price + slip;
      closePosition(exitPx, sec, i, pendingSignal === 0 ? "signal exit" : "signal flip");
      exited = true;
    }

    // Stop / take-profit vs current trade.
    if (pos && (req.stopLossTicks > 0 || req.takeProfitTicks > 0)) {
      const sl = req.stopLossTicks * tickSize;
      const tp = req.takeProfitTicks * tickSize;
      if (pos.side === 1) {
        if (req.stopLossTicks > 0 && trade.price <= pos.entryPrice - sl) {
          closePosition(pos.entryPrice - sl - slip, sec, i, "stop loss");
          exited = true;
        } else if (req.takeProfitTicks > 0 && trade.price >= pos.entryPrice + tp) {
          closePosition(pos.entryPrice + tp - slip, sec, i, "take profit");
          exited = true;
        }
      } else {
        if (req.stopLossTicks > 0 && trade.price >= pos.entryPrice + sl) {
          closePosition(pos.entryPrice + sl + slip, sec, i, "stop loss");
          exited = true;
        } else if (req.takeProfitTicks > 0 && trade.price <= pos.entryPrice - tp) {
          closePosition(pos.entryPrice - tp + slip, sec, i, "take profit");
          exited = true;
        }
      }
    }

    // Enter toward pending signal if flat.
    if (!pos && !exited && pendingSignal !== 0) {
      const side: 1 | -1 = pendingSignal > 0 ? 1 : -1;
      pos = {
        side,
        entryPrice: fillPrice(side, trade),
        entryTime: sec,
        entryIndex: i,
        contracts,
      };
    }

    // New signal becomes pending for the next trade.
    pendingSignal = signalAt({
      trade,
      index: i,
      quote: quoteState,
      tickSize,
    });

    if (i % sampleEvery === 0 || i === trades.length - 1) {
      const unrealized = pos ? grossPnl(pos.side, pos.entryPrice, trade.price) : 0;
      equityCurve.push({
        time: sec,
        equity: req.startingCapital + realizedPnl + unrealized,
      });
    }
  }

  // Close any open position at end of data for clean accounting.
  if (pos && trades.length) {
    const last = trades[trades.length - 1];
    const sec = nsToSec(last.timestamp);
    const reason = req.flattenAtSessionEnd ? "session end" : "end of data";
    const exitPx = pos.side === 1 ? last.price - slip : last.price + slip;
    closePosition(exitPx, sec, trades.length - 1, reason);
    if (equityCurve.length) {
      equityCurve[equityCurve.length - 1] = {
        time: sec,
        equity: req.startingCapital + realizedPnl,
      };
    }
  }

  const sessionEndEquity = equityCurve.length
    ? [equityCurve[equityCurve.length - 1].equity]
    : [req.startingCapital];
  const metrics = computeMetrics(closed, equityCurve, sessionEndEquity, req.startingCapital);
  const bars = resampleTradesToBars(trades, 60, sessionDate);

  return {
    request: req,
    spec,
    ticker: trades[0]?.ticker ?? "",
    sessionDate,
    bars,
    trades: closed,
    equityCurve,
    metrics,
    tradeEventCount: trades.length,
    quoteEventCount: quotes.length,
  };
}
