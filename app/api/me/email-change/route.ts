import { NextRequest } from "next/server";
import { requestTranslator } from "@/lib/i18n/serverMessages";
import { resolveOutputLocale } from "@/lib/i18n/output";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import {
  emailLimits, emailOtpConfigured, generateOtpCode, hashOtp, hashRecipient, maskEmail, otpPepper,
} from "@/lib/auth/emailOtp";
import { getEmailProvider } from "@/lib/email/provider";
import { renderOtpEmail } from "@/lib/email/templates/otpEmail";
import { reconfirmPassword } from "@/lib/auth/stepUp";
import { sendSecurityNotice } from "@/lib/auth/securityNotice";
import { emailSelfServiceAllowed } from "@/lib/auth/emailSelfService";

export const runtime = "nodejs";

const NEED_STRONG = "emailChange.needStrong"; // auth.server katalog anahtarı (I18N-F1-R1)

/**
 * GİRİŞ GÜVENLİĞİ F2-E — kendi giriş e-posta adresimi değiştirme (e-posta erişimi kaybı senaryosu).
 * Şartlar: QR (güvenilir cihaz) veya kurtarma koduyla açılmış oturum (DB) + parola (burada) + YENİ
 * adrese gönderilen 6 haneli kod (10 dk, 5 yanlışta kilit). Başarıda eski adrese güvenlik bildirimi.
 * Hesap kimliği (users.id), tenant, danışan ve analiz kayıtları DEĞİŞMEZ — yalnız giriş adresi.
 * F3: kapsam AUTH_EMAIL_SELF_SERVICE_ROLES (varsayılan yalnız Owner). Kapsam dışı hesapta start / confirm 403
 * (METHOD_NOT_IN_SCOPE); parola denenmez, kod üretilmez, e-posta gönderilmez.
 *
 * POST { action: "start", newEmail, password } → { requestId, expiresAt, sentTo: maske }
 * POST { action: "confirm", requestId, code }   → { ok, email: maske }
 */
export async function POST(req: NextRequest) {
  const te = requestTranslator(req, "auth.server");
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  if (!(await emailSelfServiceAllowed(guard.db, guard.userId, guard.role))) {
    return jsonNoStore({ code: "METHOD_NOT_IN_SCOPE", error: te("common.emailNotInScope") }, 403);
  }
  const body = (await req.json().catch(() => null)) as { action?: unknown; newEmail?: unknown; password?: unknown; requestId?: unknown; code?: unknown } | null;
  const pepper = otpPepper();
  const provider = getEmailProvider();
  if (!emailOtpConfigured() || !pepper || !provider) {
    return jsonNoStore({ code: "METHOD_UNAVAILABLE", error: te("emailChange.sendUnavailable") }, 503);
  }
  const scope = `change:${guard.userId}`;
  const locale = resolveOutputLocale(req).locale;

  if (body?.action === "start") {
    const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail) || newEmail.length > 254) {
      return jsonNoStore({ code: "BAD_EMAIL", error: te("emailChange.badEmail") }, 400);
    }
    const step = await reconfirmPassword(guard.db, req, guard.userId, body.password);
    if (!step.ok) return jsonNoStore(step.body, step.status);
    const code = generateOtpCode();
    const { data, error } = await guard.db.rpc("auth_email_change_begin", {
      p_actor_token: guard.token,
      p_new_email: newEmail,
      p_code_hash: hashOtp(scope, code, pepper),
      p_to_hash: hashRecipient(newEmail, pepper),
      p_provider: provider.name,
      p_daily_limit: emailLimits().dailyLimit,
      p_warn_at: emailLimits().warnAt,
    });
    if (error) return jsonNoStore({ error: te("emailChange.startFailed") }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; request_id?: unknown; delivery_id?: unknown; expires_at?: unknown; retry_after?: unknown };
    if (r.ok !== true) {
      const map: Record<string, [number, string]> = {
        strong_mfa_required: [403, te(NEED_STRONG)],
        same_email: [400, te("emailChange.sameEmail")],
        email_unavailable: [409, te("common.emailAddressUnavailable")],
        cooldown: [429, te("common.waitBeforeNewCode")],
        rate_limited: [429, te("emailChange.rateLimited")],
        quota_exhausted: [503, te("emailChange.quotaExhausted")],
        forbidden: [401, te("common.sessionUnverified")],
      };
      const [status, msg] = map[String(r.code)] ?? [400, te("emailChange.startFailed")];
      return jsonNoStore({ code: String(r.code ?? "error").toUpperCase(), error: msg, ...(r.retry_after ? { retryAfter: Number(r.retry_after) } : {}) }, status);
    }
    const mail = renderOtpEmail({ purpose: "change_email", code, name: step.name, minutes: 10, locale });
    const sent = await provider.send({ to: newEmail, subject: mail.subject, text: mail.text, html: mail.html, category: "change_email" });
    await guard.db.rpc("auth_email_delivery_result", {
      p_delivery_id: Number(r.delivery_id),
      p_ok: sent.ok,
      p_error_code: sent.ok ? null : sent.code,
      p_provider_message_id: sent.ok ? sent.providerMessageId : null,
    });
    if (!sent.ok) return jsonNoStore({ code: "SEND_FAILED", error: te("emailChange.sendFailed") }, 503);
    return jsonNoStore({ requestId: r.request_id, expiresAt: r.expires_at, sentTo: maskEmail(newEmail) }, 200);
  }

  if (body?.action === "confirm") {
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    if (!isMfaChallengeId(requestId)) return jsonNoStore({ error: te("common.invalidRequest") }, 400);
    if (!/^[0-9]{6}$/.test(code)) return jsonNoStore({ code: "OTP_WRONG", error: te("emailChange.codeFormat") }, 400);
    const { data, error } = await guard.db.rpc("auth_email_change_confirm", {
      p_actor_token: guard.token, p_request_id: requestId, p_code_hash: hashOtp(scope, code, pepper),
    });
    if (error) return jsonNoStore({ error: te("emailChange.changeFailed") }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; attempts_left?: unknown; old_email?: unknown };
    if (r.ok !== true) {
      const left = Number(r.attempts_left);
      const map: Record<string, [number, string]> = {
        strong_mfa_required: [403, te(NEED_STRONG)],
        wrong: [400, `${te("common.codeWrong")}${Number.isFinite(left) ? te("common.attemptsLeft", { count: String(left) }) : ""}`],
        locked: [400, te("emailChange.lockedNewRequest")],
        expired: [400, te("emailChange.expiredNewRequest")],
        email_unavailable: [409, te("common.emailAddressUnavailable")],
        not_sent: [400, te("emailChange.notSentNewRequest")],
      };
      const [status, msg] = map[String(r.code)] ?? [400, te("emailChange.invalidOrExpiredNewRequest")];
      return jsonNoStore({ code: `EMAIL_CHANGE_${String(r.code ?? "invalid").toUpperCase()}`, error: msg }, status);
    }
    const { data: u } = await guard.db.from("users").select("email, name, full_name").eq("id", guard.userId).maybeSingle();
    const user = (u ?? {}) as { email?: unknown; name?: unknown; full_name?: unknown };
    const name = (typeof user.full_name === "string" && user.full_name) || (typeof user.name === "string" ? user.name : null);
    await sendSecurityNotice(guard.db, { userId: guard.userId, to: typeof r.old_email === "string" ? r.old_email : null, name, kind: "email_changed_old", locale });
    return jsonNoStore({ ok: true, email: typeof user.email === "string" ? maskEmail(user.email) : null }, 200);
  }

  return jsonNoStore({ error: te("common.invalidAction") }, 400);
}
