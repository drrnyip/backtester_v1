# ES Trade & Quote Research Platform

Local-first web app for researching **E-mini S&P 500 (ES)** strategies on
**trade and quote** tick data from [Massive](https://massive.com) CME flat files.
Built with **Next.js 16** (App Router) and optionally deployed on Firebase App Hosting
(UI shell only — tick archives stay on disk).

## Features

- **Flat-file ingest:** download Massive CME trades/quotes, filter to ES outrights,
  pick front-month by trade count, store day parquet under `data/es/`.
- **Explore:** session picker, OHLC from trades, mid/spread from quotes, session
  stats, mid-session tape sample.
- **Backtest:** tick engine with as-of BBO; starter strategies — opening range
  breakout, spread widen fade, trade imbalance.
- **Simple access gate** suited to an internal tool.

## Prerequisite

Massive **Futures Developer+** (or Business CME) for flat files, plus S3 credentials
from the Massive dashboard (`files.massive.com`). Aggregates-only API keys cannot
ingest trades/quotes.

## Getting started

Requires Node.js 20+ and [pnpm](https://pnpm.io).

```bash
pnpm install

# Create .env.local (gitignored):
cat > .env.local <<'EOF'
MASSIVE_S3_ACCESS_KEY=your_s3_access_key
MASSIVE_S3_SECRET_KEY=your_s3_secret_key
APP_PASSWORD=choose-a-password
SESSION_SECRET=any-random-string
EOF

# Demo data without Massive (synthetic ES session):
pnpm seed-sample

# Or ingest real flat files for a date range:
pnpm ingest -- --from 2024-12-16 --to 2024-12-17

pnpm dev      # http://localhost:3000
```

Other scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`.

## Architecture

| Piece | Location | Notes |
| --- | --- | --- |
| Ingest CLI | `scripts/ingest-es.ts` | S3 → filter ES → parquet + `sessions.json` |
| Sample seed | `scripts/seed-sample.ts` | Synthetic session for UI without S3 |
| Local data | `data/es/` | Gitignored trades/quotes parquet |
| Session reader | `src/lib/data/` | Load, resample, stats, tape windows |
| Tick engine | `src/lib/backtest/` | Trade events + as-of quotes |
| API | `src/app/api/sessions`, `backtest` | List/overview/tape + strategy run |
| Auth gate | `src/proxy.ts` | Next 16 renamed middleware → proxy |
| UI | `src/components/ResearchApp.tsx` | Explore + Backtest tabs |

## Deploy (Firebase App Hosting)

Project: `backtester-da4a5` (pinned in `.firebaserc`). Runtime config lives in
`apphosting.yaml`. Tick data is **local-first** — App Hosting is fine for the UI
gate, not for multi-GB flat-file archives without external object storage.

1. Create secrets:
   ```bash
   firebase apphosting:secrets:set APP_PASSWORD
   firebase apphosting:secrets:set SESSION_SECRET
   ```
2. Deploy via git-connected backend or `firebase deploy --only apphosting:backtester`.
