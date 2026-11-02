import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildEnforcedCsp } from "./lib/security/securityHeaders";
import { cspOptionsFromEnv, documentRequestHeaders, resolveDocumentCsp } from "./lib/security/documentCsp";
import { isProEphemerisEnabled } from "./lib/astrology/pro/ephemeris/flags";
import { isCampaignVisitorPath, withTurnstileCsp } from "./lib/security/campaignCsp";

/**
 * 1) /admin/* rotalarını korur (hızlı ret).
 * Admin oturum cookie'si (`yasam_admin_session`, opak oturum token'ı) yoksa ana sayfaya
 * redirect eder. DB sorgusu yapmaz — token + admin doğrulaması app/admin/layout.tsx'te
 * (lib/auth/adminShellSession) yapılır. Sabit, lib/auth/adminShellSession.ADMIN_SESSION_COOKIE
 * ile aynıdır (proxy bundle'ına Supabase bağımlılığı sokmamak için burada tekrarlanır).
 *
 * 2) CSP NONCE C1-v2: DOKÜMAN isteklerinde CSP'nin TEK kaynağı (lib/security/documentCsp).
 * Mod CSP_NONCE_MODE (off|canary|all; tanımsızsa eski CSP_NONCE_CANARY): off → production ile
 * byte-eşit CSP; canary → yalnız cookie'li istek, all → her doküman isteği nonce'lu CSP alır.
 * API / statik / prefetch-RSC istekleri proxy'ye girmez — onların CSP'si next.config'ten gelir.
 */
const ADMIN_SESSION_COOKIE = "yasam_admin_session";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * 3) B4 (Profesyonel Efemeris, varsayılan KAPALI): YALNIZ bu iki rota yolu. Uzman yolu ModuleRouteGuard arkasında olduğundan sayfa
 * içindeki notFound() SSR'de çalışmıyor ve yanıt 200 kalıyordu (soft-404). Bayrak kapalıyken doküman isteği var olmayan bir yola
 * rewrite edilir → yönlendirici seviyesinde gerçek 404 + noindex. Admin oturum yönlendirmesi ve CSP aynen önce uygulanır.
 */
const PRO_EPHEMERIS_PATHS = ["/astroloji/efemeris", "/admin/astroloji/efemeris"] as const;
const PRO_EPHEMERIS_OFF_TARGET = "/__ozellik-kapali";
function isProEphemerisPath(pathname: string): boolean {
  return PRO_EPHEMERIS_PATHS.some((p) => pathname === p || pathname === `${p}/`);
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
  // Gece operasyonu (kampanya): Turnstile betiği/iframe'i YALNIZ ziyaretçi analiz sayfasında (diğer yollar byte-eşit).
  if (isCampaignVisitorPath(request.nextUrl.pathname)) {
    policy = withTurnstileCsp(policy);
    requestHeaders = documentRequestHeaders(request.headers, policy);
  }

  if (isAdminPath(request.nextUrl.pathname) && !request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    redirect.headers.set("Content-Security-Policy", policy);
    return redirect;
  }

  if (isProEphemerisPath(request.nextUrl.pathname) && !isProEphemerisEnabled()) {
    const notFoundRewrite = NextResponse.rewrite(new URL(PRO_EPHEMERIS_OFF_TARGET, request.url), { request: { headers: requestHeaders } });
    notFoundRewrite.headers.set("Content-Security-Policy", policy);
    return notFoundRewrite;
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
