import { NextRequest } from "next/server";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";
import { formatRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "@/lib/auth/recoveryCodes";
import { reconfirmPassword } from "@/lib/auth/stepUp";
import { sendSecurityNotice } from "@/lib/auth/securityNotice";

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
  }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  const body = (await req.json().catch(() => null)) as { action?: unknown; password?: unknown; caseId?: unknown } | null;

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
