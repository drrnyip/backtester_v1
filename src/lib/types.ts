// Shared domain types for the futures backtesting platform.

export interface Bar {
  /** Unix time in seconds (UTC) of the bar's start. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Trading session date (YYYY-MM-DD) the bar belongs to. */
  sessionDate: string;
}

export interface ProductSpec {
  /** Massive product_code, e.g. "ES". */
  code: string;
  name: string;
  /** Dollar value of a one-point move per single contract. */
  multiplier: number;
  /** Minimum price increment. */
  tickSize: number;
  /** Dollar value of one tick = multiplier * tickSize. */
  tickValue: number;
  exchange: string;
}

export interface ContractInfo {
  ticker: string;
  productCode: string;
  name: string;
  active: boolean;
  firstTradeDate: string | null;
  lastTradeDate: string | null;
  settlementDate: string | null;
}

export type OrderType = "market" | "limit" | "stop";

export interface StrategyParam {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  help?: string;
}

export interface StrategyDef {
  id: string;
  name: string;
  description: string;
  params: StrategyParam[];
}

export interface BacktestRequest {
  ticker: string;
  productCode: string;
  // Spec is resolved server-side from productCode but echoed for transparency.
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  strategyId: string;
  strategyParams: Record<string, number | boolean | string>;
  contracts: number;
  // Execution model
  entryOrderType: OrderType;
  /** Offset in ticks for limit/stop entries (favourable for limit, breakout for stop). */
  entryOffsetTicks: number;
  slippageTicks: number;
  commissionPerContract: number; // dollars per contract per side
  // Risk controls (0 = disabled)
  stopLossTicks: number;
  takeProfitTicks: number;
  // Intraday behaviour
  flattenAtSessionEnd: boolean;
  startingCapital: number;
}

export interface Trade {
  side: "long" | "short";
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  contracts: number;
  grossPnl: number;
  commission: number;
  netPnl: number;
  reason: string; // why the trade exited
  barsHeld: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestMetrics {
  netPnl: number;
  returnPct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgTrade: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpe: number | null;
  totalCommission: number;
  finalEquity: number;
}

export interface BacktestResult {
  request: BacktestRequest;
  spec: ProductSpec;
  bars: Bar[];
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  barCount: number;
  rangeStart: string;
  rangeEnd: string;
}
