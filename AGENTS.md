<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

ES trade/quote research platform: **Next.js 16 (App Router, TypeScript)** on **Firebase App Hosting** (UI optional). Market data from **Massive** CME **flat files** (trades + quotes), ingested locally under `data/es/`. Single Next.js service. Package manager: **pnpm**. Scripts: `pnpm dev` (port 3000), `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm ingest`, `pnpm seed-sample`.

Environment variables (dev: `.env.local`, gitignored; prod: Cloud Secret Manager via `apphosting.yaml` for auth only):
- `MASSIVE_S3_ACCESS_KEY` / `MASSIVE_S3_SECRET_KEY` — Flat Files S3 credentials from the Massive dashboard (`files.massive.com`, bucket `flatfiles`). Required for `pnpm ingest`.
- `APP_PASSWORD` — password for the access gate at `/login`.
- `SESSION_SECRET` — value stored in the session cookie; the proxy compares against it.
- `MASSIVE_API_KEY` — optional; not used by the tick research path.

The app researches **ES only**. Without ingested sessions under `data/es/`, Explore/Backtest show an empty state — run `pnpm seed-sample` or `pnpm ingest -- --from YYYY-MM-DD --to YYYY-MM-DD`.

Non-obvious caveats:
- **Plan requirement:** trades/quotes flat files need **Futures Developer+** (or Business CME). Aggregates-only keys get 403 on S3 prefixes `futures/trades/cme` and `futures/quotes/cme`.
- **Front-month rule:** for each session date, keep outright ES tickers matching `^ES[FGHJKMNQUVXZ][0-9]{1,2}$`, pick highest trade count.
- **Local-first data:** parquet day files in `data/es/` are gitignored. Firebase App Hosting is ephemeral — do not rely on it for multi-GB tick storage without external object storage.
- **Next 16 renamed middleware → `proxy`**: auth gate lives in `src/proxy.ts`. Everything except `/login` and `/api/login` requires the session cookie.
- Next 16 enables **React Compiler lint rules**: avoid manual `useCallback`/`useMemo` that the compiler can't preserve, and avoid synchronous `setState` in `useEffect` bodies (move into handlers/async callbacks).
- Deploy: Firebase App Hosting builds from the connected repo using `apphosting.yaml`; create auth secrets with `firebase apphosting:secrets:set <NAME>` before rollout.
