"use client";

import type { BacktestMetrics } from "@/lib/types";

const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;

function Card({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "pos" | "neg";
  sub?: string;
}) {
  const color =
    tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function MetricsGrid({ m }: { m: BacktestMetrics }) {
  const pnlTone = m.netPnl >= 0 ? "pos" : "neg";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Card label="Net P&L" value={usd(m.netPnl)} tone={pnlTone} sub={pct(m.returnPct)} />
      <Card label="Final Equity" value={usd(m.finalEquity)} />
      <Card
        label="Max Drawdown"
        value={usd(-m.maxDrawdown)}
        tone={m.maxDrawdown > 0 ? "neg" : "neutral"}
        sub={pct(m.maxDrawdownPct)}
      />
      <Card
        label="Profit Factor"
        value={m.profitFactor === null ? "∞" : m.profitFactor.toFixed(2)}
      />
      <Card label="Total Trades" value={String(m.totalTrades)} sub={`${m.wins}W / ${m.losses}L`} />
      <Card
        label="Win Rate"
        value={pct(m.winRatePct)}
        tone={m.winRatePct >= 50 ? "pos" : "neutral"}
      />
      <Card label="Avg Trade" value={usd(m.avgTrade)} tone={m.avgTrade >= 0 ? "pos" : "neg"} />
      <Card label="Sharpe (ann.)" value={m.sharpe === null ? "—" : m.sharpe.toFixed(2)} />
      <Card label="Avg Win" value={usd(m.avgWin)} tone="pos" />
      <Card label="Avg Loss" value={usd(m.avgLoss)} tone="neg" />
      <Card label="Largest Win" value={usd(m.largestWin)} tone="pos" />
      <Card label="Largest Loss" value={usd(m.largestLoss)} tone="neg" />
      <Card label="Gross Profit" value={usd(m.grossProfit)} tone="pos" />
      <Card label="Gross Loss" value={usd(-m.grossLoss)} tone="neg" />
      <Card label="Commissions" value={usd(-m.totalCommission)} />
    </div>
  );
}
