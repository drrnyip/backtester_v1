/**
 * Write a synthetic ES session so the UI works without Massive S3 credentials.
 *
 * Usage: pnpm seed-sample
 */
import path from "path";
import { config } from "dotenv";
import { quotesPath, tradesPath } from "../src/lib/data/paths";
import { writeQuotesParquet, writeTradesParquet } from "../src/lib/data/parquet";
import { upsertSession } from "../src/lib/data/sessions";
import type { QuoteTick, TradeTick } from "../src/lib/data/types";

config({ path: path.join(process.cwd(), ".env.local") });

const DATE = "2024-12-16";
const TICKER = "ESZ4";

function nsAt(hourCT: number, minute: number, second = 0, nano = 0): number {
  // Approximate: session date Dec 16 2024 — treat CT as UTC-6 for sample data.
  const utcHour = hourCT + 6;
  const d = new Date(Date.UTC(2024, 11, 16, utcHour, minute, second));
  return d.getTime() * 1e6 + nano;
}

async function main() {
  const trades: TradeTick[] = [];
  const quotes: QuoteTick[] = [];
  let price = 6050;
  let bid = 6049.75;
  let ask = 6050;
  let seq = 1;

  // ~2 hours of RTH-ish activity at 1 trade/sec for a light demo (~7200 trades).
  for (let i = 0; i < 7200; i++) {
    const minute = Math.floor(i / 60);
    const second = i % 60;
    const hour = 8 + Math.floor(minute / 60);
    const min = minute % 60;
    const ts = nsAt(hour, min, second, i);

    // Random-walk price in ticks.
    const step = (Math.sin(i / 40) + Math.sin(i / 17) * 0.5) > 0 ? 0.25 : -0.25;
    if (i % 3 === 0) price = Math.round((price + step) * 4) / 4;
    bid = price - 0.25;
    ask = price;
    // Occasionally widen the spread.
    if (i % 200 < 15) {
      bid = price - 0.75;
      ask = price + 0.5;
    }

    trades.push({
      ticker: TICKER,
      timestamp: ts,
      sequenceNumber: seq++,
      reportSequence: seq,
      price,
      size: 1 + (i % 5),
      correction: 0,
      exchange: 1,
      sessionEndDate: DATE,
    });

    if (i % 2 === 0) {
      quotes.push({
        ticker: TICKER,
        timestamp: ts,
        sequenceNumber: seq++,
        reportSequence: seq,
        askTimestamp: ts,
        askPrice: ask,
        askSize: 5 + (i % 10),
        bidTimestamp: ts,
        bidPrice: bid,
        bidSize: 4 + (i % 8),
        exchange: 1,
        sessionEndDate: DATE,
      });
    }
  }

  // Add a quieter second month so front-month selection has something to beat.
  for (let i = 0; i < 50; i++) {
    trades.push({
      ticker: "ESH5",
      timestamp: nsAt(9, 0, i),
      sequenceNumber: 9_000_000 + i,
      reportSequence: i,
      price: 6060,
      size: 1,
      correction: 0,
      exchange: 1,
      sessionEndDate: DATE,
    });
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);
  quotes.sort((a, b) => a.timestamp - b.timestamp);

  const tPath = tradesPath(DATE);
  const qPath = quotesPath(DATE);
  await writeTradesParquet(tPath, trades);
  await writeQuotesParquet(qPath, quotes);

  upsertSession({
    date: DATE,
    frontMonth: TICKER,
    tradeCount: trades.filter((t) => t.ticker === TICKER).length,
    quoteCount: quotes.filter((q) => q.ticker === TICKER).length,
    volume: trades.filter((t) => t.ticker === TICKER).reduce((s, t) => s + t.size, 0),
    tickers: [TICKER, "ESH5"],
    tradesFile: path.relative(process.cwd(), tPath),
    quotesFile: path.relative(process.cwd(), qPath),
    ingestedAt: new Date().toISOString(),
  });

  console.log(`Seeded sample session ${DATE} (${TICKER})`);
  console.log(`  trades: ${trades.length}, quotes: ${quotes.length}`);
  console.log(`  ${tPath}`);
  console.log(`  ${qPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
