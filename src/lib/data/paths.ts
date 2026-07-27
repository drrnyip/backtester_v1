import path from "path";

export const DATA_ROOT = path.join(process.cwd(), "data", "es");
export const TRADES_DIR = path.join(DATA_ROOT, "trades");
export const QUOTES_DIR = path.join(DATA_ROOT, "quotes");
export const SESSIONS_INDEX = path.join(DATA_ROOT, "sessions.json");

export function tradesPath(date: string): string {
  return path.join(TRADES_DIR, `${date}.parquet`);
}

export function quotesPath(date: string): string {
  return path.join(QUOTES_DIR, `${date}.parquet`);
}
