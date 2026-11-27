import { NextRequest } from "next/server";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { formatRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "@/lib/auth/recoveryCodes";
import { reconfirmPassword } from "@/lib/auth/stepUp";
import { sendSecurityNotice } from "@/lib/auth/securityNotice";
import { issueAndSendOtp, maskEmail, recoverySetupOtpHash } from "@/lib/auth/emailOtp";
import { recoverySetupEligibility } from "@/lib/auth/recoverySetup";

export const runtime = "nodejs";

/**
 * GİRİŞ GÜVENLİĞİ F2-E — oturumdaki kullanıcının KENDİ hesap kurtarma ayarları.
 *
 * GET → { codesActive, generatedAt, lastUsedAt, sessionMethod, sessionRecoveryKind, isOwner,
 *         ownerOfflineActive, ownerBootstrapAvailable, openCase }   (kod / özet DÖNMEZ)
 * POST { action: "generate", password } → 10 yeni kod (YALNIZ bu yanıtta; eski kodlar geçersiz).
 *        MFA'lı oturum (DB) + parola yeniden doğrulaması (burada) şart.
 * POST { action: "cancel_case", caseId } → hesabım için açılmış kurtarma talebini iptal (MFA'lı oturum).
 * POST { action: "owner_bootstrap", password } → Owner, çevrimdışı kodla açılmış taze oturumdan yeni
 *        telefon için 15 dk'lık eşleştirme kodu (oturum başına bir kez).
 * F4 (Risk A) — MFA ÖNCESİ kurulum (zorunluluk henüz açılmamış, MFA kapsamındaki, e-postası doğrulanmış hesap):
 * POST { action: "setup_send", password } → parola yeniden doğrulanır, kayıtlı adrese 6 haneli kod (3 dk; 60 sn bekleme).
 * POST { action: "setup_generate", code } → kod DB'de aynı işlemde tüketilir (auth_recovery_codes_setup) → 10 kod (YALNIZ
 *        bu yanıtta). Yalnız parolayı bilen biri kod üretemez (posta kutusu kanıtı şart). GET → setup: { available, issue }.
 * Demo hesabında yazma kapalı.
 */
export async function GET(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  const { data, error } = await guard.db.rpc("auth_recovery_status", { p_actor_token: guard.token });
  if (error) return jsonNoStore({ error: "Kurtarma durumu okunamadı." }, 500);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return jsonNoStore({ error: "Oturum doğrulanamadı." }, 401);
  return jsonNoStore({
    codesActive: Number(r.codes_active) || 0,
    generatedAt: r.codes_generated_at ?? null,
    lastUsedAt: r.codes_last_used_at ?? null,
    sessionMethod: r.session_method ?? null,
    sessionRecoveryKind: r.session_recovery_kind ?? null,
    isOwner: r.is_owner === true,
    ownerOfflineActive: r.owner_offline_active ?? null,
    ownerBootstrapAvailable: r.owner_bootstrap_available === true,
    openCase: r.open_case ?? null,
    // F4: MFA öncesi kurulum uygun mu (kod / adres DÖNMEZ; yalnız durum ve maske).
    setup: await (async () => {
      const e = await recoverySetupEligibility(guard.db, guard);
      return e.ok ? { available: true, issue: null, emailHint: maskEmail(e.email) } : { available: false, issue: e.issue, emailHint: null };
    })(),
  }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  const body = (await req.json().catch(() => null)) as { action?: unknown; password?: unknown; caseId?: unknown; code?: unknown } | null;

  if (body?.action === "setup_send" || body?.action === "setup_generate") {
    const el = await recoverySetupEligibility(guard.db, guard);
    if (!el.ok) {
      const msg = el.issue === "mfa_required" ? "İkinci doğrulama bu hesapta açık; kurtarma kodlarını ikinci doğrulamayla açılmış oturumda oluşturun."
        : el.issue === "email_unverified" ? "Önce e-posta adresinizi doğrulayın."
          : "Kurtarma kodu kurulumu bu hesap için şu anda kullanılamıyor.";
      return jsonNoStore({ code: `SETUP_${el.issue.toUpperCase()}`, error: msg }, 403);
    }
    if (body.action === "setup_send") {
      const step = await reconfirmPassword(guard.db, req, guard.userId, body.password);
      if (!step.ok) return jsonNoStore(step.body, step.status);
      const out = await issueAndSendOtp(guard.db, { userId: guard.userId, email: el.email, name: el.name, purpose: "recovery_setup", challengeId: null });
      if (out.ok) return jsonNoStore({ sent: true, expiresAt: out.expiresAt, emailHint: maskEmail(el.email) }, 200);
      const status = out.code === "cooldown" || out.code === "rate_limited" ? 429 : out.code === "not_configured" || out.code === "quota_exhausted" || out.code === "send_failed" ? 503 : 400;
      return jsonNoStore({ code: out.code.toUpperCase(), error: out.code === "cooldown" ? "Yeni kod istemeden önce biraz bekleyin." : "Kod gönderilemedi.", ...(out.retryAfter ? { retryAfter: out.retryAfter } : {}) }, status);
    }
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    const otpHash = recoverySetupOtpHash(guard.userId, el.email, code);
    if (!otpHash) return jsonNoStore({ code: "OTP_WRONG", error: "Kod 6 haneli olmalı." }, 400);
    const codes = generateRecoveryCodes();
    const { data, error } = await guard.db.rpc("auth_recovery_codes_setup", {
      p_actor_token: guard.token,
      p_code_hashes: codes.map((c) => hashRecoveryCode(guard.userId, c)),
      p_otp_hash: otpHash,
    });
    if (error) {
      const missing = String((error as { code?: unknown }).code ?? "");
      if (missing === "PGRST202" || missing === "42883") return jsonNoStore({ code: "SETUP_UNAVAILABLE", error: "Kurtarma kodu kurulumu henüz etkin değil." }, 503);
      return jsonNoStore({ error: "Kurtarma kodları oluşturulamadı." }, 500);
    }
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; revoked?: unknown; attempts_left?: unknown };
    if (r.ok !== true) {
      const c = String(r.code ?? "error");
      if (c === "rate_limited") return jsonNoStore({ code: "RATE_LIMITED", error: "Son 24 saatte en fazla 3 kez kod oluşturabilirsiniz." }, 429);
      if (c.startsWith("otp_")) {
        const left = Number(r.attempts_left);
        const msg = c === "otp_wrong" ? `Kod hatalı.${Number.isFinite(left) ? ` Kalan deneme: ${left}.` : ""}`
          : c === "otp_expired" ? "Kodun süresi doldu. Yeni kod isteyin."
            : c === "otp_locked" ? "Kod 5 kez hatalı girildi. Yeni kod isteyin."
              : "Geçerli bir kod yok. Yeni kod isteyin.";
        return jsonNoStore({ code: c.toUpperCase(), error: msg }, 400);
      }
      return jsonNoStore({ code: c.toUpperCase(), error: "Kurtarma kodları oluşturulamadı." }, c === "forbidden" || c === "mfa_session_required" ? 403 : 400);
    }
    await sendSecurityNotice(guard.db, { userId: guard.userId, to: el.email, name: el.name, kind: "recovery_codes_generated" });
    return jsonNoStore({ codes: codes.map(formatRecoveryCode), revoked: Number(r.revoked) || 0 }, 200);
  }

  if (body?.action === "generate") {
    const step = await reconfirmPassword(guard.db, req, guard.userId, body.password);
    if (!step.ok) return jsonNoStore(step.body, step.status);
    const codes = generateRecoveryCodes();
    const { data, error } = await guard.db.rpc("auth_recovery_codes_generate", {
      p_actor_token: guard.token,
      p_code_hashes: codes.map((c) => hashRecoveryCode(guard.userId, c)),
    });
    if (error) return jsonNoStore({ error: "Kurtarma kodları oluşturulamadı." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; revoked?: unknown };
    if (r.ok !== true) {
      if (r.code === "rate_limited") return jsonNoStore({ code: "RATE_LIMITED", error: "Son 24 saatte en fazla 3 kez kod oluşturabilirsiniz." }, 429);
      if (r.code === "strong_mfa_required") {
        return jsonNoStore({ code: "STRONG_MFA_REQUIRED", error: "Telefonunuz kayıtlı olduğu için kurtarma kodları yalnız telefonla (QR) açılmış bir oturumda oluşturulabilir." }, 403);
      }
      if (r.code === "forbidden") {
        return jsonNoStore({ code: "MFA_SESSION_REQUIRED", error: "Kurtarma kodları yalnız ikinci doğrulamayla açılmış bir oturumda oluşturulabilir." }, 403);
      }
      return jsonNoStore({ error: "Kurtarma kodları oluşturulamadı." }, 400);
    }
    await sendSecurityNotice(guard.db, { userId: guard.userId, to: step.email, name: step.name, kind: "recovery_codes_generated" });
    return jsonNoStore({ codes: codes.map(formatRecoveryCode), revoked: Number(r.revoked) || 0 }, 200);
  }

  if (body?.action === "cancel_case") {
    const caseId = typeof body.caseId === "string" ? body.caseId.trim() : "";
    if (!isMfaChallengeId(caseId)) return jsonNoStore({ error: "Geçersiz talep." }, 400);
    const { data, error } = await guard.db.rpc("auth_recovery_case_close", {
      p_actor_token: guard.token, p_case_id: caseId, p_action: "cancel", p_reason: "Hesap sahibi iptal etti",
    });
    if (error) return jsonNoStore({ error: "Talep iptal edilemedi." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown };
    if (r.ok !== true) {
      return jsonNoStore(r.code === "forbidden"
        ? { code: "MFA_SESSION_REQUIRED", error: "Talebi iptal etmek için ikinci doğrulamayla giriş yapmış olmalısınız." }
        : { error: "Talep bulunamadı veya artık beklemede değil." }, r.code === "forbidden" ? 403 : 404);
    }
    return jsonNoStore({ ok: true }, 200);
  }

  if (body?.action === "owner_bootstrap") {
    const step = await reconfirmPassword(guard.db, req, guard.userId, body.password);
    if (!step.ok) return jsonNoStore(step.body, step.status);
    const { data, error } = await guard.db.rpc("auth_owner_offline_bootstrap", { p_actor_token: guard.token });
    if (error) return jsonNoStore({ error: "Eşleştirme kodu üretilemedi." }, 500);
    const r = (data ?? {}) as { ok?: unknown; code?: unknown; expires_at?: unknown };
    if (r.ok !== true) {
      const msg = r.code === "stale_session" ? "Bu işlem çevrimdışı kodla girişten sonraki 30 dakika içinde yapılabilir. Yeniden giriş yapın."
        : r.code === "already_issued" ? "Bu oturum için eşleştirme kodu zaten üretildi."
          : "Bu işlem yalnız Owner'ın çevrimdışı kurtarma koduyla açtığı oturumda yapılabilir.";
      return jsonNoStore({ code: String(r.code ?? "forbidden").toUpperCase(), error: msg }, 403);
    }
    const code = String(r.code ?? "");
    return jsonNoStore({ code: code.match(/.{1,4}/g)?.join("-") ?? code, expiresAt: r.expires_at ?? null }, 200);
  }

  return jsonNoStore({ error: "Geçersiz işlem." }, 400);
}
