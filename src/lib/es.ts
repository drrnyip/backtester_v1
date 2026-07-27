import type { ProductSpec } from "./types";

/** Hard-coded ES contract specs for the research platform. */
export const ES_SPEC: ProductSpec = {
  code: "ES",
  name: "E-mini S&P 500",
  multiplier: 50,
  tickSize: 0.25,
  tickValue: 12.5,
  exchange: "CME",
};

/** Outright ES futures ticker, e.g. ESH5 / ESZ24 (not calendar spreads). */
export const ES_OUTRIGHT_RE = /^ES[FGHJKMNQUVXZ][0-9]{1,2}$/;

export function isEsOutright(ticker: string): boolean {
  return ES_OUTRIGHT_RE.test(ticker);
}
