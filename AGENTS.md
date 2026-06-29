<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Web-based futures backtesting platform: **Next.js 16 (App Router, TypeScript)** on **Firebase App Hosting**, market data from **Massive** (the rebranded Polygon.io). Single Next.js service; no separate backend. Scripts: `npm run dev` (port 3000), `npm run build`, `npm run lint`, `npm run typecheck`.

Environment variables (dev: put them in `.env.local`, which is gitignored; prod: Cloud Secret Manager via `apphosting.yaml`):
- `MASSIVE_API_KEY` — server-only; read only in `src/lib/massive.ts`. Never expose to the client.
- `APP_PASSWORD` — password for the access gate at `/login`.
- `SESSION_SECRET` — value stored in the session cookie; the proxy compares against it.

The app will not produce backtests without `MASSIVE_API_KEY` set; `/api/contracts` and `/api/backtest` return a clear error if it is missing.

Non-obvious caveats:
- **Massive plan limits:** the configured key has aggregate bars (incl. 1-minute) + reference data, but **not** tick trades (`/futures/v1/trades` → `403 NOT_AUTHORIZED`) or real-time WebSockets. The backtester only uses `GET /futures/v1/aggs/{ticker}` at 1-minute resolution. Massive auth uses `Authorization: Bearer <key>`; base URL `https://api.massive.com`.
- Massive returns bars **most-recent-first**; `getAggregates` re-sorts ascending for the engine (do not assume API order).
- **Next 16 renamed middleware → `proxy`**: the auth gate lives in `src/proxy.ts` (not `middleware.ts`). Everything except `/login` and `/api/login` requires the session cookie.
- Next 16 enables **React Compiler lint rules**: avoid manual `useCallback`/`useMemo` that the compiler can't preserve, and avoid synchronous `setState` in `useEffect` bodies (move into handlers/async callbacks).
- Pick a contract whose history covers the chosen date range. Far-dated contracts (settlement years out) have no 1-minute history yet and will return "No bars". 1-minute date range is capped at 45 days server-side.
- Deploy: Firebase App Hosting builds from the connected repo using `apphosting.yaml`; create the three secrets with `firebase apphosting:secrets:set <NAME>` before the first rollout.
