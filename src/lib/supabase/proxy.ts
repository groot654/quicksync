import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, isEmailAllowed } from "@/lib/env";
import type { Database } from "@/types/database";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = new Set(["/login"]);

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";

/**
 * Refreshes the Supabase session cookie on every request and performs an optimistic
 * redirect for page navigations. This is a convenience layer only: pages and Server
 * Actions re-verify the user themselves, and RLS protects the data.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { supabaseUrl, supabaseKey } = getPublicEnv();

  let response = NextResponse.next({ request });
  const cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Responses that set auth cookies must never be cached by a CDN.
        Object.assign(cacheHeaders, headers);
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): getClaims() validates the
  // JWT and triggers the refresh that keeps users signed in.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const isAuthorized = Boolean(claims?.sub) && isEmailAllowed(claims?.email as string | undefined);

  // Only redirect page navigations. Server Actions and other requests are answered by
  // their own handlers, which return a structured "unauthorized" result instead.
  const isNavigation = request.method === "GET" || request.method === "HEAD";
  if (!isNavigation) return response;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!isAuthorized && !isPublic) {
    return redirectWithSession(request, response, LOGIN_PATH, cacheHeaders);
  }
  if (isAuthorized && pathname === LOGIN_PATH) {
    return redirectWithSession(request, response, HOME_PATH, cacheHeaders);
  }

  return response;
}

function redirectWithSession(
  request: NextRequest,
  sessionResponse: NextResponse,
  pathname: string,
  cacheHeaders: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  // Carry over any refreshed auth cookies so the session is not lost on redirect.
  sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
  return redirect;
}
