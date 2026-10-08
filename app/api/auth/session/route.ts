import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerDb } from "@/lib/supabase-server";
import {
  createUserSession,
  endUserSession,
  extractClientIp,
  extractLocationFromHeaders,
  resolveActiveSession,
} from "@/lib/auth/sessionSecurity";
import { limitReasonMessage } from "@/lib/auth/sessionLimits";
import { verifyLoginCredentialsGuarded } from "@/lib/auth/credentialLogin";
import {
  hashLoginIp,
  LOGIN_INVALID_MESSAGE,
  loginLockedMessage,
} from "@/lib/auth/loginThrottle";
import { isExpertReady, normalizeRole, resolveApprovalStatus } from "@/lib/auth/approvalGate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAdminAudit } from "@/lib/admin/adminAudit";
import { resolveActorIsMainAdmin } from "@/lib/admin/accountSessionControls";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: Record<string, unknown>, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...(extra ?? {}) } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADMIN_PENDING_MESSAGE =
  "Yönetici hesabınız başka bir cihazda açık. Bu giriş, mevcut oturumunuzdan onaylanana kadar bekliyor.";

/** Admin oturum olayı audit'i (aktör = hesabın kendisi; token/IP/parola YOK). Fail-closed. */
async function auditAdminSessionEvent(
  db: SupabaseClient,
  adminId: string,
  action: "admin_web_login_pending" | "admin_mobile_login_rejected",
  context: Record<string, unknown>,
): Promise<void> {
  const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
  await writeAdminAudit(db, { actorAdminId: adminId, action, targetUserId: adminId, actorIsMainAdmin, context });
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
      | { email?: unknown; password?: unknown; replaceSessionToken?: unknown }
      | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    // Aynı cihazdaki önceki token (yalnız aynı kullanıcıya aitse kapatılır; aksi halde etkisiz).
    const replaceSessionToken =
      typeof body?.replaceSessionToken === "string" && UUID_RE.test(body.replaceSessionToken.trim())
        ? body.replaceSessionToken.trim()
        : null;

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

    const result = await createUserSession(db, row.id, location, sessionToken, {
      replaceToken: replaceSessionToken,
    });

    // P3 reject-new: limit aşımında yeni oturum OLUŞTURULMAZ (mevcut oturumlar korunur).
    if (!result.ok) {
      if (result.reason === "admin_mobile_active" || result.reason === "admin_web_limit") {
        // Ret güvenli yönde; audit hatası yanıtı değiştirmez (iz security_events'te de var).
        await auditAdminSessionEvent(db, String(row.id), result.reason === "admin_mobile_active"
          ? "admin_mobile_login_rejected"
          : "admin_web_login_pending", {
          outcome: "rejected",
          reason: result.reason,
          platform: result.deviceType,
        }).catch(() => {});
        return json(
          {
            code: result.reason === "admin_mobile_active" ? "ADMIN_MOBILE_ACTIVE" : "ADMIN_WEB_LIMIT",
            error: limitReasonMessage(result.reason, result.deviceType),
            reason: result.reason,
          },
          409,
        );
      }
      return NextResponse.json(
        {
          code: "SESSION_LIMIT",
          error: limitReasonMessage(result.reason, result.deviceType),
          reason: result.reason,
        },
        { status: 403, headers: NO_STORE },
      );
    }

    if (result.state === "pending_approval") {
      // Admin ikinci/riskli web girişi: token YALNIZ kendi durumunu sorgulayabilir; kullanıcı
      // satırı/profil DÖNDÜRÜLMEZ. Audit fail-closed: yazılamazsa pending kapatılır → 500.
      try {
        await auditAdminSessionEvent(db, String(row.id), "admin_web_login_pending", {
          outcome: "pending",
          channel: result.channel,
          high_risk: result.highRisk,
          pending_ttl_minutes: 10,
        });
      } catch {
        await db
          .from("user_sessions")
          .update({ ended_at: new Date().toISOString(), end_reason: "audit_failed" })
          .eq("session_token", sessionToken)
          .eq("session_state", "pending_approval");
        return json({ code: "ERROR", error: "Oturum oluşturulamadı." }, 500);
      }
      return json(
        {
          code: "PENDING_APPROVAL",
          pendingToken: sessionToken,
          pendingExpiresAt: result.pendingExpiresAt,
          error: ADMIN_PENDING_MESSAGE,
        },
        202,
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

/** Oturum sonlanma nedenleri → istemci mesajı sınıfı (süre dolumu vs. güvenlik/başka cihaz). */
const EXPIRED_END_REASONS: ReadonlySet<string> = new Set([
  "expired_idle",
  "expired_absolute",
  "expired_policy_cleanup",
]);

/**
 * GET /api/auth/session — oturum geçerliliği (+ throttled touch).
 * Token tercihen `x-session-token` başlığıyla; geriye uyumluluk için `?token=` de kabul edilir.
 * Returns: { valid: true } | { valid: false, reason: "expired" | "revoked" }
 *
 * `reason` yalnız token'ı ELİNDE TUTAN istemciye, KENDİ oturumunun neden geçersiz olduğunu
 * söyler (doğru mesaj: "Oturum süreniz doldu" vs. güvenlik/başka cihaz). Tam token eşleşmesiyle
 * okunur; başka kullanıcı/oturum hakkında bilgi vermez. Yetki kararı DEĞİLDİR.
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
    const state = await resolveActiveSession(db, token);
    if (state.status === "active") return json({ valid: true }, 200);
    // WT4: geçici DB/RPC hatası oturum sonu DEĞİLDİR → 503 (istemci karar vermez, çıkış yapmaz).
    // Önceden burada 200 { valid:false, reason:"revoked" } dönüyor, istemci geçerli oturumu
    // kapatıyordu (DELETE → end_reason=user_logout).
    if (state.status === "unavailable") return json({ valid: null, unavailable: true }, 503);

    let reason: "expired" | "revoked" = "revoked";
    try {
      const { data } = await db
        .from("user_sessions")
        .select("end_reason")
        .eq("session_token", token)
        .maybeSingle();
      const endReason = typeof data?.end_reason === "string" ? data.end_reason : "";
      if (EXPIRED_END_REASONS.has(endReason)) reason = "expired";
    } catch {
      /* neden okunamazsa güvenli varsayılan: revoked */
    }
    return json({ valid: false, reason }, 200);
  } catch {
    // Beklenmeyen sunucu hatası da oturum sonu değildir (istemci 5xx'te karar vermez).
    return json({ valid: null, unavailable: true }, 503);
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
