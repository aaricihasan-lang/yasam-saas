import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildEnforcedCsp } from "./lib/security/securityHeaders";
import { cspOptionsFromEnv, documentRequestHeaders, resolveDocumentCsp } from "./lib/security/documentCsp";

/**
 * 1) /admin/* rotalarını korur (hızlı ret).
 * Admin oturum cookie'si (`yasam_admin_session`, opak oturum token'ı) yoksa ana sayfaya
 * redirect eder. DB sorgusu yapmaz — token + admin doğrulaması app/admin/layout.tsx'te
 * (lib/auth/adminShellSession) yapılır. Sabit, lib/auth/adminShellSession.ADMIN_SESSION_COOKIE
 * ile aynıdır (proxy bundle'ına Supabase bağımlılığı sokmamak için burada tekrarlanır).
 *
 * 2) CSP NONCE C1-v2: DOKÜMAN isteklerinde CSP'nin TEK kaynağı (lib/security/documentCsp).
 * Normal trafik production ile byte-eşit CSP alır; canary (env + cookie) nonce'lu CSP alır.
 * API / statik / prefetch-RSC istekleri proxy'ye girmez — onların CSP'si next.config'ten gelir.
 */
const ADMIN_SESSION_COOKIE = "yasam_admin_session";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function proxy(request: NextRequest) {
  let policy: string;
  let requestHeaders: Headers;
  try {
    const csp = resolveDocumentCsp(request.cookies);
    policy = csp.policy;
    requestHeaders = documentRequestHeaders(request.headers, policy);
  } catch {
    // FAIL-SAFE: CSP'siz yanıt YOK — normal zorunlu CSP.
    policy = buildEnforcedCsp(cspOptionsFromEnv());
    requestHeaders = documentRequestHeaders(request.headers, policy);
  }

  if (isAdminPath(request.nextUrl.pathname) && !request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    redirect.headers.set("Content-Security-Policy", policy);
    return redirect;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    // /admin: bugünkü gibi HER istekte (prefetch/RSC dahil) — hızlı ret davranışı korunur.
    "/admin",
    "/admin/:path*",
    // Doküman istekleri. API, statik/asset (nokta içeren yollar), görsel optimizasyonu, Vercel
    // insights ve prefetch/RSC istekleri HARİÇ (onların CSP'si next.config'ten).
    {
      source: "/((?!api/|api$|_next/static|_next/image|_next/data|_vercel|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
        { type: "header", key: "rsc" },
      ],
    },
  ],
};
