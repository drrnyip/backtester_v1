import "server-only";
import type { Bar, ContractInfo } from "./types";

const BASE_URL = "https://api.massive.com";
const MAX_PAGES = 20;
const PAGE_LIMIT = 50000;
const CACHE_TTL_MS = 10 * 60 * 1000;

function apiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) {
    throw new Error(
      "MASSIVE_API_KEY is not configured. Set it in .env.local (dev) or App Hosting secrets (prod).",
    );
  }
  return key;
}

// Simple per-process cache to respect Massive's low free-tier rate limit.
const cache = new Map<string, { at: number; value: unknown }>();
function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  return undefined;
}
function setCached(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function massiveFetch(url: string): Promise<Record<string, unknown>> {
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      cache: "no-store",
    });
    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = {};
    }
    if (res.ok) return json;

    const message = (json.message as string) || (json.status as string) || `HTTP ${res.status}`;
    if (res.status === 429) {
      // Rate limited: exponential backoff and retry.
      lastErr = "Rate limited by Massive (free tier ~5 req/min).";
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    if (res.status === 403) {
      throw new Error(`Massive API access denied: ${message}. This data tier may require a plan upgrade.`);
    }
    throw new Error(`Massive API error (HTTP ${res.status}): ${message}`);
  }
  throw new Error(lastErr || "Massive API request failed after retries.");
}

function recentWeekday(): string {
  const d = new Date();
  // Step back to the most recent weekday to get an active contract snapshot.
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * List tradeable contracts for a product code. Uses a single as-of date snapshot
 * (one row per ticker) to stay within the API rate limit.
 */
export async function listContracts(productCode: string): Promise<ContractInfo[]> {
  const code = productCode.toUpperCase();
  const cacheKey = `contracts:${code}`;
  const cached = getCached<ContractInfo[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    product_code: code,
    date: recentWeekday(),
    limit: "1000",
  });
  const json = await massiveFetch(`${BASE_URL}/futures/v1/contracts?${params.toString()}`);
  const results = (json.results as Record<string, unknown>[]) ?? [];
  const byTicker = new Map<string, ContractInfo>();
  for (const r of results) {
    const ticker = r.ticker as string;
    // Only outright single contracts (skip calendar-spread combos).
    if (!ticker || byTicker.has(ticker)) continue;
    if (r.type && r.type !== "single") continue;
    if (ticker.includes("-")) continue;
    byTicker.set(ticker, {
      ticker,
      productCode: (r.product_code as string) ?? code,
      name: (r.name as string) ?? ticker,
      active: Boolean(r.active),
      firstTradeDate: (r.first_trade_date as string) ?? null,
      lastTradeDate: (r.last_trade_date as string) ?? null,
      settlementDate: (r.settlement_date as string) ?? null,
    });
  }

  const list = Array.from(byTicker.values()).sort((a, b) => {
    const as = a.settlementDate ?? "";
    const bs = b.settlementDate ?? "";
    return as.localeCompare(bs);
  });
  setCached(cacheKey, list);
  return list;
}

/** Fetch OHLCV bars for a contract over a date range, paginating as needed. */
export async function getAggregates(
  ticker: string,
  resolution: string,
  fromDate: string,
  toDate: string,
): Promise<Bar[]> {
  const cacheKey = `aggs:${ticker}:${resolution}:${fromDate}:${toDate}`;
  const cached = getCached<Bar[]>(cacheKey);
  if (cached) return cached;

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
    url = (json.next_url as string | undefined) ?? "";
  }

  // Massive returns most-recent-first; the engine needs chronological order.
  bars.sort((a, b) => a.time - b.time);
  setCached(cacheKey, bars);
  return bars;
}
