"use client";

import type { Trade } from "@/lib/types";

const usd = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const fmtTime = (t: number) =>
  new Date(t * 1000).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export default function TradeTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return <p className="text-sm text-muted">No trades were generated for these settings.</p>;
  }
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Entry (CT)</th>
            <th className="px-3 py-2">Entry px</th>
            <th className="px-3 py-2">Exit (CT)</th>
            <th className="px-3 py-2">Exit px</th>
            <th className="px-3 py-2">Bars</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2 text-right">Net P&L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={i} className="border-t border-border odd:bg-surface even:bg-surface/40">
              <td className="px-3 py-1.5 text-muted">{i + 1}</td>
              <td className="px-3 py-1.5">
                <span
                  className={
                    t.side === "long"
                      ? "rounded bg-positive/15 px-1.5 py-0.5 text-xs font-medium text-positive"
                      : "rounded bg-negative/15 px-1.5 py-0.5 text-xs font-medium text-negative"
                  }
                >
                  {t.side}
                </span>
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">{fmtTime(t.entryTime)}</td>
              <td className="px-3 py-1.5">{t.entryPrice.toFixed(2)}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{fmtTime(t.exitTime)}</td>
              <td className="px-3 py-1.5">{t.exitPrice.toFixed(2)}</td>
              <td className="px-3 py-1.5 text-muted">{t.barsHeld}</td>
              <td className="px-3 py-1.5 text-muted">{t.reason}</td>
              <td
                className={`px-3 py-1.5 text-right font-medium ${
                  t.netPnl >= 0 ? "text-positive" : "text-negative"
                }`}
              >
                {usd(t.netPnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
