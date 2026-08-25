import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// "/submissions" (my submissions list) needs a session; "/submissions/[id]" is
// public for public models — the page itself enforces private/hidden visibility.
const PROTECTED_PREFIX = ["/submit", "/profile", "/admin"];
const PROTECTED_EXACT = ["/submissions"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_EXACT.includes(pathname) || PROTECTED_PREFIX.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsAuth) return NextResponse.next();
  if (!req.auth?.user) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && req.auth.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/?forbidden=1", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logos|images).*)"],
};
