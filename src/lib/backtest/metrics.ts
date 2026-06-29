import type { BacktestMetrics, EquityPoint, Trade } from "../types";

export function computeMetrics(
  trades: Trade[],
  equityCurve: EquityPoint[],
  sessionEndEquity: number[],
  startingCapital: number,
): BacktestMetrics {
  const netPnl = trades.reduce((s, t) => s + t.netPnl, 0);
  const totalCommission = trades.reduce((s, t) => s + t.commission, 0);

  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let largestWin = 0;
  let largestLoss = 0;
  for (const t of trades) {
    if (t.netPnl >= 0) {
      grossProfit += t.netPnl;
      wins++;
      largestWin = Math.max(largestWin, t.netPnl);
    } else {
      grossLoss += -t.netPnl;
      losses++;
      largestLoss = Math.min(largestLoss, t.netPnl);
    }
  }

  const totalTrades = trades.length;
  const winRatePct = totalTrades ? (wins / totalTrades) * 100 : 0;
  const avgTrade = totalTrades ? netPnl / totalTrades : 0;
  const avgWin = wins ? grossProfit / wins : 0;
  const avgLoss = losses ? -grossLoss / losses : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  // Max drawdown from the mark-to-market equity curve.
  let peak = equityCurve.length ? equityCurve[0].equity : startingCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  // Sharpe ratio from session-to-session returns, annualised (~252 sessions/yr).
  let sharpe: number | null = null;
  if (sessionEndEquity.length >= 2) {
    const returns: number[] = [];
    for (let i = 1; i < sessionEndEquity.length; i++) {
      const prev = sessionEndEquity[i - 1];
      if (prev > 0) returns.push((sessionEndEquity[i] - prev) / prev);
    }
    if (returns.length >= 2) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance =
        returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
      const sd = Math.sqrt(variance);
      sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : null;
    }
  }

  const finalEquity = equityCurve.length
    ? equityCurve[equityCurve.length - 1].equity
    : startingCapital;
  const returnPct = startingCapital > 0 ? (netPnl / startingCapital) * 100 : 0;

  return {
    netPnl,
    returnPct,
    grossProfit,
    grossLoss,
    profitFactor,
    totalTrades,
    wins,
    losses,
    winRatePct,
    avgTrade,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss,
    maxDrawdown,
    maxDrawdownPct,
    sharpe,
    totalCommission,
    finalEquity,
  };
}
