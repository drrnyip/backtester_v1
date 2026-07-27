/**
 * Ingest Massive CME trade/quote flat files for ES into local parquet day files.
 *
 * Usage:
 *   pnpm ingest -- --from 2024-12-16 --to 2024-12-17
 *
 * Requires MASSIVE_S3_ACCESS_KEY + MASSIVE_S3_SECRET_KEY in .env.local
 * (Futures Developer+ plan).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { parse } from "csv-parse";
import { config } from "dotenv";
import { isEsOutright } from "../src/lib/es";
import { quotesPath, tradesPath, TRADES_DIR, QUOTES_DIR } from "../src/lib/data/paths";
import { writeQuotesParquet, writeTradesParquet } from "../src/lib/data/parquet";
import { pickFrontMonth } from "../src/lib/data/resample";
import { getObjectStream, getS3Client, resolveObjectKey } from "../src/lib/data/s3";
import { upsertSession } from "../src/lib/data/sessions";
import type { QuoteTick, TradeTick } from "../src/lib/data/types";

config({ path: path.join(process.cwd(), ".env.local") });
config(); // also allow process env / .env

function usage(): never {
  console.error("Usage: pnpm ingest -- --from YYYY-MM-DD --to YYYY-MM-DD");
  process.exit(1);
}

function parseArgs(argv: string[]): { from: string; to: string } {
  let from = "";
  let to = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") from = argv[++i] ?? "";
    else if (argv[i] === "--to") to = argv[++i] ?? "";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) usage();
  if (from > to) {
    console.error("--from must be on or before --to");
    process.exit(1);
  }
  return { from, to };
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function num(v: string | undefined): number {
  if (v === undefined || v === "") return 0;
  return Number(v);
}

function optNum(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function parseCsvGzStream(
  stream: NodeJS.ReadableStream,
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    const gunzip = zlib.createGunzip();
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    stream
      .pipe(gunzip)
      .pipe(parser)
      .on("data", (row: Record<string, string>) => rows.push(row))
      .on("error", reject)
      .on("end", () => resolve(rows));
  });
}

function rowToTrade(row: Record<string, string>): TradeTick | null {
  const ticker = row.ticker ?? "";
  if (!isEsOutright(ticker)) return null;
  return {
    ticker,
    timestamp: num(row.timestamp),
    sequenceNumber: num(row.sequence_number),
    reportSequence: num(row.report_sequence),
    price: num(row.price),
    size: num(row.size),
    correction: num(row.correction),
    exchange: num(row.exchange),
    sessionEndDate: row.session_end_date ?? "",
  };
}

function rowToQuote(row: Record<string, string>): QuoteTick | null {
  const ticker = row.ticker ?? "";
  if (!isEsOutright(ticker)) return null;
  return {
    ticker,
    timestamp: num(row.timestamp),
    sequenceNumber: num(row.sequence_number),
    reportSequence: num(row.report_sequence),
    askTimestamp: num(row.ask_timestamp),
    askPrice: optNum(row.ask_price),
    askSize: num(row.ask_size),
    bidTimestamp: num(row.bid_timestamp),
    bidPrice: optNum(row.bid_price),
    bidSize: num(row.bid_size),
    exchange: num(row.exchange),
    sessionEndDate: row.session_end_date ?? "",
  };
}

async function ingestDay(date: string): Promise<void> {
  const client = getS3Client();
  console.log(`\n=== ${date} ===`);

  const tradesKey = await resolveObjectKey(client, "trades", date);
  console.log(`Downloading trades: ${tradesKey}`);
  const tradesStream = await getObjectStream(client, tradesKey);
  const tradeRows = await parseCsvGzStream(tradesStream);
  const trades: TradeTick[] = [];
  for (const row of tradeRows) {
    const t = rowToTrade(row);
    if (t) trades.push(t);
  }
  trades.sort((a, b) => a.timestamp - b.timestamp || a.sequenceNumber - b.sequenceNumber);
  console.log(`ES trades kept: ${trades.length.toLocaleString()} / ${tradeRows.length.toLocaleString()}`);

  const quotesKey = await resolveObjectKey(client, "quotes", date);
  console.log(`Downloading quotes: ${quotesKey}`);
  const quotesStream = await getObjectStream(client, quotesKey);
  const quoteRows = await parseCsvGzStream(quotesStream);
  const quotes: QuoteTick[] = [];
  for (const row of quoteRows) {
    const q = rowToQuote(row);
    if (q) quotes.push(q);
  }
  quotes.sort((a, b) => a.timestamp - b.timestamp || a.sequenceNumber - b.sequenceNumber);
  console.log(`ES quotes kept: ${quotes.length.toLocaleString()} / ${quoteRows.length.toLocaleString()}`);

  if (trades.length === 0) {
    console.warn(`No ES trades for ${date}; skipping session index entry.`);
    return;
  }

  const frontMonth = pickFrontMonth(trades);
  if (!frontMonth) {
    console.warn(`Could not determine front month for ${date}`);
    return;
  }

  const tPath = tradesPath(date);
  const qPath = quotesPath(date);
  fs.mkdirSync(TRADES_DIR, { recursive: true });
  fs.mkdirSync(QUOTES_DIR, { recursive: true });
  await writeTradesParquet(tPath, trades);
  await writeQuotesParquet(qPath, quotes);

  const tickers = [...new Set(trades.map((t) => t.ticker))].sort();
  let volume = 0;
  for (const t of trades) {
    if (t.ticker === frontMonth && t.correction === 0) volume += t.size;
  }

  upsertSession({
    date,
    frontMonth,
    tradeCount: trades.filter((t) => t.ticker === frontMonth).length,
    quoteCount: quotes.filter((q) => q.ticker === frontMonth).length,
    volume,
    tickers,
    tradesFile: path.relative(process.cwd(), tPath),
    quotesFile: path.relative(process.cwd(), qPath),
    ingestedAt: new Date().toISOString(),
  });

  console.log(`Wrote ${tPath}`);
  console.log(`Wrote ${qPath}`);
  console.log(`Front month: ${frontMonth}`);
}

async function main() {
  const { from, to } = parseArgs(process.argv.slice(2));
  console.log(`Ingesting ES trades/quotes ${from} → ${to}`);
  for (const date of eachDate(from, to)) {
    // Skip weekends — CME still has Globex but empty files are possible; try anyway.
    await ingestDay(date);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
