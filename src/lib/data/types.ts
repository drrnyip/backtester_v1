/** Tick-level trade from Massive CME flat files (ES-filtered). */
export interface TradeTick {
  ticker: string;
  /** Nanosecond Unix timestamp. */
  timestamp: number;
  sequenceNumber: number;
  reportSequence: number;
  price: number;
  size: number;
  correction: number;
  exchange: number;
  sessionEndDate: string;
}

/** Top-of-book quote from Massive CME flat files (ES-filtered). */
export interface QuoteTick {
  ticker: string;
  timestamp: number;
  sequenceNumber: number;
  reportSequence: number;
  askTimestamp: number;
  askPrice: number | null;
  askSize: number;
  bidTimestamp: number;
  bidPrice: number | null;
  bidSize: number;
  exchange: number;
  sessionEndDate: string;
}

export interface SessionInfo {
  date: string;
  frontMonth: string;
  tradeCount: number;
  quoteCount: number;
  volume: number;
  tickers: string[];
  tradesFile: string;
  quotesFile: string;
  ingestedAt: string;
}

export interface SessionsIndex {
  updatedAt: string;
  sessions: SessionInfo[];
}

export interface SessionStats {
  date: string;
  ticker: string;
  tradeCount: number;
  quoteCount: number;
  volume: number;
  vwap: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  close: number | null;
  avgSpread: number | null;
  medianSpread: number | null;
}

export interface SpreadPoint {
  /** Unix seconds. */
  time: number;
  mid: number;
  spread: number;
  bid: number;
  ask: number;
}

export interface QuoteState {
  bid: number | null;
  ask: number | null;
  bidSize: number;
  askSize: number;
  spread: number | null;
  mid: number | null;
  timestamp: number;
}
