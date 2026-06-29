import type { ProductSpec } from "./types";

// Curated list of liquid futures products commonly used for day-trading research.
// Multiplier and tick size are exchange contract specs (not provided per-bar by Massive),
// so we keep a small static table and let the user pick.
const RAW: Omit<ProductSpec, "tickValue">[] = [
  { code: "ES", name: "E-mini S&P 500", multiplier: 50, tickSize: 0.25, exchange: "CME" },
  { code: "MES", name: "Micro E-mini S&P 500", multiplier: 5, tickSize: 0.25, exchange: "CME" },
  { code: "NQ", name: "E-mini Nasdaq-100", multiplier: 20, tickSize: 0.25, exchange: "CME" },
  { code: "MNQ", name: "Micro E-mini Nasdaq-100", multiplier: 2, tickSize: 0.25, exchange: "CME" },
  { code: "YM", name: "E-mini Dow", multiplier: 5, tickSize: 1, exchange: "CBOT" },
  { code: "RTY", name: "E-mini Russell 2000", multiplier: 50, tickSize: 0.1, exchange: "CME" },
  { code: "CL", name: "Crude Oil", multiplier: 1000, tickSize: 0.01, exchange: "NYMEX" },
  { code: "GC", name: "Gold", multiplier: 100, tickSize: 0.1, exchange: "COMEX" },
  { code: "SI", name: "Silver", multiplier: 5000, tickSize: 0.005, exchange: "COMEX" },
  { code: "ZN", name: "10-Year T-Note", multiplier: 1000, tickSize: 0.015625, exchange: "CBOT" },
  { code: "6E", name: "Euro FX", multiplier: 125000, tickSize: 0.00005, exchange: "CME" },
];

export const PRODUCTS: ProductSpec[] = RAW.map((p) => ({
  ...p,
  tickValue: Number((p.multiplier * p.tickSize).toFixed(6)),
}));

export function getProductSpec(code: string): ProductSpec | undefined {
  return PRODUCTS.find((p) => p.code === code.toUpperCase());
}
