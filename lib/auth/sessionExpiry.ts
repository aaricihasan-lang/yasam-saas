"use client";

/**
 * Oturum sona erdiğinde (süre dolumu / iptal) istemci tarafı ortak akış — WEB P1.
 *
 * Sunucu güvenliği DEĞİŞMEZ (süreler ve guard'lar sunucuda, touch_active_session). Bu modül
 * yalnız istemcinin geçersiz oturumu fark edip bayat localStorage durumunda takılı KALMAMASINI
 * sağlar: durum temizlenir, kullanıcı giriş akışına döner ve doğru mesajı görür.
 *
 *   - checkSessionStatus: GET /api/auth/session → { valid, reason } (ağ hatası → null; ağ
 *     hatası oturum sonu SAYILMAZ).
 *   - markSessionEnded / consumeSessionEnded: modül/admin sayfasından ana sayfaya dönüşte
 *     nedenin taşınması (sessionStorage; kişisel veri YOK, yalnız neden kodu).
 */
import { hasSessionCredential, readSessionToken, sessionTokenHeader } from "@/lib/auth/yasamUser";

export type SessionEndReason = "expired" | "revoked";

const SESSION_ENDED_KEY = "yasam_session_ended_v1";

export type SessionStatus = { valid: boolean; reason: SessionEndReason };

/**
 * HTTPONLY H2+: sunucu `cookie: "bootstrap"` ipucu verirse (yalnız SESSION_COOKIE_MODE≠off ve
 * uygun web oturumu) sayfa başına EN FAZLA bir kez HttpOnly cookie bootstrap'i istenir. off modda
 * ipucu hiç gelmez → çağrı da yapılmaz. Token localStorage'da ve header'da aynen kalır.
 */
let cookieBootstrapRequested = false;
function requestSessionCookieBootstrap(token: string): void {
  if (cookieBootstrapRequested) return;
  cookieBootstrapRequested = true;
  void fetch("/api/auth/session/cookie", {
    method: "POST",
    cache: "no-store",
    headers: { "x-session-token": token },
  }).catch(() => {
    /* bootstrap best-effort; header yolu çalışmaya devam eder */
  });
}

/** Oturumu sunucuda doğrular. Token yoksa/ağ hatasında null (karar verilmez). */
export async function checkSessionStatus(token: string | null = readSessionToken()): Promise<SessionStatus | null> {
  // HTTPONLY H5: web'de token yoksa HttpOnly cookie ile sorulur (sunucu primary modda cookie'yi
  // okur). Android'de / profil kaydı yokken kimlik bilgisi yok → karar verilmez (null).
  if (!hasSessionCredential(token)) return null;
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      cache: "no-store",
      headers: sessionTokenHeader(token),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { valid?: boolean; reason?: string; cookie?: string };
    if (json.valid === true) {
      if (json.cookie === "bootstrap" && token) requestSessionCookieBootstrap(token);
      return { valid: true, reason: "revoked" };
    }
    if (json.valid === false) return { valid: false, reason: json.reason === "expired" ? "expired" : "revoked" };
    return null;
  } catch {
    return null;
  }
}

/**
 * WT4 — İKİ AŞAMALI karar: tek bir "geçersiz" yanıtı oturumu bitirmez. İlk yanıt geçersizse
 * kısa bir aradan sonra AYNI token tekrar sorulur; yalnız ikisi de kesin "geçersiz" ise
 * sonuç döner. Ağ hatası / 5xx / belirsiz yanıt / token değişti (ör. başka sekmede yeniden
 * giriş) → null (çıkış YAPILMAZ). Sunucu süreleri ve güvenlik kararı DEĞİŞMEZ; yalnız istemci
 * tek bir geçici yanıtla geçerli oturumu kapatmaz.
 */
export async function confirmSessionInvalid(
  delayMs = 1500,
  check: (token: string | null) => Promise<SessionStatus | null> = checkSessionStatus,
  readToken: () => string | null = readSessionToken,
): Promise<SessionStatus | null> {
  const token = readToken();
  // HTTPONLY H5: web'de token yoksa cookie oturumu sorulur (token=null); Android'de karar yok.
  if (!hasSessionCredential(token)) return null;
  const first = await check(token);
  if (!first || first.valid) return null;
  await new Promise((r) => setTimeout(r, delayMs));
  if (readToken() !== token) return null;
  const second = await check(token);
  if (!second || second.valid) return null;
  return second;
}

export function markSessionEnded(reason: SessionEndReason): void {
  try {
    sessionStorage.setItem(SESSION_ENDED_KEY, reason);
  } catch {
    /* depolama yoksa ana sayfa genel giriş ekranını gösterir */
  }
}

export function consumeSessionEnded(): SessionEndReason | null {
  try {
    const v = sessionStorage.getItem(SESSION_ENDED_KEY);
    if (v) sessionStorage.removeItem(SESSION_ENDED_KEY);
    return v === "expired" || v === "revoked" ? v : null;
  } catch {
    return null;
  }
}
