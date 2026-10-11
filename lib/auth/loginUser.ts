import { clearYasamUser, readStoredSessionToken } from "@/lib/auth/yasamUser";
import { ANDROID_APP_UA_SUFFIX, CLIENT_CHANNEL_HEADER } from "@/lib/auth/clientChannel";

/**
 * Onay bekleyen admin web girişinin token'ı — YALNIZ durum sorgusu / iptal içindir; normal oturum
 * anahtarına (yasam_session_token) YAZILMAZ ve hiçbir korumalı uçta geçerli değildir (sunucuda
 * is_active=false). localStorage'da tutulur: sekmeler arasında paylaşılır ve yenileme sonrası
 * bekleme devam eder. Bitiş (10 dk) geçince okunurken kendiliğinden silinir.
 */
export const PENDING_LOGIN_STORAGE_KEY = "yasam_pending_login_v2";
const LEGACY_PENDING_KEY = "yasam_pending_session_v1";
const PENDING_MAX_MS = 10 * 60 * 1000 + 30_000;

export type StoredPendingLogin = { token: string; expiresAt: string | null };

export function readPendingLogin(): StoredPendingLogin | null {
  try {
    const raw = localStorage.getItem(PENDING_LOGIN_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown; savedAt?: unknown };
    const savedAt = Number(p.savedAt);
    const token = typeof p.token === "string" ? p.token : "";
    const expiresAt = typeof p.expiresAt === "string" ? p.expiresAt : null;
    const expMs = expiresAt ? Date.parse(expiresAt) : savedAt + PENDING_MAX_MS;
    const now = Date.now();
    if (!token || !Number.isFinite(savedAt) || !Number.isFinite(expMs) || now > expMs || now - savedAt > PENDING_MAX_MS) {
      localStorage.removeItem(PENDING_LOGIN_STORAGE_KEY);
      return null;
    }
    return { token, expiresAt };
  } catch {
    return null;
  }
}

export function readPendingLoginToken(): string | null {
  return readPendingLogin()?.token ?? null;
}

export function savePendingLogin(token: string, expiresAt: string | null): void {
  try {
    localStorage.setItem(PENDING_LOGIN_STORAGE_KEY, JSON.stringify({ token, expiresAt, savedAt: Date.now() }));
  } catch {
    /* depolama yoksa bekleme yalnız bu sayfa ömrü boyunca sürer */
  }
}

export function clearPendingLoginToken(): void {
  try {
    localStorage.removeItem(PENDING_LOGIN_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_PENDING_KEY);
  } catch {
    /* sessiz */
  }
}

/** "Beklemeyi iptal et": sunucudaki bekleyen kaydı kapatır (slotu boşaltır) + yerel token'ı siler. */
export async function cancelPendingLogin(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl("/api/auth/session/pending", { method: "DELETE", headers: { "x-session-token": token } });
  } catch {
    /* ağ hatası: bekleyen kayıt 10 dk içinde zaten düşer */
  }
  clearPendingLoginToken();
}

/** Resmi Android uygulaması (UA soneki) içindeysek giriş isteğine kanal ipucu eklenir. */
function officialAppHeaders(): Record<string, string> {
  if (typeof navigator === "undefined") return {};
  return ANDROID_APP_UA_SUFFIX.test(navigator.userAgent) ? { [CLIENT_CHANNEL_HEADER]: "android" } : {};
}

export type PendingLoginStatus =
  | { state: "pending"; pendingExpiresAt: string | null }
  | { state: "approved"; row: Record<string, unknown> }
  | { state: "denied" | "expired" | "invalid" }
  | null;

/** Bekleyen girişin durumu (ağ hatası → null; karar verilmez). */
export async function checkPendingLogin(token: string, fetchImpl: typeof fetch = fetch): Promise<PendingLoginStatus> {
  try {
    const res = await fetchImpl("/api/auth/session/pending", {
      method: "GET",
      cache: "no-store",
      headers: { "x-session-token": token },
    });
    if (!res.ok && res.status !== 400) return null;
    const j = (await res.json().catch(() => ({}))) as { state?: string; user?: unknown; pendingExpiresAt?: unknown };
    if (j.state === "pending") {
      return { state: "pending", pendingExpiresAt: typeof j.pendingExpiresAt === "string" ? j.pendingExpiresAt : null };
    }
    if (j.state === "approved") {
      const row = rpcLoginRowsToArray(j.user)[0];
      return row ? { state: "approved", row } : { state: "invalid" };
    }
    if (j.state === "denied" || j.state === "expired") return { state: j.state };
    return { state: "invalid" };
  } catch {
    return null;
  }
}

/**
 * FAZ1 FINAL HARDENING — TEK LOGIN YOLU (istemci).
 *
 * Tarayıcı artık `login_user` RPC'sini (anon key) ÇAĞIRMAZ. Kimlik doğrulama + kısıtlama
 * (throttle) + gating + oturum token'ı tek istekte SUNUCUDA yapılır: POST /api/auth/session.
 * Oturum oluşturulamazsa giriş BAŞARISIZDIR (fail-closed) — token'sız "giriş yapmış" durum yok.
 */
export type LoginAttemptResult =
  | {
      ok: true;
      /** login_user ile aynı gating alanları (id, email, name, role, status, tenant_id, active, approval_status). */
      row: Record<string, unknown>;
      /** HTTPONLY H6b: web + cookie taşımasında null (oturum HttpOnly cookie'de; JS token görmez). */
      sessionToken: string | null;
      suspiciousLogin: boolean;
      normalizedEmail: string;
    }
  | {
      ok: false;
      /** HTTP durum kodu; ağ hatasında 0. */
      status: number;
      /** Sunucu kodu: INVALID_CREDENTIALS | LOCKED | INACTIVE | PENDING | NO_ROLE | SESSION_LIMIT |
       *  ADMIN_MOBILE_ACTIVE | ADMIN_WEB_LIMIT | PENDING_APPROVAL | ERROR | NETWORK */
      code: string;
      /** PENDING_APPROVAL: yalnız durum sorgusu için token (normal oturum DEĞİL). */
      pendingToken?: string | null;
      pendingExpiresAt?: string | null;
      /** Sunucunun kullanıcıya gösterilebilir (genel) mesajı; yoksa null. */
      message: string | null;
      retryAfterSeconds: number | null;
      normalizedEmail: string;
    };

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** RPC bazen tek nesne döndürebilir; diziye çevirir (geriye uyumluluk). */
export function rpcLoginRowsToArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (item) => item != null && typeof item === "object",
    ) as Record<string, unknown>[];
  }
  if (typeof data === "object") {
    return [data as Record<string, unknown>];
  }
  return [];
}

/**
 * Oturum öncesi localStorage temizler (eski token sunucuda da kapatılır), e-posta/şifreyi
 * normalize eder ve sunucu login'ini çağırır. Şifre trim paritesi: istemci `.trim()` +
 * sunucu `.trim()` (mevcut davranışla birebir).
 */
export async function loginWithCredentials(
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoginAttemptResult> {
  // Aynı cihazdaki önceki token (aktif oturum veya bekleyen onay) — sunucu yalnız AYNI kullanıcıya
  // aitse kapatır; böylece aynı tarayıcıdan yeniden giriş kendi kendine onay istemez.
  // HTTPONLY H6a: saklı token (taşımadan bağımsız) — yalnız login GÖVDESİNDE aynı-cihaz kapatma için.
  const replaceSessionToken = readStoredSessionToken() ?? readPendingLoginToken();
  clearYasamUser();
  clearPendingLoginToken();

  const normalizedEmail = normalizeLoginEmail(email);
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_CREDENTIALS",
      message: null,
      retryAfterSeconds: null,
      normalizedEmail,
    };
  }

  let res: Response;
  try {
    res = await fetchImpl("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...officialAppHeaders() },
      cache: "no-store",
      body: JSON.stringify({
        email: normalizedEmail,
        password: trimmedPassword,
        ...(replaceSessionToken ? { replaceSessionToken } : {}),
      }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "NETWORK",
      message: null,
      retryAfterSeconds: null,
      normalizedEmail,
    };
  }

  const json = (await res.json().catch(() => ({}))) as {
    sessionToken?: unknown;
    sessionCookie?: unknown;
    user?: unknown;
    suspiciousLogin?: unknown;
    highRisk?: unknown;
    code?: unknown;
    error?: unknown;
    retryAfter?: unknown;
    pendingToken?: unknown;
    pendingExpiresAt?: unknown;
  };

  if (res.status === 202 && json.code === "PENDING_APPROVAL" && typeof json.pendingToken === "string") {
    savePendingLogin(json.pendingToken, typeof json.pendingExpiresAt === "string" ? json.pendingExpiresAt : null);
    return {
      ok: false,
      status: 202,
      code: "PENDING_APPROVAL",
      message: typeof json.error === "string" ? json.error : null,
      retryAfterSeconds: null,
      normalizedEmail,
      pendingToken: json.pendingToken,
      pendingExpiresAt: typeof json.pendingExpiresAt === "string" ? json.pendingExpiresAt : null,
    };
  }

  const row = rpcLoginRowsToArray(json.user)[0];
  // Oturum kanıtı: gövdede token (Android / header taşıması) VEYA sunucunun HttpOnly cookie ile
  // oturum kurduğunu bildiren `sessionCookie: true` (HTTPONLY H6b web). İkisi de yoksa fail-closed.
  const bodyToken = typeof json.sessionToken === "string" && json.sessionToken ? json.sessionToken : null;
  if (res.ok && row && (bodyToken || json.sessionCookie === true)) {
    return {
      ok: true,
      row,
      sessionToken: bodyToken,
      suspiciousLogin: json.suspiciousLogin === true || json.highRisk === true,
      normalizedEmail,
    };
  }

  const retryHeader = Number(res.headers.get("Retry-After"));
  const retryBody = Number(json.retryAfter);
  const retryAfterSeconds = Number.isFinite(retryBody) && retryBody > 0
    ? retryBody
    : Number.isFinite(retryHeader) && retryHeader > 0
      ? retryHeader
      : null;

  return {
    ok: false,
    status: res.ok ? 500 : res.status,
    code: typeof json.code === "string" ? json.code : res.ok ? "ERROR" : `HTTP_${res.status}`,
    message: typeof json.error === "string" && json.error.trim() ? json.error : null,
    retryAfterSeconds,
    normalizedEmail,
  };
}
