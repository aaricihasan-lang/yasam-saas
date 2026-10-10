/**
 * CSP NONCE C1-v2 — DOKÜMAN CSP'si (tek kaynak; proxy.ts'ten çağrılır).
 *
 * NEDEN PROXY: Vercel'de next.config `headers()` ile gelen CSP render'a İSTEK başlığı olarak da
 * görünür ve proxy'nin istek başlığına koyduğu nonce'lu CSP'yi ezer (vercel/next.js#99360) → Next
 * nonce'u bulamaz. Bu yüzden doküman isteklerinde CSP YALNIZ burada üretilir: aynı değer hem Next'e
 * (istek `content-security-policy` — Next nonce'u buradan okur) hem tarayıcıya (yanıt) gider.
 *
 * DAVRANIŞ:
 *   - Normal istek → production ile BYTE-EŞİT zorunlu CSP (nonce YOK, 'unsafe-inline' var).
 *   - Canary (env `CSP_NONCE_CANARY=on` VE cookie `yasam_csp_canary=1`) → istek başına 128-bit
 *     nonce'lu zorunlu CSP (script-src: 'self' 'nonce-…' 'strict-dynamic'; 'unsafe-inline' YOK).
 *     Env yoksa/`on` değilse cookie YOK SAYILIR (production'da env tanımlanana kadar etkisiz).
 *   - İstemcinin gönderdiği `content-security-policy` istek başlıkları HER ZAMAN ezilir/silinir.
 *   - FAIL-SAFE: nonce/CSP üretimi hata verirse normal zorunlu CSP döner — CSP ASLA kaybolmaz.
 *
 * Auth/session ile İLGİSİZDİR: canary cookie'si yetki vermez, kimlik taşımaz.
 */
import { buildEnforcedCsp, buildNonceCsp, type SecurityHeaderOptions } from "./securityHeaders";

export const CSP_CANARY_COOKIE = "yasam_csp_canary";
export const CSP_CANARY_ENV = "CSP_NONCE_CANARY";

type Env = Record<string, string | undefined>;
type CookieReader = { get(name: string): { value: string } | undefined };

/** 16 bayt (128 bit) kriptografik rastgele → base64 (Next nonce kalıbına uyar). */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Canary yalnız env AÇIKÇA `on` iken etkin (varsayılan kapalı = kill-switch). */
export function isCspCanaryEnabled(env: Env = process.env): boolean {
  return String(env[CSP_CANARY_ENV] ?? "").trim().toLowerCase() === "on";
}

export function cspOptionsFromEnv(env: Env = process.env): SecurityHeaderOptions {
  return { supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, isDev: env.NODE_ENV === "development" };
}

export type DocumentCsp = { policy: string; nonce: string | null; canary: boolean };

/**
 * İstek için doküman CSP'sini seçer. Asla throw etmez; her durumda bir politika döner.
 */
export function resolveDocumentCsp(
  cookies: CookieReader,
  deps: { env?: Env; genNonce?: () => string } = {},
): DocumentCsp {
  const env = deps.env ?? process.env;
  const opts = cspOptionsFromEnv(env);
  const normal = (): DocumentCsp => ({ policy: buildEnforcedCsp(opts), nonce: null, canary: false });
  if (!isCspCanaryEnabled(env) || cookies.get(CSP_CANARY_COOKIE)?.value !== "1") return normal();
  try {
    const nonce = (deps.genNonce ?? generateCspNonce)();
    return { policy: buildNonceCsp(nonce, opts), nonce, canary: true };
  } catch {
    // FAIL-SAFE: canary başarısız → normal zorunlu CSP (güvenlik başlığı kaybolmaz).
    return normal();
  }
}

/** Next'e giden istek başlıkları: istemcinin CSP başlıkları silinir, seçilen politika yazılır. */
export function documentRequestHeaders(source: Headers, policy: string): Headers {
  const h = new Headers(source);
  h.delete("content-security-policy-report-only");
  h.set("content-security-policy", policy);
  return h;
}
