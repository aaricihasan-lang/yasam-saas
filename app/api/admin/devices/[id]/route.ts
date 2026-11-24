import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
type RouteContext = { params: Promise<{ id: string }> };
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

const DECIDE_ERRORS: Record<string, [number, string]> = {
  forbidden: [403, "Bu işlem yalnız Owner'ın QR ile açılmış oturumunda yapılabilir."],
  self_approval_forbidden: [403, "Kendi cihazınızı buradan onaylayamazsınız (ilk cihaz için SQL konsolu kodu)."],
  not_pending: [409, "Bu eşleştirme isteği artık beklemede değil."],
  verification_required: [400, "Onay için uzmanı kayıtlı telefonundan arayıp kodu ONA okutmanız ve bunu işaretlemeniz gerekir."],
  not_found: [404, "Eşleştirme isteği bulunamadı."],
  bad_decision: [400, "Geçersiz karar."],
  // F2-F: onay, son 30 dakikada ikinci doğrulamayla açılmış Owner oturumu ister.
  // F2-G: onay işleme özel yeniden doğrulama (telefon QR veya e-posta kodu) ister.
  step_up_required: [403, "Bu onay için telefonunuzdan (QR) veya e-postanıza gelen kodla ek doğrulama gerekiyor."],
  fresh_mfa_required: [403, "Güvenliğiniz için cihaz onayından önce çıkış yapıp yeniden giriş yapın (son 30 dakika içinde ikinci doğrulamayla açılmış oturum gerekir)."],
};

/**
 * POST /api/admin/devices/[id] — GİRİŞ GÜVENLİĞİ F2-C: Owner kararı veya iptal.
 * Body: { action: "approve" | "reject", fingerprintConfirmed: boolean, verificationMethod: "telefon" | "yuz_yuze", note? }
 *    | { action: "revoke", reason? }
 * Onay cihazı yalnız `owner_approved` yapar: OTURUM AÇMAZ; cihaz kendi imzasıyla aktifleşir.
 * Tüm yetki kontrolleri DB'de (auth_device_owner_decide / auth_device_revoke; aktör = oturum token'ı).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const { id } = await ctx.params;
  if (!isMfaChallengeId(id)) return json({ error: "Geçersiz cihaz." }, 400);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    if (action === "approve" || action === "reject") {
      const { data, error } = await guard.db.rpc("auth_device_owner_decide", {
        p_actor_token: guard.sessionToken,
        p_device_id: id,
        p_decision: action,
        p_fingerprint_confirmed: body?.fingerprintConfirmed === true,
        p_verification_method: typeof body?.verificationMethod === "string" ? body.verificationMethod : null,
        p_note: typeof body?.note === "string" ? body.note.slice(0, 500) : null,
      });
      if (error) return json({ error: "Karar kaydedilemedi." }, 500);
      const r = (data ?? {}) as { ok?: unknown; code?: unknown; state?: unknown };
      if (r.ok === true) return json({ ok: true, state: r.state }, 200);
      const e = DECIDE_ERRORS[String(r.code)] ?? [500, "Karar kaydedilemedi."];
      return json({ code: String(r.code ?? "error"), error: e[1] }, e[0]);
    }
    if (action === "revoke") {
      const { data, error } = await guard.db.rpc("auth_device_revoke", {
        p_actor_token: guard.sessionToken,
        p_device_id: id,
        p_reason: typeof body?.reason === "string" ? body.reason.slice(0, 300) : null,
      });
      if (error) return json({ error: "Cihaz iptal edilemedi." }, 500);
      const r = (data ?? {}) as { ok?: unknown; code?: unknown; sessions_closed?: unknown };
      if (r.ok === true) return json({ ok: true, sessionsClosed: Number(r.sessions_closed) || 0 }, 200);
      if (r.code === "fresh_mfa_required") {
        return json({ code: "FRESH_MFA_REQUIRED", error: "Başkasının cihazını iptal etmek için çıkış yapıp yeniden giriş yapın (son 30 dakika içinde ikinci doğrulamayla açılmış oturum gerekir)." }, 403);
      }
      return json({ code: String(r.code ?? "error"), error: "Cihaz bulunamadı veya yetki yok." }, 404);
    }
    return json({ error: "Geçersiz işlem." }, 400);
  } catch {
    return json({ error: "İşlem tamamlanamadı." }, 500);
  }
}
