import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerDb } from "@/lib/supabase-server";
import {
  createUserSession,
  endUserSession,
  extractClientIp,
  extractLocationFromHeaders,
  validateSessionToken,
} from "@/lib/auth/sessionSecurity";
import { limitReasonMessage } from "@/lib/auth/sessionLimits";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import {
  hashLoginIp,
  LOGIN_INVALID_MESSAGE,
  loginLockedMessage,
} from "@/lib/auth/loginThrottle";
import { isExpertReady, normalizeRole, resolveApprovalStatus } from "@/lib/auth/approvalGate";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: Record<string, unknown>, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...(extra ?? {}) } });
}

/**
 * POST /api/auth/session — TEK LOGIN YOLU (FAZ1 FINAL HARDENING).
 *
 * P0-1 KAPANIŞI (atomik server-login) KORUNUR: token yalnızca credential'lar bu güvenilir
 * server yürütmesi içinde doğrulandıktan sonra üretilir; çıplak userId KABUL EDİLMEZ.
 *
 * Doğrulama artık `auth_login_guarded` (kalıcı throttle: e-posta+IP / e-posta / IP; kilitliyken
 * doğru parola da reddedilir; hash-only). Tarayıcı artık login_user RPC'sini ÇAĞIRMAZ — bu
 * yanıt istemcinin oturumu kurması için gereken gating satırını da döndürür.
 *
 * Body: { email: string, password: string }
 * 200: { sessionToken, user: {id,email,name,role,status,tenant_id,active,approval_status},
 *        suspiciousLogin, highRisk }
 * 401 INVALID_CREDENTIALS (hesap varlığı sızdırmayan tek mesaj) · 429 LOCKED (+Retry-After)
 * 403 INACTIVE / PENDING / NO_ROLE / SESSION_LIMIT · 500 (ayrıntı sızdırılmaz).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown }
      | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email.trim() || !password.trim()) {
      // Credential yok → kimlik kanıtı yok. Token ÜRETİLMEZ.
      return json({ code: "INVALID_CREDENTIALS", error: "Kimlik doğrulama gerekli." }, 401);
    }

    const db = getServerDb();
    const ipHash = hashLoginIp(extractClientIp(req.headers));

    // SUNUCU-TARAFI + KISITLAMALI credential doğrulaması. userId doğrulanmış sonuçtan TÜRETİLİR.
    const verified = await verifyLoginCredentialsGuarded(db, email, password, ipHash);

    if (verified.status === "locked") {
      return json(
        {
          code: "LOCKED",
          error: loginLockedMessage(verified.retryAfterSeconds),
          retryAfter: verified.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(verified.retryAfterSeconds) },
      );
    }
    if (verified.status === "invalid") {
      // Account enumeration'ı artırmamak için tek genel mesaj.
      return json({ code: "INVALID_CREDENTIALS", error: LOGIN_INVALID_MESSAGE }, 401);
    }
    if (verified.status !== "ok") {
      return json({ code: "ERROR", error: "Giriş şu anda yapılamıyor. Lütfen tekrar deneyin." }, 500);
    }

    const row = verified.row;
    const role = normalizeRole(row.role);

    // Gating (istemcideki canLoginYasamUser ile aynı kural, artık SUNUCUDA; token üretmeden önce):
    //   active=false → herkes reddedilir · admin yalnız active · uzman active + onaylı.
    if (row.active !== true) {
      return json(
        { code: "INACTIVE", error: "Hesabınız pasif durumda. Lütfen sistem yöneticisiyle iletişime geçin." },
        403,
      );
    }
    if (role !== "admin" && role !== "expert") {
      return json({ code: "NO_ROLE", error: "Hesabınız için geçerli bir rol tanımlı değil." }, 403);
    }
    if (
      role === "expert" &&
      !isExpertReady({ active: row.active, approval: resolveApprovalStatus(row as Record<string, unknown>) })
    ) {
      return json({ code: "PENDING", error: "Hesabınız yönetici onayı bekliyor." }, 403);
    }

    const location     = extractLocationFromHeaders(req.headers);
    const sessionToken = randomUUID();

    const result = await createUserSession(db, row.id, location, sessionToken);

    // P3 reject-new: limit aşımında yeni oturum OLUŞTURULMAZ (mevcut oturumlar korunur).
    if (!result.ok) {
      return NextResponse.json(
        {
          code: "SESSION_LIMIT",
          error: limitReasonMessage(result.reason, result.deviceType),
          reason: result.reason,
        },
        { status: 403, headers: NO_STORE },
      );
    }

    return json(
      {
        sessionToken,
        user: row,
        suspiciousLogin: result.suspiciousLogin,
        highRisk: result.highRisk,
      },
      200,
    );
  } catch {
    // Hata ayrıntısı/stack client'a sızdırılmaz.
    return json({ code: "ERROR", error: "Oturum oluşturulamadı." }, 500);
  }
}

/**
 * GET /api/auth/session — oturum geçerliliği (+ throttled touch).
 * Token tercihen `x-session-token` başlığıyla; geriye uyumluluk için `?token=` de kabul edilir.
 * Returns: { valid: boolean }
 */
export async function GET(req: NextRequest) {
  try {
    const token =
      req.headers.get("x-session-token")?.trim() ||
      req.nextUrl.searchParams.get("token") ||
      "";
    if (!token) {
      return json({ valid: false }, 400);
    }

    const db    = getServerDb();
    const valid = await validateSessionToken(db, token);
    return json({ valid }, 200);
  } catch {
    return json({ valid: false }, 500);
  }
}

/**
 * DELETE /api/auth/session — SUNUCU LOGOUT (FAZ1 FINAL HARDENING).
 * `x-session-token` ile gelen token'ı pasifler (is_active=false, end_reason='user_logout').
 * İdempotent ve HER ZAMAN 200 (token yok/bilinmiyor/zaten pasif dahil) — istemci çıkışı
 * hiçbir koşulda bloklanmaz; sonuç token varlığı hakkında bilgi sızdırmaz.
 * Sonrasında aynı token'la her korumalı uç 401 döner (verifyUserRequest is_active kontrolü).
 */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get("x-session-token")?.trim() ?? "";
  if (token) {
    try {
      await endUserSession(getServerDb(), token);
    } catch {
      /* logout istemciyi asla bloklamaz */
    }
  }
  return json({ ok: true }, 200);
}
