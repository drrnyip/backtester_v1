import fs from "fs";
import path from "path";
import parquet from "@dsnp/parquetjs";
import type { QuoteTick, TradeTick } from "./types";

const tradeSchema = new parquet.ParquetSchema({
  ticker: { type: "UTF8" },
  timestamp: { type: "INT64" },
  sequenceNumber: { type: "INT64" },
  reportSequence: { type: "INT64" },
  price: { type: "DOUBLE" },
  size: { type: "INT64" },
  correction: { type: "INT32" },
  exchange: { type: "INT32" },
  sessionEndDate: { type: "UTF8" },
});

const quoteSchema = new parquet.ParquetSchema({
  ticker: { type: "UTF8" },
  timestamp: { type: "INT64" },
  sequenceNumber: { type: "INT64" },
  reportSequence: { type: "INT64" },
  askTimestamp: { type: "INT64" },
  askPrice: { type: "DOUBLE", optional: true },
  askSize: { type: "DOUBLE" },
  bidTimestamp: { type: "INT64" },
  bidPrice: { type: "DOUBLE", optional: true },
  bidSize: { type: "DOUBLE" },
  exchange: { type: "INT32" },
  sessionEndDate: { type: "UTF8" },
});

function toNum(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number(v ?? 0);
}

function toOptNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
}

export async function writeTradesParquet(filePath: string, rows: TradeTick[]): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const writer = await parquet.ParquetWriter.openFile(tradeSchema, filePath);
  for (const r of rows) {
    await writer.appendRow({
      ticker: r.ticker,
      timestamp: r.timestamp,
      sequenceNumber: r.sequenceNumber,
      reportSequence: r.reportSequence,
      price: r.price,
      size: r.size,
      correction: r.correction,
      exchange: r.exchange,
      sessionEndDate: r.sessionEndDate,
    });
  }
  await writer.close();
}

export async function writeQuotesParquet(filePath: string, rows: QuoteTick[]): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const writer = await parquet.ParquetWriter.openFile(quoteSchema, filePath);
  for (const r of rows) {
    await writer.appendRow({
      ticker: r.ticker,
      timestamp: r.timestamp,
      sequenceNumber: r.sequenceNumber,
      reportSequence: r.reportSequence,
      askTimestamp: r.askTimestamp,
      askPrice: r.askPrice,
      askSize: r.askSize,
      bidTimestamp: r.bidTimestamp,
      bidPrice: r.bidPrice,
      bidSize: r.bidSize,
      exchange: r.exchange,
      sessionEndDate: r.sessionEndDate,
    });
  }
  await writer.close();
}

export async function readTradesParquet(filePath: string): Promise<TradeTick[]> {
  const reader = await parquet.ParquetReader.openFile(filePath);
  const cursor = reader.getCursor();
  const out: TradeTick[] = [];
  for (;;) {
    const record = (await cursor.next()) as Record<string, unknown> | null;
    if (!record) break;
    out.push({
      ticker: String(record.ticker),
      timestamp: toNum(record.timestamp),
      sequenceNumber: toNum(record.sequenceNumber),
      reportSequence: toNum(record.reportSequence),
      price: toNum(record.price),
      size: toNum(record.size),
      correction: toNum(record.correction),
      exchange: toNum(record.exchange),
      sessionEndDate: String(record.sessionEndDate),
    });
  }
  await reader.close();
  out.sort((a, b) => a.timestamp - b.timestamp || a.sequenceNumber - b.sequenceNumber);
  return out;
}

export async function readQuotesParquet(filePath: string): Promise<QuoteTick[]> {
  const reader = await parquet.ParquetReader.openFile(filePath);
  const cursor = reader.getCursor();
  const out: QuoteTick[] = [];
  for (;;) {
    const record = (await cursor.next()) as Record<string, unknown> | null;
    if (!record) break;
    out.push({
      ticker: String(record.ticker),
      timestamp: toNum(record.timestamp),
      sequenceNumber: toNum(record.sequenceNumber),
      reportSequence: toNum(record.reportSequence),
      askTimestamp: toNum(record.askTimestamp),
      askPrice: toOptNum(record.askPrice),
      askSize: toNum(record.askSize),
      bidTimestamp: toNum(record.bidTimestamp),
      bidPrice: toOptNum(record.bidPrice),
      bidSize: toNum(record.bidSize),
      exchange: toNum(record.exchange),
      sessionEndDate: String(record.sessionEndDate),
    });
  }
  await reader.close();
  out.sort((a, b) => a.timestamp - b.timestamp || a.sequenceNumber - b.sequenceNumber);
  return out;
}
