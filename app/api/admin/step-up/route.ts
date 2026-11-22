import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { qrApprovalUrl } from "@/lib/auth/deviceSignature";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import {
  emailLimits, emailOtpConfigured, generateOtpCode, hashOtp, hashRecipient, maskEmail, otpPepper, verifyOtp,
} from "@/lib/auth/emailOtp";
import { getEmailProvider } from "@/lib/email/provider";
import { renderOtpEmail } from "@/lib/email/templates/otpEmail";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });
// F2-K (N2) "admin_grant": yönetici yetkisi verme (DB tarafı 001100; arayüz penceresi bu route ile başlatır — F2-L e2e yakaladı).
const ACTIONS = ["device_approve", "mfa_disable", "recovery_execute", "retention_policy", "retention_execute", "password_reset", "admin_grant"] as const;
const INVALID = "Onay isteği geçersiz veya süresi dolmuş. İşlemi yeniden başlatın.";

/**
 * GİRİŞ GÜVENLİĞİ F2-G — Owner kritik işlemleri için İŞLEME ÖZEL yeniden doğrulama (step-up).
 * Yetki DB'de: yalnız is_super_admin Owner'ın son 30 dk'da ikinci doğrulamayla açılmış oturumu; istek bu
 * OTURUMA + işlem türüne + hedef kayda bağlı, 5 dk, tek kullanımlık. Doğrulama: Owner'ın güvenilir telefonu
 * (QR + eşleştirme sayısı) VEYA doğrulanmış e-postasına giden kod. Kurtarma kodu bu amaçla geçmez.
 *
 * POST { op: "begin", action, targetId } → { challengeId, expiresAt, qr?: { url, matchCode }, emailHint? }
 * GET  ?challenge=<id>                    → { state }  (yalnız isteyen oturum)
 * POST { op: "email_send", challengeId } / { op: "email_verify", challengeId, code }
 */
export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const body = (await req.json().catch(() => null)) as { op?: unknown; action?: unknown; targetId?: unknown; challengeId?: unknown; code?: unknown } | null;

  if (body?.op === "begin") {
    const action = ACTIONS.find((a) => a === body.action);
    const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
    if (!action || !isMfaChallengeId(targetId)) return json({ error: "Geçersiz istek." }, 400);
    const { data, error } = await guard.db.rpc("auth_owner_step_up_begin", { p_actor_token: guard.sessionToken, p_action: action, p_target: targetId });
    if (error) return json({ error: "Onay isteği başlatılamadı." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; challenge_id?: unknown; expires_at?: unknown; qr_nonce?: unknown; match_code?: unknown; has_device?: unknown; email_verified?: unknown };
    if (r.ok !== true) {
      const msg = r.code === "fresh_mfa_required"
        ? "Güvenliğiniz için çıkış yapıp yeniden giriş yapın (son 30 dakika içinde ikinci doğrulamayla açılmış oturum gerekir)."
        : r.code === "too_many_open" ? "Açık çok sayıda onay isteği var; birkaç dakika sonra tekrar deneyin."
          : "Bu işlem yalnız Owner'ın ikinci doğrulamayla açılmış oturumunda yapılabilir.";
      return json({ code: String(r.code ?? "forbidden").toUpperCase(), error: msg }, r.code === "too_many_open" ? 429 : 403);
    }
    const challengeId = String(r.challenge_id);
    const emailOk = r.email_verified === true && emailOtpConfigured();
    let emailHint: string | null = null;
    if (emailOk) {
      const { data: u } = await guard.db.from("users").select("email").eq("id", guard.adminId).maybeSingle();
      const em = (u as { email?: unknown } | null)?.email;
      emailHint = typeof em === "string" ? maskEmail(em) : null;
    }
    return json({
      challengeId,
      expiresAt: r.expires_at ?? null,
      ...(r.has_device === true && typeof r.qr_nonce === "string" && typeof r.match_code === "string"
        ? { qr: { url: qrApprovalUrl(challengeId, r.qr_nonce), matchCode: r.match_code } } : {}),
      ...(emailOk ? { emailHint } : {}),
    }, 200);
  }

  const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
  if (!isMfaChallengeId(challengeId)) return json({ error: "Geçersiz istek." }, 400);
  // Her e-posta adımı önce isteğin BU oturuma ait ve bekliyor olduğunu doğrular.
  const st = await stepUpState(guard.db, guard.sessionToken, challengeId);
  if (!st || st.state !== "pending" || st.userId !== guard.adminId) return json({ code: "STEP_UP_INVALID", error: INVALID }, 401);

  const pepper = otpPepper();
  const provider = getEmailProvider();
  if (!emailOtpConfigured() || !pepper || !provider) return json({ code: "METHOD_UNAVAILABLE", error: "E-posta ile onay şu anda kullanılamıyor; telefonla (QR) onaylayın." }, 503);

  if (body?.op === "email_send") {
    const { data: u } = await guard.db.from("users").select("email, full_name, name").eq("id", guard.adminId).maybeSingle();
    const user = (u ?? {}) as { email?: unknown; full_name?: unknown; name?: unknown };
    if (typeof user.email !== "string" || !user.email) return json({ error: "Kayıtlı e-posta adresi yok." }, 400);
    const code = generateOtpCode();
    const { data, error } = await guard.db.rpc("auth_email_otp_issue", {
      p_user_id: guard.adminId, p_purpose: "login", p_challenge_id: challengeId,
      p_code_hash: hashOtp(`login:${challengeId}`, code, pepper), p_to_hash: hashRecipient(user.email, pepper), p_provider: provider.name,
      p_daily_limit: emailLimits().dailyLimit,
      p_warn_at: emailLimits().warnAt,
    });
    if (error) return json({ error: "Kod gönderilemedi." }, 500);
    const r = (data ?? {}) as { ok?: unknown; reason?: unknown; delivery_id?: unknown; retry_after?: unknown };
    if (r.ok !== true) {
      const status = r.reason === "cooldown" || r.reason === "rate_limited" || r.reason === "too_many" ? 429 : 400;
      return json({ code: String(r.reason ?? "error").toUpperCase(), error: r.reason === "cooldown" ? "Yeni kod istemeden önce biraz bekleyin." : "Kod gönderilemedi.",
        ...(r.retry_after ? { retryAfter: Number(r.retry_after) } : {}) }, status);
    }
    const name = (typeof user.full_name === "string" && user.full_name) || (typeof user.name === "string" ? user.name : null);
    const mail = renderOtpEmail({ purpose: "step_up", code, name, minutes: 3 });
    const sent = await provider.send({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html, category: "step_up" });
    await guard.db.rpc("auth_email_delivery_result", {
      p_delivery_id: Number(r.delivery_id), p_ok: sent.ok, p_error_code: sent.ok ? null : sent.code, p_provider_message_id: sent.ok ? sent.providerMessageId : null,
    });
    return sent.ok ? json({ sent: true }, 200) : json({ code: "SEND_FAILED", error: "Kod gönderilemedi; telefonla (QR) onaylayın." }, 503);
  }

  if (body?.op === "email_verify") {
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    const r = await verifyOtp(guard.db, { userId: guard.adminId, purpose: "login", challengeId, code });
    if (r.ok) return json({ result: "verified" }, 200);
    const msg = r.code === "wrong" ? `Kod hatalı.${r.attemptsLeft !== undefined ? ` Kalan deneme: ${r.attemptsLeft}.` : ""}`
      : r.code === "locked" ? "Kod 5 kez hatalı girildi; bu onay isteği kapatıldı."
        : r.code === "expired" ? "Kodun süresi doldu. Yeni kod isteyin." : "Geçerli bir kod yok. Yeni kod isteyin.";
    return json({ code: `OTP_${r.code.toUpperCase()}`, error: msg }, 401);
  }
  return json({ error: "Geçersiz işlem." }, 400);
}

export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const challengeId = req.nextUrl.searchParams.get("challenge")?.trim() ?? "";
  if (!isMfaChallengeId(challengeId)) return json({ state: "invalid" }, 200);
  const st = await stepUpState(guard.db, guard.sessionToken, challengeId);
  return json({ state: st?.state ?? "error" }, st ? 200 : 503);
}

async function stepUpState(db: Parameters<typeof verifyOtp>[0], token: string, challengeId: string): Promise<{ state: string; userId: string | null } | null> {
  const { data, error } = await db.rpc("auth_owner_step_up_status", { p_actor_token: token, p_challenge_id: challengeId });
  if (error) return null;
  const r = (data ?? {}) as { state?: unknown; user_id?: unknown };
  return { state: typeof r.state === "string" ? r.state : "invalid", userId: typeof r.user_id === "string" ? r.user_id : null };
}
