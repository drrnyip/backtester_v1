"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { SessionInfo, SessionStats, SpreadPoint } from "@/lib/data/types";
import type { Bar } from "@/lib/types";
import type { QuoteTick, TradeTick } from "@/lib/data/types";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-lg bg-surface-2" />,
});
const SpreadChart = dynamic(() => import("./SpreadChart"), {
  ssr: false,
  loading: () => <div className="h-[220px] w-full animate-pulse rounded-lg bg-surface-2" />,
});

const FIELD =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const LABEL = "block text-xs font-medium text-muted mb-1";

export default function Explorer() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [resolution, setResolution] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [spreads, setSpreads] = useState<SpreadPoint[]>([]);
  const [tape, setTape] = useState<{ trades: TradeTick[]; quotes: QuoteTick[] } | null>(null);
  const [tapeLoading, setTapeLoading] = useState(false);

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
        setDate((prev) => prev || (list.length ? list[list.length - 1].date : ""));
      })
      .catch((e) => {
        if (!cancelled) setSessionsError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setTape(null);
      try {
        const r = await fetch(`/api/sessions/${date}?resolution=${resolution}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load session");
        if (cancelled) return;
        setSession(data.session as SessionInfo);
        setStats(data.stats as SessionStats);
        setBars(data.bars as Bar[]);
        setSpreads(data.spreads as SpreadPoint[]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load session");
          setStats(null);
          setBars([]);
          setSpreads([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, resolution]);

  const loadTape = async () => {
    if (!bars.length) return;
    const mid = bars[Math.floor(bars.length / 2)];
    const start = mid.time;
    const end = start + 60;
    setTapeLoading(true);
    try {
      const res = await fetch(
        `/api/sessions/${date}/tape?start=${start}&end=${end}&limit=200`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tape");
      setTape(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tape failed");
    } finally {
      setTapeLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4 rounded-2xl border border-border bg-surface p-5 h-fit">
        <h2 className="text-sm font-semibold">Session</h2>
        {sessionsError && <p className="text-xs text-negative">{sessionsError}</p>}
        {!sessionsError && sessions.length === 0 && (
          <p className="text-xs text-muted">
            No ingested sessions yet. Run{" "}
            <code className="text-foreground">pnpm seed-sample</code> or{" "}
            <code className="text-foreground">pnpm ingest</code>.
          </p>
        )}
        <div>
          <label className={LABEL}>Date</label>
          <select
            className={FIELD}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={!sessions.length}
          >
            {sessions.map((s) => (
              <option key={s.date} value={s.date}>
                {s.date} · {s.frontMonth}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Bar size</label>
          <select
            className={FIELD}
            value={resolution}
            onChange={(e) => setResolution(Number(e.target.value))}
          >
            <option value={1}>1 second</option>
            <option value={5}>5 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
          </select>
        </div>
        {session && (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted space-y-1">
            <div>
              Front month: <span className="text-foreground">{session.frontMonth}</span>
            </div>
            <div>
              Trades:{" "}
              <span className="text-foreground">{session.tradeCount.toLocaleString()}</span>
            </div>
            <div>
              Quotes:{" "}
              <span className="text-foreground">{session.quoteCount.toLocaleString()}</span>
            </div>
            <div>
              Volume: <span className="text-foreground">{session.volume.toLocaleString()}</span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={loadTape}
          disabled={!bars.length || tapeLoading}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {tapeLoading ? "Loading tape…" : "Sample mid-session tape (60s)"}
        </button>
      </aside>

      <section className="space-y-6">
        {error && (
          <div className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </div>
        )}
        {loading && (
          <div className="h-[420px] animate-pulse rounded-2xl bg-surface-2" />
        )}
        {!loading && stats && (
          <>
            <StatsGrid stats={stats} />
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Price ({session?.frontMonth}) · trades → {resolution}s bars
              </h3>
              <PriceChart bars={bars} trades={[]} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-2 text-sm font-semibold">Bid / ask mid & spread</h3>
              <SpreadChart spreads={spreads} />
            </div>
            {tape && <TapeTables tape={tape} />}
          </>
        )}
      </section>
    </div>
  );
}

function StatsGrid({ stats }: { stats: SessionStats }) {
  const fmt = (n: number | null, d = 2) => (n == null ? "—" : n.toFixed(d));
  const items = [
    { label: "Open", value: fmt(stats.open) },
    { label: "High", value: fmt(stats.high) },
    { label: "Low", value: fmt(stats.low) },
    { label: "Close", value: fmt(stats.close) },
    { label: "VWAP", value: fmt(stats.vwap) },
    { label: "Volume", value: stats.volume.toLocaleString() },
    { label: "Avg spread", value: fmt(stats.avgSpread, 3) },
    { label: "Med spread", value: fmt(stats.medianSpread, 3) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-border bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted">{it.label}</div>
          <div className="mt-1 text-lg font-semibold">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

function TapeTables({ tape }: { tape: { trades: TradeTick[]; quotes: QuoteTick[] } }) {
  const fmtTs = (ns: number) =>
    new Date(Math.floor(ns / 1e6)).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">Trades ({tape.trades.length})</h3>
        <div className="max-h-64 overflow-auto text-xs">
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr>
                <th className="px-2 py-1 text-left">Time CT</th>
                <th className="px-2 py-1 text-right">Px</th>
                <th className="px-2 py-1 text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {tape.trades.map((t, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1">{fmtTs(t.timestamp)}</td>
                  <td className="px-2 py-1 text-right">{t.price.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">{t.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">Quotes ({tape.quotes.length})</h3>
        <div className="max-h-64 overflow-auto text-xs">
          <table className="w-full">
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr>
                <th className="px-2 py-1 text-left">Time CT</th>
                <th className="px-2 py-1 text-right">Bid</th>
                <th className="px-2 py-1 text-right">Ask</th>
              </tr>
            </thead>
            <tbody>
              {tape.quotes.map((q, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1">{fmtTs(q.timestamp)}</td>
                  <td className="px-2 py-1 text-right">
                    {q.bidPrice?.toFixed(2) ?? "—"}×{q.bidSize}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {q.askPrice?.toFixed(2) ?? "—"}×{q.askSize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
