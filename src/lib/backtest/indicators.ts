// Technical indicators used by the preset strategies. Each returns an array
// aligned to the input length, with `NaN` where there isn't enough lookback.

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = period === 1 ? values[0] : NaN;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0 || values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface Bollinger {
  middle: number[];
  upper: number[];
  lower: number[];
}

export function bollinger(values: number[], period: number, mult: number): Bollinger {
  const middle = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let variance = 0;
    const mean = middle[i];
    for (let j = i - period + 1; j <= i; j++) {
      variance += (values[j] - mean) ** 2;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}
