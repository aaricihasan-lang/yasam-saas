/**
 * HTTPONLY WEB SESSION (H1–H4) — cookie kaynaklı kimlik doğrulama için CSRF kontrolü.
 *
 * YALNIZ şu durumda uygulanır: kimlik bilgisi gerçekten COOKIE'den kullanıldı (header token yok)
 * VE metot durum değiştiren (POST/PUT/PATCH/DELETE). Header-auth (bugünkü tüm istemciler) bu
 * kontrole HİÇ girmez → mevcut davranış değişmez.
 *
 * Katmanlar (cookie SameSite=Strict'e EK):
 *   1. Özel başlık: x-user-id veya x-admin-id ZORUNLU (çapraz-site <form> özel başlık gönderemez;
 *      çapraz-origin fetch CORS preflight'a takılır).
 *   2. Origin: izinli origin listesiyle BİREBİR eşleşmeli.
 *   3. Origin yoksa: yalnız `Sec-Fetch-Site: same-origin` kabul (eksik Origin kör kabul EDİLMEZ).
 *
 * İzinli origin'ler Host başlığından TÜRETİLMEZ:
 *   - SESSION_COOKIE_ALLOWED_ORIGINS (virgüllü) verilmişse yalnız onlar; yoksa kanonik
 *     https://www.yasamsistemi.com
 *   - VERCEL_ENV=preview iken platformun ayarladığı VERCEL_URL / VERCEL_BRANCH_URL (https) eklenir.
 */
const CANONICAL_ORIGIN = "https://www.yasamsistemi.com";
const UNSAFE_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type Env = Record<string, string | undefined>;

export function isUnsafeMethod(method: string | null | undefined): boolean {
  return UNSAFE_METHODS.has(String(method ?? "").toUpperCase());
}

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function allowedSessionOrigins(env: Env = process.env): ReadonlySet<string> {
  const out = new Set<string>();
  const configured = String(env.SESSION_COOKIE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => normalizeOrigin(s))
    .filter((s): s is string => !!s);
  if (configured.length) configured.forEach((o) => out.add(o));
  else out.add(CANONICAL_ORIGIN);
  if (String(env.VERCEL_ENV ?? "") === "preview") {
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
      const o = host ? normalizeOrigin(`https://${host}`) : null;
      if (o) out.add(o);
    }
  }
  return out;
}

export type CsrfCheck = { ok: true } | { ok: false; reason: "missing_custom_header" | "bad_origin" | "missing_origin" };

/** Origin / Sec-Fetch-Site doğrulaması (özel başlık şartı OLMADAN). */
export function checkSameOriginRequest(headers: Headers, env: Env = process.env): CsrfCheck {
  const origin = headers.get("origin");
  if (origin !== null) {
    const norm = normalizeOrigin(origin);
    return norm && allowedSessionOrigins(env).has(norm) ? { ok: true } : { ok: false, reason: "bad_origin" };
  }
  return headers.get("sec-fetch-site") === "same-origin" ? { ok: true } : { ok: false, reason: "missing_origin" };
}

/** Cookie-auth + durum değiştiren metot için tam CSRF kontrolü. Güvenli metotlarda ok. */
export function checkCookieAuthCsrf(method: string, headers: Headers, env: Env = process.env): CsrfCheck {
  if (!isUnsafeMethod(method)) return { ok: true };
  const custom = (headers.get("x-user-id") ?? headers.get("x-admin-id") ?? "").trim();
  if (!custom) return { ok: false, reason: "missing_custom_header" };
  return checkSameOriginRequest(headers, env);
}
