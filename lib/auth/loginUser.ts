import { clearYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { ANDROID_APP_UA_SUFFIX, CLIENT_CHANNEL_HEADER } from "@/lib/auth/clientChannel";

/** Onay bekleyen admin web girişinin token'ı (yalnız durum sorgusu; normal oturum anahtarına YAZILMAZ). */
const PENDING_TOKEN_KEY = "yasam_pending_session_v1";

export function readPendingLoginToken(): string | null {
  try {
    return sessionStorage.getItem(PENDING_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function savePendingLoginToken(token: string): void {
  try {
    sessionStorage.setItem(PENDING_TOKEN_KEY, token);
  } catch {
    /* depolama yoksa bekleme yalnız bu sayfa ömrü boyunca sürer */
  }
}

export function clearPendingLoginToken(): void {
  try {
    sessionStorage.removeItem(PENDING_TOKEN_KEY);
  } catch {
    /* sessiz */
  }
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
      sessionToken: string;
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
  const replaceSessionToken = readSessionToken() ?? readPendingLoginToken();
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
    savePendingLoginToken(json.pendingToken);
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
  if (res.ok && typeof json.sessionToken === "string" && json.sessionToken && row) {
    return {
      ok: true,
      row,
      sessionToken: json.sessionToken,
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
