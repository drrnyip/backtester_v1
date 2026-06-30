import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, getSessionToken } from "@/lib/auth";

// Optimistic password gate for the internal tool. Public paths (login page and
// login API) are always allowed; everything else requires a valid session cookie.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" || pathname === "/api/login";

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const authed = token === getSessionToken();

  if (!authed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (authed && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and image optimisation.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
