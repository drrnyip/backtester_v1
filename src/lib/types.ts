// Shared domain types for the ES trade/quote research platform.

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
  /** Session date YYYY-MM-DD (ingested flat-file day). */
  sessionDate: string;
  strategyId: string;
  strategyParams: Record<string, number | boolean | string>;
  contracts: number;
  slippageTicks: number;
  commissionPerContract: number;
  stopLossTicks: number;
  takeProfitTicks: number;
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
  reason: string;
  /** Number of trade events held (tick engine). */
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
  ticker: string;
  sessionDate: string;
  bars: Bar[];
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  tradeEventCount: number;
  quoteEventCount: number;
}
