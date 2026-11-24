import { NextRequest } from "next/server";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { isMfaChallengeId } from "@/lib/auth/mfaChallenge";

export const runtime = "nodejs";

/**
 * GİRİŞ GÜVENLİĞİ F2-E — telefon değişimi (eski telefon elde).
 * GET    → { proofDeviceId, waiting } : bu oturum son 30 dk içinde hangi cihazın QR onayıyla açıldı
 *          (eski cihaza sahiplik kanıtı) ve bekleyen değişim.
 * POST   { oldDeviceId } → değişim işareti (24 saat). Yeni telefon F2-C akışıyla eşleşir (Owner onayı +
 *          cihaz imzası ATLANMAZ); aktifleştiği anda eski cihaz otomatik iptal edilir.
 * DELETE → bekleyen değişimi iptal.
 */
export async function GET(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  const { data, error } = await guard.db.rpc("auth_device_replace_status", { p_actor_token: guard.token });
  if (error) return jsonNoStore({ error: "Durum okunamadı." }, 500);
  const r = (data ?? {}) as { ok?: unknown; proof_device_id?: unknown; waiting?: unknown };
  if (r.ok !== true) return jsonNoStore({ error: "Oturum doğrulanamadı." }, 401);
  return jsonNoStore({ proofDeviceId: r.proof_device_id ?? null, waiting: r.waiting ?? null }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  const body = (await req.json().catch(() => null)) as { oldDeviceId?: unknown } | null;
  const oldDeviceId = typeof body?.oldDeviceId === "string" ? body.oldDeviceId.trim() : "";
  if (!isMfaChallengeId(oldDeviceId)) return jsonNoStore({ error: "Geçersiz cihaz." }, 400);
  const { data, error } = await guard.db.rpc("auth_device_replace_begin", { p_actor_token: guard.token, p_old_device_id: oldDeviceId });
  if (error) return jsonNoStore({ error: "Telefon değişimi başlatılamadı." }, 500);
  const r = (data ?? {}) as { ok?: unknown; code?: unknown; expires_at?: unknown };
  if (r.ok !== true) {
    if (r.code === "old_device_proof_required") {
      return jsonNoStore({
        code: "OLD_DEVICE_PROOF_REQUIRED",
        error: "Telefon değişimi için son 30 dakika içinde ESKİ telefonunuzla (QR) giriş yapmış olmalısınız. Eski telefon elinizde değilse onu iptal edin.",
      }, 403);
    }
    return jsonNoStore({ error: "Cihaz bulunamadı." }, 404);
  }
  return jsonNoStore({ ok: true, expiresAt: r.expires_at ?? null }, 200);
}

export async function DELETE(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  const { data, error } = await guard.db.rpc("auth_device_replace_cancel", { p_actor_token: guard.token });
  if (error) return jsonNoStore({ error: "İptal edilemedi." }, 500);
  const r = (data ?? {}) as { ok?: unknown; cancelled?: unknown };
  if (r.ok !== true) return jsonNoStore({ error: "Oturum doğrulanamadı." }, 401);
  return jsonNoStore({ ok: true, cancelled: Number(r.cancelled) || 0 }, 200);
}
