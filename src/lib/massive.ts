import "server-only";
import type { Bar, ContractInfo } from "./types";

const BASE_URL = "https://api.massive.com";
const MAX_PAGES = 30;
const PAGE_LIMIT = 50000;

function apiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) {
    throw new Error(
      "MASSIVE_API_KEY is not configured. Set it in .env.local (dev) or App Hosting secrets (prod).",
    );
  }
  return key;
}

async function massiveFetch(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Massive API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const message = (json.message as string) || (json.status as string) || `HTTP ${res.status}`;
    if (res.status === 403) {
      throw new Error(`Massive API access denied: ${message}. This data tier may require a plan upgrade.`);
    }
    throw new Error(`Massive API error (HTTP ${res.status}): ${message}`);
  }
  return json;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** List unique tradeable contracts for a product code, most recent first. */
export async function listContracts(productCode: string): Promise<ContractInfo[]> {
  const params = new URLSearchParams({
    product_code: productCode.toUpperCase(),
    limit: "1000",
  });
  let url = `${BASE_URL}/futures/v1/contracts?${params.toString()}`;
  const byTicker = new Map<string, ContractInfo>();

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const json = await massiveFetch(url);
    const results = (json.results as Record<string, unknown>[]) ?? [];
    for (const r of results) {
      const ticker = r.ticker as string;
      if (!ticker) continue;
      // Contracts return daily snapshots; keep the latest snapshot per ticker.
      const existing = byTicker.get(ticker);
      const settlement = (r.settlement_date as string) ?? null;
      if (!existing) {
        byTicker.set(ticker, {
          ticker,
          productCode: (r.product_code as string) ?? productCode,
          name: (r.name as string) ?? ticker,
          active: Boolean(r.active),
          firstTradeDate: (r.first_trade_date as string) ?? null,
          lastTradeDate: (r.last_trade_date as string) ?? null,
          settlementDate: settlement,
        });
      }
    }
    const next = json.next_url as string | undefined;
    url = next ? next : "";
  }

  return Array.from(byTicker.values()).sort((a, b) => {
    const as = a.settlementDate ?? "";
    const bs = b.settlementDate ?? "";
    return bs.localeCompare(as);
  });
}

/** Fetch 1-minute (or other resolution) OHLCV bars for a contract over a date range. */
export async function getAggregates(
  ticker: string,
  resolution: string,
  fromDate: string,
  toDate: string,
): Promise<Bar[]> {
  const params = new URLSearchParams({
    resolution,
    "window_start.gte": fromDate,
    "window_start.lt": addDays(toDate, 1),
    limit: String(PAGE_LIMIT),
  });
  let url = `${BASE_URL}/futures/v1/aggs/${encodeURIComponent(ticker)}?${params.toString()}`;
  const bars: Bar[] = [];

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const json = await massiveFetch(url);
    const results = (json.results as Record<string, unknown>[]) ?? [];
    for (const r of results) {
      const ns = r.window_start as number;
      bars.push({
        time: Math.floor(ns / 1e9),
        open: r.open as number,
        high: r.high as number,
        low: r.low as number,
        close: r.close as number,
        volume: (r.volume as number) ?? 0,
        sessionDate: (r.session_end_date as string) ?? "",
      });
    }
    const next = json.next_url as string | undefined;
    url = next ? next : "";
  }

  // Massive returns most-recent-first; the engine needs chronological order.
  bars.sort((a, b) => a.time - b.time);
  return bars;
}
