import { clearYasamUser } from "@/lib/auth/yasamUser";

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
      /** Sunucu kodu: INVALID_CREDENTIALS | LOCKED | INACTIVE | PENDING | NO_ROLE | SESSION_LIMIT | ERROR | NETWORK */
      code: string;
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
  clearYasamUser();

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
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ email: normalizedEmail, password: trimmedPassword }),
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
  };

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
