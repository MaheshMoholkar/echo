import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

// Optimistic check: is there a session cookie at all? It only saves a
// round trip for signed-out visitors. Pages still validate the session on
// the server (lib/session.ts), because a cookie can be expired or forged.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Everything except the auth pages, API routes (they authenticate
  // themselves), the public widget, Next.js internals and static files.
  matcher: [
    "/((?!sign-in|sign-up|api|widget|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
}
