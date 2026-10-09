/**
 * CSP NONCE C1 — canary Report-Only katmanı (proxy.ts'ten çağrılır).
 *
 * DAVRANIŞ:
 *   - Yalnız `yasam_csp_canary=1` cookie'si olan doküman isteklerinde çalışır (proxy matcher
 *     aynı koşulu `has` ile uygular → canary olmayan istekler proxy'ye HİÇ girmez).
 *   - İstek başına kriptografik rastgele nonce üretir (16 bayt, Web Crypto). Nonce loglanmaz,
 *     saklanmaz, kullanıcı bilgisi içermez.
 *   - Nonce'ı Next'e İSTEK başlığı `content-security-policy` ile aktarır (Next CSP rehberinin
 *     resmi yolu). Next 16 nonce'ı bu istek başlığından çıkarır (next/dist/server/app-render/
 *     app-render.js) ve kendi script'lerine uygular. İstek başlığı tarayıcıda HİÇBİR ŞEY
 *     uygulatmaz (yalnız Next'e girdi); tarayıcı yalnız yanıt başlıklarını uygular. İstemcinin
 *     gönderebileceği aynı adlı istek başlığı ezilir.
 *     NOT: `content-security-policy-report-only` istek başlığı yerel `next start`'ta çalışır
 *     ancak Vercel'de render'a ulaşmadı (preview'da nonce 0/16) → resmi yol kullanılır.
 *   - Yanıta `Content-Security-Policy-Report-Only` ekler (raporlar `report-uri` ile).
 *     Statik ZORUNLU `Content-Security-Policy` (next.config.ts headers()) DOKUNULMADAN kalır.
 *   - FAIL-OPEN: herhangi bir hata → düz `NextResponse.next()` (zorunlu CSP yine yanıtta).
 *
 * KILL-SWITCH: `CSP_NONCE_CANARY=off` → canary cookie'si olsa bile hiçbir şey eklenmez.
 *
 * Auth/session ile İLGİSİZDİR: cookie yetki vermez, kimlik taşımaz.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CSP_CANARY_COOKIE,
  CSP_NONCE_RE,
  buildNonceReportOnlyCsp,
} from "./securityHeaders";

export const CSP_CANARY_KILL_SWITCH_ENV = "CSP_NONCE_CANARY";

/** 16 bayt (128 bit) kriptografik rastgele → base64 (Next nonce kalıbına uyar). */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function isCspCanaryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env[CSP_CANARY_KILL_SWITCH_ENV] ?? "").trim().toLowerCase() !== "off";
}

export function isCspCanaryRequest(
  request: NextRequest,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isCspCanaryEnabled(env) && request.cookies.get(CSP_CANARY_COOKIE)?.value === "1";
}

export type CspCanaryDeps = {
  genNonce?: () => string;
  env?: Record<string, string | undefined>;
};

/**
 * Canary isteğinde nonce'lı Report-Only yanıtı; aksi halde (veya hata halinde) düz devam.
 * Asla throw etmez.
 */
export function withCspCanary(request: NextRequest, deps: CspCanaryDeps = {}): NextResponse {
  const env = deps.env ?? process.env;
  if (!isCspCanaryRequest(request, env)) return NextResponse.next();
  try {
    const nonce = (deps.genNonce ?? generateCspNonce)();
    if (!CSP_NONCE_RE.test(nonce)) throw new Error("invalid csp nonce");
    const policy = buildNonceReportOnlyCsp(nonce, { isDev: env.NODE_ENV === "development" });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("content-security-policy-report-only");
    requestHeaders.set("content-security-policy", policy);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy-Report-Only", policy);
    return response;
  } catch {
    // FAIL-OPEN: canary deneyi normal sayfayı asla bozmaz.
    return NextResponse.next();
  }
}
