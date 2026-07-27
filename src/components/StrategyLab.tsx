"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { STRATEGIES } from "@/lib/backtest/strategies";
import type { BacktestRequest, BacktestResult } from "@/lib/types";
import type { SessionInfo } from "@/lib/data/types";
import MetricsGrid from "./MetricsGrid";
import TradeTable from "./TradeTable";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-lg bg-surface-2" />,
});
const EquityChart = dynamic(() => import("./EquityChart"), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full animate-pulse rounded-lg bg-surface-2" />,
});

const FIELD =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const LABEL = "block text-xs font-medium text-muted mb-1";

type ParamValue = number | boolean | string;

export default function StrategyLab() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionDate, setSessionDate] = useState("");
  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id);
  const [params, setParams] = useState<Record<string, ParamValue>>(() =>
    Object.fromEntries(STRATEGIES[0].params.map((p) => [p.key, p.default])),
  );
  const [contracts, setContracts] = useState(1);
  const [slippageTicks, setSlippageTicks] = useState(1);
  const [commission, setCommission] = useState(2.5);
  const [stopLossTicks, setStopLossTicks] = useState(0);
  const [takeProfitTicks, setTakeProfitTicks] = useState(0);
  const [flatten, setFlatten] = useState(true);
  const [capital, setCapital] = useState(100000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const strategy = STRATEGIES.find((s) => s.id === strategyId)!;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load sessions");
        return data.sessions as SessionInfo[];
      })
      .then((list) => {
        if (cancelled) return;
        setSessions(list);
        if (list.length) setSessionDate(list[list.length - 1].date);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const changeStrategy = (id: string) => {
    const next = STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[0];
    setStrategyId(id);
    setParams(Object.fromEntries(next.params.map((p) => [p.key, p.default])));
  };

  const setParam = (key: string, value: ParamValue) =>
    setParams((p) => ({ ...p, [key]: value }));

  const run = async () => {
    if (!sessionDate) return;
    setLoading(true);
    setError(null);
    const req: BacktestRequest = {
      sessionDate,
      strategyId,
      strategyParams: params,
      contracts,
      slippageTicks,
      commissionPerContract: commission,
      stopLossTicks,
      takeProfitTicks,
      flattenAtSessionEnd: flatten,
      startingCapital: capital,
    };
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
      <aside className="space-y-5 rounded-2xl border border-border bg-surface p-5 h-fit">
        <Section title="ES session">
          <div>
            <label className={LABEL}>Session date</label>
            <select
              className={FIELD}
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              disabled={!sessions.length}
            >
              {sessions.map((s) => (
                <option key={s.date} value={s.date}>
                  {s.date} · {s.frontMonth}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Tick engine over front-month trades with as-of quotes.
            </p>
          </div>
        </Section>

        <Section title="Strategy">
          <div>
            <label className={LABEL}>Preset</label>
            <select
              className={FIELD}
              value={strategyId}
              onChange={(e) => changeStrategy(e.target.value)}
            >
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{strategy.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {strategy.params.map((p) => (
              <div key={p.key} className={p.type === "boolean" ? "col-span-2" : ""}>
                <label className={LABEL}>{p.label}</label>
                {p.type === "number" && (
                  <input
                    type="number"
                    className={FIELD}
                    value={Number(params[p.key])}
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    onChange={(e) => setParam(p.key, Number(e.target.value))}
                  />
                )}
                {p.type === "boolean" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(params[p.key])}
                      onChange={(e) => setParam(p.key, e.target.checked)}
                    />
                    <span className="text-muted">Enabled</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Execution & costs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Contracts</label>
              <input
                type="number"
                min={1}
                className={FIELD}
                value={contracts}
                onChange={(e) => setContracts(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>Slippage (ticks)</label>
              <input
                type="number"
                min={0}
                className={FIELD}
                value={slippageTicks}
                onChange={(e) => setSlippageTicks(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>Commission ($/side)</label>
              <input
                type="number"
                min={0}
                step={0.05}
                className={FIELD}
                value={commission}
                onChange={(e) => setCommission(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>Capital ($)</label>
              <input
                type="number"
                min={1}
                className={FIELD}
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>Stop loss (ticks)</label>
              <input
                type="number"
                min={0}
                className={FIELD}
                value={stopLossTicks}
                onChange={(e) => setStopLossTicks(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>Take profit (ticks)</label>
              <input
                type="number"
                min={0}
                className={FIELD}
                value={takeProfitTicks}
                onChange={(e) => setTakeProfitTicks(Number(e.target.value))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={flatten}
              onChange={(e) => setFlatten(e.target.checked)}
            />
            <span className="text-muted">Flatten at session end</span>
          </label>
        </Section>

        <button
          type="button"
          onClick={run}
          disabled={loading || !sessionDate}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Running…" : "Run backtest"}
        </button>
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
              <h2 className="text-lg font-semibold">Run an ES tick backtest</h2>
              <p className="mt-2 text-sm text-muted">
                Strategies use front-month trades and as-of bid/ask from ingested flat files.
              </p>
            </div>
          </div>
        )}
        {result && (
          <>
            <div>
              <h2 className="text-lg font-semibold">
                {result.ticker} · {result.sessionDate}
              </h2>
              <p className="text-sm text-muted">
                {result.tradeEventCount.toLocaleString()} trades ·{" "}
                {result.quoteEventCount.toLocaleString()} quotes · tick {result.spec.tickSize} ($
                {result.spec.tickValue})
              </p>
            </div>
            <MetricsGrid m={result.metrics} />
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">Price & trades (1m bars)</h3>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}
