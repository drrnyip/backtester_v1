"use client";

import { useEffect, useState } from "react";
import { PRODUCTS } from "@/lib/products";
import { STRATEGIES } from "@/lib/backtest/strategies";
import type { BacktestRequest, ContractInfo, OrderType } from "@/lib/types";

type ParamValue = number | boolean | string;

const FIELD =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const LABEL = "block text-xs font-medium text-muted mb-1";

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Default to a ~2 week window ending at the contract's last trade date (clamped to today).
function defaultWindow(c: ContractInfo): { from: string; to: string } {
  const today = new Date();
  const last = c.lastTradeDate ? new Date(`${c.lastTradeDate}T00:00:00Z`) : today;
  const ref = last.getTime() < today.getTime() ? last : today;
  const start = new Date(ref);
  start.setUTCDate(start.getUTCDate() - 14);
  return { from: toInputDate(start), to: toInputDate(ref) };
}

export default function ConfigPanel({
  onRun,
  loading,
}: {
  onRun: (req: BacktestRequest) => void;
  loading: boolean;
}) {
  const [productCode, setProductCode] = useState("ES");
  const [contracts, setContracts] = useState<ContractInfo[]>([]);
  const [contractsError, setContractsError] = useState<string | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [ticker, setTicker] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id);
  const [params, setParams] = useState<Record<string, ParamValue>>(() =>
    Object.fromEntries(STRATEGIES[0].params.map((p) => [p.key, p.default])),
  );

  const [numContracts, setNumContracts] = useState(1);
  const [entryOrderType, setEntryOrderType] = useState<OrderType>("market");
  const [entryOffsetTicks, setEntryOffsetTicks] = useState(4);
  const [slippageTicks, setSlippageTicks] = useState(1);
  const [commission, setCommission] = useState(2.5);
  const [stopLossTicks, setStopLossTicks] = useState(0);
  const [takeProfitTicks, setTakeProfitTicks] = useState(0);
  const [flatten, setFlatten] = useState(true);
  const [capital, setCapital] = useState(100000);

  const strategy = STRATEGIES.find((s) => s.id === strategyId)!;

  const changeStrategy = (id: string) => {
    const next = STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[0];
    setStrategyId(id);
    setParams(Object.fromEntries(next.params.map((p) => [p.key, p.default])));
  };

  // Load contracts whenever the product changes.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flags for data fetch
    setContractsLoading(true);
    setContractsError(null);
    fetch(`/api/contracts?product=${productCode}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load contracts");
        return data.contracts as ContractInfo[];
      })
      .then((list) => {
        if (cancelled) return;
        setContracts(list);
        if (list.length) {
          const c = list[0];
          const w = defaultWindow(c);
          setTicker(c.ticker);
          setFromDate(w.from);
          setToDate(w.to);
        }
      })
      .catch((e) => {
        if (!cancelled) setContractsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setContractsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productCode]);

  const selectContract = (c: ContractInfo) => {
    const w = defaultWindow(c);
    setTicker(c.ticker);
    setFromDate(w.from);
    setToDate(w.to);
  };

  const setParam = (key: string, value: ParamValue) =>
    setParams((p) => ({ ...p, [key]: value }));

  const submit = () => {
    if (!ticker) return;
    onRun({
      ticker,
      productCode,
      fromDate,
      toDate,
      strategyId,
      strategyParams: params,
      contracts: numContracts,
      entryOrderType,
      entryOffsetTicks,
      slippageTicks,
      commissionPerContract: commission,
      stopLossTicks,
      takeProfitTicks,
      flattenAtSessionEnd: flatten,
      startingCapital: capital,
    });
  };

  return (
    <div className="space-y-5">
      <Section title="Instrument">
        <div>
          <label className={LABEL}>Product</label>
          <select className={FIELD} value={productCode} onChange={(e) => setProductCode(e.target.value)}>
            {PRODUCTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Contract</label>
          <select
            className={FIELD}
            value={ticker}
            disabled={contractsLoading || !!contractsError}
            onChange={(e) => {
              const c = contracts.find((x) => x.ticker === e.target.value);
              if (c) selectContract(c);
            }}
          >
            {contractsLoading && <option>Loading…</option>}
            {contracts.map((c) => (
              <option key={c.ticker} value={c.ticker}>
                {c.ticker}
                {c.settlementDate ? ` · settles ${c.settlementDate}` : ""}
              </option>
            ))}
          </select>
          {contractsError && <p className="mt-1 text-xs text-negative">{contractsError}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>From</label>
            <input type="date" className={FIELD} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>To</label>
            <input type="date" className={FIELD} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted">1-minute bars · max 45-day range.</p>
      </Section>

      <Section title="Strategy">
        <div>
          <label className={LABEL}>Preset</label>
          <select className={FIELD} value={strategyId} onChange={(e) => changeStrategy(e.target.value)}>
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
              {p.type === "select" && (
                <select
                  className={FIELD}
                  value={String(params[p.key])}
                  onChange={(e) => setParam(p.key, e.target.value)}
                >
                  {p.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Execution & Costs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Contracts</label>
            <input type="number" min={1} className={FIELD} value={numContracts} onChange={(e) => setNumContracts(Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>Entry order</label>
            <select className={FIELD} value={entryOrderType} onChange={(e) => setEntryOrderType(e.target.value as OrderType)}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
            </select>
          </div>
          {entryOrderType !== "market" && (
            <div>
              <label className={LABEL}>Entry offset (ticks)</label>
              <input type="number" min={0} className={FIELD} value={entryOffsetTicks} onChange={(e) => setEntryOffsetTicks(Number(e.target.value))} />
            </div>
          )}
          <div>
            <label className={LABEL}>Slippage (ticks)</label>
            <input type="number" min={0} className={FIELD} value={slippageTicks} onChange={(e) => setSlippageTicks(Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>Commission ($/contract/side)</label>
            <input type="number" min={0} step={0.05} className={FIELD} value={commission} onChange={(e) => setCommission(Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>Stop loss (ticks, 0=off)</label>
            <input type="number" min={0} className={FIELD} value={stopLossTicks} onChange={(e) => setStopLossTicks(Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>Take profit (ticks, 0=off)</label>
            <input type="number" min={0} className={FIELD} value={takeProfitTicks} onChange={(e) => setTakeProfitTicks(Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>Starting capital ($)</label>
            <input type="number" min={1} className={FIELD} value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
          <span className="text-muted">Flatten positions at session end (intraday only)</span>
        </label>
      </Section>

      <button
        onClick={submit}
        disabled={loading || !ticker}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Running backtest…" : "Run backtest"}
      </button>
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
