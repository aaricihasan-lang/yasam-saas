import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerDb } from "@/lib/supabase-server";
import {
  createUserSession,
  extractClientIp,
  extractLocationFromHeaders,
  SESSION_ABSOLUTE_MS,
} from "@/lib/auth/sessionSecurity";
import {
  androidAppSessionTransport,
  clearWebSessionCookie,
  getSessionCookieConfig,
  hasWebSessionCookie,
  isAndroidAppRequest,
  isSessionCookieEligible,
  readWebSessionCookie,
  readWebSessionTransport,
  setWebSessionCookie,
} from "@/lib/auth/sessionCookie";
import { checkSameOriginRequest } from "@/lib/security/csrf";
import { limitReasonMessage } from "@/lib/auth/sessionLimits";
import { isExpertReady, normalizeRole, resolveApprovalStatus } from "@/lib/auth/approvalGate";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { activateTrialOnLogin } from "@/lib/trial/trialServer";
import {
  clearMfaBindingCookie,
  hashMfaBinding,
  isMfaChallengeId,
  readMfaBinding,
  readMfaChallengeState,
} from "@/lib/auth/mfaChallenge";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const COMPLETE_IP_LIMIT = 30;
const COMPLETE_IP_WINDOW_SEC = 15 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Login gating satırı — POST /api/auth/session başarı yanıtıyla AYNI alanlar (login_user sözleşmesi). */
const GATING_SELECT = "id, email, name, role, status, tenant_id, active, approval_status" as const;

function json(body: Record<string, unknown>, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...(extra ?? {}) } });
}

/** Challenge reddi: oturum YOK; tekrar kullanılamayacak durumlarda bağlama çerezi temizlenir. */
function rejected(code: string, status: number, androidApp: boolean, clearBinding: boolean) {
  const res = json({ code, error: "Doğrulama tamamlanamadı. Lütfen yeniden giriş yapın." }, status);
  if (clearBinding && !androidApp) clearMfaBindingCookie(res);
  return res;
}

/**
 * POST /api/auth/mfa/complete — GİRİŞ GÜVENLİĞİ F2-B: MFA'lı girişin TEK tamamlama ucu.
 *
 * Body: { challengeId: uuid, replaceSessionToken?: uuid }
 * Bağlama: web → HttpOnly `__Host-yasam_mfa` çerezi (+ Origin/Sec-Fetch-Site doğrulaması);
 *          resmî Android → `x-yasam-mfa-binding` başlığı. challenge_id tek başına yetmez.
 * Oturum YALNIZ auth_finalize_login ile açılır (challenge 'verified' + süresi geçmemiş + bağlama
 * eşleşir + kullanıcı aktif; tüketim ve oturum AYNI işlemde → paralel çağrıda tek oturum).
 * 200 yanıtı POST /api/auth/session başarı yanıtıyla aynı biçimdedir (istemci completeLogin akışı).
 * 401 MFA_INVALID / MFA_NOT_VERIFIED / MFA_EXPIRED / MFA_CONSUMED · 403 INACTIVE/NO_ROLE/PENDING/
 * SESSION_LIMIT · 409 ADMIN_* · 429 · 500/503 (ayrıntı sızdırılmaz).
 */
export async function POST(req: NextRequest) {
  const androidApp = isAndroidAppRequest(req.headers);
  try {
    if (!androidApp && !checkSameOriginRequest(req.headers).ok) {
      return json({ code: "FORBIDDEN", error: "İstek kaynağı doğrulanamadı." }, 403);
    }
    const body = (await req.json().catch(() => null)) as { challengeId?: unknown; replaceSessionToken?: unknown } | null;
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
    const binding = readMfaBinding(req, androidApp);
    if (!isMfaChallengeId(challengeId) || !binding) return rejected("MFA_INVALID", 401, androidApp, false);

    const db = getServerDb();
    const clientIp = extractClientIp(req.headers);
    const ipHit = await hitDbRateLimit(db, rateLimitBucket("mfa-complete-ip", clientIp), COMPLETE_IP_LIMIT, COMPLETE_IP_WINDOW_SEC);
    if (!ipHit.allowed) {
      const retryAfter = Math.max(1, ipHit.retryAfterSec);
      return json({ code: "RATE_LIMITED", error: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.", retryAfter }, 429, { "Retry-After": String(retryAfter) });
    }

    const bindingHash = hashMfaBinding(binding);
    const st = await readMfaChallengeState(db, challengeId, bindingHash);
    if (!st) return json({ code: "ERROR", error: "Doğrulama şu anda tamamlanamıyor." }, 503);
    if (st.state === "invalid") return rejected("MFA_INVALID", 401, androidApp, false);
    if (st.state === "pending") return rejected("MFA_NOT_VERIFIED", 401, androidApp, false);
    if (st.state !== "verified") {
      return rejected(st.state === "consumed" ? "MFA_CONSUMED" : st.state === "expired" ? "MFA_EXPIRED" : "MFA_DENIED", 401, androidApp, true);
    }
    if (!st.userId) return rejected("MFA_INVALID", 401, androidApp, false);

    // Hesap gating'i login ile AYNI kural (challenge açıldıktan sonra pasifleşme/rol değişimi yakalanır).
    const { data: u, error: uErr } = await db.from("users").select(GATING_SELECT).eq("id", st.userId).maybeSingle();
    if (uErr) return json({ code: "ERROR", error: "Oturum oluşturulamadı." }, 500);
    const row = u as Record<string, unknown> | null;
    if (!row || row.active !== true) {
      return json({ code: "INACTIVE", error: "Hesabınızın sisteme girişi kapalı. Lütfen sistem yöneticisiyle iletişime geçin." }, 403);
    }
    const role = normalizeRole(row.role);
    if (role !== "admin" && role !== "expert") {
      return json({ code: "NO_ROLE", error: "Hesabınız için geçerli bir rol tanımlı değil." }, 403);
    }
    if (role === "expert" && !isExpertReady({ active: row.active, approval: resolveApprovalStatus(row) })) {
      return json({ code: "PENDING", error: "Hesabınız yönetici onayı bekliyor." }, 403);
    }

    // Aynı cihazdaki önceki token (login ile aynı kural): gövde (Android/header) veya web oturum çerezi.
    const cookieCfg = getSessionCookieConfig();
    const bodyReplace = typeof body?.replaceSessionToken === "string" && UUID_RE.test(body.replaceSessionToken.trim())
      ? body.replaceSessionToken.trim()
      : null;
    const cookieReplace = !bodyReplace && cookieCfg.mode !== "off" && !androidApp ? readWebSessionCookie(req) : "";
    const replaceToken = bodyReplace ?? (UUID_RE.test(cookieReplace) ? cookieReplace : null);

    const location = extractLocationFromHeaders(req.headers);
    const sessionToken = randomUUID();
    const result = await createUserSession(db, String(row.id), location, sessionToken, {
      replaceToken,
      mfa: { challengeId, bindingHash },
    });

    if (!result.ok && "mfaRejected" in result) {
      const reason = result.reason;
      return rejected(
        reason === "consumed" ? "MFA_CONSUMED" : reason === "expired" ? "MFA_EXPIRED" : reason === "not_verified" ? "MFA_NOT_VERIFIED"
          : reason === "inactive" ? "INACTIVE" : "MFA_INVALID",
        reason === "inactive" ? 403 : 401,
        androidApp,
        reason === "consumed" || reason === "expired",
      );
    }
    if (!result.ok) {
      if (result.reason === "admin_mobile_active" || result.reason === "admin_web_limit") {
        return json({
          code: result.reason === "admin_mobile_active" ? "ADMIN_MOBILE_ACTIVE" : "ADMIN_WEB_LIMIT",
          error: limitReasonMessage(result.reason, result.deviceType),
          reason: result.reason,
        }, 409);
      }
      return json({ code: "SESSION_LIMIT", error: limitReasonMessage(result.reason, result.deviceType), reason: result.reason }, 403);
    }
    if (result.state !== "active") {
      // auth_finalize_login bekleyen onay oturumu üretmez (DB savunması); buraya ulaşılmamalı.
      return json({ code: "ERROR", error: "Oturum oluşturulamadı." }, 500);
    }

    // Login başarı yanıtıyla AYNI taşıma kuralları (HTTPONLY H2+/H6b).
    const webCookieSession =
      cookieCfg.mode !== "off" &&
      (result.channel !== "android_app" || androidAppSessionTransport() === "cookie") &&
      !androidApp &&
      isSessionCookieEligible(cookieCfg, String(row.id));
    const webCookieOnly = webCookieSession && readWebSessionTransport() === "cookie";
    // TRIAL7: deneme penceresi İLK GERÇEK (MFA'lı) oturumda başlar — parola adımında DEĞİL.
    const trial = role === "expert" ? await activateTrialOnLogin(db, String(row.id)) : null;

    const response = json(
      {
        ...(webCookieOnly ? { sessionCookie: true } : { sessionToken }),
        user: row,
        ...(trial && trial.phase !== "none" ? { trial: { phase: trial.phase, endsAt: trial.endsAt, serverNow: trial.serverNow } } : {}),
        suspiciousLogin: result.suspiciousLogin,
        highRisk: result.highRisk,
      },
      200,
    );
    if (webCookieSession) {
      setWebSessionCookie(response, sessionToken, Math.floor(SESSION_ABSOLUTE_MS[result.role] / 1000));
    } else if (hasWebSessionCookie(req)) {
      clearWebSessionCookie(response);
    }
    if (!androidApp) clearMfaBindingCookie(response);
    return response;
  } catch {
    return json({ code: "ERROR", error: "Oturum oluşturulamadı." }, 500);
  }
}
