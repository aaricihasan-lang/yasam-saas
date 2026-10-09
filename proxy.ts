import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withCspCanary } from "./lib/security/cspCanary";

/**
 * /admin/* rotalarını korur (hızlı ret).
 * Admin oturum cookie'si (`yasam_admin_session`, opak oturum token'ı) yoksa ana sayfaya
 * redirect eder. DB sorgusu yapmaz — token + admin doğrulaması app/admin/layout.tsx'te
 * (lib/auth/adminShellSession) yapılır. Sabit, lib/auth/adminShellSession.ADMIN_SESSION_COOKIE
 * ile aynıdır (proxy bundle'ına Supabase bağımlılığı sokmamak için burada tekrarlanır).
 *
 * CSP NONCE C1: yalnız `yasam_csp_canary=1` cookie'li doküman isteklerinde nonce'lı
 * Report-Only CSP eklenir (lib/security/cspCanary; fail-open). Canary olmayan istekler
 * matcher'daki `has` koşulu nedeniyle proxy'ye girmez (yalnız /admin bugünkü gibi girer).
 */
const ADMIN_SESSION_COOKIE = "yasam_admin_session";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function proxy(request: NextRequest) {
  if (isAdminPath(request.nextUrl.pathname)) {
    const adminCookie = request.cookies.get(ADMIN_SESSION_COOKIE);

    if (!adminCookie?.value) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return withCspCanary(request);
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    // C1 canary: yalnız canary cookie'li doküman istekleri. API, statik/asset (nokta içeren
    // yollar), görsel optimizasyonu, Vercel insights ve prefetch/RSC istekleri HARİÇ.
    {
      source: "/((?!api/|api$|_next/static|_next/image|_vercel|.*\\..*).*)",
      has: [{ type: "cookie", key: "yasam_csp_canary", value: "1" }],
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
        { type: "header", key: "rsc" },
      ],
    },
  ],
};
