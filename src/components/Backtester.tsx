"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ConfigPanel from "./ConfigPanel";
import MetricsGrid from "./MetricsGrid";
import TradeTable from "./TradeTable";
import type { BacktestRequest, BacktestResult } from "@/lib/types";

// Charts touch the DOM, so load them client-side only. Reserve their height
// while the chunk loads to avoid a layout reflow when results first appear.
const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-lg bg-surface-2" />,
});
const EquityChart = dynamic(() => import("./EquityChart"), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-surface-2" />,
});

export default function Backtester() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (req: BacktestRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Backtest failed");
      setResult(data as BacktestResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="rounded-2xl border border-border bg-surface p-5">
        <ConfigPanel onRun={run} loading={loading} />
      </aside>

      <section className="space-y-6">
        {error && (
          <div className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 text-center">
            <div className="max-w-sm px-6">
              <h2 className="text-lg font-semibold">Configure a backtest</h2>
              <p className="mt-2 text-sm text-muted">
                Pick a futures contract, choose a preset strategy and its parameters, then run a
                backtest on 1-minute historical data.
              </p>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {result.request.ticker} · {result.spec.name}
                </h2>
                <p className="text-sm text-muted">
                  {result.rangeStart} → {result.rangeEnd} · {result.barCount.toLocaleString()} bars ·
                  multiplier ${result.spec.multiplier} · tick {result.spec.tickSize} ($
                  {result.spec.tickValue})
                </p>
              </div>
            </div>

            <MetricsGrid m={result.metrics} />

            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">Price & trades</h3>
              <PriceChart bars={result.bars} trades={result.trades} />
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">Equity curve</h3>
              <EquityChart equityCurve={result.equityCurve} />
            </div>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold">
                Trade log ({result.trades.length})
              </h3>
              <TradeTable trades={result.trades} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
