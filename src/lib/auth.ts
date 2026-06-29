// Minimal shared-secret gate for an internal-only tool.
// The session cookie stores SESSION_SECRET; the proxy and the login route both
// derive the expected value from environment variables (no client exposure).

export const COOKIE_NAME = "bt_session";
export const COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours

export function getSessionToken(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.APP_PASSWORD ||
    "insecure-dev-session"
  );
}

export function getAppPassword(): string {
  return process.env.APP_PASSWORD || "backtest";
}
