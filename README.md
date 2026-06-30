# Futures Backtester

A web-based platform for researching **intraday (day-trading) futures strategies** on
1-minute historical data. Built with **Next.js 16** (App Router) and deployed on
**Firebase App Hosting**. Market data comes from the [Massive](https://massive.com) API
(the rebranded Polygon.io).

## Features

- **Preset strategies with parameters:** SMA Crossover, RSI Mean Reversion, Opening Range
  Breakout, and Bollinger Bands (mean-reversion / breakout).
- **Realistic execution model:** market / limit / stop entries, configurable slippage and
  per-contract commissions, optional stop-loss / take-profit, and end-of-session flattening
  for intraday testing.
- **Futures-aware accounting:** contract multiplier and tick value per product.
- **Results dashboard:** candlestick chart with trade markers, equity curve, a full trade
  log, and performance metrics (net P&L, return, max drawdown, profit factor, win rate,
  Sharpe, and more).
- **Simple access gate** suited to an internal tool.

## Getting started

Requires Node.js 20+.

```bash
npm install

# Create .env.local (gitignored):
cat > .env.local <<'EOF'
MASSIVE_API_KEY=your_massive_api_key
APP_PASSWORD=choose-a-password
SESSION_SECRET=any-random-string
EOF

npm run dev      # http://localhost:3000
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`.

## Architecture

| Piece | Location | Notes |
| --- | --- | --- |
| Massive data client | `src/lib/massive.ts` | Server-only; fetches contracts + 1-min OHLC bars |
| Backtest engine | `src/lib/backtest/` | `engine.ts`, `strategies.ts`, `indicators.ts`, `metrics.ts` |
| API routes | `src/app/api/*` | `contracts`, `backtest`, `login`, `logout` |
| Auth gate | `src/proxy.ts` | Next 16 renamed middleware → proxy |
| UI | `src/components/*` | Config panel, charts (lightweight-charts), metrics, trade log |

## Data tier note

The backtester uses aggregate OHLC bars at 1-minute resolution
(`GET /futures/v1/aggs/{ticker}`). Tick-level trades and real-time WebSocket streams
require a higher Massive plan and are not used here.

## Deploy (Firebase App Hosting)

Project: `backtester-da4a5` (pinned in `.firebaserc`). Runtime config lives in
`apphosting.yaml`; CLI deploy/emulator settings live in `firebase.json`.

1. Create a Firebase App Hosting backend (Blaze plan). Either connect this repo to a
   backend in the console, or run `firebase init apphosting`.
   - `firebase.json` uses backend id **`backtester`** — rename it to match the backend you
     create (or name your backend `backtester`).
2. Create the runtime secrets:
   ```bash
   firebase apphosting:secrets:set MASSIVE_API_KEY
   firebase apphosting:secrets:set APP_PASSWORD
   firebase apphosting:secrets:set SESSION_SECRET
   ```
3. Deploy:
   - **Git-connected:** push to the connected branch and App Hosting builds + rolls out
     automatically, or
   - **Local source:** `firebase deploy --only apphosting:backtester` (the working dir is
     zipped; `.env*` is excluded via the `ignore` list so local secrets aren't uploaded).

Local production-style testing: `firebase emulators:start` (App Hosting emulator runs
`npm run dev`).
