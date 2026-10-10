/**
 * CSP NONCE C1-v2 — DOKÜMAN CSP'si (tek kaynak; proxy.ts'ten çağrılır).
 *
 * NEDEN PROXY: Vercel'de next.config `headers()` ile gelen CSP render'a İSTEK başlığı olarak da
 * görünür ve proxy'nin istek başlığına koyduğu nonce'lu CSP'yi ezer (vercel/next.js#99360) → Next
 * nonce'u bulamaz. Bu yüzden doküman isteklerinde CSP YALNIZ burada üretilir: aynı değer hem Next'e
 * (istek `content-security-policy` — Next nonce'u buradan okur) hem tarayıcıya (yanıt) gider.
 *
 * DAVRANIŞ — mod `CSP_NONCE_MODE` (C3 rollout switch):
 *   - `off`    → herkes production ile BYTE-EŞİT zorunlu CSP (nonce YOK, 'unsafe-inline' var).
 *   - `canary` → yalnız cookie `yasam_csp_canary=1` taşıyan doküman isteği nonce'lu CSP alır.
 *   - `all`    → her doküman isteği nonce'lu CSP alır (cookie gerekmez).
 *   Nonce'lu CSP: istek başına 128-bit nonce (script-src: 'self' 'nonce-…' 'strict-dynamic';
 *   'unsafe-inline' YOK; style-src 'unsafe-inline' KALIR).
 *   - `CSP_NONCE_MODE` TANIMLIYSA tek karar odur; `off`/boş/geçersiz değer → `off` (güvenli varsayılan).
 *   - `CSP_NONCE_MODE` TANIMSIZSA eski C1-v2 env'i geriye uyumlu okunur: `CSP_NONCE_CANARY=on` →
 *     `canary`, aksi halde `off`. Eski env hiçbir zaman `all` açamaz.
 *   - KILL-SWITCH: `CSP_NONCE_MODE=off` + redeploy → tüm trafik normal CSP (eski env `on` olsa bile).
 *   - İstemcinin gönderdiği `content-security-policy` istek başlıkları HER ZAMAN ezilir/silinir.
 *   - FAIL-SAFE: nonce/CSP üretimi hata verirse normal zorunlu CSP döner — CSP ASLA kaybolmaz.
 *
 * Auth/session ile İLGİSİZDİR: canary cookie'si yetki vermez, kimlik taşımaz.
 */
import { buildEnforcedCsp, buildNonceCsp, type SecurityHeaderOptions } from "./securityHeaders";

export const CSP_CANARY_COOKIE = "yasam_csp_canary";
/** Eski (C1-v2) boolean env — yalnız `CSP_NONCE_MODE` tanımsızken okunur. */
export const CSP_CANARY_ENV = "CSP_NONCE_CANARY";
/** C3 rollout switch: off | canary | all. */
export const CSP_NONCE_MODE_ENV = "CSP_NONCE_MODE";

export type CspNonceMode = "off" | "canary" | "all";

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

/**
 * Etkin nonce modu. `CSP_NONCE_MODE` tanımlıysa yalnız `canary`/`all` nonce açar; diğer her değer
 * (`off`, boş, yazım hatası) `off`. Tanımsızsa eski `CSP_NONCE_CANARY=on` → `canary`.
 */
export function resolveCspNonceMode(env: Env = process.env): CspNonceMode {
  const raw = env[CSP_NONCE_MODE_ENV];
  if (raw !== undefined) {
    const v = raw.trim().toLowerCase();
    return v === "canary" || v === "all" ? v : "off";
  }
  return String(env[CSP_CANARY_ENV] ?? "").trim().toLowerCase() === "on" ? "canary" : "off";
}

/** Canary cookie'si dikkate alınıyor mu (mod `canary`). */
export function isCspCanaryEnabled(env: Env = process.env): boolean {
  return resolveCspNonceMode(env) === "canary";
}

export function cspOptionsFromEnv(env: Env = process.env): SecurityHeaderOptions {
  return { supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, isDev: env.NODE_ENV === "development" };
}

/** `canary`: bu isteğe nonce'lu politika uygulandı mı (mod `canary` veya `all`). */
export type DocumentCsp = { policy: string; nonce: string | null; canary: boolean; mode: CspNonceMode };

/**
 * İstek için doküman CSP'sini seçer. Asla throw etmez; her durumda bir politika döner.
 */
export function resolveDocumentCsp(
  cookies: CookieReader,
  deps: { env?: Env; genNonce?: () => string } = {},
): DocumentCsp {
  const env = deps.env ?? process.env;
  const opts = cspOptionsFromEnv(env);
  let mode: CspNonceMode = "off";
  const normal = (): DocumentCsp => ({ policy: buildEnforcedCsp(opts), nonce: null, canary: false, mode });
  try {
    mode = resolveCspNonceMode(env);
    if (mode === "off") return normal();
    if (mode === "canary" && cookies.get(CSP_CANARY_COOKIE)?.value !== "1") return normal();
    const nonce = (deps.genNonce ?? generateCspNonce)();
    return { policy: buildNonceCsp(nonce, opts), nonce, canary: true, mode };
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
